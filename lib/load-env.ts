import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Minimal .env loader (no external dependency). Loads KEY=VALUE pairs from a
 * .env file into process.env without overwriting already-set variables.
 * Imported for side-effects at the top of CLI scripts.
 */
function loadEnv(file = resolve(process.cwd(), '.env')): void {
  if (!existsSync(file)) return;
  const content = readFileSync(file, 'utf8');
  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    // Strip surrounding quotes.
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

loadEnv();
