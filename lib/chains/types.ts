// VoteChain launchpad — chain adapter abstraction.
//
// A ChainAdapter performs the real on-chain actions a funding campaign needs:
// open an escrow, watch incoming contributions, release funds to a treasury
// when the goal is met, refund contributors when it is missed, and mint the
// membership asset (token / NFT / Midnight credential) to contributors on
// success. Each chain (XRPL, Xahau, Midnight, Cardano) provides one
// implementation; `registry.ts` resolves the right one per project.

import type { ChainName } from '../agility/types';

/** How a membership entitlement is represented on-chain. */
export type MembershipKind = 'token' | 'nft' | 'credential';

/**
 * Opaque, serialisable reference to a project's on-chain escrow. Persisted on
 * the Project record. Never contains secrets — signing material is stored
 * separately (encrypted) and supplied to write methods via {@link SignerAuth}.
 */
export interface EscrowRef {
  chain: ChainName;
  /** Primary locator: XRPL/Xahau classic address, or Midnight contract address. */
  address: string;
  /** Issuer / minter address for membership tokens & NFTs (XRPL family). */
  issuer?: string;
  /** Per-chain metadata (e.g. currency code, taxon, contract id). */
  meta?: Record<string, string>;
}

/** Chain-native signing material for escrow / issuer accounts. */
export interface SignerAuth {
  /** XRPL/Xahau family seed (s...), or Midnight wallet seed (hex). */
  secret: string;
}

/** A single inbound contribution detected on the escrow. */
export interface ContributionRecord {
  /** Contributor's address. */
  from: string;
  /** Decimal string amount in the campaign currency. */
  amount: string;
  /** On-chain transaction hash / id. */
  txHash: string;
  /** ISO timestamp (best-effort; may be derived from ledger close time). */
  at?: string;
}

/** Result of scanning the escrow for new contributions. */
export interface ContributionScan {
  contributions: ContributionRecord[];
  /** Opaque cursor to pass back on the next scan to avoid re-reading. */
  marker?: string;
}

/** Receipt for a submitted write transaction. */
export interface TxReceipt {
  txHash: string;
  /** True when the submission was accepted (tentatively or validated). */
  accepted: boolean;
  /** Raw engine/result code for diagnostics. */
  resultCode?: string;
}

export interface CreateEscrowInput {
  projectId: string;
  /** Decimal string funding goal. */
  goalAmount: string;
  /** Campaign currency (e.g. "XRP", "NIGHT", or an issued currency code). */
  currency: string;
  /** Unix seconds deadline after which a missed goal triggers refunds. */
  deadline: number;
  /** Membership asset to mint on success. */
  membership: MembershipConfig;
}

export interface MembershipConfig {
  kind: MembershipKind;
  /** Display name / symbol for the membership asset. */
  name: string;
  /** Issued-currency code (XRPL token) — 3-char ASCII or 40-char hex. */
  currency?: string;
  /** Per-contributor amount minted (token) or count (NFT). Defaults to 1. */
  amountPerContributor?: string;
  /** XRPL NFT taxon, when kind === 'nft'. */
  taxon?: number;
}

export interface MintMembershipInput {
  ref: EscrowRef;
  membership: MembershipConfig;
  /** Recipient contributor address. */
  to: string;
}

export interface MintResult {
  txHash: string;
  /** NFTokenID / asset locator that was minted, when available. */
  assetRef?: string;
}

export interface VerifyHoldingInput {
  ref: EscrowRef;
  membership: MembershipConfig;
  /** Address whose holdings are being checked. */
  address: string;
}

/**
 * A pluggable per-chain implementation. All methods perform real on-chain
 * actions. Read methods (`getEscrowBalance`, `scanContributions`,
 * `verifyHolding`) require no secrets. Write methods require {@link SignerAuth}.
 */
export interface ChainAdapter {
  readonly chain: ChainName;

  /** Provision an escrow for the campaign (generate/derive the locator). */
  createEscrow(input: CreateEscrowInput): Promise<{ ref: EscrowRef; auth: SignerAuth }>;

  /** Current balance held in escrow, as a decimal string in the campaign currency. */
  getEscrowBalance(ref: EscrowRef): Promise<string>;

  /**
   * Amount (decimal string, campaign currency) that is permanently locked to
   * keep the on-chain escrow account alive and therefore cannot be released to
   * the treasury. Chains without an account reserve (e.g. Midnight) omit this.
   */
  getAccountReserve?(): Promise<string>;

  /** Scan for inbound contributions since the given marker. */
  scanContributions(ref: EscrowRef, sinceMarker?: string): Promise<ContributionScan>;

  /** Release the full escrow balance to the destination (treasury) address. */
  releaseEscrow(ref: EscrowRef, destination: string, auth: SignerAuth): Promise<TxReceipt>;

  /** Refund a specific contributor their contributed amount. */
  refundContributor(
    ref: EscrowRef,
    contributor: string,
    amount: string,
    auth: SignerAuth
  ): Promise<TxReceipt>;

  /** Mint the membership asset to a contributor. */
  mintMembership(input: MintMembershipInput, auth: SignerAuth): Promise<MintResult>;

  /** Verify an address holds the membership asset (for bot gating). */
  verifyHolding(input: VerifyHoldingInput): Promise<boolean>;
}

/** Thrown when an adapter cannot perform a write because custody keys are absent. */
export class CustodyKeyMissingError extends Error {
  constructor(chain: ChainName) {
    super(`No custody/signing key available for ${chain} escrow write`);
    this.name = 'CustodyKeyMissingError';
  }
}

/** Thrown when an adapter feature is not yet implemented for a chain. */
export class AdapterUnsupportedError extends Error {
  constructor(chain: ChainName, feature: string) {
    super(`${feature} is not supported by the ${chain} adapter yet`);
    this.name = 'AdapterUnsupportedError';
  }
}
