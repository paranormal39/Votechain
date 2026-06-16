import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ChainName } from '../../lib/agility/types';
import { cardanoGenerator } from './cardano';
import { midnightGenerator } from './midnight';
import { xahauGenerator } from './xahau';
import { xrplGenerator } from './xrpl';
import type { GeneratedWallet, WalletBundle, WalletGenerator } from './types';

export const WALLET_FILE = resolve(process.cwd(), '.wallets.json');

export const generators: WalletGenerator[] = [
  midnightGenerator,
  xrplGenerator,
  xahauGenerator,
  cardanoGenerator,
];

export async function generateAllWallets(): Promise<WalletBundle> {
  const wallets = {} as Record<ChainName, GeneratedWallet>;
  for (const gen of generators) {
    wallets[gen.chain] = await gen.generate();
  }
  return { generatedAt: new Date().toISOString(), wallets };
}

export function saveWalletBundle(bundle: WalletBundle, file = WALLET_FILE): void {
  writeFileSync(file, JSON.stringify(bundle, null, 2), 'utf8');
}

export function loadWalletBundle(file = WALLET_FILE): WalletBundle | null {
  if (!existsSync(file)) return null;
  return JSON.parse(readFileSync(file, 'utf8')) as WalletBundle;
}

export function loadOrCreateWalletBundle(file = WALLET_FILE): Promise<WalletBundle> {
  const existing = loadWalletBundle(file);
  if (existing) return Promise.resolve(existing);
  return generateAllWallets().then((bundle) => {
    saveWalletBundle(bundle, file);
    return bundle;
  });
}

export * from './types';
