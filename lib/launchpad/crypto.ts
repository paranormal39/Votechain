import 'server-only';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

/**
 * AES-256-GCM encryption for launchpad secrets at rest:
 * - escrow signing seeds stored on Project records
 * - Discord↔wallet identity links
 *
 * The key is derived from `LAUNCHPAD_ENCRYPTION_KEY` (any string; hashed to 32
 * bytes via SHA-256). In production set a strong, rotated secret. If the env
 * var is unset a process-ephemeral key is used so dev still works — but data
 * encrypted with an ephemeral key cannot be decrypted after a restart.
 */

let cachedKey: Buffer | null = null;

function getKey(): Buffer {
  if (cachedKey) return cachedKey;
  const material = process.env.LAUNCHPAD_ENCRYPTION_KEY;
  if (!material) {
    console.warn(
      '[launchpad/crypto] LAUNCHPAD_ENCRYPTION_KEY not set — using an ephemeral key. ' +
        'Encrypted secrets will not survive a restart.'
    );
    cachedKey = randomBytes(32);
    return cachedKey;
  }
  cachedKey = createHash('sha256').update(material).digest();
  return cachedKey;
}

/** Encrypt plaintext → base64 string of iv|tag|ciphertext. */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString('base64');
}

/** Decrypt a base64 string produced by {@link encryptSecret}. */
export function decryptSecret(encoded: string): string {
  const buf = Buffer.from(encoded, 'base64');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ciphertext = buf.subarray(28);
  const decipher = createDecipheriv('aes-256-gcm', getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}
