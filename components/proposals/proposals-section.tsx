'use client';

import * as React from 'react';
import Link from 'next/link';
import { Plus, FileText, MessageSquare, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ProposalStatusBadge } from './status-badge';
import { apiFetch } from '@/lib/api/fetch';
import { formatDate } from '@/lib/utils';
import { participationCount, type Proposal } from '@/lib/domain/proposal-types';

export function ProposalsSection({ orgId, isAdmin }: { orgId: string; isAdmin: boolean }) {
  const [proposals, setProposals] = React.useState<Proposal[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    apiFetch<Proposal[]>(`/api/orgs/${orgId}/proposals`)
      .then(setProposals)
      .catch((e) => setError(e.message));
  }, [orgId]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">Proposals</CardTitle>
            <CardDescription>Governance decisions for this organization.</CardDescription>
          </div>
          {isAdmin && (
            <Link href={`/organizations/${orgId}/proposals/new`}>
              <Button size="sm">
                <Plus className="h-4 w-4" /> New proposal
              </Button>
            </Link>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {error && <p className="text-sm text-destructive">{error}</p>}
        {!proposals && !error && <p className="text-sm text-muted-foreground">Loading…</p>}
        {proposals && proposals.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary">
              <FileText className="h-5 w-5 text-muted-foreground" />
            </span>
            <p className="text-sm text-muted-foreground">No proposals yet.</p>
          </div>
        )}
        {proposals?.map((p) => (
          <Link key={p.id} href={`/proposals/${p.id}`}>
            <div className="flex items-center justify-between rounded-md border border-border bg-secondary/30 px-3 py-2.5 transition-colors hover:border-primary/50">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium">{p.title}</span>
                  {p.type === 'treasury' && (
                    <span className="rounded bg-accent/15 px-1.5 py-0.5 text-[10px] uppercase text-accent">
                      treasury
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Users className="h-3 w-3" /> {participationCount(p)} vote
                    {participationCount(p) === 1 ? '' : 's'}
                  </span>
                  <span className="flex items-center gap-1">
                    <MessageSquare className="h-3 w-3" /> {p.comments.length}
                  </span>
                  <span>Created {formatDate(p.createdAt)}</span>
                </div>
              </div>
              <ProposalStatusBadge status={p.status} />
            </div>
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}
