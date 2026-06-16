import { treasuryService } from '@/lib/domain/treasury-service';
import { ok, fail, handleError } from '@/lib/api/respond';
import { createSpendRequestSchema, executeSpendSchema, linkProposalSchema } from '@/lib/domain/schemas';

export const dynamic = 'force-dynamic';

interface Params { params: { id: string } }

/** POST /api/orgs/[id]/treasury/spend — create a spend request */
export async function POST(request: Request, { params }: Params) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail('Invalid JSON body', 400, 'INVALID_JSON');
  }

  const url = new URL(request.url);
  const action = url.searchParams.get('action');

  if (action === 'execute') {
    const result = executeSpendSchema.safeParse(body);
    if (!result.success) {
      return fail('Validation failed', 422, 'VALIDATION_ERROR', result.error.flatten());
    }
    try {
      const spendReq = await treasuryService.executeSpend(params.id, result.data);
      return ok(spendReq);
    } catch (err) {
      return handleError(err);
    }
  }

  if (action === 'link') {
    const result = linkProposalSchema.safeParse(body);
    if (!result.success) {
      return fail('Validation failed', 422, 'VALIDATION_ERROR', result.error.flatten());
    }
    try {
      const spendReq = await treasuryService.linkProposal(params.id, result.data.spendRequestId, result.data.proposalId);
      return ok(spendReq);
    } catch (err) {
      return handleError(err);
    }
  }

  const result = createSpendRequestSchema.safeParse(body);
  if (!result.success) {
    return fail('Validation failed', 422, 'VALIDATION_ERROR', result.error.flatten());
  }
  try {
    const spendReq = await treasuryService.createSpendRequest(params.id, result.data);
    return ok(spendReq, 201);
  } catch (err) {
    return handleError(err);
  }
}

/** DELETE /api/orgs/[id]/treasury/spend?spendRequestId=... — cancel a pending spend request */
export async function DELETE(request: Request, { params }: Params) {
  const url = new URL(request.url);
  const spendRequestId = url.searchParams.get('spendRequestId');
  if (!spendRequestId) return fail('spendRequestId query param is required', 400, 'MISSING_PARAM');

  try {
    const spendReq = await treasuryService.cancelSpendRequest(params.id, spendRequestId);
    return ok(spendReq);
  } catch (err) {
    return handleError(err);
  }
}
