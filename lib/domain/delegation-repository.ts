import 'server-only';
import { randomUUID } from 'crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import type { Delegation, DelegateInput } from './delegation-types';

const DATA_DIR = join(process.cwd(), '.data');
const DATA_FILE = join(DATA_DIR, 'delegations.json');

function readAll(): Delegation[] {
  try {
    return JSON.parse(readFileSync(DATA_FILE, 'utf-8')) as Delegation[];
  } catch {
    return [];
  }
}

function writeAll(delegations: Delegation[]): void {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(DATA_FILE, JSON.stringify(delegations, null, 2));
}

export class DelegationNotFoundError extends Error {
  constructor(id: string) {
    super(`Delegation "${id}" not found`);
    this.name = 'DelegationNotFoundError';
  }
}

export class DuplicateDelegationError extends Error {
  constructor(delegatorAddress: string) {
    super(`${delegatorAddress} already has an active delegation in this org`);
    this.name = 'DuplicateDelegationError';
  }
}

export class SelfDelegationError extends Error {
  constructor() {
    super('A member cannot delegate to themselves');
    this.name = 'SelfDelegationError';
  }
}

export interface DelegationRepository {
  listByOrg(orgId: string): Promise<Delegation[]>;
  listActiveByOrg(orgId: string): Promise<Delegation[]>;
  listActiveDelegationsTo(orgId: string, delegateAddress: string): Promise<Delegation[]>;
  getActiveDelegationFrom(orgId: string, delegatorAddress: string): Promise<Delegation | null>;
  create(orgId: string, input: DelegateInput): Promise<Delegation>;
  revoke(orgId: string, delegatorAddress: string): Promise<Delegation>;
}

class JsonDelegationRepository implements DelegationRepository {
  async listByOrg(orgId: string): Promise<Delegation[]> {
    return readAll().filter((d) => d.orgId === orgId);
  }

  async listActiveByOrg(orgId: string): Promise<Delegation[]> {
    return readAll().filter((d) => d.orgId === orgId && d.active);
  }

  async listActiveDelegationsTo(orgId: string, delegateAddress: string): Promise<Delegation[]> {
    return readAll().filter(
      (d) => d.orgId === orgId && d.active && d.delegateAddress === delegateAddress
    );
  }

  async getActiveDelegationFrom(orgId: string, delegatorAddress: string): Promise<Delegation | null> {
    return (
      readAll().find(
        (d) => d.orgId === orgId && d.active && d.delegatorAddress === delegatorAddress
      ) ?? null
    );
  }

  async create(orgId: string, input: DelegateInput): Promise<Delegation> {
    if (input.delegatorAddress === input.delegateAddress) {
      throw new SelfDelegationError();
    }

    const all = readAll();

    const existing = all.find(
      (d) => d.orgId === orgId && d.active && d.delegatorAddress === input.delegatorAddress
    );
    if (existing) {
      throw new DuplicateDelegationError(input.delegatorAddress);
    }

    const delegation: Delegation = {
      id: randomUUID(),
      orgId,
      delegatorAddress: input.delegatorAddress,
      delegateAddress: input.delegateAddress,
      createdAt: new Date().toISOString(),
      active: true,
    };

    writeAll([...all, delegation]);
    return delegation;
  }

  async revoke(orgId: string, delegatorAddress: string): Promise<Delegation> {
    const all = readAll();
    const idx = all.findIndex(
      (d) => d.orgId === orgId && d.active && d.delegatorAddress === delegatorAddress
    );
    if (idx === -1) {
      throw new DelegationNotFoundError(`active delegation from ${delegatorAddress} in ${orgId}`);
    }

    const updated = {
      ...all[idx],
      active: false,
      revokedAt: new Date().toISOString(),
    };
    all[idx] = updated;
    writeAll(all);
    return updated;
  }
}

export const delegationRepository: DelegationRepository = new JsonDelegationRepository();
