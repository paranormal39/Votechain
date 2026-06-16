import { treasuryService } from '@/lib/domain/treasury-service';
import { ok, fail, handleError } from '@/lib/api/respond';
import { depositSchema } from '@/lib/domain/schemas';

export const dynamic = 'force-dynamic';

interface Params { params: { id: string } }

/** GET /api/orgs/[id]/treasury — get or initialise treasury */
export async function GET(_req: Request, { params }: Params) {
  try {
    const account = await treasuryService.getOrInit(params.id);
    return ok(account);
  } catch (err) {
    return handleError(err);
  }
}

/** POST /api/orgs/[id]/treasury/deposit — record a deposit */
export async function POST(request: Request, { params }: Params) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail('Invalid JSON body', 400, 'INVALID_JSON');
  }

  const result = depositSchema.safeParse(body);
  if (!result.success) {
    return fail('Validation failed', 422, 'VALIDATION_ERROR', result.error.flatten());
  }

  try {
    const account = await treasuryService.deposit(params.id, result.data);
    return ok(account, 201);
  } catch (err) {
    return handleError(err);
  }
}
