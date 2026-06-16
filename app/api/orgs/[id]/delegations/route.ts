import { delegationService } from '@/lib/domain/delegation-service';
import { ok, fail, handleError } from '@/lib/api/respond';
import { delegateSchema, revokeDelegationSchema } from '@/lib/domain/schemas';

export const dynamic = 'force-dynamic';

interface Params { params: { id: string } }

/** GET /api/orgs/[id]/delegations — list all delegations for an org */
export async function GET(_req: Request, { params }: Params) {
  try {
    const delegations = await delegationService.listDelegations(params.id);
    return ok(delegations);
  } catch (err) {
    return handleError(err);
  }
}

/** POST /api/orgs/[id]/delegations — create a new delegation */
export async function POST(request: Request, { params }: Params) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail('Invalid JSON body', 400, 'INVALID_JSON');
  }

  const result = delegateSchema.safeParse(body);
  if (!result.success) {
    return fail('Validation failed', 422, 'VALIDATION_ERROR', result.error.flatten());
  }

  try {
    const delegation = await delegationService.delegate(params.id, result.data);
    return ok(delegation, 201);
  } catch (err) {
    return handleError(err);
  }
}

/** DELETE /api/orgs/[id]/delegations — revoke an active delegation */
export async function DELETE(request: Request, { params }: Params) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail('Invalid JSON body', 400, 'INVALID_JSON');
  }

  const result = revokeDelegationSchema.safeParse(body);
  if (!result.success) {
    return fail('Validation failed', 422, 'VALIDATION_ERROR', result.error.flatten());
  }

  try {
    const delegation = await delegationService.revoke(params.id, result.data.delegatorAddress);
    return ok(delegation);
  } catch (err) {
    return handleError(err);
  }
}
