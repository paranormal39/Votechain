/**
 * Register VoteChain's Discord slash commands.
 *
 * Usage:
 *   npm run scripts:discord:register
 *
 * Reads DISCORD_CLIENT_ID + DISCORD_BOT_TOKEN from .env (or the environment).
 * If DISCORD_GUILD_ID is set, commands are registered to that guild (instant,
 * ideal for testing). Otherwise they are registered globally (can take up to
 * ~1 hour to propagate).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { COMMANDS } from '../lib/discord/commands';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENV_PATH = path.resolve(__dirname, '..', '.env');

// Minimal .env loader (no dependency) — only fills vars not already set.
function loadEnv(file: string): void {
  let raw: string;
  try {
    raw = readFileSync(file, 'utf8');
  } catch {
    return;
  }
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

async function main(): Promise<void> {
  loadEnv(ENV_PATH);

  const appId = process.env.DISCORD_CLIENT_ID;
  const token = process.env.DISCORD_BOT_TOKEN;
  const guildId = process.env.DISCORD_GUILD_ID;

  if (!appId || !token) {
    console.error('Missing DISCORD_CLIENT_ID or DISCORD_BOT_TOKEN (set them in .env).');
    process.exit(1);
  }

  const url = guildId
    ? `https://discord.com/api/v10/applications/${appId}/guilds/${guildId}/commands`
    : `https://discord.com/api/v10/applications/${appId}/commands`;

  const scope = guildId ? `guild ${guildId}` : 'global';
  console.log(`Registering ${COMMANDS.length} command(s) to ${scope}...`);

  const res = await fetch(url, {
    method: 'PUT', // bulk overwrite
    headers: {
      Authorization: `Bot ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(COMMANDS),
  });

  const text = await res.text();
  if (!res.ok) {
    console.error(`Discord API error ${res.status}: ${text}`);
    process.exit(1);
  }

  let names: string[] = [];
  try {
    names = (JSON.parse(text) as Array<{ name: string }>).map((c) => c.name);
  } catch {
    /* ignore parse issues; registration already succeeded */
  }
  console.log(`Registered: ${names.length ? names.join(', ') : '(see Discord)'}`);
  if (!guildId) {
    console.log('Global commands may take up to ~1 hour to appear. Set DISCORD_GUILD_ID for instant testing.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
