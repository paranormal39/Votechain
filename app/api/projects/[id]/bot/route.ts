import { projectService } from '@/lib/launchpad';
import { treasuryService } from '@/lib/domain/treasury-service';
import {
  resolveBotTier,
  nextBotTier,
  isBotUnlocked,
  BOT_TIERS,
  BOT_UNLOCK_THRESHOLD,
} from '@/lib/launchpad/bot-tier';
import { buildInviteUrl, isDiscordConfigured } from '@/lib/discord/config';
import { ok, fail, handleError } from '@/lib/api/respond';

export const dynamic = 'force-dynamic';

interface Params {
  params: { id: string };
}

/**
 * Discord bot status for a project: the treasury-tier gate. The bot install
 * link is only returned once the DAO's treasury balance clears the entry tier.
 * Live projects only — the backing org (and its treasury) exists post-activation.
 */
export async function GET(_request: Request, { params }: Params) {
  try {
    const project = await projectService.get(params.id);
    if (!project) return fail('Project not found', 404, 'PROJECT_NOT_FOUND');

    let balance = 0;
    let currency = project.currency;
    if (project.status === 'live' && project.orgId) {
      const account = await treasuryService.getOrInit(project.orgId, project.currency);
      balance = Number.parseFloat(account.balance) || 0;
      currency = account.currency;
    }

    const tier = resolveBotTier(balance);
    const unlocked = isBotUnlocked(balance);
    const inviteUrl = unlocked ? buildInviteUrl(project.id) : null;

    return ok({
      projectId: project.id,
      status: project.status,
      treasuryBalance: String(balance),
      currency,
      unlocked,
      unlockThreshold: BOT_UNLOCK_THRESHOLD,
      tier,
      nextTier: nextBotTier(balance),
      tiers: BOT_TIERS,
      guildId: project.guildId ?? null,
      discordConfigured: isDiscordConfigured(),
      inviteUrl,
    });
  } catch (err) {
    return handleError(err);
  }
}
