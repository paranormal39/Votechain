import { projectService } from '@/lib/launchpad';
import { ok, handleError } from '@/lib/api/respond';

export const dynamic = 'force-dynamic';

interface Params {
  params: { id: string };
}

export async function GET(_request: Request, { params }: Params) {
  try {
    const contributions = await projectService.listContributions(params.id);
    return ok(contributions);
  } catch (err) {
    return handleError(err);
  }
}
