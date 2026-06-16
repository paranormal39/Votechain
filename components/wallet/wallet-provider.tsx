'use client';

import * as React from 'react';
import type { ChainName } from '@/lib/agility/types';

export interface WalletIdentity {
  address: string;
  chain: ChainName;
  network?: string;
  source: 'cip30' | 'midnight' | 'xaman' | 'generated' | 'manual';
  label?: string;
}

interface WalletContextValue {
  identity: WalletIdentity | null;
  connect: (identity: WalletIdentity) => void;
  disconnect: () => void;
  generateTestIdentity: (chain: ChainName) => Promise<void>;
  isConnecting: boolean;
  error: string | null;
}

const STORAGE_KEY = 'votechain.wallet';

const WalletContext = React.createContext<WalletContextValue | null>(null);

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [identity, setIdentity] = React.useState<WalletIdentity | null>(null);
  const [isConnecting, setIsConnecting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setIdentity(JSON.parse(raw) as WalletIdentity);
    } catch {
      /* ignore */
    }
  }, []);

  const connect = React.useCallback((next: WalletIdentity) => {
    setIdentity(next);
    setError(null);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }, []);

  const disconnect = React.useCallback(() => {
    setIdentity(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  const generateTestIdentity = React.useCallback(
    async (chain: ChainName) => {
      setIsConnecting(true);
      setError(null);
      try {
        const res = await fetch('/api/wallet/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chain }),
        });
        const json = await res.json();
        if (!res.ok || !json.success) {
          throw new Error(json.error?.message ?? 'Failed to generate identity');
        }
        connect({
          address: json.data.address,
          chain: json.data.chain,
          network: json.data.network,
          source: 'generated',
          label: `Test ${chain}`,
        });
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setIsConnecting(false);
      }
    },
    [connect]
  );

  const value = React.useMemo<WalletContextValue>(
    () => ({ identity, connect, disconnect, generateTestIdentity, isConnecting, error }),
    [identity, connect, disconnect, generateTestIdentity, isConnecting, error]
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletContextValue {
  const ctx = React.useContext(WalletContext);
  if (!ctx) throw new Error('useWallet must be used within a WalletProvider');
  return ctx;
}
