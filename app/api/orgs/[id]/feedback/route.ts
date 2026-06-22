import { feedbackService } from '@/lib/domain/feedback-service';
import { ok, fail, handleError } from '@/lib/api/respond';
import { submitFeedbackSchema } from '@/lib/domain/schemas';

export const dynamic = 'force-dynamic';

interface Params { params: { id: string } }

/** GET /api/orgs/[id]/feedback — list submitted feedback for an org */
export async function GET(_req: Request, { params }: Params) {
  try {
    const feedback = await feedbackService.listByOrg(params.id);
    return ok(feedback);
  } catch (err) {
    return handleError(err);
  }
}

/** POST /api/orgs/[id]/feedback — submit anonymous member feedback */
export async function POST(request: Request, { params }: Params) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail('Invalid JSON body', 400, 'INVALID_JSON');
  }

  const result = submitFeedbackSchema.safeParse(body);
  if (!result.success) {
    return fail('Validation failed', 422, 'VALIDATION_ERROR', result.error.flatten());
  }

  try {
    const feedback = await feedbackService.submit(params.id, result.data);
    return ok(feedback, 201);
  } catch (err) {
    return handleError(err);
  }
}
