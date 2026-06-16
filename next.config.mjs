/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // AgilityCore SDK / chain libs are server-only; keep them out of client bundles.
  experimental: {
    serverComponentsExternalPackages: ['@emurgo/cardano-serialization-lib-nodejs'],
  },
};

export default nextConfig;
