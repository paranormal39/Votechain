import { proposalService } from '@/lib/domain/proposal-service';
import { createProposalSchema } from '@/lib/domain/schemas';
import { ok, parseBody, handleError } from '@/lib/api/respond';

export const dynamic = 'force-dynamic';

interface Params {
  params: { id: string };
}

export async function GET(_request: Request, { params }: Params) {
  try {
    const proposals = await proposalService.listByOrg(params.id);
    return ok(proposals);
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(request: Request, { params }: Params) {
  const parsed = await parseBody(request, createProposalSchema);
  if ('response' in parsed) return parsed.response;

  try {
    const proposal = await proposalService.createProposal({ orgId: params.id, ...parsed.data });
    return ok(proposal, 201);
  } catch (err) {
    return handleError(err);
  }
}
