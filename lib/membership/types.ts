import type { ChainName } from '../agility/types';
import type { MembershipRequirement } from '../domain/types';

/** Inputs available when evaluating whether a wallet satisfies a requirement. */
export interface VerificationContext {
  walletAddress: string;
  chain: ChainName;
  /** Opaque client-generated proof hash (required for Midnight requirements). */
  proofHash?: string;
}

/** Outcome of evaluating a single requirement. */
export interface RequirementResult {
  requirement: MembershipRequirement;
  satisfied: boolean;
  /** Human-readable explanation shown to the applicant. */
  detail: string;
}

/** Aggregate outcome across all of an organization's requirements. */
export interface VerificationOutcome {
  satisfied: boolean;
  results: RequirementResult[];
}
