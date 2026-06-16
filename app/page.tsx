'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowRight, Lock, Eye, Vote, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { apiFetch } from '@/lib/api/fetch';
import type { HealthData } from '@/lib/agility/types';

const features = [
  { icon: Lock, title: 'Private decisions', body: 'Votes stay confidential via Midnight ZK proofs.' },
  { icon: Eye, title: 'Public accountability', body: 'Outcomes are verifiable without exposing voters.' },
  { icon: Vote, title: 'Representative governance', body: 'Delegate authority while keeping ballots private.' },
];

export default function DashboardPage() {
  const [health, setHealth] = React.useState<HealthData | null>(null);
  const [healthError, setHealthError] = React.useState(false);

  React.useEffect(() => {
    apiFetch<HealthData>('/api/health')
      .then(setHealth)
      .catch(() => setHealthError(true));
  }, []);

  return (
    <div className="space-y-12">
      <section className="space-y-6 py-8">
        <Badge variant="default" className="gap-1.5">
          <ShieldCheck className="h-3.5 w-3.5" /> Confidential governance infrastructure
        </Badge>
        <h1 className="max-w-2xl text-4xl font-bold tracking-tight sm:text-5xl">
          Govern privately. Remain accountable.
        </h1>
        <p className="max-w-xl text-lg text-muted-foreground">
          VoteChain lets organizations make decisions, manage treasuries, and delegate authority
          while preserving privacy — powered by Midnight.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link href="/organizations/new">
            <Button size="lg">
              Create organization <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
          <Link href="/organizations">
            <Button size="lg" variant="outline">
              Browse organizations
            </Button>
          </Link>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        {features.map((f) => (
          <Card key={f.title}>
            <CardHeader>
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/15 text-primary">
                <f.icon className="h-5 w-5" />
              </span>
              <CardTitle className="pt-2 text-base">{f.title}</CardTitle>
              <CardDescription>{f.body}</CardDescription>
            </CardHeader>
          </Card>
        ))}
      </section>

      <section>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Network status</CardTitle>
            <CardDescription>Live connection to AgilityCore execution layer.</CardDescription>
          </CardHeader>
          <CardContent>
            {healthError && (
              <p className="text-sm text-destructive">Unable to reach AgilityCore.</p>
            )}
            {!healthError && !health && (
              <p className="text-sm text-muted-foreground">Checking…</p>
            )}
            {health && (
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="success">{health.status}</Badge>
                {health.simulation && <Badge variant="warning">simulation mode</Badge>}
                {Object.values(health.chains ?? {}).map((c) => (
                  <Badge key={c.chain} variant={c.connected ? 'secondary' : 'outline'}>
                    {c.chain}: {c.connected ? 'connected' : 'offline'}
                  </Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
