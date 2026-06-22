// VoteChain launchpad — Discord bot treasury-tier gate.
//
// The hosted Discord bot is unlocked for a DAO once its treasury balance clears
// a tier threshold. Higher tiers unlock more bot surface (see roadmap Phase B).
// This module is pure data + helpers (no server-only / IO) so both the BFF and
// client UI can import the tier table for gating and display.

export type BotTierName = 'Basic' | 'Second' | 'High' | 'Enterprise';

export interface BotTier {
  /** Tier level, ascending (1 = entry). */
  level: number;
  name: BotTierName;
  /** Minimum treasury balance (in the treasury currency) to reach this tier. */
  threshold: number;
  /** Short capability summary surfaced in the UI. */
  capabilities: string[];
}

/**
 * Test thresholds (1 / 5 / 10 / 20). Replace with production values and pin the
 * currency before launch. Tiers MUST stay sorted by ascending threshold.
 */
export const BOT_TIERS: BotTier[] = [
  {
    level: 1,
    name: 'Basic',
    threshold: 1,
    capabilities: ['Invite bot', '/proposals', '/vote'],
  },
  {
    level: 2,
    name: 'Second',
    threshold: 5,
    capabilities: ['+ announcements', '/treasury read'],
  },
  {
    level: 3,
    name: 'High',
    threshold: 10,
    capabilities: ['+ delegation commands', 'analytics'],
  },
  {
    level: 4,
    name: 'Enterprise',
    threshold: 20,
    capabilities: ['+ private feedback', 'audit export'],
  },
];

/** Minimum balance required to unlock the bot at all (the entry tier). */
export const BOT_UNLOCK_THRESHOLD = BOT_TIERS[0].threshold;

/** Resolve the highest tier a treasury balance qualifies for, or null if none. */
export function resolveBotTier(balance: number): BotTier | null {
  if (!Number.isFinite(balance)) return null;
  let resolved: BotTier | null = null;
  for (const tier of BOT_TIERS) {
    if (balance >= tier.threshold) resolved = tier;
  }
  return resolved;
}

/** True when the treasury balance clears the entry tier. */
export function isBotUnlocked(balance: number): boolean {
  return Number.isFinite(balance) && balance >= BOT_UNLOCK_THRESHOLD;
}

/** The next tier above the current balance, or null if already at the top. */
export function nextBotTier(balance: number): BotTier | null {
  for (const tier of BOT_TIERS) {
    if (balance < tier.threshold) return tier;
  }
  return null;
}
