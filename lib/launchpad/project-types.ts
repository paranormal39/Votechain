// VoteChain launchpad — project (funding campaign) domain types.
//
// A Project is the new entry point that replaces immediate org creation. It
// raises real on-chain funds into escrow; only when the goal is met does it
// activate — releasing escrow to a treasury, minting membership, and creating
// the backing Organization that all existing governance code operates on.

import type { ChainName } from '../agility/types';
import type { EscrowRef, MembershipConfig } from '../chains/types';

/**
 * Funding lifecycle:
 *   draft     — created, not yet open for contributions
 *   funding   — escrow open, accepting contributions
 *   activating— goal hit; releasing escrow + minting + creating the org
 *   live      — fully activated; governance + bot enabled
 *   failed    — deadline passed without hitting the goal
 *   refunding — issuing refunds to contributors
 *   refunded  — all contributors refunded
 */
export type ProjectStatus =
  | 'draft'
  | 'funding'
  | 'activating'
  | 'live'
  | 'failed'
  | 'refunding'
  | 'refunded';

export const PROJECT_STATUSES: ProjectStatus[] = [
  'draft',
  'funding',
  'activating',
  'live',
  'failed',
  'refunding',
  'refunded',
];

export interface Project {
  /** Stable launchpad project id (slug-like). */
  id: string;
  name: string;
  description?: string;
  /** Chain the escrow + membership asset live on. */
  chain: ChainName;
  /** Creator wallet (becomes the org admin on activation). */
  createdBy: string;
  /**
   * Decimal string funding goal in the campaign currency. For chains with an
   * account reserve (XRPL/Xahau), this is bumped by {@link reserveAmount} when
   * funding opens so the net released amount still meets the creator's goal.
   */
  goalAmount: string;
  /**
   * On-chain account reserve (decimal string) folded into {@link goalAmount}
   * when funding opens. This portion stays permanently locked in the escrow
   * account and is not released to the treasury. Undefined for chains without
   * an account reserve (e.g. Midnight).
   */
  reserveAmount?: string;
  /** Campaign currency (e.g. "XRP", "NIGHT"). */
  currency: string;
  /** ISO deadline; a missed goal after this triggers refunds. */
  deadline: string;
  status: ProjectStatus;
  /** Total raised so far (decimal string), updated as contributions arrive. */
  raisedAmount: string;
  /** Membership asset minted to contributors on success. */
  membership: MembershipConfig;
  /** On-chain escrow reference (no secrets). Set when funding opens. */
  escrowRef?: EscrowRef;
  /** AES-GCM encrypted escrow signing secret (never returned to clients). */
  escrowSecretEnc?: string;
  /** Opaque contribution-scan cursor for the chain adapter. */
  scanMarker?: string;
  /** Bound Discord guild id (set via the bot /setup command). */
  guildId?: string;
  /** Backing Organization id, created on activation. */
  orgId?: string;
  createdAt: string;
  activatedAt?: string;
}

export interface CreateProjectInput {
  name: string;
  description?: string;
  chain: ChainName;
  createdBy: string;
  goalAmount: string;
  currency: string;
  /** ISO deadline. */
  deadline: string;
  membership: MembershipConfig;
}

/** Public-facing projection of a Project (secrets stripped). */
export type PublicProject = Omit<Project, 'escrowSecretEnc'>;

export function toPublicProject(p: Project): PublicProject {
  const { escrowSecretEnc: _omit, ...rest } = p;
  void _omit;
  return rest;
}

/**
 * Minimum cumulative contribution (campaign-currency units) a wallet must reach
 * to be auto-enrolled as a member of the backing organization. Test value = 1.
 */
export const MIN_MEMBERSHIP_CONTRIBUTION = 1;

/** Fraction of the goal raised, clamped to [0, 1]. */
export function fundingProgress(p: Project): number {
  const goal = Number.parseFloat(p.goalAmount);
  const raised = Number.parseFloat(p.raisedAmount);
  if (!Number.isFinite(goal) || goal <= 0) return 0;
  return Math.min(1, Math.max(0, raised / goal));
}

/** True when raised >= goal. */
export function isGoalMet(p: Project): boolean {
  return Number.parseFloat(p.raisedAmount) >= Number.parseFloat(p.goalAmount);
}

/** True when the deadline has passed. */
export function isExpired(p: Project, now: Date = new Date()): boolean {
  return new Date(p.deadline).getTime() <= now.getTime();
}
