import { generateAllWallets, saveWalletBundle, WALLET_FILE } from './index';

async function main() {
  console.log('Generating test wallets for all four chains...\n');
  const bundle = await generateAllWallets();

  for (const [chain, wallet] of Object.entries(bundle.wallets)) {
    console.log(`  [${chain.padEnd(8)}] ${wallet.network.padEnd(8)} ${wallet.address}`);
  }

  saveWalletBundle(bundle);
  console.log(`\nSaved ${Object.keys(bundle.wallets).length} wallets to ${WALLET_FILE}`);
  console.log('WARNING: .wallets.json contains secret material. It is gitignored. Do not commit.');
}

main().catch((err) => {
  console.error('Wallet generation failed:', err);
  process.exit(1);
});
