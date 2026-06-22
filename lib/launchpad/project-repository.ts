import 'server-only';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { CreateProjectInput, Project } from './project-types';

export interface ProjectRepository {
  list(): Promise<Project[]>;
  get(id: string): Promise<Project | null>;
  getByGuild(guildId: string): Promise<Project | null>;
  getByOrgId(orgId: string): Promise<Project | null>;
  create(input: CreateProjectInput): Promise<Project>;
  update(id: string, fn: (p: Project) => Project): Promise<Project>;
}

export class ProjectNotFoundError extends Error {
  constructor(id: string) {
    super(`Project not found: ${id}`);
    this.name = 'ProjectNotFoundError';
  }
}

const DATA_DIR = path.join(process.cwd(), '.data');
const DATA_FILE = path.join(DATA_DIR, 'projects.json');

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'project'
  );
}

export class JsonProjectRepository implements ProjectRepository {
  private async readAll(): Promise<Project[]> {
    try {
      const raw = await fs.readFile(DATA_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as Project[]) : [];
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw err;
    }
  }

  private async writeAll(projects: Project[]): Promise<void> {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(DATA_FILE, JSON.stringify(projects, null, 2), 'utf8');
  }

  async list(): Promise<Project[]> {
    const all = await this.readAll();
    return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async get(id: string): Promise<Project | null> {
    const all = await this.readAll();
    return all.find((p) => p.id === id) ?? null;
  }

  async getByGuild(guildId: string): Promise<Project | null> {
    const all = await this.readAll();
    return all.find((p) => p.guildId === guildId) ?? null;
  }

  async getByOrgId(orgId: string): Promise<Project | null> {
    const all = await this.readAll();
    return all.find((p) => p.orgId === orgId) ?? null;
  }

  async create(input: CreateProjectInput): Promise<Project> {
    const all = await this.readAll();
    let id = slugify(input.name);
    if (all.some((p) => p.id === id)) id = `${id}-${Date.now().toString(36)}`;

    const project: Project = {
      id,
      name: input.name,
      description: input.description,
      chain: input.chain,
      createdBy: input.createdBy,
      goalAmount: input.goalAmount,
      currency: input.currency,
      deadline: input.deadline,
      status: 'draft',
      raisedAmount: '0',
      membership: input.membership,
      createdAt: new Date().toISOString(),
    };

    all.push(project);
    await this.writeAll(all);
    return project;
  }

  async update(id: string, fn: (p: Project) => Project): Promise<Project> {
    const all = await this.readAll();
    const idx = all.findIndex((p) => p.id === id);
    if (idx === -1) throw new ProjectNotFoundError(id);
    const updated = fn(all[idx]);
    all[idx] = updated;
    await this.writeAll(all);
    return updated;
  }
}

export const projectRepository: ProjectRepository = new JsonProjectRepository();
