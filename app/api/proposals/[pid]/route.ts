import { proposalService } from '@/lib/domain/proposal-service';
import { ok, fail, handleError } from '@/lib/api/respond';

export const dynamic = 'force-dynamic';

interface Params {
  params: { pid: string };
}

export async function GET(_request: Request, { params }: Params) {
  try {
    const proposal = await proposalService.getProposal(params.pid);
    if (!proposal) return fail('Proposal not found', 404, 'PROPOSAL_NOT_FOUND');
    return ok(proposal);
  } catch (err) {
    return handleError(err);
  }
}
