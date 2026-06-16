'use client';

import * as React from 'react';
import { ThumbsUp, ThumbsDown, Minus, ShieldCheck, Wifi, WifiOff, Settings, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { apiFetch } from '@/lib/api/fetch';
import {
  checkProofServer,
  generateVoteProof,
  getProofServerUrl,
  setProofServerUrl,
  type ProofServerStatus,
} from '@/lib/proof/client';
import type { Proposal } from '@/lib/domain/proposal-types';

type PublicChoice = 'yes' | 'no' | 'abstain';

interface VotingSectionProps {
  proposal: Proposal;
  walletAddress: string;
  onChange: (p: Proposal) => void;
}

export function VotingSection({ proposal, walletAddress, onChange }: VotingSectionProps) {
  const [proofStatus, setProofStatus] = React.useState<ProofServerStatus | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [receipt, setReceipt] = React.useState<string | null>(null);
  const [showUrlEdit, setShowUrlEdit] = React.useState(false);
  const [urlInput, setUrlInput] = React.useState(getProofServerUrl());
  /** Private vote choice — stays in browser state only, never sent over the network. */
  const [privateChoice, setPrivateChoice] = React.useState<PublicChoice | null>(null);

  const hasVoted = proposal.votes.some((v) => v.walletAddress === walletAddress);

  React.useEffect(() => {
    checkProofServer().then(setProofStatus);
  }, []);

  async function castPublicVote(choice: PublicChoice) {
    setBusy(true);
    setError(null);
    setReceipt(null);
    try {
      const updated = await apiFetch<Proposal>(`/api/proposals/${proposal.id}/vote`, {
        method: 'POST',
        body: JSON.stringify({ walletAddress, choice }),
      });
      onChange(updated);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function castPrivateVote() {
    if (!privateChoice) return;
    setBusy(true);
    setError(null);
    setReceipt(null);
    try {
      // Choice is passed to proof generation locally — it is committed into the ZK proof
      // and NEVER serialised into the network request (only proofHash travels to the BFF).
      const { proofHash, simulated } = await generateVoteProof(
        proposal.agilityProposalId ?? proposal.id,
        walletAddress,
        privateChoice
      );

      const updated = await apiFetch<Proposal>(`/api/proposals/${proposal.id}/vote`, {
        method: 'POST',
        body: JSON.stringify({ walletAddress, proofHash }),
      });
      onChange(updated);
      setPrivateChoice(null);
      setReceipt(
        simulated
          ? `Simulated proof: ${proofHash}`
          : `ZK proof submitted: ${proofHash}`
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function saveUrl() {
    setProofServerUrl(urlInput);
    setShowUrlEdit(false);
    checkProofServer().then(setProofStatus);
  }

  if (proposal.status !== 'active') return null;

  const proofServerReady = proofStatus?.online === true;
  const proofServerChecked = proofStatus !== null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">Cast your vote</CardTitle>
            <CardDescription>
              {hasVoted
                ? 'You have already voted on this proposal.'
                : 'Your vote is final and cannot be changed.'}
            </CardDescription>
          </div>
          <ProofServerBadge status={proofStatus} onConfigure={() => setShowUrlEdit((v) => !v)} />
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Proof server URL editor */}
        {showUrlEdit && (
          <div className="space-y-2 rounded-md border border-border bg-secondary/30 p-3">
            <p className="text-xs text-muted-foreground">
              Point to your Midnight proof server. Private votes are generated locally against this URL — your choice never leaves your browser.
            </p>
            <div className="flex gap-2">
              <input
                className="flex-1 rounded border border-border bg-background px-2 py-1 text-sm font-mono"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="http://localhost:6300"
              />
              <Button size="sm" onClick={saveUrl}>Save</Button>
            </div>
          </div>
        )}

        {/* Proof server offline notice (shown once checked, not while loading) */}
        {proofServerChecked && !proofServerReady && !showUrlEdit && (
          <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2.5">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
            <div className="space-y-1 text-xs">
              <p className="font-medium text-amber-300">Proof server offline</p>
              <p className="text-muted-foreground">
                Private votes will use a simulated proof hash. To use real ZK proofs,{' '}
                <button
                  className="underline hover:text-foreground"
                  onClick={() => setShowUrlEdit(true)}
                >
                  configure your proof server
                </button>
                .
              </p>
            </div>
          </div>
        )}

        {!hasVoted && (
          <>
            {/* Public vote buttons */}
            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground">Public vote</p>
              <div className="grid grid-cols-3 gap-2">
                <Button
                  variant="outline"
                  className="border-emerald-600/40 text-emerald-400 hover:bg-emerald-600/10"
                  onClick={() => castPublicVote('yes')}
                  disabled={busy}
                >
                  <ThumbsUp className="h-4 w-4" /> Yes
                </Button>
                <Button
                  variant="outline"
                  className="border-destructive/40 text-destructive hover:bg-destructive/10"
                  onClick={() => castPublicVote('no')}
                  disabled={busy}
                >
                  <ThumbsDown className="h-4 w-4" /> No
                </Button>
                <Button
                  variant="outline"
                  className="text-muted-foreground hover:bg-secondary"
                  onClick={() => castPublicVote('abstain')}
                  disabled={busy}
                >
                  <Minus className="h-4 w-4" /> Abstain
                </Button>
              </div>
            </div>

            <div className="relative flex items-center gap-2">
              <div className="flex-1 border-t border-border" />
              <span className="text-xs text-muted-foreground">or vote privately</span>
              <div className="flex-1 border-t border-border" />
            </div>

            {/* Private vote — choice picker + submit */}
            <div className="space-y-2 rounded-md border border-border bg-secondary/20 p-3">
              <p className="text-xs font-medium text-muted-foreground">
                Private vote{' '}
                <span className="ml-1 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-primary">
                  ZK proof
                </span>
              </p>
              <p className="text-xs text-muted-foreground">
                Select your choice. It will be committed into a ZK proof locally — only the opaque proof hash is submitted.
              </p>
              <div className="grid grid-cols-3 gap-2">
                {(['yes', 'no', 'abstain'] as const).map((c) => (
                  <button
                    key={c}
                    onClick={() => setPrivateChoice(privateChoice === c ? null : c)}
                    disabled={busy}
                    className={`rounded-md border px-2 py-1.5 text-sm capitalize transition-colors disabled:opacity-50 ${
                      privateChoice === c
                        ? 'border-primary bg-primary/15 text-primary'
                        : 'border-border text-muted-foreground hover:border-primary/40 hover:text-foreground'
                    }`}
                  >
                    {c === 'yes' ? '👍' : c === 'no' ? '👎' : '—'} {c}
                  </button>
                ))}
              </div>
              <Button
                variant="secondary"
                className="w-full gap-2"
                onClick={castPrivateVote}
                disabled={busy || privateChoice === null}
              >
                <ShieldCheck className="h-4 w-4" />
                {privateChoice === null
                  ? 'Select a choice above'
                  : proofServerReady
                    ? `Cast private ZK vote (${privateChoice})`
                    : `Cast private vote — simulated (${privateChoice})`}
              </Button>
            </div>
          </>
        )}

        {busy && <p className="text-sm text-muted-foreground">Generating proof and submitting…</p>}
        {error && (
          <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}
        {receipt && (
          <div className="rounded-md border border-emerald-600/20 bg-emerald-600/10 px-3 py-2">
            <p className="text-xs font-medium text-emerald-400">Vote recorded</p>
            <p className="mt-1 break-all font-mono text-xs text-muted-foreground">{receipt}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ProofServerBadge({
  status,
  onConfigure,
}: {
  status: ProofServerStatus | null;
  onConfigure: () => void;
}) {
  return (
    <button
      onClick={onConfigure}
      className="flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs transition-colors hover:bg-secondary"
      title="Configure proof server"
    >
      {status === null ? (
        <span className="h-2 w-2 rounded-full bg-muted-foreground/40 animate-pulse" />
      ) : status.online ? (
        <Wifi className="h-3 w-3 text-emerald-400" />
      ) : (
        <WifiOff className="h-3 w-3 text-amber-400" />
      )}
      <span className={status?.online ? 'text-emerald-400' : status === null ? 'text-muted-foreground' : 'text-amber-400'}>
        {status === null
          ? 'Checking…'
          : status.online
            ? `Proof server v${status.version ?? '?'}`
            : 'Proof server offline'}
      </span>
      <Settings className="h-3 w-3 text-muted-foreground" />
    </button>
  );
}
