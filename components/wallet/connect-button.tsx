'use client';

import * as React from 'react';
import { Wallet, ChevronDown, LogOut, Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useWallet, type WalletIdentity } from './wallet-provider';
import { shortAddress, cn } from '@/lib/utils';
import type { ChainName } from '@/lib/agility/types';
import {
  getMidnightWallets,
  connectMidnightWallet,
  type DetectedMidnightWallet,
} from '@/lib/wallet/midnight';
import { setProofServerUrl } from '@/lib/proof/client';
import { createXamanPayload, pollXamanPayload, type XamanPayloadResponse } from '@/lib/wallet/xaman';

interface Cip30EnabledApi {
  getChangeAddress: () => Promise<string>;
  getUsedAddresses: () => Promise<string[]>;
  getNetworkId: () => Promise<number>;
}

interface Cip30Api {
  enable: () => Promise<Cip30EnabledApi>;
  name?: string;
  icon?: string;
  apiVersion?: string;
}

/**
 * Lace (and some other CIP-30 wallets) return addresses as CBOR-encoded hex.
 * A valid bech32 addr starts with 'addr'. If the returned string looks like
 * raw hex (no spaces, all hex chars, length > 50) try to decode it.
 * CIP-30 spec: getChangeAddress returns a single address as a hex-encoded CBOR bytes.
 */
function decodeCborAddress(raw: string): string {
  const trimmed = raw.trim();
  if (/^addr/.test(trimmed)) return trimmed;
  if (/^[0-9a-fA-F]{2,}$/.test(trimmed) && trimmed.length > 20) {
    try {
      const bytes = new Uint8Array(trimmed.match(/.{1,2}/g)!.map((b) => parseInt(b, 16)));
      const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
      if (/^addr/.test(text)) return text;
    } catch { /* fall through */ }
    return `addr_hex_${trimmed.slice(0, 16)}`;
  }
  return trimmed;
}

function getCip30Wallets(): Array<{ key: string; api: Cip30Api }> {
  if (typeof window === 'undefined') return [];
  const cardano = (window as unknown as { cardano?: Record<string, Cip30Api> }).cardano;
  if (!cardano) return [];
  return Object.entries(cardano)
    .filter(([, v]) => v && typeof v.enable === 'function')
    .map(([key, api]) => ({ key, api }));
}

const TEST_CHAINS: ChainName[] = ['xrpl', 'cardano', 'midnight', 'xahau'];

export function ConnectButton() {
  const { identity, connect, disconnect, generateTestIdentity, isConnecting, error } = useWallet();
  const [open, setOpen] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const [cip30, setCip30] = React.useState<Array<{ key: string; api: Cip30Api }>>([]);
  const [midnight, setMidnight] = React.useState<DetectedMidnightWallet[]>([]);
  const [diag, setDiag] = React.useState<string>('');
  const [connectError, setConnectError] = React.useState<string | null>(null);
  const [connecting, setConnecting] = React.useState<string | null>(null);
  const [xamanPayload, setXamanPayload] = React.useState<XamanPayloadResponse | null>(null);
  const [xamanStatus, setXamanStatus] = React.useState<'pending' | 'signed' | 'cancelled' | 'expired' | null>(null);
  const ref = React.useRef<HTMLDivElement>(null);

  // Wallet extensions inject window.cardano / window.midnight asynchronously,
  // sometimes seconds after load. Poll a few times so we don't miss them.
  React.useEffect(() => {
    function scan() {
      setCip30(getCip30Wallets());
      setMidnight(getMidnightWallets());
      const w = window as unknown as {
        cardano?: Record<string, unknown>;
        midnight?: Record<string, unknown>;
      };
      const cardanoKeys = w.cardano ? Object.keys(w.cardano) : [];
      const midnightEntries = w.midnight
        ? Object.entries(w.midnight).map(([k, v]) => {
            const o = v as Record<string, unknown>;
            const name = typeof o?.name === 'string' ? o.name : '?';
            const hasEnable = typeof o?.enable === 'function';
            const hasConnect = typeof o?.connect === 'function';
            return `${name}(${k.slice(0, 6)}…,enable=${hasEnable},connect=${hasConnect})`;
          })
        : [];
      setDiag(
        `cardano: [${cardanoKeys.join(', ') || '—'}] · ` +
          `midnight: [${midnightEntries.join(', ') || '—'}]`
      );
    }
    scan();
    const id = setInterval(scan, 1000);
    const stop = setTimeout(() => clearInterval(id), 8000);
    return () => {
      clearInterval(id);
      clearTimeout(stop);
    };
  }, [open]);

  React.useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  async function connectCip30(key: string, api: Cip30Api) {
    const name = api.name ?? key;
    setConnectError(null);
    setConnecting(key);
    try {
      const enabled = await api.enable();

      let rawAddress = '';
      try {
        rawAddress = await enabled.getChangeAddress();
      } catch {
        const used = await enabled.getUsedAddresses().catch(() => [] as string[]);
        rawAddress = used[0] ?? '';
      }

      if (!rawAddress) {
        setConnectError(
          `${name} connected but returned no address. Open the extension, make sure an account exists, then try again.`
        );
        return;
      }

      const address = decodeCborAddress(rawAddress);
      const next: WalletIdentity = {
        address,
        chain: 'cardano',
        source: 'cip30',
        label: name,
      };
      connect(next);
      setOpen(false);
    } catch (err) {
      console.warn('[ConnectButton] CIP-30 connect failed:', err);
      const reason =
        (err as { info?: string })?.info ??
        (err as Error)?.message ??
        'the request was dismissed or rejected';
      setConnectError(`Could not connect to ${name}: ${reason}`);
    } finally {
      setConnecting(null);
    }
  }

  async function connectMidnight(wallet: DetectedMidnightWallet) {
    const name = wallet.api.name ?? wallet.key;
    setConnectError(null);
    setConnecting(wallet.key);
    try {
      const conn = await connectMidnightWallet(wallet);
      // The wallet's configured proof server becomes our client-side prover.
      if (conn.proverServerUri) {
        setProofServerUrl(conn.proverServerUri);
      }
      const next: WalletIdentity = {
        address: conn.address,
        chain: 'midnight',
        source: 'midnight',
        label: conn.walletName,
      };
      connect(next);
      setOpen(false);
    } catch (err) {
      console.warn('[ConnectButton] Midnight connect failed:', err);
      const reason = (err as Error)?.message ?? 'the request was dismissed or rejected';
      setConnectError(`Could not connect to ${name}: ${reason}`);
    } finally {
      setConnecting(null);
    }
  }

  async function connectXaman() {
    setConnectError(null);
    setConnecting('xaman');
    setXamanStatus('pending');
    try {
      const payload = await createXamanPayload();
      setXamanPayload(payload);
      const result = await pollXamanPayload(payload.uuid, setXamanStatus);
      const next: WalletIdentity = {
        address: result.address,
        chain: result.network,
        source: 'xaman',
        label: 'Xaman',
      };
      connect(next);
      setXamanPayload(null);
      setXamanStatus(null);
      setOpen(false);
    } catch (err) {
      console.warn('[ConnectButton] Xaman connect failed:', err);
      setConnectError((err as Error)?.message ?? 'Xaman sign-in failed');
      setXamanPayload(null);
      setXamanStatus(null);
    } finally {
      setConnecting(null);
    }
  }

  function copy() {
    if (!identity) return;
    navigator.clipboard.writeText(identity.address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  if (identity) {
    return (
      <div className="relative" ref={ref}>
        <Button variant="outline" onClick={() => setOpen((o) => !o)}>
          <span className="h-2 w-2 rounded-full bg-emerald-400" />
          <span className="font-mono text-xs">{shortAddress(identity.address)}</span>
          <ChevronDown className="h-4 w-4 opacity-60" />
        </Button>
        {open && (
          <div className="absolute right-0 z-50 mt-2 w-64 rounded-lg border border-border bg-card p-2 shadow-xl">
            <div className="px-2 py-1.5 text-xs text-muted-foreground">
              {identity.label ?? identity.source} · {identity.chain}
            </div>
            <button
              onClick={copy}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-secondary/60"
            >
              {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
              <span className="font-mono text-xs">{shortAddress(identity.address, 10, 6)}</span>
            </button>
            <button
              onClick={() => {
                disconnect();
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-destructive hover:bg-destructive/10"
            >
              <LogOut className="h-4 w-4" />
              Disconnect
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative" ref={ref}>
      <Button onClick={() => setOpen((o) => !o)} disabled={isConnecting}>
        <Wallet className="h-4 w-4" />
        {isConnecting ? 'Connecting…' : 'Connect Wallet'}
      </Button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-72 rounded-lg border border-border bg-card p-2 shadow-xl">
          {/* Xaman section — always shown since no browser extension detection needed */}
          <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
            XRPL / Xahau wallets
          </div>
          <button
            onClick={() => void connectXaman()}
            disabled={connecting !== null}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-secondary/60 disabled:opacity-50"
          >
            <Wallet className="h-4 w-4 text-blue-400" />
            Xaman (XUMM)
            <span className="ml-auto text-[10px] uppercase tracking-wide text-blue-400">
              {connecting === 'xaman' ? (xamanStatus ?? 'connecting…') : 'xrpl · xahau'}
            </span>
          </button>
          {xamanPayload && (
            <div className="mx-2 my-2 space-y-2 rounded-md border border-border bg-secondary/20 p-3">
              <p className="text-xs font-medium">Scan with Xaman to sign in</p>
              <img
                src={xamanPayload.refs.qr_png}
                alt="Xaman QR code"
                className="mx-auto h-40 w-40 rounded border border-border bg-white p-1"
              />
              <p className="text-center text-[10px] text-muted-foreground">
                {xamanStatus === 'pending' ? 'Waiting for signature…' : xamanStatus ?? ''}
              </p>
              <a
                href={xamanPayload.next.always}
                className="block text-center text-xs text-blue-400 underline hover:text-blue-300"
              >
                Open in Xaman app
              </a>
            </div>
          )}
          <div className="my-1 border-t border-border" />
          {midnight.length > 0 && (
            <>
              <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                Midnight wallets
              </div>
              {midnight.map((wallet) => (
                <button
                  key={wallet.key}
                  onClick={() => connectMidnight(wallet)}
                  disabled={connecting !== null}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm capitalize hover:bg-secondary/60 disabled:opacity-50"
                >
                  {wallet.api.icon
                    ? <img src={wallet.api.icon} alt={wallet.key} className="h-4 w-4 rounded" />
                    : <Wallet className="h-4 w-4 text-primary" />
                  }
                  {wallet.api.name ?? 'Midnight Wallet'}
                  <span className="ml-auto text-[10px] uppercase tracking-wide text-primary">
                    {connecting === wallet.key ? 'connecting…' : 'midnight'}
                  </span>
                </button>
              ))}
              <div className="my-1 border-t border-border" />
            </>
          )}
          {cip30.length > 0 && (
            <>
              <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                Cardano wallets
              </div>
              {cip30.map(({ key, api }) => (
                <button
                  key={key}
                  onClick={() => connectCip30(key, api)}
                  disabled={connecting !== null}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm capitalize hover:bg-secondary/60 disabled:opacity-50"
                >
                  {api.icon
                    ? <img src={api.icon} alt={key} className="h-4 w-4 rounded" />
                    : <Wallet className="h-4 w-4" />
                  }
                  {api.name ?? key}
                  {connecting === key && (
                    <span className="ml-auto text-[10px] uppercase tracking-wide text-muted-foreground">
                      connecting…
                    </span>
                  )}
                </button>
              ))}
              <div className="my-1 border-t border-border" />
            </>
          )}
          <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
            Generate test identity
          </div>
          <div className="grid grid-cols-2 gap-1">
            {TEST_CHAINS.map((chain) => (
              <button
                key={chain}
                onClick={() => {
                  void generateTestIdentity(chain);
                  setOpen(false);
                }}
                className={cn(
                  'rounded-md px-2 py-1.5 text-sm capitalize hover:bg-secondary/60'
                )}
              >
                {chain}
              </button>
            ))}
          </div>
          {(connectError || error) && (
            <div className="px-2 py-1.5 text-xs text-destructive">{connectError ?? error}</div>
          )}
          <div className="my-1 border-t border-border" />
          <div className="px-2 py-1.5 text-[10px] leading-tight text-muted-foreground break-all">
            <span className="font-medium">Detected:</span> {diag || 'scanning…'}
          </div>
        </div>
      )}
    </div>
  );
}
