import { pendingLinkRepository, type PendingLink } from '@/lib/discord/pending-link-repository';
import { getPayloadStatus } from '@/lib/wallet/xaman-server';
import { projectRepository } from '@/lib/launchpad/project-repository';
import { orgService } from '@/lib/domain/service';
import { identityRepository } from '@/lib/launchpad/identity-repository';
import { sendInteractionFollowup } from '@/lib/discord/rest';

// Xaman webhook — fires when ANY of this app's payloads resolves.
//
// For the Discord scan-to-link flow: we created the SignIn payload with a
// pending record keyed by its uuid. When the webhook arrives we re-fetch the
// payload from Xaman (authoritative — a spoofed webhook can't forge this),
// confirm it was signed, check the signer is a DAO member, then record the
// encrypted identity link and post a follow-up confirmation in Discord.
//
// Payloads with no matching pending record (e.g. normal web sign-ins) are
// ignored. We always answer 200 so Xaman doesn't retry.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const OK = new Response('ok', { status: 200 });

async function notify(pending: PendingLink, content: string): Promise<void> {
  await sendInteractionFollowup(pending.applicationId, pending.interactionToken, content);
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return OK;
  }

  const payloadResponse = body.payloadResponse as { payload_uuidv4?: string; signed?: boolean } | undefined;
  const meta = body.meta as { payload_uuidv4?: string } | undefined;
  const uuid = payloadResponse?.payload_uuidv4 ?? meta?.payload_uuidv4;
  if (!uuid) return OK;

  try {
    const pending = await pendingLinkRepository.get(uuid);
    if (!pending) return OK; // not a Discord-link payload

    // User declined / didn't sign.
    if (payloadResponse?.signed === false) {
      await pendingLinkRepository.remove(uuid);
      await notify(pending, '\u26A0\uFE0F Wallet link cancelled \u2014 the sign-in wasn\u2019t completed. Run `/link` to try again.');
      return OK;
    }

    // Authoritative check: read the resolved payload from Xaman.
    const status = await getPayloadStatus(uuid);
    if (!status.signed || !status.account) return OK;

    const project = await projectRepository.getByGuild(pending.guildId).catch(() => null);
    const org = project?.orgId ? await orgService.getOrganization(project.orgId) : null;
    if (!org) {
      await pendingLinkRepository.remove(uuid);
      await notify(pending, 'The linked DAO could not be found. An admin may need to re-run `/setup`.');
      return OK;
    }

    const isMember = org.members.some((m) => m.walletAddress === status.account);
    if (!isMember) {
      await pendingLinkRepository.remove(uuid);
      await notify(
        pending,
        `That wallet (\`${status.account}\`) isn\u2019t a member of this DAO. Join/contribute first, then run \`/link\` again.`
      );
      return OK;
    }

    await identityRepository.link({
      guildId: pending.guildId,
      discordUserId: pending.discordUserId,
      chain: org.chain,
      walletAddress: status.account,
    });
    await pendingLinkRepository.remove(uuid);
    await notify(pending, '\uD83D\uDD10 Wallet linked! Your address is encrypted and never shown publicly. You can now use `/vote`.');
  } catch (err) {
    console.error('[xaman/webhook] error:', err);
  }

  return OK;
}
