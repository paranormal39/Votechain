'use client';

import * as React from 'react';
import { UserCheck, UserX, ArrowRight, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { apiFetch } from '@/lib/api/fetch';
import type { Delegation, DelegateProfile } from '@/lib/domain/delegation-types';
import type { Member } from '@/lib/domain/types';

interface DelegationSectionProps {
  orgId: string;
  walletAddress: string;
  members: Member[];
}

export function DelegationSection({ orgId, walletAddress, members }: DelegationSectionProps) {
  const [profile, setProfile] = React.useState<DelegateProfile | null>(null);
  const [activeDelegation, setActiveDelegation] = React.useState<Delegation | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [selectedDelegate, setSelectedDelegate] = React.useState('');

  React.useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [profileData, allDelegations] = await Promise.all([
          apiFetch<DelegateProfile>(`/api/orgs/${orgId}/delegations/profile/${walletAddress}`),
          apiFetch<Delegation[]>(`/api/orgs/${orgId}/delegations`),
        ]);
        setProfile(profileData);
        const myActive = allDelegations.find(
          (d) => d.delegatorAddress === walletAddress && d.active
        ) ?? null;
        setActiveDelegation(myActive);
      } catch {
        /* non-critical */
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [orgId, walletAddress]);

  async function delegate() {
    if (!selectedDelegate) return;
    setBusy(true);
    setError(null);
    try {
      const d = await apiFetch<Delegation>(`/api/orgs/${orgId}/delegations`, {
        method: 'POST',
        body: JSON.stringify({ delegatorAddress: walletAddress, delegateAddress: selectedDelegate }),
      });
      setActiveDelegation(d);
      setSelectedDelegate('');
      const profileData = await apiFetch<DelegateProfile>(
        `/api/orgs/${orgId}/delegations/profile/${walletAddress}`
      );
      setProfile(profileData);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function revoke() {
    setBusy(true);
    setError(null);
    try {
      await apiFetch<Delegation>(`/api/orgs/${orgId}/delegations`, {
        method: 'DELETE',
        body: JSON.stringify({ delegatorAddress: walletAddress }),
      });
      setActiveDelegation(null);
      const profileData = await apiFetch<DelegateProfile>(
        `/api/orgs/${orgId}/delegations/profile/${walletAddress}`
      );
      setProfile(profileData);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const eligibleDelegates = members.filter(
    (m) => m.walletAddress !== walletAddress && (m.role === 'member' || m.role === 'admin')
  );

  if (loading) return null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">Delegation</CardTitle>
            <CardDescription>
              Grant your vote weight to another member for future proposals.
            </CardDescription>
          </div>
          {profile && profile.voteWeight > 1 && (
            <div className="flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs">
              <Shield className="h-3 w-3 text-primary" />
              <span className="font-medium text-primary">×{profile.voteWeight} vote weight</span>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Active outgoing delegation */}
        {activeDelegation ? (
          <div className="flex items-center justify-between rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2.5">
            <div className="flex items-center gap-2 text-sm">
              <ArrowRight className="h-4 w-4 text-amber-400" />
              <span className="text-muted-foreground">Delegating to</span>
              <span className="font-mono text-xs font-medium">
                {activeDelegation.delegateAddress.slice(0, 12)}…
              </span>
              {members.find((m) => m.walletAddress === activeDelegation.delegateAddress)?.displayName && (
                <span className="text-muted-foreground">
                  ({members.find((m) => m.walletAddress === activeDelegation.delegateAddress)?.displayName})
                </span>
              )}
            </div>
            <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={revoke} disabled={busy}>
              <UserX className="h-4 w-4" />
              Revoke
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              No active delegation. Select a member to delegate your vote:
            </p>
            <div className="flex gap-2">
              <select
                className="flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-sm"
                value={selectedDelegate}
                onChange={(e) => setSelectedDelegate(e.target.value)}
                disabled={busy}
              >
                <option value="">— select a member —</option>
                {eligibleDelegates.map((m) => (
                  <option key={m.walletAddress} value={m.walletAddress}>
                    {m.displayName ?? m.walletAddress.slice(0, 16) + '…'} ({m.role})
                  </option>
                ))}
              </select>
              <Button size="sm" onClick={delegate} disabled={busy || !selectedDelegate}>
                <UserCheck className="h-4 w-4" />
                Delegate
              </Button>
            </div>
          </div>
        )}

        {/* Incoming delegations (delegate profile) */}
        {profile && profile.activeDelegations.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">
              {profile.activeDelegations.length} member{profile.activeDelegations.length > 1 ? 's' : ''} delegating to you
            </p>
            <div className="space-y-1">
              {profile.activeDelegations.map((d) => (
                <div key={d.id} className="flex items-center gap-2 rounded-md bg-secondary/20 px-3 py-1.5 text-xs">
                  <Shield className="h-3 w-3 text-primary" />
                  <span className="font-mono">{d.delegatorAddress.slice(0, 14)}…</span>
                  <span className="ml-auto text-muted-foreground">
                    since {new Date(d.createdAt).toLocaleDateString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {error && (
          <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
