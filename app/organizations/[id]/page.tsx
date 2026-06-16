'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, UserPlus, Trash2, Crown, User, Eye, LogIn, Save, ShieldCheck, Globe, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { useWallet, type WalletIdentity } from '@/components/wallet/wallet-provider';
import { ProposalsSection } from '@/components/proposals/proposals-section';
import { DelegationSection } from '@/components/organizations/delegation-section';
import { TreasurySection } from '@/components/organizations/treasury-section';
import { MembershipEditor } from '@/components/organizations/membership-editor';
import { apiFetch } from '@/lib/api/fetch';
import { generateMembershipProof } from '@/lib/proof/client';
import { shortAddress, formatDate, cn } from '@/lib/utils';
import type { ChainName } from '@/lib/agility/types';
import type {
  JoinPolicy,
  MemberRole,
  MembershipRequirement,
  MembershipSettings,
  Organization,
} from '@/lib/domain/types';

const ROLES: MemberRole[] = ['admin', 'member', 'observer'];
const CHAINS: ChainName[] = ['midnight', 'xrpl', 'xahau', 'cardano'];

const roleMeta: Record<MemberRole, { icon: typeof Crown; variant: 'default' | 'secondary' | 'outline' }> = {
  admin: { icon: Crown, variant: 'default' },
  member: { icon: User, variant: 'secondary' },
  observer: { icon: Eye, variant: 'outline' },
};

export default function OrganizationDetailPage() {
  const params = useParams<{ id: string }>();
  const { identity } = useWallet();
  const [org, setOrg] = React.useState<Organization | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  const load = React.useCallback(() => {
    setLoading(true);
    apiFetch<Organization>(`/api/orgs/${params.id}`)
      .then((o) => {
        setOrg(o);
        setError(null);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [params.id]);

  React.useEffect(() => {
    load();
  }, [load]);

  const isAdmin = Boolean(
    org && identity && org.members.some((m) => m.walletAddress === identity.address && m.role === 'admin')
  );
  const isMember = Boolean(
    org && identity && org.members.some((m) => m.walletAddress === identity.address)
  );

  if (loading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!org) return null;

  return (
    <div className="space-y-6">
      <Link
        href="/organizations"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to organizations
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">{org.name}</h1>
            <Badge variant="secondary">{org.chain}</Badge>
          </div>
          <p className="max-w-2xl text-sm text-muted-foreground">
            {org.description || 'No description.'}
          </p>
          <p className="text-xs text-muted-foreground">
            Created {formatDate(org.createdAt)} · {org.daoId ? `DAO ${shortAddress(org.daoId)}` : 'DAO not linked'}
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <MemberList org={org} isAdmin={isAdmin} currentAddress={identity?.address} onChange={setOrg} />
        </div>
        <div className="space-y-6">
          {!identity && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Membership</CardTitle>
                <CardDescription>
                  Connect a wallet to join or manage this organization.
                </CardDescription>
              </CardHeader>
            </Card>
          )}

          {identity && !isMember && (
            <JoinCard org={org} identity={identity} onJoined={setOrg} />
          )}

          {isAdmin && <InviteCard orgId={org.id} onInvited={setOrg} />}
          {isAdmin && <MembershipSettingsCard org={org} onChange={setOrg} />}

          {isMember && !isAdmin && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Membership</CardTitle>
                <CardDescription>
                  You are a member of this organization. Only admins can invite members or change
                  roles.
                </CardDescription>
              </CardHeader>
            </Card>
          )}
        </div>
      </div>

      {isMember && identity && (
        <DelegationSection
          orgId={org.id}
          walletAddress={identity.address}
          members={org.members}
        />
      )}

      {isMember && identity && (
        <TreasurySection
          orgId={org.id}
          isAdmin={isAdmin}
          walletAddress={identity.address}
        />
      )}

      <ProposalsSection orgId={org.id} isAdmin={isAdmin} />
    </div>
  );
}

function MemberList({
  org,
  isAdmin,
  currentAddress,
  onChange,
}: {
  org: Organization;
  isAdmin: boolean;
  currentAddress?: string;
  onChange: (org: Organization) => void;
}) {
  const [busy, setBusy] = React.useState<string | null>(null);

  async function changeRole(wallet: string, role: MemberRole) {
    setBusy(wallet);
    try {
      const updated = await apiFetch<Organization>(
        `/api/orgs/${org.id}/members/${encodeURIComponent(wallet)}`,
        { method: 'PATCH', body: JSON.stringify({ role }) }
      );
      onChange(updated);
    } finally {
      setBusy(null);
    }
  }

  async function remove(wallet: string) {
    setBusy(wallet);
    try {
      const updated = await apiFetch<Organization>(
        `/api/orgs/${org.id}/members/${encodeURIComponent(wallet)}`,
        { method: 'DELETE' }
      );
      onChange(updated);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Members ({org.members.length})</CardTitle>
        <CardDescription>Roles determine governance permissions.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {org.members.map((m) => {
          const Meta = roleMeta[m.role];
          const isSelf = m.walletAddress === currentAddress;
          return (
            <div
              key={m.walletAddress}
              className="flex items-center justify-between rounded-md border border-border bg-secondary/30 px-3 py-2"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm">{shortAddress(m.walletAddress, 8, 6)}</span>
                  {isSelf && <Badge variant="outline">you</Badge>}
                </div>
                <p className="text-xs text-muted-foreground">
                  {m.chain} · joined {formatDate(m.joinedAt)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {isAdmin ? (
                  <select
                    value={m.role}
                    disabled={busy === m.walletAddress}
                    onChange={(e) => changeRole(m.walletAddress, e.target.value as MemberRole)}
                    className="h-8 rounded-md border border-input bg-background px-2 text-xs capitalize"
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                ) : (
                  <Badge variant={Meta.variant} className="gap-1 capitalize">
                    <Meta.icon className="h-3 w-3" /> {m.role}
                  </Badge>
                )}
                {isAdmin && !isSelf && (
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={busy === m.walletAddress}
                    onClick={() => remove(m.walletAddress)}
                    aria-label="Remove member"
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function InviteCard({
  orgId,
  onInvited,
}: {
  orgId: string;
  onInvited: (org: Organization) => void;
}) {
  const [wallet, setWallet] = React.useState('');
  const [chain, setChain] = React.useState<ChainName>('xrpl');
  const [role, setRole] = React.useState<MemberRole>('member');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const updated = await apiFetch<Organization>(`/api/orgs/${orgId}/members`, {
        method: 'POST',
        body: JSON.stringify({ walletAddress: wallet, chain, role }),
      });
      onInvited(updated);
      setWallet('');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Invite member</CardTitle>
        <CardDescription>Add a wallet and assign a governance role.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={invite} className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Wallet address</label>
            <Input
              value={wallet}
              onChange={(e) => setWallet(e.target.value)}
              placeholder="addr_test1… / r…"
              required
              minLength={4}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Chain</label>
              <select
                value={chain}
                onChange={(e) => setChain(e.target.value as ChainName)}
                className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm capitalize"
              >
                {CHAINS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Role</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as MemberRole)}
                className={cn('h-10 w-full rounded-md border border-input bg-background px-2 text-sm capitalize')}
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={busy}>
            <UserPlus className="h-4 w-4" /> {busy ? 'Adding…' : 'Add member'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

const policyMeta: Record<JoinPolicy, { label: string; icon: typeof Lock; description: string }> = {
  invite: { label: 'Invite only', icon: Lock, description: 'Only admins can add members.' },
  open: { label: 'Open', icon: Globe, description: 'Anyone with a wallet can join.' },
  gated: {
    label: 'Token / NFT gated',
    icon: ShieldCheck,
    description: 'Meet the requirements below to join.',
  },
};

function describeRequirement(req: MembershipRequirement): string {
  if (req.label) return req.label;
  switch (req.kind) {
    case 'token':
      return `Hold ≥ ${req.minBalance} ${req.currency} (issuer ${shortAddress(req.issuer)}) on ${req.chain}`;
    case 'nft':
      return `Hold ≥ ${req.minCount} NFT(s) from ${shortAddress(req.issuer)}${
        req.taxon !== undefined ? ` (taxon ${req.taxon})` : ''
      } on ${req.chain}`;
    case 'midnight':
      return req.statement || 'Provide a Midnight holding proof';
  }
}

function JoinCard({
  org,
  identity,
  onJoined,
}: {
  org: Organization;
  identity: WalletIdentity;
  onJoined: (org: Organization) => void;
}) {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [results, setResults] = React.useState<
    { satisfied: boolean; detail: string }[] | null
  >(null);

  const { joinPolicy, requirements } = org.membership;
  const meta = policyMeta[joinPolicy];
  const needsProof = requirements.some((r) => r.kind === 'midnight');

  async function join() {
    setBusy(true);
    setError(null);
    setResults(null);
    try {
      let proofHash: string | undefined;
      if (needsProof) {
        const proof = await generateMembershipProof(org.id, identity.address);
        proofHash = proof.proofHash;
      }
      const updated = await apiFetch<Organization>(`/api/orgs/${org.id}/join`, {
        method: 'POST',
        body: JSON.stringify({
          walletAddress: identity.address,
          chain: identity.chain,
          proofHash,
        }),
      });
      onJoined(updated);
    } catch (err) {
      const e = err as Error & { details?: { satisfied: boolean; detail: string }[] };
      setError(e.message);
      if (Array.isArray(e.details)) setResults(e.details);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <meta.icon className="h-4 w-4" /> Join organization
        </CardTitle>
        <CardDescription>{meta.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {joinPolicy === 'gated' && requirements.length > 0 && (
          <ul className="space-y-1.5">
            {requirements.map((req, i) => {
              const res = results?.[i];
              return (
                <li
                  key={i}
                  className="flex items-start gap-2 rounded-md border border-border bg-secondary/30 px-2.5 py-2 text-xs"
                >
                  <span
                    className={cn(
                      'mt-0.5 h-2 w-2 shrink-0 rounded-full',
                      res ? (res.satisfied ? 'bg-emerald-400' : 'bg-destructive') : 'bg-muted-foreground/40'
                    )}
                  />
                  <span className="min-w-0">
                    <span className="text-foreground">{describeRequirement(req)}</span>
                    {res && <span className="block text-muted-foreground">{res.detail}</span>}
                  </span>
                </li>
              );
            })}
          </ul>
        )}

        <div className="rounded-md border border-border bg-secondary/40 px-3 py-2 text-xs text-muted-foreground">
          Joining as{' '}
          <span className="font-mono text-foreground">{shortAddress(identity.address)}</span> ·{' '}
          {identity.chain}
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Button className="w-full gap-2" onClick={join} disabled={busy}>
          <LogIn className="h-4 w-4" />
          {busy ? 'Joining…' : needsProof ? 'Prove & join' : 'Join'}
        </Button>
      </CardContent>
    </Card>
  );
}

function MembershipSettingsCard({
  org,
  onChange,
}: {
  org: Organization;
  onChange: (org: Organization) => void;
}) {
  const [draft, setDraft] = React.useState<MembershipSettings>(org.membership);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState(false);

  React.useEffect(() => {
    setDraft(org.membership);
  }, [org.membership]);

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const updated = await apiFetch<Organization>(`/api/orgs/${org.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ membership: draft }),
      });
      onChange(updated);
      setSaved(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Membership settings</CardTitle>
        <CardDescription>Control who can join and the on-chain requirements.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <MembershipEditor value={draft} onChange={(next) => { setDraft(next); setSaved(false); }} />
        {error && <p className="text-sm text-destructive">{error}</p>}
        {saved && <p className="text-sm text-emerald-400">Settings saved.</p>}
        <Button className="w-full gap-2" onClick={save} disabled={busy}>
          <Save className="h-4 w-4" /> {busy ? 'Saving…' : 'Save settings'}
        </Button>
      </CardContent>
    </Card>
  );
}
