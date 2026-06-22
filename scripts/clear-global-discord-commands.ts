/**
 * Clear GLOBAL Discord slash commands.
 *
 * Usage:
 *   npm run scripts:discord:clear-global
 *
 * Use this when commands appear twice: they were registered globally AND to a
 * guild. Guild commands are instant and preferred for testing, so we clear the
 * global set (PUT an empty array) and leave guild commands intact.
 *
 * Reads DISCORD_CLIENT_ID + DISCORD_BOT_TOKEN from .env (or the environment).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENV_PATH = path.resolve(__dirname, '..', '.env');

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
  if (!appId || !token) {
    console.error('Missing DISCORD_CLIENT_ID or DISCORD_BOT_TOKEN (set them in .env).');
    process.exit(1);
  }

  const url = `https://discord.com/api/v10/applications/${appId}/commands`;
  console.log('Clearing ALL global commands...');

  const res = await fetch(url, {
    method: 'PUT', // bulk overwrite with an empty set
    headers: { Authorization: `Bot ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify([]),
  });

  const text = await res.text();
  if (!res.ok) {
    console.error(`Discord API error ${res.status}: ${text}`);
    process.exit(1);
  }
  console.log('Global commands cleared. Guild commands (if any) are unaffected.');
  console.log('Note: removed global commands can take up to ~1 hour to disappear from clients.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
