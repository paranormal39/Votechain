import { Wallet } from 'xrpl';
import type { GeneratedWallet, WalletGenerator } from './types';

/**
 * XRPL test wallet. XRPL devnet uses classic r-addresses.
 * Wallet.generate() produces a fresh keypair + seed (family seed).
 */
export const xrplGenerator: WalletGenerator = {
  chain: 'xrpl',
  generate(): GeneratedWallet {
    const wallet = Wallet.generate();
    return {
      chain: 'xrpl',
      network: 'devnet',
      address: wallet.classicAddress,
      secret: wallet.seed ?? '',
      publicKey: wallet.publicKey,
    };
  },
};
