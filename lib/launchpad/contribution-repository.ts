import 'server-only';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Contribution, ContributionStatus } from './contribution-types';

export interface ContributionRepository {
  listByProject(projectId: string): Promise<Contribution[]>;
  /** Idempotent upsert keyed by txHash; returns true if newly inserted. */
  recordIfNew(input: Omit<Contribution, 'id' | 'status' | 'createdAt'>): Promise<boolean>;
  update(id: string, fn: (c: Contribution) => Contribution): Promise<Contribution>;
  setStatus(id: string, status: ContributionStatus): Promise<Contribution>;
}

const DATA_DIR = path.join(process.cwd(), '.data');
const DATA_FILE = path.join(DATA_DIR, 'contributions.json');

export class JsonContributionRepository implements ContributionRepository {
  private async readAll(): Promise<Contribution[]> {
    try {
      const raw = await fs.readFile(DATA_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as Contribution[]) : [];
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw err;
    }
  }

  private async writeAll(rows: Contribution[]): Promise<void> {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(DATA_FILE, JSON.stringify(rows, null, 2), 'utf8');
  }

  async listByProject(projectId: string): Promise<Contribution[]> {
    const all = await this.readAll();
    return all
      .filter((c) => c.projectId === projectId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async recordIfNew(
    input: Omit<Contribution, 'id' | 'status' | 'createdAt'>
  ): Promise<boolean> {
    const all = await this.readAll();
    if (all.some((c) => c.txHash === input.txHash)) return false;
    all.push({
      id: input.txHash,
      projectId: input.projectId,
      contributor: input.contributor,
      amount: input.amount,
      txHash: input.txHash,
      status: 'confirmed',
      createdAt: new Date().toISOString(),
    });
    await this.writeAll(all);
    return true;
  }

  async update(id: string, fn: (c: Contribution) => Contribution): Promise<Contribution> {
    const all = await this.readAll();
    const idx = all.findIndex((c) => c.id === id);
    if (idx === -1) throw new Error(`Contribution not found: ${id}`);
    const updated = fn(all[idx]);
    all[idx] = updated;
    await this.writeAll(all);
    return updated;
  }

  setStatus(id: string, status: ContributionStatus): Promise<Contribution> {
    return this.update(id, (c) => ({ ...c, status }));
  }
}

export const contributionRepository: ContributionRepository =
  new JsonContributionRepository();
