import 'server-only';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { ChainName } from '../agility/types';

/**
 * Short-lived store of in-flight Discord scan-to-link sessions.
 *
 * When a member runs `/link` (QR flow), we create a Xaman SignIn payload and
 * record the mapping `payloadUuid -> { guild, discord user, interaction token }`
 * here. The Xaman webhook later looks the payload up by uuid to know which
 * Discord user signed, then finalizes the (encrypted) identity link.
 *
 * Records are best-effort and expire — they only need to live long enough for
 * the user to scan + sign (Xaman payloads expire in ~5 min).
 */
export interface PendingLink {
  uuid: string;
  guildId: string;
  discordUserId: string;
  /** Membership chain for the bound DAO (used when recording the link). */
  chain: ChainName;
  /** Interaction token, used to post a follow-up confirmation (valid ~15 min). */
  interactionToken: string;
  /** Discord application id (for the follow-up webhook). */
  applicationId: string;
  expiresAt: string;
}

const DATA_DIR = path.join(process.cwd(), '.data');
const DATA_FILE = path.join(DATA_DIR, 'discord-pending-links.json');

async function readAll(): Promise<Record<string, PendingLink>> {
  try {
    const raw = await fs.readFile(DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, PendingLink>) : {};
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw err;
  }
}

async function writeAll(map: Record<string, PendingLink>): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(DATA_FILE, JSON.stringify(map, null, 2), 'utf8');
}

function pruneExpired(map: Record<string, PendingLink>): Record<string, PendingLink> {
  const now = Date.now();
  for (const [uuid, link] of Object.entries(map)) {
    if (new Date(link.expiresAt).getTime() < now) delete map[uuid];
  }
  return map;
}

export const pendingLinkRepository = {
  async create(link: PendingLink): Promise<void> {
    const map = pruneExpired(await readAll());
    map[link.uuid] = link;
    await writeAll(map);
  },

  async get(uuid: string): Promise<PendingLink | null> {
    const map = pruneExpired(await readAll());
    const link = map[uuid];
    return link ?? null;
  },

  async remove(uuid: string): Promise<void> {
    const map = await readAll();
    if (map[uuid]) {
      delete map[uuid];
      await writeAll(map);
    }
  },
};
