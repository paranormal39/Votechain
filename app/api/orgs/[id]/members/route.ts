import { orgService } from '@/lib/domain/service';
import { addMemberSchema } from '@/lib/domain/schemas';
import { ok, fail, parseBody, handleError } from '@/lib/api/respond';

export const dynamic = 'force-dynamic';

interface Params {
  params: { id: string };
}

export async function GET(_request: Request, { params }: Params) {
  try {
    const org = await orgService.getOrganization(params.id);
    if (!org) return fail('Organization not found', 404, 'ORG_NOT_FOUND');
    return ok(org.members);
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(request: Request, { params }: Params) {
  const parsed = await parseBody(request, addMemberSchema);
  if ('response' in parsed) return parsed.response;

  try {
    const org = await orgService.addMember(params.id, parsed.data);
    return ok(org, 201);
  } catch (err) {
    return handleError(err);
  }
}
