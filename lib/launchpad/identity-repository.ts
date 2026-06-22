import 'server-only';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { ChainName } from '../agility/types';
import { encryptSecret, decryptSecret } from './crypto';

/**
 * Encrypted Discord↔wallet identity links for the bot's private gating.
 *
 * Privacy requirement: the mapping between a Discord user and their wallet must
 * never be public. Wallet addresses are stored AES-GCM encrypted at rest and
 * are only ever decrypted server-side to perform an eligibility check — they
 * are never echoed into a Discord channel.
 *
 * The Discord user id is stored hashed-ish only by being the record key; we key
 * by `${guildId}:${discordUserId}` so a member can link a different wallet per
 * community if desired.
 */

export interface IdentityLink {
  guildId: string;
  discordUserId: string;
  chain: ChainName;
  /** Decrypted wallet address (only present on in-memory reads). */
  walletAddress: string;
  linkedAt: string;
}

interface StoredLink {
  guildId: string;
  discordUserId: string;
  chain: ChainName;
  /** AES-GCM encrypted wallet address. */
  walletEnc: string;
  linkedAt: string;
}

export interface IdentityRepository {
  link(input: Omit<IdentityLink, 'linkedAt'>): Promise<void>;
  get(guildId: string, discordUserId: string): Promise<IdentityLink | null>;
  unlink(guildId: string, discordUserId: string): Promise<void>;
}

const DATA_DIR = path.join(process.cwd(), '.data');
const DATA_FILE = path.join(DATA_DIR, 'identity-links.json');

function keyOf(guildId: string, discordUserId: string): string {
  return `${guildId}:${discordUserId}`;
}

export class JsonIdentityRepository implements IdentityRepository {
  private async readAll(): Promise<Record<string, StoredLink>> {
    try {
      const raw = await fs.readFile(DATA_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, StoredLink>) : {};
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return {};
      throw err;
    }
  }

  private async writeAll(map: Record<string, StoredLink>): Promise<void> {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(DATA_FILE, JSON.stringify(map, null, 2), 'utf8');
  }

  async link(input: Omit<IdentityLink, 'linkedAt'>): Promise<void> {
    const map = await this.readAll();
    map[keyOf(input.guildId, input.discordUserId)] = {
      guildId: input.guildId,
      discordUserId: input.discordUserId,
      chain: input.chain,
      walletEnc: encryptSecret(input.walletAddress),
      linkedAt: new Date().toISOString(),
    };
    await this.writeAll(map);
  }

  async get(guildId: string, discordUserId: string): Promise<IdentityLink | null> {
    const map = await this.readAll();
    const stored = map[keyOf(guildId, discordUserId)];
    if (!stored) return null;
    return {
      guildId: stored.guildId,
      discordUserId: stored.discordUserId,
      chain: stored.chain,
      walletAddress: decryptSecret(stored.walletEnc),
      linkedAt: stored.linkedAt,
    };
  }

  async unlink(guildId: string, discordUserId: string): Promise<void> {
    const map = await this.readAll();
    delete map[keyOf(guildId, discordUserId)];
    await this.writeAll(map);
  }
}

export const identityRepository: IdentityRepository = new JsonIdentityRepository();
