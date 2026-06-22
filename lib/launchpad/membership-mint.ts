import 'server-only';
import { getChainAdapter, type SignerAuth } from '../chains';
import type { Contribution } from './contribution-types';
import type { ContributionRepository } from './contribution-repository';
import type { Project } from './project-types';

export interface MintSummary {
  minted: number;
  failed: number;
}

/**
 * Mint the membership asset to every confirmed contributor of a project.
 * Best-effort per contributor: a failure to mint for one contributor is logged
 * and does not abort the rest (the contribution stays 'confirmed' for retry).
 */
export async function mintMembershipToContributors(
  project: Project,
  contributions: Contribution[],
  auth: SignerAuth,
  contributionRepo: ContributionRepository
): Promise<MintSummary> {
  if (!project.escrowRef) return { minted: 0, failed: 0 };
  const adapter = getChainAdapter(project.chain);

  let minted = 0;
  let failed = 0;
  for (const c of contributions) {
    if (c.status === 'minted') {
      minted += 1;
      continue;
    }
    try {
      const result = await adapter.mintMembership(
        { ref: project.escrowRef, membership: project.membership, to: c.contributor },
        auth
      );
      await contributionRepo.update(c.id, (row) => ({
        ...row,
        status: 'minted',
        mintTxHash: result.txHash,
      }));
      minted += 1;
    } catch (err) {
      failed += 1;
      console.warn(
        `[membership-mint] mint deferred for ${c.contributor} on "${project.id}": ${String(err)}`
      );
    }
  }
  return { minted, failed };
}
