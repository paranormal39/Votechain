'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ShieldCheck } from 'lucide-react';
import { ConnectButton } from '@/components/wallet/connect-button';
import { cn } from '@/lib/utils';

const links = [
  { href: '/', label: 'Dashboard' },
  { href: '/organizations', label: 'Organizations' },
];

export function Nav() {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 text-primary">
              <ShieldCheck className="h-5 w-5" />
            </span>
            VoteChain
          </Link>
          <nav className="hidden items-center gap-1 sm:flex">
            {links.map((link) => {
              const active =
                link.href === '/' ? pathname === '/' : pathname.startsWith(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    'rounded-md px-3 py-1.5 text-sm transition-colors',
                    active
                      ? 'bg-secondary text-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>
        <ConnectButton />
      </div>
    </header>
  );
}
