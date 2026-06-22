// VoteChain launchpad — contribution domain types.

export type ContributionStatus = 'confirmed' | 'refunded' | 'minted';

export interface Contribution {
  /** Unique id (derived from txHash). */
  id: string;
  projectId: string;
  /** Contributor wallet address. */
  contributor: string;
  /** Decimal string amount in the campaign currency. */
  amount: string;
  /** On-chain transaction hash of the contribution. */
  txHash: string;
  status: ContributionStatus;
  /** Set when the membership asset has been minted to the contributor. */
  mintTxHash?: string;
  /** Set when the contributor has been refunded (failed campaign). */
  refundTxHash?: string;
  createdAt: string;
}
