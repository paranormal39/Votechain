'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Wallet, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input, Textarea } from '@/components/ui/input';
import { useWallet } from '@/components/wallet/wallet-provider';
import { apiFetch } from '@/lib/api/fetch';
import { shortAddress } from '@/lib/utils';
import type { PublicProject } from '@/lib/launchpad/project-types';

const SELECT_CLASS =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

type MembershipKind = 'token' | 'nft' | 'credential';

export default function NewProjectPage() {
  const router = useRouter();
  const { identity } = useWallet();
  const [name, setName] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [goalAmount, setGoalAmount] = React.useState('');
  const [currency, setCurrency] = React.useState('XRP');
  const [deadline, setDeadline] = React.useState('');
  const [membershipKind, setMembershipKind] = React.useState<MembershipKind>('nft');
  const [membershipName, setMembershipName] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Default the currency to the chain's native asset for convenience.
  React.useEffect(() => {
    if (!identity) return;
    setCurrency(identity.chain === 'midnight' ? 'NIGHT' : 'XRP');
    setMembershipKind(identity.chain === 'midnight' ? 'credential' : 'nft');
  }, [identity]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!identity) return;
    setSubmitting(true);
    setError(null);
    try {
      const project = await apiFetch<PublicProject>('/api/projects', {
        method: 'POST',
        body: JSON.stringify({
          name,
          description: description || undefined,
          chain: identity.chain,
          createdBy: identity.address,
          goalAmount,
          currency,
          deadline: new Date(deadline).toISOString(),
          membership: {
            kind: membershipKind,
            name: membershipName || `${name} Membership`,
          },
        }),
      });
      router.push(`/projects/${project.id}`);
    } catch (err) {
      setError((err as Error).message);
      setSubmitting(false);
    }
  }

  const chainSupported = identity && identity.chain !== 'cardano';

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <Link
        href="/projects"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to launchpad
      </Link>

      <Card>
        <CardHeader>
          <CardTitle>Launch a project</CardTitle>
          <CardDescription>
            Opens an on-chain funding escrow. When the goal is met by the deadline, the DAO
            activates, membership is minted to contributors, and governance opens.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!identity ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary">
                <Wallet className="h-6 w-6 text-muted-foreground" />
              </span>
              <p className="text-sm text-muted-foreground">
                Connect a wallet to launch a project.
              </p>
            </div>
          ) : !chainSupported ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              The launchpad currently supports XRPL, Xahau, and Midnight. Cardano support is coming
              soon — switch your connected wallet to a supported chain.
            </p>
          ) : (
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Name</label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Acme Foundation"
                  required
                  minLength={2}
                  maxLength={80}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Description</label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What will this DAO govern?"
                  maxLength={1000}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Funding goal</label>
                  <Input
                    value={goalAmount}
                    onChange={(e) => setGoalAmount(e.target.value)}
                    placeholder="1000"
                    inputMode="decimal"
                    pattern="^\d+(\.\d+)?$"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Currency</label>
                  <Input
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                    placeholder="XRP"
                    required
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Deadline</label>
                <Input
                  type="datetime-local"
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Membership type</label>
                  <select
                    className={SELECT_CLASS}
                    value={membershipKind}
                    onChange={(e) => setMembershipKind(e.target.value as MembershipKind)}
                  >
                    <option value="nft">NFT</option>
                    <option value="token">Token</option>
                    <option value="credential">Credential (Midnight)</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Membership name</label>
                  <Input
                    value={membershipName}
                    onChange={(e) => setMembershipName(e.target.value)}
                    placeholder="Founding Member"
                    maxLength={80}
                  />
                </div>
              </div>
              <div className="rounded-md border border-border bg-secondary/40 px-3 py-2 text-xs text-muted-foreground">
                Creator:{' '}
                <span className="font-mono text-foreground">{shortAddress(identity.address)}</span>{' '}
                · {identity.chain}
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? 'Creating…' : 'Create project'}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
