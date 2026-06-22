import 'server-only';

// Server-to-server Xaman (XUMM) helpers.
//
// The browser-facing flow lives in the BFF route (app/api/wallet/xaman). This
// module is for server-initiated payloads — specifically the Discord bot's
// scan-to-link flow, where we create a SignIn payload carrying custom metadata
// that ties the resulting signature back to a Discord user, and later read the
// resolved payload to learn the verified account.

const XAMAN_BASE = 'https://xumm.app/api/v1/platform';

function xamanHeaders(): Record<string, string> {
  const key = process.env.XAMAN_API_KEY;
  const secret = process.env.XAMAN_API_SECRET;
  if (!key || !secret) {
    throw new Error('XAMAN_API_KEY and XAMAN_API_SECRET must be set');
  }
  return { 'Content-Type': 'application/json', 'X-API-Key': key, 'X-API-Secret': secret };
}

export function isXamanConfigured(): boolean {
  return Boolean(process.env.XAMAN_API_KEY && process.env.XAMAN_API_SECRET);
}

export interface XamanCustomMeta {
  /** Unique-per-app identifier. Reusing one returns the existing payload. */
  identifier: string;
  /** Human-readable instruction shown in the Xaman app. */
  instruction?: string;
  /** Arbitrary JSON echoed back on the webhook. */
  blob?: Record<string, unknown>;
}

export interface SignInPayload {
  uuid: string;
  next: { always: string };
  refs: { qr_png: string; websocket_status?: string };
}

/** Create a Xaman SignIn payload with custom metadata. */
export async function createSignInPayload(customMeta: XamanCustomMeta): Promise<SignInPayload> {
  const res = await fetch(`${XAMAN_BASE}/payload`, {
    method: 'POST',
    headers: xamanHeaders(),
    body: JSON.stringify({
      txjson: { TransactionType: 'SignIn' },
      options: { submit: false, expire: 5 },
      custom_meta: customMeta,
    }),
  });
  if (!res.ok) {
    throw new Error(`Xaman create payload failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as SignInPayload;
  return { uuid: data.uuid, next: data.next, refs: data.refs };
}

export interface ResolvedPayload {
  signed: boolean;
  account?: string;
  network: 'xrpl' | 'xahau';
}

/** Read a payload's resolved status + the verified account that signed it. */
export async function getPayloadStatus(uuid: string): Promise<ResolvedPayload> {
  const res = await fetch(`${XAMAN_BASE}/payload/${encodeURIComponent(uuid)}`, {
    headers: xamanHeaders(),
  });
  if (!res.ok) {
    throw new Error(`Xaman get payload failed: ${res.status}`);
  }
  const data = (await res.json()) as {
    meta?: { signed?: boolean };
    response?: { account?: string; environment_networkid?: number };
  };
  const networkId = data.response?.environment_networkid;
  return {
    signed: Boolean(data.meta?.signed),
    account: data.response?.account,
    network: networkId === 21337 ? 'xahau' : 'xrpl',
  };
}
