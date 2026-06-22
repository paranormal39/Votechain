import { projectService } from '@/lib/launchpad';
import { toPublicProject } from '@/lib/launchpad/project-types';
import { projectActionSchema } from '@/lib/domain/schemas';
import { ok, parseBody, handleError } from '@/lib/api/respond';

export const dynamic = 'force-dynamic';

interface Params {
  params: { id: string };
}

/**
 * Drive the funding lifecycle:
 *   open     — provision escrow, begin accepting contributions
 *   sync     — poll the chain for new contributions; auto-activate/fail
 *   activate — force activation (goal must be met)
 *   fail     — mark failed (deadline passed)
 *   refund   — refund all contributors of a failed project
 */
export async function POST(request: Request, { params }: Params) {
  const parsed = await parseBody(request, projectActionSchema);
  if ('response' in parsed) return parsed.response;

  try {
    const { action } = parsed.data;
    let project;
    switch (action) {
      case 'open':
        project = await projectService.openFunding(params.id);
        break;
      case 'sync':
        project = await projectService.syncContributions(params.id);
        break;
      case 'activate':
        project = await projectService.activate(params.id);
        break;
      case 'fail':
        project = await projectService.fail(params.id);
        break;
      case 'refund':
        project = await projectService.refund(params.id);
        break;
    }
    return ok(toPublicProject(project));
  } catch (err) {
    return handleError(err);
  }
}
