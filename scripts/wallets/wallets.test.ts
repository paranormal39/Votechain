import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { cardanoGenerator } from './cardano';
import { midnightGenerator } from './midnight';
import { xahauGenerator } from './xahau';
import { xrplGenerator } from './xrpl';
import { generateAllWallets } from './index';

describe('wallet generators', () => {
  it('generates a valid XRPL wallet', async () => {
    const w = await xrplGenerator.generate();
    assert.equal(w.chain, 'xrpl');
    assert.match(w.address, /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/);
    assert.match(w.secret, /^s/);
    assert.ok(w.publicKey);
  });

  it('generates a valid Xahau wallet (XRPL format)', async () => {
    const w = await xahauGenerator.generate();
    assert.equal(w.chain, 'xahau');
    assert.match(w.address, /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/);
  });

  it('generates a valid Cardano testnet wallet', async () => {
    const w = await cardanoGenerator.generate();
    assert.equal(w.chain, 'cardano');
    assert.match(w.address, /^addr_test1/);
    assert.equal(w.mnemonic?.split(' ').length, 24);
  });

  it('generates a Midnight test wallet with documented prefix', async () => {
    const w = await midnightGenerator.generate();
    assert.equal(w.chain, 'midnight');
    assert.match(w.address, /^mn_shield-addr_test1/);
    assert.equal(w.mnemonic?.split(' ').length, 24);
  });

  it('generates all four chains with unique addresses', async () => {
    const bundle = await generateAllWallets();
    const chains = Object.keys(bundle.wallets).sort();
    assert.deepEqual(chains, ['cardano', 'midnight', 'xahau', 'xrpl']);
    const addresses = Object.values(bundle.wallets).map((w) => w.address);
    assert.equal(new Set(addresses).size, addresses.length);
  });
});
