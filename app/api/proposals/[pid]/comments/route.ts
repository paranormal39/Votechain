import { proposalService } from '@/lib/domain/proposal-service';
import { addCommentSchema } from '@/lib/domain/schemas';
import { ok, fail, parseBody, handleError } from '@/lib/api/respond';

export const dynamic = 'force-dynamic';

interface Params {
  params: { pid: string };
}

export async function GET(_request: Request, { params }: Params) {
  try {
    const proposal = await proposalService.getProposal(params.pid);
    if (!proposal) return fail('Proposal not found', 404, 'PROPOSAL_NOT_FOUND');
    return ok(proposal.comments);
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(request: Request, { params }: Params) {
  const parsed = await parseBody(request, addCommentSchema);
  if ('response' in parsed) return parsed.response;

  try {
    const proposal = await proposalService.comment(params.pid, parsed.data);
    return ok(proposal, 201);
  } catch (err) {
    return handleError(err);
  }
}
