#!/usr/bin/env node
/**
 * Patches @midnight-ntwrk/* package.json "exports" maps so that the
 * "default" condition is always listed LAST, as required by the Node.js
 * resolution spec and enforced by webpack ("Default condition should be
 * last one"). Several published Midnight SDK packages ship with "default"
 * before "types", which breaks the Next.js build.
 *
 * Idempotent and safe to run repeatedly. Wired as a postinstall hook so it
 * re-applies after every `npm install`.
 */
import { readFileSync, writeFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootNodeModules = join(__dirname, '..', 'node_modules');

/** Reorder a conditions object so `default` is last. Returns true if changed. */
function reorderConditions(obj) {
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) return false;
  let changed = false;
  const keys = Object.keys(obj);

  // Recurse into nested condition objects first.
  for (const k of keys) {
    if (reorderConditions(obj[k])) changed = true;
  }

  // If `default` exists but isn't last, move it to the end.
  if (keys.includes('default') && keys[keys.length - 1] !== 'default') {
    const def = obj.default;
    delete obj.default;
    obj.default = def;
    changed = true;
  }
  return changed;
}

function patchPackage(pkgPath) {
  let raw;
  try {
    raw = readFileSync(pkgPath, 'utf8');
  } catch {
    return false;
  }
  let pkg;
  try {
    pkg = JSON.parse(raw);
  } catch {
    return false;
  }
  if (!pkg.exports) return false;

  const changed = reorderConditions(pkg.exports);
  if (changed) {
    writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
    console.log(`[fix-midnight-exports] patched ${pkg.name ?? pkgPath}`);
  }
  return changed;
}

/** Recursively patch every @midnight-ntwrk package under a node_modules dir. */
function walkNodeModules(nmDir) {
  let count = 0;
  const scopeDir = join(nmDir, '@midnight-ntwrk');
  if (existsSync(scopeDir)) {
    for (const entry of readdirSync(scopeDir)) {
      const dir = join(scopeDir, entry);
      if (!statSync(dir).isDirectory()) continue;
      const pkgJson = join(dir, 'package.json');
      if (existsSync(pkgJson) && patchPackage(pkgJson)) count++;
      // Recurse into nested node_modules of this package.
      const nested = join(dir, 'node_modules');
      if (existsSync(nested)) count += walkNodeModules(nested);
    }
  }
  // Also recurse into nested node_modules of non-scoped packages.
  for (const entry of readdirSync(nmDir)) {
    if (entry === '@midnight-ntwrk' || entry.startsWith('.')) continue;
    const dir = join(nmDir, entry);
    if (!existsSync(dir) || !statSync(dir).isDirectory()) continue;
    const nested = join(dir, 'node_modules');
    if (existsSync(nested)) count += walkNodeModules(nested);
  }
  return count;
}

if (!existsSync(rootNodeModules)) {
  console.log('[fix-midnight-exports] no node_modules found; skipping');
  process.exit(0);
}

const total = walkNodeModules(rootNodeModules);
console.log(`[fix-midnight-exports] done — patched ${total} package(s)`);
