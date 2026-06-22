import { orgService } from '@/lib/domain/service';
import { ok, fail, handleError } from '@/lib/api/respond';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const orgs = await orgService.listOrganizations();
    return ok(orgs);
  } catch (err) {
    return handleError(err);
  }
}

/**
 * Direct organization creation is disabled by the launchpad pivot. An
 * Organization is created automatically when its backing launchpad project
 * reaches its funding goal and activates. Create a project instead.
 */
export async function POST() {
  return fail(
    'Organizations are created via the launchpad. Create a funding project at POST /api/projects; the org is provisioned automatically when the goal is met.',
    409,
    'ORG_CREATE_DISABLED'
  );
}
