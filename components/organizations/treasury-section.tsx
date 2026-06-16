'use client';

import * as React from 'react';
import { Landmark, ArrowDownCircle, ArrowUpCircle, Clock, CheckCircle2, XCircle, Lock, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { apiFetch } from '@/lib/api/fetch';
import type { TreasuryAccount, SpendRequest, PrivacyMode } from '@/lib/domain/treasury-types';
import { formatDate } from '@/lib/utils';

interface TreasurySectionProps {
  orgId: string;
  isAdmin: boolean;
  walletAddress: string;
}

const privacyMeta: Record<PrivacyMode, { label: string; icon: typeof Eye; color: string }> = {
  public:  { label: 'Public',  icon: Eye,  color: 'text-muted-foreground' },
  hybrid:  { label: 'Hybrid',  icon: Eye,  color: 'text-amber-400' },
  private: { label: 'Private', icon: Lock, color: 'text-primary' },
};

const statusMeta: Record<SpendRequest['status'], { icon: typeof Clock; color: string }> = {
  pending:   { icon: Clock,          color: 'text-muted-foreground' },
  approved:  { icon: CheckCircle2,   color: 'text-amber-400' },
  rejected:  { icon: XCircle,        color: 'text-destructive' },
  executed:  { icon: CheckCircle2,   color: 'text-emerald-400' },
  cancelled: { icon: XCircle,        color: 'text-muted-foreground' },
};

export function TreasurySection({ orgId, isAdmin, walletAddress }: TreasurySectionProps) {
  const [account, setAccount] = React.useState<TreasuryAccount | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  // Deposit form
  const [depositAmount, setDepositAmount] = React.useState('');
  const [depositMemo, setDepositMemo] = React.useState('');
  const [showDeposit, setShowDeposit] = React.useState(false);

  // Spend request form
  const [showSpend, setShowSpend] = React.useState(false);
  const [spendAmount, setSpendAmount] = React.useState('');
  const [spendRecipient, setSpendRecipient] = React.useState('');
  const [spendPurpose, setSpendPurpose] = React.useState('');
  const [spendPrivacy, setSpendPrivacy] = React.useState<PrivacyMode>('public');

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<TreasuryAccount>(`/api/orgs/${orgId}/treasury`);
      setAccount(data);
    } catch {
      /* treasury may not exist yet */
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  React.useEffect(() => { void load(); }, [load]);

  async function handleDeposit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const data = await apiFetch<TreasuryAccount>(`/api/orgs/${orgId}/treasury`, {
        method: 'POST',
        body: JSON.stringify({ amount: depositAmount, initiatorAddress: walletAddress, memo: depositMemo }),
      });
      setAccount(data);
      setDepositAmount('');
      setDepositMemo('');
      setShowDeposit(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleSpendRequest(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiFetch<SpendRequest>(`/api/orgs/${orgId}/treasury/spend`, {
        method: 'POST',
        body: JSON.stringify({
          amount: spendAmount,
          recipientAddress: spendRecipient,
          purpose: spendPurpose,
          privacyMode: spendPrivacy,
          requestedBy: walletAddress,
        }),
      });
      setSpendAmount('');
      setSpendRecipient('');
      setSpendPurpose('');
      setShowSpend(false);
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function cancelSpend(spendRequestId: string) {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/orgs/${orgId}/treasury/spend?spendRequestId=${encodeURIComponent(spendRequestId)}`, {
        method: 'DELETE',
      });
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return null;

  const pendingSpends = account?.spendRequests.filter((s) => s.status === 'pending' || s.status === 'approved') ?? [];
  const completedSpends = account?.spendRequests.filter((s) => s.status === 'executed' || s.status === 'cancelled' || s.status === 'rejected') ?? [];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Landmark className="h-4 w-4 text-primary" />
              Treasury
            </CardTitle>
            <CardDescription>Org funds with governance-gated spending.</CardDescription>
          </div>
          {account && (
            <div className="text-right">
              <div className="text-2xl font-bold">
                {account.balance} <span className="text-base font-normal text-muted-foreground">{account.currency}</span>
              </div>
              {(() => {
                const pm = privacyMeta[account.privacyMode];
                const Icon = pm.icon;
                return (
                  <div className={`flex items-center justify-end gap-1 text-xs ${pm.color}`}>
                    <Icon className="h-3 w-3" /> {pm.label}
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isAdmin && (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => setShowDeposit((v) => !v)}>
              <ArrowDownCircle className="h-4 w-4 text-emerald-400" />
              Record Deposit
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowSpend((v) => !v)}>
              <ArrowUpCircle className="h-4 w-4 text-amber-400" />
              Request Spend
            </Button>
          </div>
        )}

        {showDeposit && isAdmin && (
          <form onSubmit={handleDeposit} className="space-y-2 rounded-md border border-border bg-secondary/10 p-3">
            <p className="text-xs font-medium">Record a deposit</p>
            <input
              type="text"
              placeholder="Amount (e.g. 500)"
              value={depositAmount}
              onChange={(e) => setDepositAmount(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
              required
            />
            <input
              type="text"
              placeholder="Memo (optional)"
              value={depositMemo}
              onChange={(e) => setDepositMemo(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
            />
            <div className="flex gap-2">
              <Button size="sm" type="submit" disabled={busy}>Confirm deposit</Button>
              <Button size="sm" variant="ghost" type="button" onClick={() => setShowDeposit(false)}>Cancel</Button>
            </div>
          </form>
        )}

        {showSpend && isAdmin && (
          <form onSubmit={handleSpendRequest} className="space-y-2 rounded-md border border-border bg-secondary/10 p-3">
            <p className="text-xs font-medium">Create spend request</p>
            <p className="text-xs text-muted-foreground">
              A treasury proposal must be created and pass before the spend can be executed.
            </p>
            <input
              type="text"
              placeholder="Amount"
              value={spendAmount}
              onChange={(e) => setSpendAmount(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
              required
            />
            <input
              type="text"
              placeholder="Recipient wallet address"
              value={spendRecipient}
              onChange={(e) => setSpendRecipient(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
              required
            />
            <input
              type="text"
              placeholder="Purpose (e.g. Infrastructure costs Q3)"
              value={spendPurpose}
              onChange={(e) => setSpendPurpose(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
              required
            />
            <div className="flex items-center gap-2">
              <label className="text-xs text-muted-foreground">Privacy:</label>
              <select
                value={spendPrivacy}
                onChange={(e) => setSpendPrivacy(e.target.value as PrivacyMode)}
                className="rounded-md border border-border bg-background px-2 py-1 text-xs"
              >
                <option value="public">Public — amount visible on-chain</option>
                <option value="hybrid">Hybrid — amount hidden, result public</option>
                <option value="private">Private — amount + proposer hidden (ZK Phase)</option>
              </select>
            </div>
            <div className="flex gap-2">
              <Button size="sm" type="submit" disabled={busy}>Submit request</Button>
              <Button size="sm" variant="ghost" type="button" onClick={() => setShowSpend(false)}>Cancel</Button>
            </div>
          </form>
        )}

        {/* Pending/approved spend requests */}
        {pendingSpends.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Pending spend requests</p>
            {pendingSpends.map((s) => {
              const meta = statusMeta[s.status];
              const Icon = meta.icon;
              return (
                <div key={s.id} className="rounded-md border border-border bg-secondary/20 p-3 space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-1.5 text-sm font-medium">
                        <ArrowUpCircle className="h-3.5 w-3.5 text-amber-400" />
                        {s.amount} {s.currency}
                      </div>
                      <p className="text-xs text-muted-foreground">{s.purpose}</p>
                      <p className="font-mono text-xs text-muted-foreground">{s.recipientAddress.slice(0, 20)}…</p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <div className={`flex items-center gap-1 text-xs ${meta.color}`}>
                        <Icon className="h-3 w-3" /> {s.status}
                      </div>
                      {s.proposalId ? (
                        <Badge variant="outline" className="text-[10px]">linked proposal</Badge>
                      ) : (
                        <Badge variant="secondary" className="text-[10px]">needs proposal</Badge>
                      )}
                    </div>
                  </div>
                  {isAdmin && s.status === 'pending' && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive h-7 text-xs"
                      onClick={() => cancelSpend(s.id)}
                      disabled={busy}
                    >
                      Cancel request
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Ledger history */}
        {account && account.ledger.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">Recent transactions</p>
            <div className="max-h-48 overflow-y-auto space-y-1">
              {[...account.ledger].reverse().slice(0, 10).map((tx) => (
                <div key={tx.id} className="flex items-center justify-between rounded-md bg-secondary/10 px-3 py-1.5 text-xs">
                  <div className="flex items-center gap-2">
                    {tx.kind === 'deposit'
                      ? <ArrowDownCircle className="h-3.5 w-3.5 text-emerald-400" />
                      : <ArrowUpCircle className="h-3.5 w-3.5 text-amber-400" />
                    }
                    <span className="text-muted-foreground capitalize">{tx.kind}</span>
                    {tx.memo && <span className="text-muted-foreground">— {tx.memo}</span>}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`font-medium ${tx.kind === 'deposit' ? 'text-emerald-400' : 'text-amber-400'}`}>
                      {tx.kind === 'deposit' ? '+' : '-'}{tx.amount} {tx.currency}
                    </span>
                    <span className="text-muted-foreground">{formatDate(tx.createdAt)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {!account && !loading && (
          <p className="text-xs text-muted-foreground">
            No treasury yet. {isAdmin ? 'Record a deposit to initialise.' : 'An admin can set up the treasury.'}
          </p>
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
