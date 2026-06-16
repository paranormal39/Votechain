import { delegationService } from '@/lib/domain/delegation-service';
import { ok, handleError } from '@/lib/api/respond';

export const dynamic = 'force-dynamic';

interface Params { params: { id: string; addr: string } }

/** GET /api/orgs/[id]/delegations/profile/[addr] — delegate profile for a wallet */
export async function GET(_req: Request, { params }: Params) {
  try {
    const profile = await delegationService.getDelegateProfile(params.id, params.addr);
    return ok(profile);
  } catch (err) {
    return handleError(err);
  }
}
