/**
 * Midnight DApp Connector API client (Lace for Midnight).
 *
 * Midnight wallets do NOT use CIP-30. They expose the Midnight DApp Connector
 * API at `window.midnight[walletKey]` (e.g. `window.midnight.mnLace`).
 *
 * Reference: @midnight-ntwrk/dapp-connector-api
 *
 * Crucially for VoteChain Phase 3: `serviceUriConfig()` returns the user's
 * configured proof server URL (`proverServerUri`). This is THE source of truth
 * for client-side proof generation — no guessing localhost:6300.
 */

export interface MidnightServiceUriConfig {
  /** The user's proof server endpoint — used for client-side ZK proof generation. */
  proverServerUri: string;
  indexerUri?: string;
  indexerWsUri?: string;
  substrateNodeUri?: string;
}

export interface MidnightWalletState {
  /** The user's Midnight (shielded) address. */
  address: string;
  coinPublicKey?: string;
  encryptionPublicKey?: string;
}

export interface ShieldedAddresses {
  shieldedAddress: string;
}

/**
 * The API returned after a successful connection.
 * - Current DApp Connector API: `getShieldedAddresses()` + `getConnectionStatus()`.
 * - Legacy API: `state()` returning the address directly.
 * Both may expose `serviceUriConfig()` for the proof server URL.
 */
export interface MidnightConnectedAPI {
  getShieldedAddresses?: () => Promise<ShieldedAddresses | string[] | string>;
  getConnectionStatus?: () => Promise<boolean>;
  state?: () => Promise<MidnightWalletState>;
  serviceUriConfig?: () => Promise<MidnightServiceUriConfig>;
}

/**
 * The object exposed at `window.midnight[key]` (e.g. `window.midnight.mnLace`).
 * - Current API: `connect(network)` returns a {@link MidnightConnectedAPI}.
 * - Legacy API: `enable()` returns the connected API.
 */
export interface MidnightConnectorAPI {
  apiVersion?: string;
  name?: string;
  icon?: string;
  connect?: (network?: string) => Promise<MidnightConnectedAPI>;
  enable?: () => Promise<MidnightConnectedAPI>;
  isEnabled?: () => Promise<boolean>;
  serviceUriConfig?: () => Promise<MidnightServiceUriConfig>;
}

/**
 * Candidate Midnight networks tried (in order) when using the current
 * `connect(network)` API. `undeployed` targets a local node; the testnet
 * values cover hosted Lace-for-Midnight setups. The first that yields an
 * address wins. Override the order by passing an explicit network.
 */
export const MIDNIGHT_NETWORKS = ['undeployed', 'preview', 'testnet', 'preprod', 'mainnet'] as const;
export type MidnightNetwork = (typeof MIDNIGHT_NETWORKS)[number] | string;

export interface DetectedMidnightWallet {
  key: string;
  api: MidnightConnectorAPI;
}

export interface MidnightConnection {
  address: string;
  proverServerUri?: string;
  walletKey: string;
  walletName: string;
}

/** Detect installed Midnight wallets (Lace for Midnight registers as `mnLace`). */
export function getMidnightWallets(): DetectedMidnightWallet[] {
  if (typeof window === 'undefined') return [];
  const midnight = (window as unknown as { midnight?: Record<string, MidnightConnectorAPI> })
    .midnight;
  if (!midnight) return [];
  return Object.entries(midnight)
    .filter(
      ([, v]) =>
        v && (typeof v.connect === 'function' || typeof v.enable === 'function')
    )
    .map(([key, api]) => ({ key, api }));
}

/** Extract a shielded address from either the new or legacy connected API. */
async function resolveAddress(connected: MidnightConnectedAPI): Promise<string> {
  if (typeof connected.getShieldedAddresses === 'function') {
    const addrs = await connected.getShieldedAddresses();
    if (typeof addrs === 'string') return addrs;
    if (Array.isArray(addrs)) return addrs[0] ?? '';
    return addrs?.shieldedAddress ?? '';
  }
  if (typeof connected.state === 'function') {
    const state = await connected.state();
    return state.address;
  }
  return '';
}

/** Read the proof server URI from the connected API or the connector itself. */
async function resolveProverUri(
  connected: MidnightConnectedAPI,
  api: MidnightConnectorAPI
): Promise<string | undefined> {
  try {
    const config = await connected.serviceUriConfig?.();
    if (config?.proverServerUri) return config.proverServerUri;
  } catch {
    /* fall through */
  }
  try {
    const config = await api.serviceUriConfig?.();
    return config?.proverServerUri;
  } catch {
    return undefined;
  }
}

/**
 * Connect to a Midnight wallet and fetch the shielded address + proof server URI.
 *
 * Supports both the current DApp Connector API (`connect(network)` +
 * `getShieldedAddresses()`) and the legacy API (`enable()` + `state()`).
 *
 * When `network` is omitted and the wallet uses the current API, each value in
 * {@link MIDNIGHT_NETWORKS} is tried until one returns an address. The wallet
 * authorization prompt only appears once per session, so subsequent attempts
 * after authorization are silent.
 */
export async function connectMidnightWallet(
  wallet: DetectedMidnightWallet,
  network?: MidnightNetwork
): Promise<MidnightConnection> {
  const { key, api } = wallet;

  // Legacy API takes priority when present (no network argument required).
  if (typeof api.enable === 'function') {
    const connected = await api.enable();
    const address = await resolveAddress(connected);
    if (!address) {
      throw new Error('Connected but no address returned. Make sure Lace is unlocked.');
    }
    return {
      address,
      proverServerUri: await resolveProverUri(connected, api),
      walletKey: key,
      walletName: api.name ?? key,
    };
  }

  if (typeof api.connect !== 'function') {
    throw new Error('Wallet does not expose a connect() or enable() method.');
  }

  const networks = network ? [network] : [...MIDNIGHT_NETWORKS];
  let lastError: unknown;
  for (const net of networks) {
    try {
      const connected = await api.connect(net);
      const status = await connected.getConnectionStatus?.();
      if (status === false) continue;
      const address = await resolveAddress(connected);
      if (!address) continue;
      return {
        address,
        proverServerUri: await resolveProverUri(connected, api),
        walletKey: key,
        walletName: api.name ?? key,
      };
    } catch (err) {
      lastError = err;
    }
  }

  throw new Error(
    `Could not connect on any network (${networks.join(', ')}). ` +
      `Make sure Lace is unlocked and set to the right network. ` +
      (lastError instanceof Error ? lastError.message : '')
  );
}
