'use client';

import * as React from 'react';
import Link from 'next/link';
import { Plus, Rocket, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { apiFetch } from '@/lib/api/fetch';
import { formatDate } from '@/lib/utils';
import { fundingProgress, type PublicProject, type ProjectStatus } from '@/lib/launchpad/project-types';

const STATUS_VARIANT: Record<ProjectStatus, 'secondary' | 'success' | 'warning' | 'outline'> = {
  draft: 'outline',
  funding: 'warning',
  activating: 'secondary',
  live: 'success',
  failed: 'warning',
  refunding: 'secondary',
  refunded: 'outline',
};

export default function ProjectsPage() {
  const [projects, setProjects] = React.useState<PublicProject[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    apiFetch<PublicProject[]>('/api/projects')
      .then(setProjects)
      .catch((e) => setError(e.message));
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Launchpad</h1>
          <p className="text-sm text-muted-foreground">
            Fund a project into escrow. When the goal is met, its DAO activates and governance opens.
          </p>
        </div>
        <Link href="/projects/new">
          <Button>
            <Plus className="h-4 w-4" /> New project
          </Button>
        </Link>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {!projects && !error && <p className="text-sm text-muted-foreground">Loading…</p>}

      {projects && projects.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary">
              <Rocket className="h-6 w-6 text-muted-foreground" />
            </span>
            <p className="text-sm text-muted-foreground">No projects yet.</p>
            <Link href="/projects/new">
              <Button variant="outline">
                <Plus className="h-4 w-4" /> Launch the first one
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}

      {projects && projects.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          {projects.map((p) => {
            const pct = Math.round(fundingProgress(p) * 100);
            return (
              <Link key={p.id} href={`/projects/${p.id}`}>
                <Card className="h-full transition-colors hover:border-primary/50">
                  <CardHeader>
                    <div className="flex items-center justify-between gap-2">
                      <CardTitle className="text-base">{p.name}</CardTitle>
                      <div className="flex gap-1.5">
                        <Badge variant="secondary">{p.chain}</Badge>
                        <Badge variant={STATUS_VARIANT[p.status]}>{p.status}</Badge>
                      </div>
                    </div>
                    <CardDescription className="line-clamp-2">
                      {p.description || 'No description.'}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>
                        {p.raisedAmount} / {p.goalAmount} {p.currency} ({pct}%)
                      </span>
                      <span className="flex items-center gap-1">
                        <Users className="h-3.5 w-3.5" /> {p.membership.kind}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Deadline {formatDate(p.deadline)}
                    </p>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
