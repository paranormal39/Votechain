'use client';

import * as React from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, RefreshCw, Copy, ArrowRight, Bot, Lock } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useWallet } from '@/components/wallet/wallet-provider';
import { apiFetch } from '@/lib/api/fetch';
import { formatDate, shortAddress } from '@/lib/utils';
import {
  fundingProgress,
  MIN_MEMBERSHIP_CONTRIBUTION,
  type PublicProject,
} from '@/lib/launchpad/project-types';
import type { Contribution } from '@/lib/launchpad/contribution-types';

interface ContributeInfo {
  chain: string;
  currency: string;
  escrowAddress: string;
  memo: string;
  goalAmount: string;
  raisedAmount: string;
  deadline: string;
}

interface BotTierInfo {
  level: number;
  name: string;
  threshold: number;
  capabilities: string[];
}

interface BotStatus {
  status: string;
  treasuryBalance: string;
  currency: string;
  unlocked: boolean;
  unlockThreshold: number;
  tier: BotTierInfo | null;
  nextTier: BotTierInfo | null;
  tiers: BotTierInfo[];
  guildId: string | null;
  discordConfigured: boolean;
  inviteUrl: string | null;
}

export default function ProjectDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { identity } = useWallet();
  const [project, setProject] = React.useState<PublicProject | null>(null);
  const [contributions, setContributions] = React.useState<Contribution[]>([]);
  const [contributeInfo, setContributeInfo] = React.useState<ContributeInfo | null>(null);
  const [botStatus, setBotStatus] = React.useState<BotStatus | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const load = React.useCallback(async () => {
    try {
      const p = await apiFetch<PublicProject>(`/api/projects/${id}`);
      setProject(p);
      const c = await apiFetch<Contribution[]>(`/api/projects/${id}/contributions`);
      setContributions(c);
      if (p.status === 'funding' || p.status === 'live') {
        setContributeInfo(await apiFetch<ContributeInfo>(`/api/projects/${id}/contribute`));
      } else {
        setContributeInfo(null);
      }
      if (p.status === 'live') {
        setBotStatus(await apiFetch<BotStatus>(`/api/projects/${id}/bot`));
      } else {
        setBotStatus(null);
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }, [id]);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function runAction(action: string) {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/projects/${id}/status`, {
        method: 'POST',
        body: JSON.stringify({ action }),
      });
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (error && !project) return <p className="text-sm text-destructive">{error}</p>;
  if (!project) return <p className="text-sm text-muted-foreground">Loading…</p>;

  const isCreator = identity?.address === project.createdBy;
  const pct = Math.round(fundingProgress(project) * 100);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link
        href="/projects"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to launchpad
      </Link>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle>{project.name}</CardTitle>
            <div className="flex gap-1.5">
              <Badge variant="secondary">{project.chain}</Badge>
              <Badge variant={project.status === 'live' ? 'success' : 'warning'}>
                {project.status}
              </Badge>
            </div>
          </div>
          <CardDescription>{project.description || 'No description.'}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">
                {project.raisedAmount} / {project.goalAmount} {project.currency}
              </span>
              <span className="text-muted-foreground">{pct}% · deadline {formatDate(project.deadline)}</span>
            </div>
            {project.reserveAmount && (
              <p className="text-xs text-muted-foreground">
                Goal includes {project.reserveAmount} {project.currency} on-chain account reserve
                (locked to keep the escrow active; not released to the treasury).
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
            <span>Membership: {project.membership.kind} · {project.membership.name}</span>
            <span>Creator: <span className="font-mono">{shortAddress(project.createdBy)}</span></span>
          </div>

          {project.status === 'live' && project.orgId && (
            <Link href={`/organizations/${project.orgId}`}>
              <Button className="w-full" variant="outline">
                Open governance <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          )}
        </CardContent>
      </Card>

      {botStatus && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Bot className="h-4 w-4" /> Discord Bot
              </CardTitle>
              {botStatus.tier ? (
                <Badge variant="success">Tier {botStatus.tier.level} · {botStatus.tier.name}</Badge>
              ) : (
                <Badge variant="outline">
                  <Lock className="mr-1 h-3 w-3" /> Locked
                </Badge>
              )}
            </div>
            <CardDescription>
              Treasury balance {botStatus.treasuryBalance} {botStatus.currency} · unlocks at{' '}
              {botStatus.unlockThreshold} {botStatus.currency}.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {botStatus.unlocked ? (
              <>
                {botStatus.tier && (
                  <p className="text-xs text-muted-foreground">
                    Available: {botStatus.tier.capabilities.join(' · ')}
                  </p>
                )}
                {botStatus.guildId ? (
                  <p className="text-sm text-muted-foreground">
                    Bot bound to guild <span className="font-mono">{botStatus.guildId}</span>.
                  </p>
                ) : botStatus.inviteUrl ? (
                  <a href={botStatus.inviteUrl} target="_blank" rel="noopener noreferrer">
                    <Button className="w-full">
                      <Bot className="h-4 w-4" /> Invite bot to your server
                    </Button>
                  </a>
                ) : (
                  <p className="text-sm text-destructive">
                    {botStatus.discordConfigured
                      ? 'Unable to build the install link.'
                      : 'Discord bot is not configured on this server (set DISCORD_CLIENT_ID).'}
                  </p>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                {botStatus.nextTier
                  ? `Reach a treasury balance of ${botStatus.nextTier.threshold} ${botStatus.currency} to unlock the bot (Tier ${botStatus.nextTier.level} · ${botStatus.nextTier.name}).`
                  : 'Grow the treasury to unlock the Discord bot.'}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {contributeInfo && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {project.status === 'live' ? 'Donate & join' : 'Contribute'}
            </CardTitle>
            <CardDescription>
              {project.status === 'live'
                ? `This DAO is open — donate ${contributeInfo.currency} to the escrow address below, then press Sync to join as a member.`
                : `Send ${contributeInfo.currency} from your wallet to the escrow address below, then press Sync to record contributions.`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {contributeInfo.escrowAddress && (
              <div className="flex flex-col items-center gap-2">
                <div className="rounded-lg border border-border bg-white p-3">
                  <QRCodeSVG
                    value={contributeInfo.escrowAddress}
                    size={176}
                    level="M"
                    marginSize={0}
                  />
                </div>
                <p className="text-center text-[10px] text-muted-foreground">
                  Scan with your wallet to send {contributeInfo.currency} to the escrow address
                </p>
              </div>
            )}
            <div className="flex items-center gap-2 rounded-md border border-border bg-secondary/40 px-3 py-2">
              <code className="flex-1 break-all text-xs">{contributeInfo.escrowAddress || '— pending escrow —'}</code>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => navigator.clipboard.writeText(contributeInfo.escrowAddress)}
                disabled={!contributeInfo.escrowAddress}
              >
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Memo / reference: {contributeInfo.memo}</p>
            <p className="text-xs text-muted-foreground">
              Donate at least {MIN_MEMBERSHIP_CONTRIBUTION} {contributeInfo.currency} to join as a
              member{project.status === 'live' ? '' : ' when the project activates'}.
            </p>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => runAction('sync')}
              disabled={busy}
            >
              <RefreshCw className="h-4 w-4" /> I&apos;ve sent — Sync now
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Lifecycle controls — creator only. */}
      {isCreator && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Manage</CardTitle>
            <CardDescription>Drive the funding lifecycle for this project.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {project.status === 'draft' && (
              <Button onClick={() => runAction('open')} disabled={busy}>
                Open funding
              </Button>
            )}
            {project.status === 'funding' && (
              <>
                <Button variant="outline" onClick={() => runAction('sync')} disabled={busy}>
                  <RefreshCw className="h-4 w-4" /> Sync contributions
                </Button>
                <Button onClick={() => runAction('activate')} disabled={busy}>
                  Activate (goal met)
                </Button>
                <Button variant="outline" onClick={() => runAction('fail')} disabled={busy}>
                  Mark failed
                </Button>
              </>
            )}
            {project.status === 'activating' && (
              <Button onClick={() => runAction('activate')} disabled={busy}>
                Retry activation
              </Button>
            )}
            {project.status === 'failed' && (
              <Button variant="outline" onClick={() => runAction('refund')} disabled={busy}>
                Refund contributors
              </Button>
            )}
            {project.status === 'activating' && (
              <p className="w-full text-xs text-muted-foreground">
                Activation started but didn&apos;t finish. Retry to create the organization and go
                live (on-chain escrow release/mint is best-effort).
              </p>
            )}
            {error && <p className="w-full text-sm text-destructive">{error}</p>}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Contributions ({contributions.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {contributions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No contributions recorded yet.</p>
          ) : (
            <ul className="divide-y divide-border text-sm">
              {contributions.map((c) => (
                <li key={c.id} className="flex items-center justify-between py-2">
                  <span className="font-mono text-xs">{shortAddress(c.contributor)}</span>
                  <span>{c.amount} {project.currency}</span>
                  <Badge variant="outline">{c.status}</Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
