import 'server-only';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type {
  AddCommentInput,
  CastPrivateVoteInput,
  CastPublicVoteInput,
  CreateProposalInput,
  Proposal,
  ProposalComment,
  VoteCast,
} from './proposal-types';

export interface ProposalRepository {
  listByOrg(orgId: string): Promise<Proposal[]>;
  getProposal(id: string): Promise<Proposal | null>;
  createProposal(input: CreateProposalInput): Promise<Proposal>;
  update(id: string, fn: (p: Proposal) => Proposal): Promise<Proposal>;
  addComment(id: string, input: AddCommentInput, agilityCommentId?: string): Promise<Proposal>;
  addVote(id: string, input: CastPublicVoteInput, receipt?: string, weight?: number): Promise<Proposal>;
  addPrivateVote(id: string, input: CastPrivateVoteInput, receipt?: string, weight?: number): Promise<Proposal>;
  hasVoted(id: string, walletAddress: string): Promise<boolean>;
}

export class ProposalNotFoundError extends Error {
  constructor(id: string) {
    super(`Proposal not found: ${id}`);
    this.name = 'ProposalNotFoundError';
  }
}

const DATA_DIR = path.join(process.cwd(), '.data');
const DATA_FILE = path.join(DATA_DIR, 'proposals.json');

function slugify(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

/** File-backed proposal repository. Single-process safe. */
export class JsonProposalRepository implements ProposalRepository {
  private async readAll(): Promise<Proposal[]> {
    try {
      const raw = await fs.readFile(DATA_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as Proposal[]) : [];
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw err;
    }
  }

  private async writeAll(proposals: Proposal[]): Promise<void> {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(DATA_FILE, JSON.stringify(proposals, null, 2), 'utf8');
  }

  async listByOrg(orgId: string): Promise<Proposal[]> {
    const all = await this.readAll();
    return all
      .filter((p) => p.orgId === orgId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async getProposal(id: string): Promise<Proposal | null> {
    const all = await this.readAll();
    return all.find((p) => p.id === id) ?? null;
  }

  async createProposal(input: CreateProposalInput): Promise<Proposal> {
    const all = await this.readAll();

    let id = `${slugify(input.title) || 'proposal'}-${randomUUID().slice(0, 8)}`;
    while (all.some((p) => p.id === id)) {
      id = `${slugify(input.title) || 'proposal'}-${randomUUID().slice(0, 8)}`;
    }

    const proposal: Proposal = {
      id,
      orgId: input.orgId,
      title: input.title,
      description: input.description,
      type: input.type ?? 'general',
      status: 'draft',
      createdBy: input.createdBy,
      createdAt: new Date().toISOString(),
      votingPeriodDays: input.votingPeriodDays,
      quorum: input.quorum,
      tally: { yes: 0, no: 0, abstain: 0 },
      votes: [],
      comments: [],
    };

    all.push(proposal);
    await this.writeAll(all);
    return proposal;
  }

  async update(id: string, fn: (p: Proposal) => Proposal): Promise<Proposal> {
    const all = await this.readAll();
    const idx = all.findIndex((p) => p.id === id);
    if (idx === -1) throw new ProposalNotFoundError(id);
    const updated = fn(all[idx]);
    all[idx] = updated;
    await this.writeAll(all);
    return updated;
  }

  addComment(id: string, input: AddCommentInput, agilityCommentId?: string): Promise<Proposal> {
    return this.update(id, (p) => {
      const comment: ProposalComment = {
        id: randomUUID(),
        author: input.author,
        body: input.body,
        createdAt: new Date().toISOString(),
        agilityCommentId,
      };
      return { ...p, comments: [...p.comments, comment] };
    });
  }

  addVote(id: string, input: CastPublicVoteInput, receipt?: string, weight = 1): Promise<Proposal> {
    return this.update(id, (p) => {
      const vote: VoteCast = {
        walletAddress: input.walletAddress,
        choice: input.choice,
        receipt,
        castAt: new Date().toISOString(),
        delegatedWeight: weight > 1 ? weight - 1 : undefined,
      };
      const tally = { ...p.tally, [input.choice]: p.tally[input.choice] + weight };
      return { ...p, tally, votes: [...(p.votes ?? []), vote] };
    });
  }

  addPrivateVote(id: string, input: CastPrivateVoteInput, receipt?: string, weight = 1): Promise<Proposal> {
    return this.update(id, (p) => {
      const vote: VoteCast = {
        walletAddress: input.walletAddress,
        choice: 'private',
        receipt: receipt ?? input.proofHash,
        castAt: new Date().toISOString(),
        delegatedWeight: weight > 1 ? weight - 1 : undefined,
      };
      return { ...p, votes: [...(p.votes ?? []), vote] };
    });
  }

  async hasVoted(id: string, walletAddress: string): Promise<boolean> {
    const proposal = await this.getProposal(id);
    if (!proposal) return false;
    return (proposal.votes ?? []).some((v) => v.walletAddress === walletAddress);
  }
}

export const proposalRepository: ProposalRepository = new JsonProposalRepository();
