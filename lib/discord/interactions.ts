import 'server-only';
import { projectService } from '@/lib/launchpad';
import { projectRepository } from '@/lib/launchpad/project-repository';
import { orgService } from '@/lib/domain/service';
import { proposalService } from '@/lib/domain/proposal-service';
import { identityRepository } from '@/lib/launchpad/identity-repository';
import type { Organization } from '@/lib/domain/types';
import type { Proposal } from '@/lib/domain/proposal-types';
import { createSignInPayload, isXamanConfigured } from '@/lib/wallet/xaman-server';
import { pendingLinkRepository } from './pending-link-repository';
import { discordConfig } from './config';

// --- Discord interaction protocol constants ---------------------------------
const InteractionType = { PING: 1, APPLICATION_COMMAND: 2 } as const;
const InteractionResponseType = { PONG: 1, CHANNEL_MESSAGE_WITH_SOURCE: 4 } as const;
const MessageFlags = { EPHEMERAL: 1 << 6 } as const; // 64
const ADMINISTRATOR = 1n << 3n; // 8

// --- Minimal interaction shape (only the fields we read) --------------------
interface InteractionOption {
  name: string;
  value?: string | number | boolean;
}
interface Interaction {
  type: number;
  guild_id?: string;
  token?: string;
  application_id?: string;
  member?: { user?: { id: string }; permissions?: string };
  user?: { id: string };
  data?: { name?: string; options?: InteractionOption[] };
}

type Response = Record<string, unknown>;

// --- Response builders ------------------------------------------------------
const pong = (): Response => ({ type: InteractionResponseType.PONG });

function reply(content: string, ephemeral = true): Response {
  return {
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: { content, ...(ephemeral ? { flags: MessageFlags.EPHEMERAL } : {}) },
  };
}

function replyEmbed(embed: Record<string, unknown>, ephemeral = true): Response {
  return {
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: { embeds: [embed], ...(ephemeral ? { flags: MessageFlags.EPHEMERAL } : {}) },
  };
}

// --- Helpers ----------------------------------------------------------------
function optionValue(interaction: Interaction, name: string): string | undefined {
  const opt = interaction.data?.options?.find((o) => o.name === name);
  return opt?.value != null ? String(opt.value) : undefined;
}

function userId(interaction: Interaction): string | undefined {
  return interaction.member?.user?.id ?? interaction.user?.id;
}

function isAdmin(interaction: Interaction): boolean {
  const perms = interaction.member?.permissions;
  if (!perms) return false;
  try {
    return (BigInt(perms) & ADMINISTRATOR) !== 0n;
  } catch {
    return false;
  }
}

/** Resolve the DAO bound to a guild, or an error reply if not set up. */
async function resolveOrg(
  guildId: string | undefined
): Promise<{ org: Organization } | { error: Response }> {
  if (!guildId) return { error: reply('This command must be used inside a server.') };
  const project = await projectRepository.getByGuild(guildId).catch(() => null);
  if (!project?.orgId) {
    return { error: reply('This server isn\u2019t linked to a DAO yet. An admin must run `/setup project_id:<id>` first.') };
  }
  const org = await orgService.getOrganization(project.orgId);
  if (!org) return { error: reply('The linked DAO could not be found. Re-run `/setup`.') };
  return { org };
}

function proposalDeepLink(proposalId: string): string {
  return `${discordConfig.appPublicUrl.replace(/\/$/, '')}/proposals/${proposalId}`;
}

// --- Command handlers -------------------------------------------------------
async function handleSetup(interaction: Interaction): Promise<Response> {
  if (!interaction.guild_id) return reply('Run `/setup` inside the server you want to link.');
  if (!isAdmin(interaction)) return reply('Only server admins can run `/setup`.');

  const projectId = optionValue(interaction, 'project_id');
  if (!projectId) return reply('Provide a project id: `/setup project_id:<id>`.');

  const project = await projectService.get(projectId).catch(() => null);
  if (!project) return reply(`No VoteChain project found with id \`${projectId}\`.`);
  if (project.status !== 'live' || !project.orgId) {
    return reply(`Project \`${projectId}\` isn\u2019t live yet (status: ${project.status}). Finish funding/activation first.`);
  }

  await projectService.bindGuild(projectId, interaction.guild_id);
  return reply(
    `\u2705 Linked this server to **${project.name}** (DAO \`${project.orgId}\`).\nMembers can now \`/link\` their wallet and \`/vote\`. Use \`/proposals\` to see what\u2019s open.`
  );
}

async function handleLink(interaction: Interaction): Promise<Response> {
  const uid = userId(interaction);
  if (!uid) return reply('Could not identify your Discord user.');

  const resolved = await resolveOrg(interaction.guild_id);
  if ('error' in resolved) return resolved.error;
  const { org } = resolved;

  // Fallback: a wallet address was typed directly (no ownership proof).
  const wallet = optionValue(interaction, 'wallet')?.trim();
  if (wallet) {
    const isMember = org.members.some((m) => m.walletAddress === wallet);
    if (!isMember) {
      return reply(
        'That wallet isn\u2019t a member of this DAO. Contribute to / join the DAO first, then run `/link` again.'
      );
    }
    await identityRepository.link({
      guildId: interaction.guild_id as string,
      discordUserId: uid,
      chain: org.chain,
      walletAddress: wallet,
    });
    return reply(
      '\uD83D\uDD10 Wallet linked privately. You can now use `/vote`.\nYour address is encrypted at rest and is never shown in any channel.'
    );
  }

  // Preferred: QR sign-in via Xaman (proves wallet ownership).
  if (!isXamanConfigured()) {
    return reply('QR sign-in isn\u2019t available right now. Provide your address instead: `/link wallet:<address>`.');
  }
  const token = interaction.token;
  const appId = interaction.application_id ?? discordConfig.clientId;
  if (!token || !appId) return reply('Could not start the sign-in flow. Try again.');

  let payload;
  try {
    payload = await createSignInPayload({
      identifier: `discordlink_${interaction.guild_id}_${uid}_${Date.now()}`,
      instruction: `Link your wallet to ${org.name} on VoteChain`,
      blob: { guildId: interaction.guild_id, discordUserId: uid },
    });
  } catch (err) {
    return reply(`Couldn\u2019t start Xaman sign-in: ${(err as Error).message}`);
  }

  await pendingLinkRepository.create({
    uuid: payload.uuid,
    guildId: interaction.guild_id as string,
    discordUserId: uid,
    chain: org.chain,
    interactionToken: token,
    applicationId: appId,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  });

  return replyEmbed({
    title: `Link your wallet \u2014 ${org.name}`,
    description:
      'Scan this QR with the **Xaman** app and approve the sign-in to link your wallet.\n' +
      'On mobile, tap **Open in Xaman** below.\n\n' +
      'Your address is verified by signature, encrypted at rest, and never shown in any channel. The link finalizes automatically once you sign in.',
    color: 0x5865f2,
    image: { url: payload.refs.qr_png },
    fields: [{ name: '\u200b', value: `[Open in Xaman](${payload.next.always})` }],
    footer: { text: 'Prefer to paste an address? Use /link wallet:<address>' },
  });
}

/**
 * List proposals for the bound DAO.
 * @param ephemeral true = private reply (`/proposals`), false = posted to the
 *                  channel for everyone (`/proposals-public`).
 */
async function handleProposals(interaction: Interaction, ephemeral = true): Promise<Response> {
  const resolved = await resolveOrg(interaction.guild_id);
  if ('error' in resolved) return resolved.error;
  const { org } = resolved;

  const all = await proposalService.listByOrg(org.id);
  const active = all.filter((p) => p.status === 'active');
  const list = active.length > 0 ? active : all.slice(-5).reverse();

  if (list.length === 0) {
    return reply('There are no proposals yet for this DAO.', ephemeral);
  }

  const fields = list.map((p: Proposal) => ({
    name: `${statusEmoji(p.status)} ${p.title}`,
    value:
      `id: \`${p.id}\`\n` +
      `status: **${p.status}** \u00b7 yes ${p.tally.yes} / no ${p.tally.no} / abstain ${p.tally.abstain}` +
      (p.votingEndsAt ? `\nends: ${new Date(p.votingEndsAt).toUTCString()}` : '') +
      `\n[Open in VoteChain](${proposalDeepLink(p.id)})`,
  }));

  return replyEmbed(
    {
      title: active.length > 0 ? `Active proposals \u2014 ${org.name}` : `Recent proposals \u2014 ${org.name}`,
      color: 0x5865f2,
      fields,
      footer: { text: 'Vote with /vote proposal_id:<id> choice:<yes|no|abstain>' },
    },
    ephemeral
  );
}

async function handleVote(interaction: Interaction): Promise<Response> {
  const uid = userId(interaction);
  if (!uid) return reply('Could not identify your Discord user.');

  const resolved = await resolveOrg(interaction.guild_id);
  if ('error' in resolved) return resolved.error;
  const { org } = resolved;

  const link = await identityRepository.get(interaction.guild_id as string, uid).catch(() => null);
  if (!link) return reply('Link your wallet first with `/link wallet:<address>`.');

  const proposalId = optionValue(interaction, 'proposal_id');
  const choice = optionValue(interaction, 'choice');
  if (!proposalId || !choice) return reply('Usage: `/vote proposal_id:<id> choice:<yes|no|abstain>`.');
  if (choice !== 'yes' && choice !== 'no' && choice !== 'abstain') {
    return reply('Choice must be yes, no, or abstain.');
  }

  const proposal = await proposalService.getProposal(proposalId).catch(() => null);
  if (!proposal || proposal.orgId !== org.id) {
    return reply('Proposal not found in this DAO. Check the id with `/proposals`.');
  }

  try {
    const updated = await proposalService.castVote(proposalId, {
      walletAddress: link.walletAddress,
      choice,
    });
    return reply(
      `\uD83D\uDDF3\uFE0F Vote recorded: **${choice}** on \u201c${updated.title}\u201d.\n` +
        `Tally \u2014 yes ${updated.tally.yes} / no ${updated.tally.no} / abstain ${updated.tally.abstain}.\n` +
        `For a private (ZK) vote instead, use the app: ${proposalDeepLink(proposalId)}`
    );
  } catch (err) {
    return reply(`Couldn\u2019t record your vote: ${(err as Error).message}`);
  }
}

function statusEmoji(status: string): string {
  switch (status) {
    case 'active':
      return '\uD83D\uDFE2'; // green circle
    case 'passed':
      return '\u2705';
    case 'failed':
      return '\u274C';
    default:
      return '\uD83D\uDCDD'; // memo (draft)
  }
}

/**
 * Dispatch a verified Discord interaction to the right handler.
 * Signature verification happens in the route before this is called.
 */
export async function handleInteraction(interaction: Interaction): Promise<Response> {
  if (interaction.type === InteractionType.PING) return pong();

  if (interaction.type === InteractionType.APPLICATION_COMMAND) {
    const name = interaction.data?.name;
    switch (name) {
      case 'setup':
        return handleSetup(interaction);
      case 'link':
        return handleLink(interaction);
      case 'proposals':
        return handleProposals(interaction, true);
      case 'proposals-public':
        return handleProposals(interaction, false);
      case 'vote':
        return handleVote(interaction);
      default:
        return reply(`Unknown command: \`${name ?? '?'}\`.`);
    }
  }

  return reply('Unsupported interaction type.');
}
