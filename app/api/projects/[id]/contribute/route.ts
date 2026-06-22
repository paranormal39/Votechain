import { projectService } from '@/lib/launchpad';
import { ok, fail, handleError } from '@/lib/api/respond';

export const dynamic = 'force-dynamic';

interface Params {
  params: { id: string };
}

/**
 * Return on-chain deposit instructions for a contributor. The contributor signs
 * and submits the payment from their own wallet (Xaman for XRPL/Xahau, Lace for
 * Midnight); the backend never holds contributor keys. New contributions are
 * picked up by the `sync` action.
 */
export async function GET(_request: Request, { params }: Params) {
  try {
    const project = await projectService.get(params.id);
    if (!project) return fail('Project not found', 404, 'PROJECT_NOT_FOUND');
    // Funding projects accept contributions toward the goal; live projects stay
    // open so new donors can join the DAO by donating.
    const open = project.status === 'funding' || project.status === 'live';
    if (!open || !project.escrowRef) {
      return fail('Project is not open for contributions', 409, 'PROJECT_STATE');
    }
    return ok({
      chain: project.chain,
      currency: project.currency,
      escrowAddress: project.escrowRef.address,
      memo: `votechain:${project.id}`,
      goalAmount: project.goalAmount,
      raisedAmount: project.raisedAmount,
      deadline: project.deadline,
    });
  } catch (err) {
    return handleError(err);
  }
}
