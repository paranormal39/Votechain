/**
 * BFF proxy for the Xaman (XUMM) API.
 *
 * Keeps the XAMAN_API_KEY and XAMAN_API_SECRET server-side.
 * The browser only touches /api/wallet/xaman — never the Xaman API directly.
 *
 * POST — create a sign-in payload
 * GET  — poll an existing payload status
 *
 * Required env vars:
 *   XAMAN_API_KEY     — from https://apps.xaman.dev
 *   XAMAN_API_SECRET  — from https://apps.xaman.dev
 */

import { ok, fail } from '@/lib/api/respond';

export const dynamic = 'force-dynamic';

const XAMAN_BASE = 'https://xumm.app/api/v1/platform';

function xamanHeaders() {
  const key = process.env.XAMAN_API_KEY;
  const secret = process.env.XAMAN_API_SECRET;
  if (!key || !secret) {
    throw new Error('XAMAN_API_KEY and XAMAN_API_SECRET must be set');
  }
  return {
    'Content-Type': 'application/json',
    'X-API-Key': key,
    'X-API-Secret': secret,
  };
}

/** POST /api/wallet/xaman — create a SignIn payload */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail('Invalid JSON body', 400, 'INVALID_JSON');
  }

  const { type } = body as { type?: string };
  if (type !== 'SignIn') {
    return fail('Only SignIn payloads are supported', 422, 'UNSUPPORTED_PAYLOAD_TYPE');
  }

  try {
    const headers = xamanHeaders();
    const res = await fetch(`${XAMAN_BASE}/payload`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        txjson: { TransactionType: 'SignIn' },
        options: { submit: false, expire: 2 },
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return fail(`Xaman API error: ${JSON.stringify(err)}`, res.status, 'XAMAN_ERROR');
    }

    const data = await res.json();
    return ok(data);
  } catch (err) {
    if ((err as Error).message.includes('XAMAN_API_KEY')) {
      return fail('Xaman API credentials not configured — set XAMAN_API_KEY and XAMAN_API_SECRET', 503, 'XAMAN_NOT_CONFIGURED');
    }
    return fail((err as Error).message, 500, 'INTERNAL_ERROR');
  }
}

/** GET /api/wallet/xaman?uuid=... — poll payload status */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const uuid = searchParams.get('uuid');
  if (!uuid) return fail('uuid query parameter is required', 400, 'MISSING_UUID');

  try {
    const headers = xamanHeaders();
    const res = await fetch(`${XAMAN_BASE}/payload/${encodeURIComponent(uuid)}`, { headers });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return fail(`Xaman API error: ${JSON.stringify(err)}`, res.status, 'XAMAN_ERROR');
    }

    const data = await res.json();
    return ok(data);
  } catch (err) {
    if ((err as Error).message.includes('XAMAN_API_KEY')) {
      return fail('Xaman API credentials not configured', 503, 'XAMAN_NOT_CONFIGURED');
    }
    return fail((err as Error).message, 500, 'INTERNAL_ERROR');
  }
}
