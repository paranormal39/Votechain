import 'server-only';
import { Wallet, xrpToDrops, dropsToXrp, convertStringToHex } from 'xrpl';
import { config } from '../config';
import type { ChainName } from '../agility/types';
import { getNftCount, getTokenBalance } from '../membership/xrpl-rpc';
import {
  AdapterUnsupportedError,
  type ChainAdapter,
  type ContributionScan,
  type CreateEscrowInput,
  type EscrowRef,
  type MintMembershipInput,
  type MintResult,
  type SignerAuth,
  type TxReceipt,
  type VerifyHoldingInput,
} from './types';

/**
 * XRPL-family adapter (XRPL + Xahau).
 *
 * Reads use validated JSON-RPC (`account_info`, `account_tx`). Writes are built
 * locally, signed offline with the escrow/issuer seed via `xrpl.Wallet`, and
 * submitted through the `submit` JSON-RPC method — no persistent WebSocket
 * required, consistent with `lib/membership/xrpl-rpc.ts`.
 *
 * The campaign currency is native XRP (escrow holds drops). Membership minting
 * uses `NFTokenMint` for NFTs; issued-token membership is best-effort and
 * requires the recipient to hold a trustline.
 */
export class XrplAdapter implements ChainAdapter {
  constructor(public readonly chain: ChainName) {
    if (chain !== 'xrpl' && chain !== 'xahau') {
      throw new Error(`XrplAdapter does not support chain "${chain}"`);
    }
  }

  private get rpcUrl(): string {
    return this.chain === 'xrpl' ? config.chains.xrplRpcUrl : config.chains.xahauRpcUrl;
  }

  private async rpc<T>(method: string, params: Record<string, unknown>): Promise<T> {
    const res = await fetch(this.rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ method, params: [params] }),
      cache: 'no-store',
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) throw new Error(`${this.chain} RPC HTTP ${res.status}`);
    const json = (await res.json()) as { result: T & { error?: string; error_message?: string } };
    const result = json.result;
    if (result?.error) {
      throw new Error(`${this.chain} RPC error: ${result.error_message ?? result.error}`);
    }
    return result;
  }

  async createEscrow(_input: CreateEscrowInput): Promise<{ ref: EscrowRef; auth: SignerAuth }> {
    // Generate a fresh escrow account. On testnet it must be funded (faucet or
    // an initial contribution) before writes succeed. The issuer for membership
    // assets is the same account by default.
    const wallet = Wallet.generate();
    const ref: EscrowRef = {
      chain: this.chain,
      address: wallet.classicAddress,
      issuer: wallet.classicAddress,
      meta: { publicKey: wallet.publicKey },
    };
    return { ref, auth: { secret: wallet.seed ?? '' } };
  }

  async getEscrowBalance(ref: EscrowRef): Promise<string> {
    try {
      const info = await this.rpc<{ account_data: { Balance: string } }>('account_info', {
        account: ref.address,
        ledger_index: 'validated',
      });
      return dropsToXrp(info.account_data.Balance).toString();
    } catch (err) {
      // Unfunded account => zero balance.
      if (/actNotFound/i.test(String(err))) return '0';
      throw err;
    }
  }

  /**
   * Live base reserve (in XRP) required to keep an account funded, read from the
   * node's validated ledger. Falls back to 1 XRP (current XRPL/Xahau default) if
   * the node doesn't report it.
   */
  private async getBaseReserveXrp(): Promise<number> {
    try {
      const info = await this.rpc<{
        info?: { validated_ledger?: { reserve_base_xrp?: number } };
      }>('server_info', {});
      const reserve = info.info?.validated_ledger?.reserve_base_xrp;
      return typeof reserve === 'number' && reserve > 0 ? reserve : 1;
    } catch {
      return 1;
    }
  }

  async getAccountReserve(): Promise<string> {
    return String(await this.getBaseReserveXrp());
  }

  async scanContributions(ref: EscrowRef, sinceMarker?: string): Promise<ContributionScan> {
    const minLedger = sinceMarker ? Number.parseInt(sinceMarker, 10) : -1;
    let result: {
      transactions?: Array<{
        tx?: {
          TransactionType?: string;
          Account?: string;
          Destination?: string;
          Amount?: string | object;
          hash?: string;
          date?: number;
          ledger_index?: number;
        };
        meta?: { delivered_amount?: string | object; TransactionResult?: string };
        validated?: boolean;
      }>;
    };
    try {
      result = await this.rpc('account_tx', {
        account: ref.address,
        ledger_index_min: minLedger,
        ledger_index_max: -1,
        binary: false,
        forward: true,
        limit: 200,
      });
    } catch (err) {
      if (/actNotFound/i.test(String(err))) return { contributions: [], marker: sinceMarker };
      throw err;
    }

    const contributions = [];
    let maxLedger = minLedger;
    for (const entry of result.transactions ?? []) {
      const tx = entry.tx;
      if (!tx || tx.TransactionType !== 'Payment') continue;
      if (tx.Destination !== ref.address) continue; // inbound only
      if (entry.meta?.TransactionResult && entry.meta.TransactionResult !== 'tesSUCCESS') continue;
      const delivered = entry.meta?.delivered_amount ?? tx.Amount;
      if (typeof delivered !== 'string') continue; // skip issued-currency for native campaigns
      contributions.push({
        from: tx.Account ?? '',
        amount: dropsToXrp(delivered).toString(),
        txHash: tx.hash ?? '',
        at: tx.date ? new Date((tx.date + 946684800) * 1000).toISOString() : undefined,
      });
      if (typeof tx.ledger_index === 'number' && tx.ledger_index > maxLedger) {
        maxLedger = tx.ledger_index;
      }
    }
    return { contributions, marker: String(maxLedger + 1) };
  }

  /** Build, sign and submit a transaction with locally-fetched autofill values. */
  private async signAndSubmit(
    tx: Record<string, unknown>,
    auth: SignerAuth
  ): Promise<TxReceipt> {
    const wallet = Wallet.fromSeed(auth.secret);
    const account = wallet.classicAddress;

    const info = await this.rpc<{ account_data: { Sequence: number } }>('account_info', {
      account,
      ledger_index: 'current',
    });
    const ledger = await this.rpc<{ ledger_current_index: number }>('ledger_current', {});

    const prepared = {
      ...tx,
      Account: account,
      Sequence: info.account_data.Sequence,
      Fee: '12',
      LastLedgerSequence: ledger.ledger_current_index + 20,
    };

    const signed = wallet.sign(prepared as Parameters<typeof wallet.sign>[0]);
    const submit = await this.rpc<{
      engine_result?: string;
      tx_json?: { hash?: string };
      accepted?: boolean;
    }>('submit', { tx_blob: signed.tx_blob });

    const code = submit.engine_result ?? '';
    return {
      txHash: signed.hash,
      accepted: code.startsWith('tes') || code.startsWith('ter'),
      resultCode: code,
    };
  }

  async releaseEscrow(ref: EscrowRef, destination: string, auth: SignerAuth): Promise<TxReceipt> {
    const balance = await this.getEscrowBalance(ref);
    // Leave exactly the live base reserve (+ a small fee buffer) so the account
    // stays valid. This matches the reserve added to the goal at openFunding,
    // so the released amount still meets the creator's net goal.
    const reserve = await this.getBaseReserveXrp();
    const FEE_BUFFER_XRP = 0.001;
    const sendable = Math.max(0, Number.parseFloat(balance) - reserve - FEE_BUFFER_XRP);
    if (sendable <= 0) throw new Error('Escrow balance below reserve; nothing to release');
    return this.signAndSubmit(
      {
        TransactionType: 'Payment',
        Destination: destination,
        Amount: xrpToDrops(sendable.toFixed(6)),
      },
      auth
    );
  }

  async refundContributor(
    ref: EscrowRef,
    contributor: string,
    amount: string,
    auth: SignerAuth
  ): Promise<TxReceipt> {
    void ref;
    return this.signAndSubmit(
      {
        TransactionType: 'Payment',
        Destination: contributor,
        Amount: xrpToDrops(Number.parseFloat(amount).toFixed(6)),
      },
      auth
    );
  }

  async mintMembership(input: MintMembershipInput, auth: SignerAuth): Promise<MintResult> {
    const { membership, to } = input;
    if (membership.kind === 'credential') {
      throw new AdapterUnsupportedError(this.chain, 'credential minting');
    }
    if (membership.kind === 'nft') {
      // Mint a transferable NFT; the URI encodes the membership name.
      const receipt = await this.signAndSubmit(
        {
          TransactionType: 'NFTokenMint',
          NFTokenTaxon: membership.taxon ?? 0,
          Flags: 8, // tfTransferable
          URI: convertStringToHex(`votechain:${membership.name}`),
          // Direct mint to a recipient requires Issuer/authorized minting flows;
          // for the reference path the escrow account mints and then transfers.
        },
        auth
      );
      return { txHash: receipt.txHash, assetRef: receipt.resultCode };
    }
    // Issued-token membership: send the configured amount to the contributor.
    // Requires the recipient to already trust the issuer's currency.
    const currency = membership.currency;
    if (!currency) throw new Error('Issued-token membership requires a currency code');
    const issuer = Wallet.fromSeed(auth.secret).classicAddress;
    const receipt = await this.signAndSubmit(
      {
        TransactionType: 'Payment',
        Destination: to,
        Amount: {
          currency,
          issuer,
          value: membership.amountPerContributor ?? '1',
        },
      },
      auth
    );
    return { txHash: receipt.txHash };
  }

  async verifyHolding(input: VerifyHoldingInput): Promise<boolean> {
    const { ref, membership, address } = input;
    const issuer = ref.issuer ?? ref.address;
    if (membership.kind === 'nft') {
      const count = await getNftCount(this.chain, address, issuer, membership.taxon);
      return count > 0;
    }
    if (membership.kind === 'token') {
      const currency = membership.currency;
      if (!currency) return false;
      const balance = await getTokenBalance(this.chain, address, issuer, currency);
      return balance >= Number.parseFloat(membership.amountPerContributor ?? '1');
    }
    throw new AdapterUnsupportedError(this.chain, 'credential holding verification');
  }
}
