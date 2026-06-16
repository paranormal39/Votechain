import { proposalService } from '@/lib/domain/proposal-service';
import { ok, fail, handleError } from '@/lib/api/respond';
import { publicVoteSchema, privateVoteSchema } from '@/lib/domain/schemas';

export const dynamic = 'force-dynamic';

interface Params {
  params: { pid: string };
}

export async function POST(request: Request, { params }: Params) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail('Invalid JSON body', 400, 'INVALID_JSON');
  }

  const raw = body as Record<string, unknown>;

  try {
    if (typeof raw.proofHash === 'string') {
      const result = privateVoteSchema.safeParse(raw);
      if (!result.success) {
        return fail('Validation failed', 422, 'VALIDATION_ERROR', result.error.flatten());
      }
      const proposal = await proposalService.castPrivateVote(params.pid, result.data);
      return ok(proposal);
    } else {
      const result = publicVoteSchema.safeParse(raw);
      if (!result.success) {
        return fail('Validation failed', 422, 'VALIDATION_ERROR', result.error.flatten());
      }
      const proposal = await proposalService.castVote(params.pid, result.data);
      return ok(proposal);
    }
  } catch (err) {
    return handleError(err);
  }
}
