/**
 * Browser-side Midnight proof server client.
 *
 * Privacy principle: the vote choice is committed into a ZK proof HERE, in the
 * browser, against the user's own locally-running proof server. Only the
 * returned proofHash travels over the network. The choice itself is NEVER sent
 * to the BFF or AgilityCore.
 *
 * Default URL: http://localhost:6300 (standard Midnight proof server port).
 * Users can override via localStorage key "proofServerUrl".
 */

export interface ProofServerStatus {
  online: boolean;
  version?: string;
  url: string;
  simulated: boolean;
}

export interface GenerateProofResult {
  proofHash: string;
  simulated: boolean;
}

const DEFAULT_PROOF_SERVER_URL = 'http://localhost:6300';
const STORAGE_KEY = 'proofServerUrl';

export function getProofServerUrl(): string {
  if (typeof window === 'undefined') return DEFAULT_PROOF_SERVER_URL;
  return localStorage.getItem(STORAGE_KEY) ?? DEFAULT_PROOF_SERVER_URL;
}

export function setProofServerUrl(url: string): void {
  localStorage.setItem(STORAGE_KEY, url);
}

/**
 * Check whether the user's proof server is reachable.
 * Returns status with online=false (not an error) if unreachable.
 */
export async function checkProofServer(): Promise<ProofServerStatus> {
  const url = getProofServerUrl();
  try {
    const res = await fetch(`${url}/health`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return { online: false, url, simulated: true };
    const versionRes = await fetch(`${url}/version`, {
      signal: AbortSignal.timeout(2000),
    }).catch(() => null);
    const version = versionRes?.ok ? await versionRes.text().catch(() => undefined) : undefined;
    return { online: true, version: version?.trim(), url, simulated: false };
  } catch {
    return { online: false, url, simulated: true };
  }
}

/**
 * Generate a ZK proof for a private vote.
 *
 * When the proof server is offline, falls back to a deterministic simulation
 * hash so the UI flow still works end-to-end in dev/sim mode.
 *
 * The choice is used locally to build the proof input — it is NEVER serialised
 * into any value that leaves this function except as an opaque proof hash.
 */
export async function generateVoteProof(
  proposalId: string,
  walletAddress: string,
  choice: 'yes' | 'no' | 'abstain'
): Promise<GenerateProofResult> {
  const url = getProofServerUrl();

  try {
    const status = await checkProofServer();

    if (!status.online) {
      return { proofHash: simulatedProofHash(proposalId, walletAddress), simulated: true };
    }

    const encoder = new TextEncoder();
    const preimage = encoder.encode(
      JSON.stringify({ proposalId, walletAddress, choice, ts: Date.now() })
    );

    const res = await fetch(`${url}/prove`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: preimage,
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) {
      return { proofHash: simulatedProofHash(proposalId, walletAddress), simulated: true };
    }

    const proofBytes = await res.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', proofBytes);
    const proofHash = 'proof_' + bufToHex(hashBuffer);
    return { proofHash, simulated: false };
  } catch {
    return { proofHash: simulatedProofHash(proposalId, walletAddress), simulated: true };
  }
}

/**
 * Generate a Midnight holding proof for a gated organization join.
 *
 * Like vote proofs, the asset/holding details are committed into a ZK proof in
 * the browser against the user's own proof server; only the opaque proofHash
 * leaves this function. Falls back to a simulated hash when the proof server is
 * offline so the join flow still works end-to-end in dev/sim mode.
 */
export async function generateMembershipProof(
  orgId: string,
  walletAddress: string
): Promise<GenerateProofResult> {
  const url = getProofServerUrl();

  try {
    const status = await checkProofServer();
    if (!status.online) {
      return { proofHash: simulatedProofHash(orgId, walletAddress), simulated: true };
    }

    const encoder = new TextEncoder();
    const preimage = encoder.encode(
      JSON.stringify({ scope: 'membership', orgId, walletAddress, ts: Date.now() })
    );

    const res = await fetch(`${url}/prove`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: preimage,
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) {
      return { proofHash: simulatedProofHash(orgId, walletAddress), simulated: true };
    }

    const proofBytes = await res.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', proofBytes);
    return { proofHash: 'proof_' + bufToHex(hashBuffer), simulated: false };
  } catch {
    return { proofHash: simulatedProofHash(orgId, walletAddress), simulated: true };
  }
}

function simulatedProofHash(proposalId: string, walletAddress: string): string {
  const seed = `${proposalId}:${walletAddress}:${Date.now()}`;
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
  }
  return `sim_proof_${Math.abs(h).toString(16).padStart(8, '0')}${Date.now().toString(16)}`;
}

function bufToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
