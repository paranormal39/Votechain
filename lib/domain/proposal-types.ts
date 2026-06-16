// VoteChain proposal domain types.
//
// A Proposal is backed by an AgilityCore proposal (agilityProposalId) once it
// goes active, but the governance lifecycle, voting period, and quorum are
// VoteChain-only concepts that AgilityCore does not model — so they live here.
// Voting itself (tallies) is wired in Phase 3; Phase 2 establishes the
// structure with a zeroed tally.

export type ProposalStatus = 'draft' | 'active' | 'passed' | 'failed';

export type VoteChoice = 'yes' | 'no' | 'abstain' | 'private';

export interface VoteCast {
  /** Voter wallet address. */
  walletAddress: string;
  /** 'private' means a ZK proof was used — the actual choice is unknown server-side. */
  choice: VoteChoice;
  /** AgilityCore txHash or proofHash returned after the vote was recorded. */
  receipt?: string;
  castAt: string;
  /** Number of delegated votes bundled with this cast (undefined = plain vote, weight 1). */
  delegatedWeight?: number;
}

export const PROPOSAL_STATUSES: ProposalStatus[] = ['draft', 'active', 'passed', 'failed'];

export type ProposalType = 'general' | 'treasury';

export interface VoteTally {
  yes: number;
  no: number;
  abstain: number;
}

export interface ProposalComment {
  id: string;
  /** Wallet address of the comment author. */
  author: string;
  body: string;
  createdAt: string;
  /** Backing AgilityCore comment id, when mirrored. */
  agilityCommentId?: string;
}

export interface Proposal {
  /** VoteChain proposal id (stable). */
  id: string;
  /** Owning organization id. */
  orgId: string;
  title: string;
  description: string;
  type: ProposalType;
  status: ProposalStatus;
  /** Wallet address of the creating admin. */
  createdBy: string;
  createdAt: string;
  /** Voting window length in days (set at creation, applied on activation). */
  votingPeriodDays: number;
  /** Minimum total votes required for the proposal to be valid/passable. */
  quorum: number;
  /** Set when the proposal is activated. */
  activatedAt?: string;
  /** Computed at activation = activatedAt + votingPeriodDays. */
  votingEndsAt?: string;
  /** Set when the proposal is finalized. */
  finalizedAt?: string;
  /** Backing AgilityCore proposal id, provisioned on activation. */
  agilityProposalId?: string;
  /** Numeric id used in the on-chain Voting contract (Phase 6). */
  onChainProposalId?: number;
  /** Audit receipt from generate_treasury_audit circuit (Phase 6). */
  auditReceipt?: string;
  /** Vote tally — updated on every cast vote. */
  tally: VoteTally;
  /** Full vote log — choice is 'private' for ZK votes (actual choice never stored). */
  votes: VoteCast[];
  comments: ProposalComment[];
}

export interface CreateProposalInput {
  orgId: string;
  title: string;
  description: string;
  type?: ProposalType;
  votingPeriodDays: number;
  quorum: number;
  createdBy: string;
}

export interface AddCommentInput {
  author: string;
  body: string;
}

export type ProposalAction = 'activate' | 'finalize';

export interface CastPublicVoteInput {
  walletAddress: string;
  choice: Exclude<VoteChoice, 'private'>;
}

export interface CastPrivateVoteInput {
  walletAddress: string;
  /** Opaque ZK proof hash generated client-side. Choice is NEVER stored. */
  proofHash: string;
}

/** Total ballots cast (public + private ZK votes). */
export function participationCount(p: Proposal): number {
  return p.votes.length;
}

/**
 * Resolve the outcome of an active proposal against its quorum.
 * Passes only if participation meets quorum AND yes outweighs no.
 */
export function resolveOutcome(p: Proposal): Extract<ProposalStatus, 'passed' | 'failed'> {
  const participation = participationCount(p);
  if (participation < p.quorum) return 'failed';
  return p.tally.yes > p.tally.no ? 'passed' : 'failed';
}
