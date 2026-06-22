// VoteChain member feedback domain types (Phase 6).
//
// Feedback is anonymous: the backing votechain-feedback contract records only a
// per-(member, org, period) nullifier on-chain, so a member can submit at most
// once per period without revealing their identity. To preserve that anonymity
// off-chain, the local record intentionally stores NO wallet address — only the
// org, period, body and (when available) the on-chain receipt.

export interface Feedback {
  /** Local record id. */
  id: string;
  /** Owning organization id. */
  orgId: string;
  /** Reporting period (e.g. "2026-06" or "2026-Q1"). */
  period: string;
  /** Free-text feedback body. */
  body: string;
  /** On-chain submit_feedback receipt / marker, when the chain call succeeded. */
  receipt?: string;
  createdAt: string;
}

export interface SubmitFeedbackInput {
  walletAddress: string;
  body: string;
  /** Optional period; defaults to the current month (YYYY-MM). */
  period?: string;
}
