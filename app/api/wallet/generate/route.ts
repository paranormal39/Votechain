import { ok, fail, handleError } from '@/lib/api/respond';
import { chainSchema } from '@/lib/domain/schemas';
import { generators } from '@/scripts/wallets/index';

export const dynamic = 'force-dynamic';

/**
 * Generate an ephemeral test identity for a chain (Phase 1 demo helper).
 * Only the public address + network are returned; secret material stays server-side.
 */
export async function POST(request: Request) {
  let chain: string | undefined;
  try {
    const body = (await request.json()) as { chain?: string };
    chain = body.chain;
  } catch {
    return fail('Invalid JSON body', 400, 'INVALID_JSON');
  }

  const parsed = chainSchema.safeParse(chain);
  if (!parsed.success) {
    return fail('Invalid chain', 422, 'VALIDATION_ERROR', parsed.error.flatten());
  }

  try {
    const generator = generators.find((g) => g.chain === parsed.data);
    if (!generator) return fail('No generator for chain', 400, 'NO_GENERATOR');
    const wallet = await generator.generate();
    return ok({ address: wallet.address, chain: wallet.chain, network: wallet.network });
  } catch (err) {
    return handleError(err);
  }
}
