// VoteChain treasury domain types.
//
// A TreasuryAccount is scoped to one Organization. Members with the admin role
// can record deposits. SpendRequests must be backed by a passing treasury proposal
// before they can be executed (governance gate).
//
// Phase 5: app-layer only (balances are off-chain bookkeeping).
// Phase 5 ZK: balances committed on-chain via Compact circuit (see docs/smart-contracts-needed.md#contract-4).

export type TxKind = 'deposit' | 'spend' | 'refund';

export type SpendStatus = 'pending' | 'approved' | 'rejected' | 'executed' | 'cancelled';

export type PrivacyMode = 'public' | 'hybrid' | 'private';

export interface TreasuryTx {
  id: string;
  /** Whether this is a deposit, spend, or refund. */
  kind: TxKind;
  /** Amount in the org's chosen currency (string to avoid float loss). */
  amount: string;
  /** ISO 4217 currency code or on-chain token symbol. */
  currency: string;
  /** Wallet that initiated the transaction. */
  initiatorAddress: string;
  /** Optional memo / purpose. */
  memo?: string;
  /** Backing proposal id (required for spend / refund). */
  proposalId?: string;
  /** On-chain txHash when available. */
  txHash?: string;
  createdAt: string;
}

export interface SpendRequest {
  id: string;
  orgId: string;
  /** Proposed spend amount. */
  amount: string;
  currency: string;
  /** Destination wallet. */
  recipientAddress: string;
  /** Human-readable purpose. */
  purpose: string;
  /** Privacy mode for this spend. */
  privacyMode: PrivacyMode;
  status: SpendStatus;
  /** Backing proposal id — must reach 'passed' before execution. */
  proposalId?: string;
  /** Wallet that created the request. */
  requestedBy: string;
  createdAt: string;
  /** ISO timestamp when status last changed. */
  updatedAt: string;
  /** Populated when executed. */
  executedAt?: string;
  executedTxHash?: string;
}

export interface TreasuryAccount {
  /** Matches org id. */
  orgId: string;
  /** Running balance (sum of deposits minus executed spends). */
  balance: string;
  currency: string;
  /** Privacy mode applied to the whole treasury. */
  privacyMode: PrivacyMode;
  /** Full transaction ledger. */
  ledger: TreasuryTx[];
  /** All spend requests (open and closed). */
  spendRequests: SpendRequest[];
  createdAt: string;
  updatedAt: string;
}

export interface DepositInput {
  amount: string;
  currency?: string;
  initiatorAddress: string;
  memo?: string;
  txHash?: string;
}

export interface CreateSpendRequestInput {
  amount: string;
  currency?: string;
  recipientAddress: string;
  purpose: string;
  privacyMode?: PrivacyMode;
  requestedBy: string;
  /** Optional: link an existing proposal id. If omitted, a treasury proposal must be created. */
  proposalId?: string;
}

export interface ExecuteSpendInput {
  spendRequestId: string;
  /** Admin wallet authorising execution. */
  authorisedBy: string;
  txHash?: string;
}
