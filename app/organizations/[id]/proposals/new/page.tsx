'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input, Textarea } from '@/components/ui/input';
import { useWallet } from '@/components/wallet/wallet-provider';
import { apiFetch } from '@/lib/api/fetch';
import { shortAddress, cn } from '@/lib/utils';
import type { Organization } from '@/lib/domain/types';
import type { Proposal, ProposalType } from '@/lib/domain/proposal-types';

const TYPES: { value: ProposalType; label: string; hint: string }[] = [
  { value: 'general', label: 'General', hint: 'Standard governance decision.' },
  { value: 'treasury', label: 'Treasury', hint: 'Linked to a spend (executes in Phase 5).' },
];

export default function NewProposalPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { identity } = useWallet();

  const [org, setOrg] = React.useState<Organization | null>(null);
  const [title, setTitle] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [type, setType] = React.useState<ProposalType>('general');
  const [votingPeriodDays, setVotingPeriodDays] = React.useState(7);
  const [quorum, setQuorum] = React.useState(1);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    apiFetch<Organization>(`/api/orgs/${params.id}`)
      .then(setOrg)
      .catch(() => setOrg(null));
  }, [params.id]);

  const isAdmin = Boolean(
    org && identity && org.members.some((m) => m.walletAddress === identity.address && m.role === 'admin')
  );

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!identity) return;
    setSubmitting(true);
    setError(null);
    try {
      const proposal = await apiFetch<Proposal>(`/api/orgs/${params.id}/proposals`, {
        method: 'POST',
        body: JSON.stringify({
          title,
          description,
          type,
          votingPeriodDays,
          quorum,
          createdBy: identity.address,
        }),
      });
      router.push(`/proposals/${proposal.id}`);
    } catch (err) {
      setError((err as Error).message);
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <Link
        href={`/organizations/${params.id}`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to organization
      </Link>

      <Card>
        <CardHeader>
          <CardTitle>Create proposal</CardTitle>
          <CardDescription>
            Drafts start private to admins. Activate to open the voting window.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!identity ? (
            <EmptyState text="Connect a wallet to create a proposal." />
          ) : !org ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : !isAdmin ? (
            <EmptyState text="Only organization admins can create proposals." />
          ) : (
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Title</label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Increase grants budget for Q3"
                  required
                  minLength={3}
                  maxLength={120}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Description</label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Explain the proposal and its rationale…"
                  required
                  maxLength={5000}
                  className="min-h-[120px]"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Type</label>
                <div className="grid grid-cols-2 gap-2">
                  {TYPES.map((t) => (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => setType(t.value)}
                      className={cn(
                        'rounded-md border px-3 py-2 text-left text-sm transition-colors',
                        type === t.value
                          ? 'border-primary bg-primary/10'
                          : 'border-border hover:bg-secondary/60'
                      )}
                    >
                      <div className="font-medium">{t.label}</div>
                      <div className="text-xs text-muted-foreground">{t.hint}</div>
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Voting period (days)</label>
                  <Input
                    type="number"
                    min={1}
                    max={90}
                    value={votingPeriodDays}
                    onChange={(e) => setVotingPeriodDays(Number(e.target.value))}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Quorum (min votes)</label>
                  <Input
                    type="number"
                    min={0}
                    value={quorum}
                    onChange={(e) => setQuorum(Number(e.target.value))}
                    required
                  />
                </div>
              </div>
              <div className="rounded-md border border-border bg-secondary/40 px-3 py-2 text-xs text-muted-foreground">
                Author: <span className="font-mono text-foreground">{shortAddress(identity.address)}</span>
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? 'Creating…' : 'Create draft proposal'}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-8 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary">
        <Wallet className="h-6 w-6 text-muted-foreground" />
      </span>
      <p className="text-sm text-muted-foreground">{text}</p>
    </div>
  );
}
