'use client';

import * as React from 'react';
import Link from 'next/link';
import { Plus, Users, Building2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { apiFetch } from '@/lib/api/fetch';
import { formatDate } from '@/lib/utils';
import type { Organization } from '@/lib/domain/types';

export default function OrganizationsPage() {
  const [orgs, setOrgs] = React.useState<Organization[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    apiFetch<Organization[]>('/api/orgs')
      .then(setOrgs)
      .catch((e) => setError(e.message));
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Organizations</h1>
          <p className="text-sm text-muted-foreground">Governance spaces you can join or manage.</p>
        </div>
        <Link href="/organizations/new">
          <Button>
            <Plus className="h-4 w-4" /> New organization
          </Button>
        </Link>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {!orgs && !error && <p className="text-sm text-muted-foreground">Loading…</p>}

      {orgs && orgs.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary">
              <Building2 className="h-6 w-6 text-muted-foreground" />
            </span>
            <p className="text-sm text-muted-foreground">No organizations yet.</p>
            <Link href="/organizations/new">
              <Button variant="outline">
                <Plus className="h-4 w-4" /> Create the first one
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}

      {orgs && orgs.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          {orgs.map((org) => (
            <Link key={org.id} href={`/organizations/${org.id}`}>
              <Card className="h-full transition-colors hover:border-primary/50">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">{org.name}</CardTitle>
                    <Badge variant="secondary">{org.chain}</Badge>
                  </div>
                  <CardDescription className="line-clamp-2">
                    {org.description || 'No description.'}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Users className="h-3.5 w-3.5" /> {org.members.length} member
                    {org.members.length === 1 ? '' : 's'}
                  </span>
                  <span>Created {formatDate(org.createdAt)}</span>
                  {org.daoId && <Badge variant="outline">DAO linked</Badge>}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
