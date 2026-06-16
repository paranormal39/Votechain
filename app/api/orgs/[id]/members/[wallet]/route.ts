import { orgService } from '@/lib/domain/service';
import { roleSchema } from '@/lib/domain/schemas';
import { ok, parseBody, handleError } from '@/lib/api/respond';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

interface Params {
  params: { id: string; wallet: string };
}

const patchSchema = z.object({ role: roleSchema });

export async function PATCH(request: Request, { params }: Params) {
  const parsed = await parseBody(request, patchSchema);
  if ('response' in parsed) return parsed.response;

  try {
    const wallet = decodeURIComponent(params.wallet);
    const org = await orgService.updateMemberRole(params.id, wallet, parsed.data.role);
    return ok(org);
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const wallet = decodeURIComponent(params.wallet);
    const org = await orgService.removeMember(params.id, wallet);
    return ok(org);
  } catch (err) {
    return handleError(err);
  }
}
