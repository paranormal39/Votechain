import { orgService } from '@/lib/domain/service';
import { updateSettingsSchema } from '@/lib/domain/schemas';
import { ok, fail, parseBody, handleError } from '@/lib/api/respond';

export const dynamic = 'force-dynamic';

interface Params {
  params: { id: string };
}

export async function GET(_request: Request, { params }: Params) {
  try {
    const org = await orgService.getOrganization(params.id);
    if (!org) return fail('Organization not found', 404, 'ORG_NOT_FOUND');
    return ok(org);
  } catch (err) {
    return handleError(err);
  }
}

export async function PATCH(request: Request, { params }: Params) {
  const parsed = await parseBody(request, updateSettingsSchema);
  if ('response' in parsed) return parsed.response;

  try {
    const org = await orgService.updateSettings(params.id, parsed.data.membership);
    return ok(org);
  } catch (err) {
    return handleError(err);
  }
}
