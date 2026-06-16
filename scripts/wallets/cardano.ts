import * as bip39 from 'bip39';
import * as CSL from '@emurgo/cardano-serialization-lib-nodejs';
import type { GeneratedWallet, WalletGenerator } from './types';

const HARDENED = 0x80000000;

function harden(index: number): number {
  return HARDENED + index;
}

/**
 * Cardano test wallet (testnet). Generates a 24-word mnemonic, derives the
 * payment + stake keys per CIP-1852, and builds a bech32 base address.
 */
export const cardanoGenerator: WalletGenerator = {
  chain: 'cardano',
  generate(): GeneratedWallet {
    const mnemonic = bip39.generateMnemonic(256); // 24 words
    const entropy = bip39.mnemonicToEntropy(mnemonic);

    const rootKey = CSL.Bip32PrivateKey.from_bip39_entropy(
      Buffer.from(entropy, 'hex'),
      Buffer.from('')
    );

    // m / 1852' / 1815' / 0' / role / index
    const accountKey = rootKey.derive(harden(1852)).derive(harden(1815)).derive(harden(0));
    const paymentKey = accountKey.derive(0).derive(0);
    const stakeKey = accountKey.derive(2).derive(0);

    const paymentPub = paymentKey.to_public();
    const stakePub = stakeKey.to_public();

    const networkId = CSL.NetworkInfo.testnet_preprod().network_id();

    const baseAddr = CSL.BaseAddress.new(
      networkId,
      CSL.Credential.from_keyhash(paymentPub.to_raw_key().hash()),
      CSL.Credential.from_keyhash(stakePub.to_raw_key().hash())
    );

    const address = baseAddr.to_address().to_bech32();

    return {
      chain: 'cardano',
      network: 'testnet',
      address,
      secret: rootKey.to_bech32(),
      publicKey: paymentPub.to_bech32(),
      mnemonic,
    };
  },
};
