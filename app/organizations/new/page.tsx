'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Wallet, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input, Textarea } from '@/components/ui/input';
import { useWallet } from '@/components/wallet/wallet-provider';
import { MembershipEditor } from '@/components/organizations/membership-editor';
import { apiFetch } from '@/lib/api/fetch';
import { shortAddress } from '@/lib/utils';
import type { MembershipSettings, Organization } from '@/lib/domain/types';

export default function NewOrganizationPage() {
  const router = useRouter();
  const { identity } = useWallet();
  const [name, setName] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [membership, setMembership] = React.useState<MembershipSettings>({
    joinPolicy: 'invite',
    requirements: [],
  });
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!identity) return;
    setSubmitting(true);
    setError(null);
    try {
      const org = await apiFetch<Organization>('/api/orgs', {
        method: 'POST',
        body: JSON.stringify({
          name,
          description: description || undefined,
          chain: identity.chain,
          createdBy: identity.address,
          membership,
        }),
      });
      router.push(`/organizations/${org.id}`);
    } catch (err) {
      setError((err as Error).message);
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <Link
        href="/organizations"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to organizations
      </Link>

      <Card>
        <CardHeader>
          <CardTitle>Create organization</CardTitle>
          <CardDescription>
            Provisions a governance space and a backing AgilityCore DAO. You become the first admin.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!identity ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary">
                <Wallet className="h-6 w-6 text-muted-foreground" />
              </span>
              <p className="text-sm text-muted-foreground">
                Connect a wallet to create an organization.
              </p>
            </div>
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
                  placeholder="What does this organization govern?"
                  maxLength={500}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Membership</label>
                <p className="text-xs text-muted-foreground">
                  Choose who can join. Token / NFT requirements are verified on-chain when members
                  join.
                </p>
                <MembershipEditor value={membership} onChange={setMembership} />
              </div>
              <div className="rounded-md border border-border bg-secondary/40 px-3 py-2 text-xs text-muted-foreground">
                Admin identity:{' '}
                <span className="font-mono text-foreground">{shortAddress(identity.address)}</span>{' '}
                · {identity.chain}
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? 'Creating…' : 'Create organization'}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
