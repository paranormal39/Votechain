import { orgService } from '@/lib/domain/service';
import { createOrgSchema } from '@/lib/domain/schemas';
import { ok, parseBody, handleError } from '@/lib/api/respond';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const orgs = await orgService.listOrganizations();
    return ok(orgs);
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(request: Request) {
  const parsed = await parseBody(request, createOrgSchema);
  if ('response' in parsed) return parsed.response;

  try {
    const org = await orgService.createOrganization(parsed.data);
    return ok(org, 201);
  } catch (err) {
    return handleError(err);
  }
}
