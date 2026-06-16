'use client';

import * as React from 'react';
import { Coins, Gem, Globe, Lock, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { ChainName } from '@/lib/agility/types';
import type {
  JoinPolicy,
  MembershipRequirement,
  MembershipSettings,
  RequirementKind,
} from '@/lib/domain/types';

const XRPL_CHAINS: ChainName[] = ['xrpl', 'xahau'];

const policyOptions: {
  value: JoinPolicy;
  label: string;
  description: string;
  icon: typeof Lock;
}[] = [
  {
    value: 'invite',
    label: 'Invite only',
    description: 'Admins add members manually.',
    icon: Lock,
  },
  {
    value: 'open',
    label: 'Open',
    description: 'Anyone with a wallet can join.',
    icon: Globe,
  },
  {
    value: 'gated',
    label: 'Token / NFT gated',
    description: 'Anyone meeting the requirements can join.',
    icon: ShieldCheck,
  },
];

function newRequirement(kind: RequirementKind): MembershipRequirement {
  switch (kind) {
    case 'token':
      return { kind: 'token', chain: 'xrpl', issuer: '', currency: '', minBalance: '1' };
    case 'nft':
      return { kind: 'nft', chain: 'xrpl', issuer: '', minCount: 1 };
    case 'midnight':
      return { kind: 'midnight', chain: 'midnight' };
  }
}

export function MembershipEditor({
  value,
  onChange,
}: {
  value: MembershipSettings;
  onChange: (next: MembershipSettings) => void;
}) {
  function setPolicy(joinPolicy: JoinPolicy) {
    onChange({ ...value, joinPolicy });
  }

  function addRequirement(kind: RequirementKind) {
    onChange({ ...value, requirements: [...value.requirements, newRequirement(kind)] });
  }

  function updateRequirement(index: number, next: MembershipRequirement) {
    onChange({
      ...value,
      requirements: value.requirements.map((r, i) => (i === index ? next : r)),
    });
  }

  function removeRequirement(index: number) {
    onChange({ ...value, requirements: value.requirements.filter((_, i) => i !== index) });
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-3">
        {policyOptions.map((opt) => {
          const active = value.joinPolicy === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => setPolicy(opt.value)}
              className={cn(
                'flex flex-col gap-1 rounded-md border p-3 text-left transition-colors',
                active
                  ? 'border-primary bg-primary/10'
                  : 'border-border bg-secondary/30 hover:bg-secondary/60'
              )}
            >
              <span className="flex items-center gap-2 text-sm font-medium">
                <opt.icon className="h-4 w-4" /> {opt.label}
              </span>
              <span className="text-xs text-muted-foreground">{opt.description}</span>
            </button>
          );
        })}
      </div>

      {value.joinPolicy === 'gated' && (
        <div className="space-y-3 rounded-md border border-border bg-secondary/20 p-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground">
              Requirements (all must be met)
            </p>
            <div className="flex gap-1">
              <AddButton icon={Coins} label="Token" onClick={() => addRequirement('token')} />
              <AddButton icon={Gem} label="NFT" onClick={() => addRequirement('nft')} />
              <AddButton
                icon={ShieldCheck}
                label="Midnight"
                onClick={() => addRequirement('midnight')}
              />
            </div>
          </div>

          {value.requirements.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No requirements yet — add a token, NFT, or Midnight proof requirement.
            </p>
          ) : (
            value.requirements.map((req, i) => (
              <RequirementRow
                key={i}
                requirement={req}
                onChange={(next) => updateRequirement(i, next)}
                onRemove={() => removeRequirement(i)}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

function AddButton({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof Coins;
  label: string;
  onClick: () => void;
}) {
  return (
    <Button type="button" variant="outline" size="sm" className="h-7 gap-1 px-2" onClick={onClick}>
      <Plus className="h-3 w-3" />
      <Icon className="h-3 w-3" /> {label}
    </Button>
  );
}

const fieldClass =
  'h-9 w-full rounded-md border border-input bg-background px-2 text-sm capitalize';

function RequirementRow({
  requirement,
  onChange,
  onRemove,
}: {
  requirement: MembershipRequirement;
  onChange: (next: MembershipRequirement) => void;
  onRemove: () => void;
}) {
  const kindLabel = { token: 'Token', nft: 'NFT', midnight: 'Midnight proof' }[requirement.kind];

  return (
    <div className="space-y-2 rounded-md border border-border bg-background/60 p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {kindLabel}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={onRemove}
          aria-label="Remove requirement"
        >
          <Trash2 className="h-3.5 w-3.5 text-destructive" />
        </Button>
      </div>

      {requirement.kind === 'token' && (
        <div className="grid gap-2 sm:grid-cols-2">
          <select
            value={requirement.chain}
            onChange={(e) => onChange({ ...requirement, chain: e.target.value as ChainName })}
            className={fieldClass}
          >
            {XRPL_CHAINS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <Input
            value={requirement.minBalance}
            onChange={(e) => onChange({ ...requirement, minBalance: e.target.value })}
            placeholder="Min balance (e.g. 100)"
            inputMode="decimal"
          />
          <Input
            value={requirement.currency}
            onChange={(e) => onChange({ ...requirement, currency: e.target.value })}
            placeholder="Currency code (e.g. USD)"
          />
          <Input
            value={requirement.issuer}
            onChange={(e) => onChange({ ...requirement, issuer: e.target.value })}
            placeholder="Issuer address (r…)"
          />
        </div>
      )}

      {requirement.kind === 'nft' && (
        <div className="grid gap-2 sm:grid-cols-2">
          <select
            value={requirement.chain}
            onChange={(e) => onChange({ ...requirement, chain: e.target.value as ChainName })}
            className={fieldClass}
          >
            {XRPL_CHAINS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <Input
            type="number"
            min={1}
            value={requirement.minCount}
            onChange={(e) =>
              onChange({ ...requirement, minCount: Number.parseInt(e.target.value, 10) || 1 })
            }
            placeholder="Min count"
          />
          <Input
            value={requirement.issuer}
            onChange={(e) => onChange({ ...requirement, issuer: e.target.value })}
            placeholder="NFT issuer address (r…)"
          />
          <Input
            type="number"
            min={0}
            value={requirement.taxon ?? ''}
            onChange={(e) =>
              onChange({
                ...requirement,
                taxon: e.target.value === '' ? undefined : Number.parseInt(e.target.value, 10),
              })
            }
            placeholder="Taxon (optional)"
          />
        </div>
      )}

      {requirement.kind === 'midnight' && (
        <Input
          value={requirement.statement ?? ''}
          onChange={(e) => onChange({ ...requirement, statement: e.target.value })}
          placeholder="What the holder must prove (e.g. holds ≥ 1 governance token)"
        />
      )}
    </div>
  );
}
