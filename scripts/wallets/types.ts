import type { ChainName } from '../../lib/agility/types';

export interface GeneratedWallet {
  chain: ChainName;
  network: string;
  address: string;
  /** Secret material — for ephemeral test wallets only. Never commit. */
  secret: string;
  /** Optional public key, where applicable. */
  publicKey?: string;
  /** BIP39 mnemonic, where applicable. */
  mnemonic?: string;
}

export interface WalletBundle {
  generatedAt: string;
  wallets: Record<ChainName, GeneratedWallet>;
}

export interface WalletGenerator {
  chain: ChainName;
  generate(): Promise<GeneratedWallet> | GeneratedWallet;
}
