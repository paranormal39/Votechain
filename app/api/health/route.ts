import { AgilityClient } from '@/lib/agility/client';
import { ok, handleError } from '@/lib/api/respond';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const res = await new AgilityClient().health();
    return ok(res.data ?? null);
  } catch (err) {
    return handleError(err);
  }
}
