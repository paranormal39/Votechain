import { projectService } from '@/lib/launchpad';
import { toPublicProject } from '@/lib/launchpad/project-types';
import { ok, fail, handleError } from '@/lib/api/respond';

export const dynamic = 'force-dynamic';

interface Params {
  params: { id: string };
}

export async function GET(_request: Request, { params }: Params) {
  try {
    const project = await projectService.get(params.id);
    if (!project) return fail('Project not found', 404, 'PROJECT_NOT_FOUND');
    return ok(toPublicProject(project));
  } catch (err) {
    return handleError(err);
  }
}
