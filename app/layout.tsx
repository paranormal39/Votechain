import type { Metadata } from 'next';
import './globals.css';
import { WalletProvider } from '@/components/wallet/wallet-provider';
import { Nav } from '@/components/nav';

export const metadata: Metadata = {
  title: 'VoteChain — Confidential Governance',
  description:
    'Confidential governance infrastructure for organizations. Private decisions. Public accountability.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-grid" suppressHydrationWarning>
        <WalletProvider>
          <Nav />
          <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
        </WalletProvider>
      </body>
    </html>
  );
}
