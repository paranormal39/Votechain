// VoteChain delegation domain types.
//
// A Delegation is a member (delegator) granting their vote weight to another
// member (delegate) within an organization. Delegations are org-scoped and
// persist until explicitly revoked. The delegation chain is recorded so that
// when a delegate votes, the full weight (their own + all active delegations)
// is reflected in the tally.
//
// Phase 4: stored in VoteChain domain only.
// Phase 4+ (ZK): delegation relationship committed on-chain via Compact circuit
// so the delegator–delegate link is hidden (see docs/smart-contracts-needed.md).

export interface Delegation {
  /** Stable unique id for this delegation record. */
  id: string;
  /** Org this delegation is scoped to. */
  orgId: string;
  /** Wallet address granting their vote power. */
  delegatorAddress: string;
  /** Wallet address receiving the vote power. */
  delegateAddress: string;
  /** ISO timestamp when the delegation was created. */
  createdAt: string;
  /** Whether the delegation is currently active. */
  active: boolean;
  /** ISO timestamp when revoked (undefined if still active). */
  revokedAt?: string;
}

export interface DelegateInput {
  /** Wallet address of the member granting power (must be an org member). */
  delegatorAddress: string;
  /** Wallet address of the member receiving power (must be an org member). */
  delegateAddress: string;
}

export interface RevokeDelegationInput {
  /** The delegator revoking their own delegation. */
  delegatorAddress: string;
}

/** Summary view used on delegate profile pages. */
export interface DelegateProfile {
  /** The delegate's wallet address. */
  walletAddress: string;
  /** All active delegations pointing at this delegate (within one org). */
  activeDelegations: Delegation[];
  /** Total vote weight = 1 (own vote) + number of active delegations. */
  voteWeight: number;
  /** Full delegation history for this delegate (including revoked). */
  history: Delegation[];
}
