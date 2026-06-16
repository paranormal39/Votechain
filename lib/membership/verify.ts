import 'server-only';
import type { MembershipRequirement } from '../domain/types';
import type {
  RequirementResult,
  VerificationContext,
  VerificationOutcome,
} from './types';
import { getNftCount, getTokenBalance } from './xrpl-rpc';

/**
 * Pluggable membership requirement verifier.
 *
 * Each requirement kind maps to a verifier. Token/NFT requirements are checked
 * against the real chain via JSON-RPC (XRPL/Xahau today; Cardano can slot in
 * later). Midnight requirements rely on a client-generated proof hash because
 * shielded balances cannot be inspected server-side.
 */

const XRPL_FAMILY = new Set(['xrpl', 'xahau']);

async function verifyRequirement(
  requirement: MembershipRequirement,
  ctx: VerificationContext
): Promise<RequirementResult> {
  switch (requirement.kind) {
    case 'token': {
      if (!XRPL_FAMILY.has(requirement.chain)) {
        return {
          requirement,
          satisfied: false,
          detail: `Token verification is not yet supported on ${requirement.chain}.`,
        };
      }
      const balance = await getTokenBalance(
        requirement.chain,
        ctx.walletAddress,
        requirement.issuer,
        requirement.currency
      );
      const need = Number.parseFloat(requirement.minBalance);
      return {
        requirement,
        satisfied: balance >= need,
        detail: `Holds ${balance} ${requirement.currency}; requires ${need}.`,
      };
    }

    case 'nft': {
      if (!XRPL_FAMILY.has(requirement.chain)) {
        return {
          requirement,
          satisfied: false,
          detail: `NFT verification is not yet supported on ${requirement.chain}.`,
        };
      }
      const count = await getNftCount(
        requirement.chain,
        ctx.walletAddress,
        requirement.issuer,
        requirement.taxon
      );
      return {
        requirement,
        satisfied: count >= requirement.minCount,
        detail: `Holds ${count} matching NFT(s); requires ${requirement.minCount}.`,
      };
    }

    case 'midnight': {
      // Shielded holdings are proven client-side; we only receive the hash.
      const provided = Boolean(ctx.proofHash && ctx.proofHash.length >= 8);
      return {
        requirement,
        satisfied: provided,
        detail: provided
          ? 'Midnight holding proof attestation provided.'
          : 'A Midnight holding proof is required to join.',
      };
    }
  }
}

/** Verify all requirements (logical AND). Per-requirement errors fail closed. */
export async function verifyRequirements(
  requirements: MembershipRequirement[],
  ctx: VerificationContext
): Promise<VerificationOutcome> {
  const results = await Promise.all(
    requirements.map((requirement) =>
      verifyRequirement(requirement, ctx).catch(
        (err): RequirementResult => ({
          requirement,
          satisfied: false,
          detail: `Verification error: ${(err as Error).message}`,
        })
      )
    )
  );

  return {
    satisfied: results.every((r) => r.satisfied),
    results,
  };
}
