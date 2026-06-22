import 'server-only';
import { createPublicKey, verify as edVerify } from 'node:crypto';

// Verify the Ed25519 signature Discord attaches to every interaction request.
//
// Discord signs `timestamp + rawBody` with the application's private key and
// sends the signature in the `X-Signature-Ed25519` header and the timestamp in
// `X-Signature-Timestamp`. We verify against the application public key (hex).
//
// We avoid an external crypto dependency by wrapping the raw 32-byte public key
// in a DER SPKI envelope so Node's built-in `crypto` can consume it.

// DER prefix for an Ed25519 SubjectPublicKeyInfo (RFC 8410): the 12-byte header
// preceding the raw 32-byte public key.
const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

function publicKeyFromHex(hex: string) {
  const raw = Buffer.from(hex, 'hex');
  if (raw.length !== 32) {
    throw new Error(`Ed25519 public key must be 32 bytes (got ${raw.length})`);
  }
  return createPublicKey({
    key: Buffer.concat([ED25519_SPKI_PREFIX, raw]),
    format: 'der',
    type: 'spki',
  });
}

/**
 * Verify a Discord interaction request signature.
 *
 * @param publicKeyHex Application public key (hex) from the Developer Portal.
 * @param signatureHex Value of the `X-Signature-Ed25519` header.
 * @param timestamp    Value of the `X-Signature-Timestamp` header.
 * @param rawBody      The exact raw request body string (do NOT re-serialize).
 * @returns true if the signature is valid.
 */
export function verifyDiscordSignature(
  publicKeyHex: string,
  signatureHex: string,
  timestamp: string,
  rawBody: string
): boolean {
  if (!publicKeyHex || !signatureHex || !timestamp) return false;
  try {
    const key = publicKeyFromHex(publicKeyHex);
    const message = Buffer.concat([Buffer.from(timestamp, 'utf8'), Buffer.from(rawBody, 'utf8')]);
    const signature = Buffer.from(signatureHex, 'hex');
    return edVerify(null, message, key, signature);
  } catch {
    return false;
  }
}
