import 'server-only';
import { config } from '../config';
import type { ChainName } from '../agility/types';

/**
 * Minimal XRPL-family (XRPL + Xahau) JSON-RPC client used to verify on-chain
 * join requirements. Only read methods are used; no keys are required.
 *
 * - `account_lines` lists issued-token trustlines (issuer + currency + balance).
 * - `account_nfts`  lists NFTs held by the account (issuer + taxon + id).
 */

interface XrplTrustLine {
  account: string; // the issuer
  currency: string;
  balance: string;
}

interface XrplNft {
  NFTokenID: string;
  Issuer?: string;
  NFTokenTaxon?: number;
}

interface RpcResult<T> {
  result: T & {
    status?: string;
    error?: string;
    error_message?: string;
    marker?: unknown;
  };
}

/** Errors that simply mean the account holds nothing relevant. */
const EMPTY_ACCOUNT_ERRORS = new Set(['actNotFound', 'entryNotFound']);

function rpcUrlFor(chain: ChainName): string {
  if (chain === 'xrpl') return config.chains.xrplRpcUrl;
  if (chain === 'xahau') return config.chains.xahauRpcUrl;
  throw new Error(`No XRPL-family RPC configured for chain "${chain}"`);
}

async function rpc<T>(
  chain: ChainName,
  method: string,
  params: Record<string, unknown>
): Promise<RpcResult<T>['result'] | null> {
  let res: Response;
  try {
    res = await fetch(rpcUrlFor(chain), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        method,
        params: [{ ...params, ledger_index: 'validated' }],
      }),
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
    });
  } catch (err) {
    throw new Error(`${chain} RPC network error: ${(err as Error).message}`);
  }

  if (!res.ok) {
    throw new Error(`${chain} RPC HTTP ${res.status}`);
  }

  const json = (await res.json()) as RpcResult<T>;
  const result = json.result;
  const errorCode = result?.error;
  if (errorCode) {
    // An account that has never been funded simply holds nothing.
    if (EMPTY_ACCOUNT_ERRORS.has(errorCode)) return null;
    throw new Error(`${chain} RPC error: ${result.error_message ?? errorCode}`);
  }
  return result;
}

/** Sum of the wallet's balance for a given (issuer, currency) trustline. */
export async function getTokenBalance(
  chain: ChainName,
  address: string,
  issuer: string,
  currency: string
): Promise<number> {
  let marker: unknown;
  let total = 0;

  do {
    const result = await rpc<{ lines: XrplTrustLine[] }>(chain, 'account_lines', {
      account: address,
      marker,
    });
    if (!result) break; // account not found => 0
    for (const line of result.lines ?? []) {
      if (line.account === issuer && line.currency === currency) {
        total += Number.parseFloat(line.balance) || 0;
      }
    }
    marker = result.marker;
  } while (marker);

  return total;
}

/** Count of NFTs held by the wallet matching the issuer (and optional taxon). */
export async function getNftCount(
  chain: ChainName,
  address: string,
  issuer: string,
  taxon?: number
): Promise<number> {
  let marker: unknown;
  let count = 0;

  do {
    const result = await rpc<{ account_nfts: XrplNft[] }>(chain, 'account_nfts', {
      account: address,
      marker,
    });
    if (!result) break; // account not found => 0
    for (const nft of result.account_nfts ?? []) {
      const issuerMatch = nft.Issuer === issuer;
      const taxonMatch = taxon === undefined || nft.NFTokenTaxon === taxon;
      if (issuerMatch && taxonMatch) count += 1;
    }
    marker = result.marker;
  } while (marker);

  return count;
}
