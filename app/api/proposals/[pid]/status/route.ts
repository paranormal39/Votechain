import { proposalService } from '@/lib/domain/proposal-service';
import { proposalActionSchema } from '@/lib/domain/schemas';
import { ok, parseBody, handleError } from '@/lib/api/respond';

export const dynamic = 'force-dynamic';

interface Params {
  params: { pid: string };
}

export async function POST(request: Request, { params }: Params) {
  const parsed = await parseBody(request, proposalActionSchema);
  if ('response' in parsed) return parsed.response;

  try {
    const proposal =
      parsed.data.action === 'activate'
        ? await proposalService.activateProposal(params.pid)
        : await proposalService.finalizeProposal(params.pid);
    return ok(proposal);
  } catch (err) {
    return handleError(err);
  }
}
