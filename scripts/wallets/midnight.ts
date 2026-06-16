import { randomBytes } from 'node:crypto';
import * as bip39 from 'bip39';
import type { GeneratedWallet, WalletGenerator } from './types';

/**
 * Midnight test wallet (testnet / "preview").
 *
 * NOTE: Full Midnight wallet derivation requires the Midnight SDK + a running
 * proof server. For the Phase 1 connection harness (server in simulation mode,
 * proof server offline) we generate a deterministic seed + a representative
 * testnet shielded address using the documented `mn_shield-addr_test1` prefix.
 *
 * This is sufficient to exercise AgilityCore's `vote/private` flow in simulation.
 * Replace with real SDK-based derivation when the proof server is available
 * (see plan: "Midnight wallet keygen" open question).
 */
export const midnightGenerator: WalletGenerator = {
  chain: 'midnight',
  generate(): GeneratedWallet {
    const mnemonic = bip39.generateMnemonic(256);
    const seed = bip39.mnemonicToSeedSync(mnemonic).toString('hex');
    const suffix = randomBytes(24).toString('hex');
    const address = `mn_shield-addr_test1${suffix}`;

    return {
      chain: 'midnight',
      network: 'preview',
      address,
      secret: seed,
      mnemonic,
    };
  },
};
