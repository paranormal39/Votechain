import 'server-only';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  DEFAULT_MEMBERSHIP,
  type AddMemberInput,
  type CreateOrganizationInput,
  type MemberRole,
  type MembershipSettings,
  type Organization,
} from './types';

/**
 * Domain repository abstraction. The JSON implementation below is an interim
 * store for Phase 1; it can be swapped for a Prisma-backed implementation
 * later without touching callers (BFF route handlers, server components).
 */
export interface OrgRepository {
  listOrganizations(): Promise<Organization[]>;
  getOrganization(id: string): Promise<Organization | null>;
  createOrganization(input: CreateOrganizationInput): Promise<Organization>;
  setDaoId(id: string, daoId: string): Promise<Organization>;
  updateSettings(id: string, membership: MembershipSettings): Promise<Organization>;
  addMember(orgId: string, input: AddMemberInput): Promise<Organization>;
  removeMember(orgId: string, walletAddress: string): Promise<Organization>;
  updateMemberRole(orgId: string, walletAddress: string, role: MemberRole): Promise<Organization>;
}

export class OrgNotFoundError extends Error {
  constructor(id: string) {
    super(`Organization not found: ${id}`);
    this.name = 'OrgNotFoundError';
  }
}

export class DuplicateMemberError extends Error {
  constructor(walletAddress: string) {
    super(`Member already exists: ${walletAddress}`);
    this.name = 'DuplicateMemberError';
  }
}

const DATA_DIR = path.join(process.cwd(), '.data');
const DATA_FILE = path.join(DATA_DIR, 'organizations.json');

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

/** File-backed repository. Single-process safe; not for concurrent multi-instance use. */
export class JsonOrgRepository implements OrgRepository {
  private async readAll(): Promise<Organization[]> {
    try {
      const raw = await fs.readFile(DATA_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      // Backfill membership settings for orgs created before this field existed.
      return (parsed as Organization[]).map((org) => ({
        ...org,
        membership: org.membership ?? { ...DEFAULT_MEMBERSHIP },
      }));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw err;
    }
  }

  private async writeAll(orgs: Organization[]): Promise<void> {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(DATA_FILE, JSON.stringify(orgs, null, 2), 'utf8');
  }

  async listOrganizations(): Promise<Organization[]> {
    return this.readAll();
  }

  async getOrganization(id: string): Promise<Organization | null> {
    const orgs = await this.readAll();
    return orgs.find((o) => o.id === id) ?? null;
  }

  async createOrganization(input: CreateOrganizationInput): Promise<Organization> {
    const orgs = await this.readAll();

    let id = slugify(input.name) || 'org';
    if (orgs.some((o) => o.id === id)) {
      id = `${id}-${Date.now().toString(36)}`;
    }

    const now = new Date().toISOString();
    const org: Organization = {
      id,
      name: input.name,
      description: input.description,
      chain: input.chain,
      createdBy: input.createdBy,
      createdAt: now,
      membership: input.membership ?? { ...DEFAULT_MEMBERSHIP },
      members: [
        {
          walletAddress: input.createdBy,
          chain: input.chain,
          role: 'admin',
          joinedAt: now,
        },
      ],
    };

    orgs.push(org);
    await this.writeAll(orgs);
    return org;
  }

  private async mutate(
    id: string,
    fn: (org: Organization) => Organization
  ): Promise<Organization> {
    const orgs = await this.readAll();
    const idx = orgs.findIndex((o) => o.id === id);
    if (idx === -1) throw new OrgNotFoundError(id);
    const updated = fn(orgs[idx]);
    orgs[idx] = updated;
    await this.writeAll(orgs);
    return updated;
  }

  setDaoId(id: string, daoId: string): Promise<Organization> {
    return this.mutate(id, (org) => ({ ...org, daoId }));
  }

  updateSettings(id: string, membership: MembershipSettings): Promise<Organization> {
    return this.mutate(id, (org) => ({ ...org, membership }));
  }

  addMember(orgId: string, input: AddMemberInput): Promise<Organization> {
    return this.mutate(orgId, (org) => {
      if (org.members.some((m) => m.walletAddress === input.walletAddress)) {
        throw new DuplicateMemberError(input.walletAddress);
      }
      return {
        ...org,
        members: [
          ...org.members,
          {
            walletAddress: input.walletAddress,
            chain: input.chain,
            displayName: input.displayName,
            role: input.role ?? 'member',
            joinedAt: new Date().toISOString(),
          },
        ],
      };
    });
  }

  removeMember(orgId: string, walletAddress: string): Promise<Organization> {
    return this.mutate(orgId, (org) => ({
      ...org,
      members: org.members.filter((m) => m.walletAddress !== walletAddress),
    }));
  }

  updateMemberRole(orgId: string, walletAddress: string, role: MemberRole): Promise<Organization> {
    return this.mutate(orgId, (org) => ({
      ...org,
      members: org.members.map((m) =>
        m.walletAddress === walletAddress ? { ...m, role } : m
      ),
    }));
  }
}

export const orgRepository: OrgRepository = new JsonOrgRepository();
