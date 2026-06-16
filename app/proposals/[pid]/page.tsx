'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Clock, Target, MessageSquare, Send, Play, Gavel } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Textarea } from '@/components/ui/input';
import { ProposalStatusBadge } from '@/components/proposals/status-badge';
import { VotingSection } from '@/components/proposals/voting-section';
import { useWallet } from '@/components/wallet/wallet-provider';
import { apiFetch } from '@/lib/api/fetch';
import { shortAddress, formatDate } from '@/lib/utils';
import type { Organization } from '@/lib/domain/types';
import { participationCount, type Proposal, type ProposalAction } from '@/lib/domain/proposal-types';

export default function ProposalDetailPage() {
  const params = useParams<{ pid: string }>();
  const { identity } = useWallet();
  const [proposal, setProposal] = React.useState<Proposal | null>(null);
  const [org, setOrg] = React.useState<Organization | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const p = await apiFetch<Proposal>(`/api/proposals/${params.pid}`);
      setProposal(p);
      setError(null);
      const o = await apiFetch<Organization>(`/api/orgs/${p.orgId}`).catch(() => null);
      setOrg(o);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [params.pid]);

  React.useEffect(() => {
    load();
  }, [load]);

  const isAdmin = Boolean(
    org && identity && org.members.some((m) => m.walletAddress === identity.address && m.role === 'admin')
  );
  const isMember = Boolean(
    org && identity && org.members.some((m) => m.walletAddress === identity.address)
  );

  async function transition(action: ProposalAction) {
    setBusy(true);
    setError(null);
    try {
      const updated = await apiFetch<Proposal>(`/api/proposals/${params.pid}/status`, {
        method: 'POST',
        body: JSON.stringify({ action }),
      });
      setProposal(updated);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (error && !proposal) return <p className="text-sm text-destructive">{error}</p>;
  if (!proposal) return null;

  const participation = participationCount(proposal);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        href={`/organizations/${proposal.orgId}`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to organization
      </Link>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">{proposal.title}</h1>
          <ProposalStatusBadge status={proposal.status} />
          {proposal.type === 'treasury' && (
            <span className="rounded bg-accent/15 px-2 py-0.5 text-xs uppercase text-accent">treasury</span>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Created by <span className="font-mono">{shortAddress(proposal.createdBy)}</span> ·{' '}
          {formatDate(proposal.createdAt)}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <InfoCard icon={Target} label="Quorum" value={`${proposal.quorum} votes`} />
        <InfoCard icon={Clock} label="Voting period" value={`${proposal.votingPeriodDays} days`} />
        <InfoCard
          icon={Clock}
          label="Voting ends"
          value={proposal.votingEndsAt ? formatDate(proposal.votingEndsAt) : 'Not started'}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Description</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="whitespace-pre-wrap text-sm text-muted-foreground">{proposal.description}</p>
        </CardContent>
      </Card>

      <TallyCard proposal={proposal} participation={participation} />

      {proposal.status === 'active' && identity && isMember && (
        <VotingSection
          proposal={proposal}
          walletAddress={identity.address}
          onChange={setProposal}
        />
      )}

      {isAdmin && (proposal.status === 'draft' || proposal.status === 'active') && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Admin actions</CardTitle>
            <CardDescription>
              {proposal.status === 'draft'
                ? 'Activate to open the voting window.'
                : 'Finalize to resolve the outcome against quorum.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {proposal.status === 'draft' ? (
              <Button onClick={() => transition('activate')} disabled={busy}>
                <Play className="h-4 w-4" /> Activate proposal
              </Button>
            ) : (
              <Button onClick={() => transition('finalize')} disabled={busy} variant="secondary">
                <Gavel className="h-4 w-4" /> Finalize proposal
              </Button>
            )}
            {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
          </CardContent>
        </Card>
      )}

      <CommentsSection
        proposal={proposal}
        canComment={isMember}
        author={identity?.address}
        onChange={setProposal}
      />
    </div>
  );
}

function InfoCard({ icon: Icon, label, value }: { icon: typeof Clock; label: string; value: string }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 py-4">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-secondary text-muted-foreground">
          <Icon className="h-4 w-4" />
        </span>
        <div>
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="text-sm font-medium">{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function TallyCard({ proposal, participation }: { proposal: Proposal; participation: number }) {
  const quorumPct = proposal.quorum > 0 ? Math.min(100, (participation / proposal.quorum) * 100) : 0;
  const total = participation || 1;
  const yesPct = Math.round((proposal.tally.yes / total) * 100);
  const noPct = Math.round((proposal.tally.no / total) * 100);
  const abstainPct = 100 - yesPct - noPct;
  const quorumMet = participation >= proposal.quorum;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Tally</CardTitle>
        <CardDescription>
          {participation} of {proposal.quorum} required votes
          {participation > 0 && (
            <span className={`ml-2 font-medium ${quorumMet ? 'text-emerald-400' : 'text-amber-400'}`}>
              {quorumMet ? '✓ Quorum met' : `${proposal.quorum - participation} more needed`}
            </span>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Quorum progress */}
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Participation</span>
            <span>{Math.round(quorumPct)}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
            <div
              className={`h-full rounded-full transition-all ${quorumMet ? 'bg-emerald-500' : 'bg-amber-500'}`}
              style={{ width: `${quorumPct}%` }}
            />
          </div>
        </div>

        {/* Per-choice breakdown */}
        {participation > 0 && (
          <div className="space-y-2">
            <TallyBar label="Yes" value={proposal.tally.yes} pct={yesPct} color="bg-emerald-500" />
            <TallyBar label="No" value={proposal.tally.no} pct={noPct} color="bg-destructive" />
            <TallyBar label="Abstain" value={proposal.tally.abstain} pct={abstainPct} color="bg-muted-foreground" />
          </div>
        )}

        {participation === 0 && (
          <p className="text-sm text-muted-foreground">No votes cast yet.</p>
        )}
      </CardContent>
    </Card>
  );
}

function TallyBar({ label, value, pct, color }: { label: string; value: number; pct: number; color: string }) {
  return (
    <div className="space-y-0.5">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">{value} <span className="text-muted-foreground">({pct}%)</span></span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function CommentsSection({
  proposal,
  canComment,
  author,
  onChange,
}: {
  proposal: Proposal;
  canComment: boolean;
  author?: string;
  onChange: (p: Proposal) => void;
}) {
  const [body, setBody] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!author) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await apiFetch<Proposal>(`/api/proposals/${proposal.id}/comments`, {
        method: 'POST',
        body: JSON.stringify({ author, body }),
      });
      onChange(updated);
      setBody('');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <MessageSquare className="h-4 w-4" /> Discussion ({proposal.comments.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {proposal.comments.length === 0 && (
          <p className="text-sm text-muted-foreground">No comments yet.</p>
        )}
        {proposal.comments.map((c) => (
          <div key={c.id} className="rounded-md border border-border bg-secondary/30 px-3 py-2">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs text-foreground">{shortAddress(c.author)}</span>
              <span className="text-xs text-muted-foreground">{formatDate(c.createdAt)}</span>
            </div>
            <p className="mt-1 whitespace-pre-wrap text-sm">{c.body}</p>
          </div>
        ))}

        {canComment ? (
          <form onSubmit={submit} className="space-y-2">
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Add to the discussion…"
              required
              maxLength={2000}
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex justify-end">
              <Button type="submit" size="sm" disabled={busy || !body.trim()}>
                <Send className="h-4 w-4" /> {busy ? 'Posting…' : 'Comment'}
              </Button>
            </div>
          </form>
        ) : (
          <p className="text-xs text-muted-foreground">
            {author ? 'Only organization members can comment.' : 'Connect a wallet to join the discussion.'}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
