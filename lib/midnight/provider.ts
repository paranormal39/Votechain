import 'server-only';
import { Buffer } from 'buffer';
import { WebSocket } from 'ws';
import * as Rx from 'rxjs';
import * as ledger from '@midnight-ntwrk/ledger-v8';
import { getNetworkId } from '@midnight-ntwrk/midnight-js/network-id';
import { toHex } from '@midnight-ntwrk/midnight-js/utils';
import { WalletFacade } from '@midnight-ntwrk/wallet-sdk-facade';
import { DustWallet } from '@midnight-ntwrk/wallet-sdk-dust-wallet';
import { HDWallet, Roles } from '@midnight-ntwrk/wallet-sdk-hd';
import { ShieldedWallet } from '@midnight-ntwrk/wallet-sdk-shielded';
import {
  createKeystore,
  InMemoryTransactionHistoryStorage,
  PublicKey,
  UnshieldedWallet,
  type UnshieldedKeystore,
} from '@midnight-ntwrk/wallet-sdk-unshielded-wallet';
import type { MidnightProvider, WalletProvider } from '@midnight-ntwrk/midnight-js/types';
import type { MidnightNetworkConfig } from './config';

// Required for GraphQL subscriptions in Node.js
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).WebSocket = WebSocket;

export interface WalletContext {
  wallet: WalletFacade;
  shieldedSecretKeys: ledger.ZswapSecretKeys;
  dustSecretKey: ledger.DustSecretKey;
  unshieldedKeystore: UnshieldedKeystore;
}

/** Derive HD wallet keys from a hex-encoded seed. */
function deriveKeysFromSeed(seed: string) {
  const hdWallet = HDWallet.fromSeed(Buffer.from(seed, 'hex'));
  if (hdWallet.type !== 'seedOk') throw new Error('HDWallet init failed from seed');
  const result = hdWallet.hdWallet
    .selectAccount(0)
    .selectRoles([Roles.Zswap, Roles.NightExternal, Roles.Dust])
    .deriveKeysAt(0);
  if (result.type !== 'keysDerived') throw new Error('HDWallet key derivation failed');
  hdWallet.hdWallet.clear();
  return result.keys;
}

function buildShieldedConfig(cfg: MidnightNetworkConfig) {
  return {
    networkId: getNetworkId(),
    indexerClientConnection: { indexerHttpUrl: cfg.indexer, indexerWsUrl: cfg.indexerWS },
    provingServerUrl: new URL(cfg.proofServer),
    relayURL: new URL(cfg.node.replace(/^http/, 'ws')),
  };
}

function buildUnshieldedConfig(cfg: MidnightNetworkConfig) {
  return {
    networkId: getNetworkId(),
    indexerClientConnection: { indexerHttpUrl: cfg.indexer, indexerWsUrl: cfg.indexerWS },
    txHistoryStorage: new InMemoryTransactionHistoryStorage(),
  };
}

function buildDustConfig(cfg: MidnightNetworkConfig) {
  return {
    networkId: getNetworkId(),
    costParameters: { additionalFeeOverhead: 300_000_000_000_000n, feeBlocksMargin: 5 },
    indexerClientConnection: { indexerHttpUrl: cfg.indexer, indexerWsUrl: cfg.indexerWS },
    provingServerUrl: new URL(cfg.proofServer),
    relayURL: new URL(cfg.node.replace(/^http/, 'ws')),
  };
}

/** Sign unshielded intents in a transaction with the correct proof marker. */
function signTransactionIntents(
  tx: { intents?: Map<number, unknown> },
  signFn: (payload: Uint8Array) => ledger.Signature,
  proofMarker: 'proof' | 'pre-proof',
): void {
  if (!tx.intents || tx.intents.size === 0) return;
  for (const segment of tx.intents.keys()) {
    const intent = tx.intents.get(segment);
    if (!intent) continue;
    const cloned = ledger.Intent.deserialize<
      ledger.SignatureEnabled,
      ledger.Proofish,
      ledger.PreBinding
    >('signature', proofMarker, 'pre-binding', (intent as any).serialize());
    const sigData = cloned.signatureData(segment);
    const signature = signFn(sigData);
    if (cloned.fallibleUnshieldedOffer) {
      const sigs = cloned.fallibleUnshieldedOffer.inputs.map(
        (_: ledger.UtxoSpend, i: number) =>
          cloned.fallibleUnshieldedOffer!.signatures.at(i) ?? signature,
      );
      cloned.fallibleUnshieldedOffer = cloned.fallibleUnshieldedOffer.addSignatures(sigs);
    }
    if (cloned.guaranteedUnshieldedOffer) {
      const sigs = cloned.guaranteedUnshieldedOffer.inputs.map(
        (_: ledger.UtxoSpend, i: number) =>
          cloned.guaranteedUnshieldedOffer!.signatures.at(i) ?? signature,
      );
      cloned.guaranteedUnshieldedOffer = cloned.guaranteedUnshieldedOffer.addSignatures(sigs);
    }
    tx.intents.set(segment, cloned);
  }
}

/** Create the unified WalletProvider + MidnightProvider from a WalletContext. */
export async function createWalletAndMidnightProvider(
  ctx: WalletContext,
): Promise<WalletProvider & MidnightProvider> {
  const state = await Rx.firstValueFrom(
    ctx.wallet.state().pipe(Rx.filter((s) => s.isSynced)),
  );
  return {
    getCoinPublicKey() {
      return state.shielded.coinPublicKey.toHexString();
    },
    getEncryptionPublicKey() {
      return state.shielded.encryptionPublicKey.toHexString();
    },
    async balanceTx(tx, ttl?) {
      const recipe = await ctx.wallet.balanceUnboundTransaction(
        tx,
        { shieldedSecretKeys: ctx.shieldedSecretKeys, dustSecretKey: ctx.dustSecretKey },
        { ttl: ttl ?? new Date(Date.now() + 30 * 60 * 1000) },
      );
      const signFn = (payload: Uint8Array) => ctx.unshieldedKeystore.signData(payload);
      signTransactionIntents(recipe.baseTransaction, signFn, 'proof');
      if (recipe.balancingTransaction) {
        signTransactionIntents(recipe.balancingTransaction, signFn, 'pre-proof');
      }
      return ctx.wallet.finalizeRecipe(recipe);
    },
    submitTx(tx) {
      return ctx.wallet.submitTransaction(tx) as ReturnType<MidnightProvider['submitTx']>;
    },
  };
}

/** Build + sync a wallet from a hex seed. Cached per-process. */
let _cached: WalletContext | null = null;

export async function getServerWalletContext(cfg: MidnightNetworkConfig): Promise<WalletContext> {
  if (_cached) return _cached;

  const seed = process.env.MIDNIGHT_WALLET_SEED;
  if (!seed) throw new Error('MIDNIGHT_WALLET_SEED env var is required for on-chain calls');

  const keys = deriveKeysFromSeed(seed);
  const shieldedSecretKeys = ledger.ZswapSecretKeys.fromSeed(keys[Roles.Zswap]);
  const dustSecretKey = ledger.DustSecretKey.fromSeed(keys[Roles.Dust]);
  const unshieldedKeystore = createKeystore(keys[Roles.NightExternal], getNetworkId());

  const walletConfig = {
    ...buildShieldedConfig(cfg),
    ...buildUnshieldedConfig(cfg),
    ...buildDustConfig(cfg),
  };

  const wallet = await WalletFacade.init({
    configuration: walletConfig,
    shielded: (c) => ShieldedWallet(c).startWithSecretKeys(shieldedSecretKeys),
    unshielded: (c) => UnshieldedWallet(c).startWithPublicKey(PublicKey.fromKeyStore(unshieldedKeystore)),
    dust: (c) => DustWallet(c).startWithSecretKey(dustSecretKey, ledger.LedgerParameters.initialParameters().dust),
  });
  await wallet.start(shieldedSecretKeys, dustSecretKey);

  // Wait for sync
  await Rx.firstValueFrom(wallet.state().pipe(Rx.filter((s) => s.isSynced)));

  _cached = { wallet, shieldedSecretKeys, dustSecretKey, unshieldedKeystore };
  return _cached;
}

/** Get the admin secret from env as Uint8Array. */
export function getAdminSecret(): Uint8Array {
  const hex = process.env.MIDNIGHT_ADMIN_SECRET;
  if (!hex) throw new Error('MIDNIGHT_ADMIN_SECRET env var is required for admin circuit calls');
  return Buffer.from(hex, 'hex');
}

/** Check whether on-chain integration is configured (both required env vars present). */
export function isMidnightEnabled(): boolean {
  return !!(process.env.MIDNIGHT_WALLET_SEED && process.env.MIDNIGHT_ADMIN_SECRET);
}

export { toHex };
