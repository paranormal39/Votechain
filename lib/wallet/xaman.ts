/**
 * Xaman (formerly XUMM) wallet connector.
 *
 * Uses the Xaman xApp / deeplink API to initiate a sign-in payload.
 * Flow:
 *   1. POST to Xaman API → receive sign-in payload (uuid + QR/deeplink)
 *   2. Poll payload status until signed or rejected
 *   3. On signed: return the XRPL account address
 *
 * The Xaman API key is kept server-side (BFF route at /api/wallet/xaman).
 * The browser only ever sees the payload UUID and QR deep link — never the key.
 *
 * Docs: https://docs.xaman.dev/js-ts-sdk/sdk-syntax/xumm.payload
 */

export interface XamanConnectResult {
  address: string;
  network: 'xrpl' | 'xahau';
  payloadUuid: string;
}

export interface XamanPayloadResponse {
  uuid: string;
  next: {
    always: string;     // deeplink URL (xumm://...)
  };
  refs: {
    qr_png: string;     // QR code image URL
    websocket_status: string;
  };
}

export interface XamanPayloadStatus {
  meta: {
    signed: boolean;
    cancelled: boolean;
    expired: boolean;
    resolved: boolean;
  };
  response: {
    account?: string;   // XRPL r-address once signed
    environment_nodeuri?: string;
    environment_networkid?: number;
  };
}

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 120_000;

/**
 * Create a Xaman sign-in payload via the BFF.
 * Returns the payload so the UI can show the QR / deeplink.
 */
export async function createXamanPayload(): Promise<XamanPayloadResponse> {
  const res = await fetch('/api/wallet/xaman', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'SignIn' }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: { message?: string } }).error?.message ?? 'Failed to create Xaman payload');
  }
  const data = await res.json() as { success: boolean; data: XamanPayloadResponse };
  return data.data;
}

/**
 * Poll the BFF for payload status until signed, cancelled, or timed out.
 * Calls onQr with the QR URL immediately so the UI can render it before polling starts.
 */
export async function pollXamanPayload(
  uuid: string,
  onStatus?: (status: 'pending' | 'signed' | 'cancelled' | 'expired') => void
): Promise<XamanConnectResult> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;

  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);

    const res = await fetch(`/api/wallet/xaman?uuid=${encodeURIComponent(uuid)}`);
    if (!res.ok) continue;

    const data = await res.json() as { success: boolean; data: XamanPayloadStatus };
    const status = data.data;

    if (status.meta.cancelled) {
      onStatus?.('cancelled');
      throw new Error('Xaman sign-in was cancelled');
    }
    if (status.meta.expired) {
      onStatus?.('expired');
      throw new Error('Xaman sign-in payload expired');
    }
    if (status.meta.signed && status.response.account) {
      onStatus?.('signed');
      const networkId = status.response.environment_networkid;
      const network: 'xrpl' | 'xahau' = networkId === 21337 ? 'xahau' : 'xrpl';
      return {
        address: status.response.account,
        network,
        payloadUuid: uuid,
      };
    }

    onStatus?.('pending');
  }

  throw new Error('Xaman sign-in timed out after 2 minutes');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
