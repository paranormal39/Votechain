import { orgService } from '@/lib/domain/service';
import { joinOrgSchema } from '@/lib/domain/schemas';
import { ok, parseBody, handleError } from '@/lib/api/respond';

export const dynamic = 'force-dynamic';

interface Params {
  params: { id: string };
}

export async function POST(request: Request, { params }: Params) {
  const parsed = await parseBody(request, joinOrgSchema);
  if ('response' in parsed) return parsed.response;

  try {
    const org = await orgService.joinOrganization(params.id, parsed.data);
    return ok(org, 201);
  } catch (err) {
    return handleError(err);
  }
}
