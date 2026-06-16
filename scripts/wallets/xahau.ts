import { Wallet } from 'xrpl';
import type { GeneratedWallet, WalletGenerator } from './types';

/**
 * Xahau test wallet. Xahau is an XRPL-protocol sidechain and shares the
 * same address/keypair format, so we reuse the xrpl keypair generator.
 */
export const xahauGenerator: WalletGenerator = {
  chain: 'xahau',
  generate(): GeneratedWallet {
    const wallet = Wallet.generate();
    return {
      chain: 'xahau',
      network: 'testnet',
      address: wallet.classicAddress,
      secret: wallet.seed ?? '',
      publicKey: wallet.publicKey,
    };
  },
};
