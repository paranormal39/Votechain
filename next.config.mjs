/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // AgilityCore SDK / chain libs are server-only; keep them out of client bundles.
  experimental: {
    serverComponentsExternalPackages: [
      '@emurgo/cardano-serialization-lib-nodejs',
      '@midnight-ntwrk/dao-contract',
      '@midnight-ntwrk/compact-runtime',
      '@midnight-ntwrk/compact-js',
      '@midnight-ntwrk/midnight-js',
      '@midnight-ntwrk/midnight-js-http-client-proof-provider',
      '@midnight-ntwrk/midnight-js-indexer-public-data-provider',
      '@midnight-ntwrk/midnight-js-level-private-state-provider',
      '@midnight-ntwrk/midnight-js-node-zk-config-provider',
      '@midnight-ntwrk/midnight-js-types',
      '@midnight-ntwrk/midnight-js-contracts',
      '@midnight-ntwrk/ledger-v8',
      '@midnight-ntwrk/wallet-sdk-address-format',
      '@midnight-ntwrk/wallet-sdk-dust-wallet',
      '@midnight-ntwrk/wallet-sdk-facade',
      '@midnight-ntwrk/wallet-sdk-hd',
      '@midnight-ntwrk/wallet-sdk-shielded',
      '@midnight-ntwrk/wallet-sdk-unshielded-wallet',
      'pino',
      'ws',
    ],
  },
};

export default nextConfig;
