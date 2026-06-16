import 'server-only';
import { randomUUID } from 'crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import type {
  TreasuryAccount,
  TreasuryTx,
  SpendRequest,
  DepositInput,
  CreateSpendRequestInput,
} from './treasury-types';

const DATA_DIR = join(process.cwd(), '.data');
const DATA_FILE = join(DATA_DIR, 'treasury.json');

function readAll(): TreasuryAccount[] {
  try {
    return JSON.parse(readFileSync(DATA_FILE, 'utf-8')) as TreasuryAccount[];
  } catch {
    return [];
  }
}

function writeAll(accounts: TreasuryAccount[]): void {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(DATA_FILE, JSON.stringify(accounts, null, 2));
}

export class TreasuryNotFoundError extends Error {
  constructor(orgId: string) {
    super(`Treasury for org "${orgId}" not found`);
    this.name = 'TreasuryNotFoundError';
  }
}

export class SpendRequestNotFoundError extends Error {
  constructor(id: string) {
    super(`Spend request "${id}" not found`);
    this.name = 'SpendRequestNotFoundError';
  }
}

export class TreasuryStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TreasuryStateError';
  }
}

export interface TreasuryRepository {
  getOrCreate(orgId: string, currency?: string): Promise<TreasuryAccount>;
  get(orgId: string): Promise<TreasuryAccount | null>;
  deposit(orgId: string, input: DepositInput): Promise<TreasuryAccount>;
  createSpendRequest(orgId: string, input: CreateSpendRequestInput): Promise<SpendRequest>;
  updateSpendRequest(orgId: string, spendId: string, fn: (s: SpendRequest) => SpendRequest): Promise<SpendRequest>;
  getSpendRequest(orgId: string, spendId: string): Promise<SpendRequest | null>;
  appendTx(orgId: string, tx: Omit<TreasuryTx, 'id' | 'createdAt'>): Promise<TreasuryAccount>;
}

function addDecimal(a: string, b: string): string {
  return (parseFloat(a) + parseFloat(b)).toFixed(6).replace(/\.?0+$/, '');
}

function subDecimal(a: string, b: string): string {
  const result = parseFloat(a) - parseFloat(b);
  if (result < 0) throw new TreasuryStateError('Insufficient treasury balance');
  return result.toFixed(6).replace(/\.?0+$/, '');
}

class JsonTreasuryRepository implements TreasuryRepository {
  private update(orgId: string, fn: (a: TreasuryAccount) => TreasuryAccount): TreasuryAccount {
    const all = readAll();
    const idx = all.findIndex((a) => a.orgId === orgId);
    if (idx === -1) throw new TreasuryNotFoundError(orgId);
    const updated = fn(all[idx]);
    all[idx] = updated;
    writeAll(all);
    return updated;
  }

  async getOrCreate(orgId: string, currency = 'USD'): Promise<TreasuryAccount> {
    const all = readAll();
    const existing = all.find((a) => a.orgId === orgId);
    if (existing) return existing;
    const now = new Date().toISOString();
    const account: TreasuryAccount = {
      orgId,
      balance: '0',
      currency,
      privacyMode: 'public',
      ledger: [],
      spendRequests: [],
      createdAt: now,
      updatedAt: now,
    };
    writeAll([...all, account]);
    return account;
  }

  async get(orgId: string): Promise<TreasuryAccount | null> {
    return readAll().find((a) => a.orgId === orgId) ?? null;
  }

  async deposit(orgId: string, input: DepositInput): Promise<TreasuryAccount> {
    await this.getOrCreate(orgId, input.currency);
    return this.update(orgId, (a) => {
      const tx: TreasuryTx = {
        id: randomUUID(),
        kind: 'deposit',
        amount: input.amount,
        currency: input.currency ?? a.currency,
        initiatorAddress: input.initiatorAddress,
        memo: input.memo,
        txHash: input.txHash,
        createdAt: new Date().toISOString(),
      };
      return {
        ...a,
        balance: addDecimal(a.balance, input.amount),
        ledger: [...a.ledger, tx],
        updatedAt: new Date().toISOString(),
      };
    });
  }

  async createSpendRequest(orgId: string, input: CreateSpendRequestInput): Promise<SpendRequest> {
    await this.getOrCreate(orgId, input.currency);
    const now = new Date().toISOString();
    const spendRequest: SpendRequest = {
      id: randomUUID(),
      orgId,
      amount: input.amount,
      currency: input.currency ?? 'USD',
      recipientAddress: input.recipientAddress,
      purpose: input.purpose,
      privacyMode: input.privacyMode ?? 'public',
      status: 'pending',
      proposalId: input.proposalId,
      requestedBy: input.requestedBy,
      createdAt: now,
      updatedAt: now,
    };
    this.update(orgId, (a) => ({
      ...a,
      spendRequests: [...a.spendRequests, spendRequest],
      updatedAt: new Date().toISOString(),
    }));
    return spendRequest;
  }

  async updateSpendRequest(
    orgId: string,
    spendId: string,
    fn: (s: SpendRequest) => SpendRequest
  ): Promise<SpendRequest> {
    let updated: SpendRequest | undefined;
    this.update(orgId, (a) => {
      const idx = a.spendRequests.findIndex((s) => s.id === spendId);
      if (idx === -1) throw new SpendRequestNotFoundError(spendId);
      const newReq = fn(a.spendRequests[idx]);
      updated = newReq;
      const newRequests = [...a.spendRequests];
      newRequests[idx] = newReq;
      return { ...a, spendRequests: newRequests, updatedAt: new Date().toISOString() };
    });
    return updated!;
  }

  async getSpendRequest(orgId: string, spendId: string): Promise<SpendRequest | null> {
    const account = await this.get(orgId);
    return account?.spendRequests.find((s) => s.id === spendId) ?? null;
  }

  async appendTx(orgId: string, tx: Omit<TreasuryTx, 'id' | 'createdAt'>): Promise<TreasuryAccount> {
    return this.update(orgId, (a) => {
      const full: TreasuryTx = { ...tx, id: randomUUID(), createdAt: new Date().toISOString() };
      const newBalance =
        tx.kind === 'spend' ? subDecimal(a.balance, tx.amount) : addDecimal(a.balance, tx.amount);
      return { ...a, balance: newBalance, ledger: [...a.ledger, full], updatedAt: new Date().toISOString() };
    });
  }
}

export const treasuryRepository: TreasuryRepository = new JsonTreasuryRepository();
