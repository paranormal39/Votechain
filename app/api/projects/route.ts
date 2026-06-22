import { projectService } from '@/lib/launchpad';
import { toPublicProject } from '@/lib/launchpad/project-types';
import { createProjectSchema } from '@/lib/domain/schemas';
import { ok, parseBody, handleError } from '@/lib/api/respond';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const projects = await projectService.list();
    return ok(projects.map(toPublicProject));
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(request: Request) {
  const parsed = await parseBody(request, createProjectSchema);
  if ('response' in parsed) return parsed.response;

  try {
    const project = await projectService.createProject(parsed.data);
    return ok(toPublicProject(project), 201);
  } catch (err) {
    return handleError(err);
  }
}
