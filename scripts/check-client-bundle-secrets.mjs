#!/usr/bin/env node
/**
 * Fail if a server-only secret's value appears in the browser bundle.
 *
 * Run after `next build`, with the same environment the build saw:
 *
 *   npm run build && node scripts/check-client-bundle-secrets.mjs
 *
 * Everything under `.next/static` is served publicly. A secret gets there when a
 * client component's import graph reaches a module that reads it and the value
 * is inlined at build time — which is how `TURSO_AUTH_TOKEN` shipped to every
 * /library and /archive visitor via next.config.js `env:`. `import 'server-only'`
 * in `src/db/index.ts` now stops the import path; this checks the outcome, so it
 * also catches a leak that arrives some other way.
 *
 * The values checked are this process's own env vars whose names look secret
 * (TOKEN, SECRET, KEY, PASSWORD, DATABASE_URL), minus `NEXT_PUBLIC_*`, which is
 * public by definition, and npm's own `npm_*` config. CI builds with fake values,
 * so it never handles a real credential. Exits 1 when no such value is set,
 * rather than passing vacuously.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const staticDir = path.join(repoRoot, '.next/static');

const SECRET_NAME = /TOKEN|SECRET|KEY|PASSWORD|DATABASE_URL/;
// Shorter values match too much minified code by chance to mean anything.
const MIN_VALUE_LENGTH = 8;

const secrets = Object.entries(process.env).filter(
  ([name, value]) =>
    SECRET_NAME.test(name) &&
    !name.startsWith('NEXT_PUBLIC_') &&
    !name.startsWith('npm_') &&
    typeof value === 'string' &&
    value.length >= MIN_VALUE_LENGTH
);

if (secrets.length === 0) {
  console.error('No secret-looking env vars are set; nothing to check. Run with the env the build used.');
  process.exit(1);
}

if (!fs.existsSync(staticDir)) {
  console.error(`${path.relative(repoRoot, staticDir)} does not exist; run \`next build\` first.`);
  process.exit(1);
}

const leaks = [];
for (const entry of fs.readdirSync(staticDir, { recursive: true, withFileTypes: true })) {
  if (!entry.isFile()) continue;
  const file = path.join(entry.parentPath ?? entry.path, entry.name);
  const content = fs.readFileSync(file, 'utf8');
  for (const [name, value] of secrets) {
    if (content.includes(value)) leaks.push({ name, file: path.relative(repoRoot, file) });
  }
}

if (leaks.length > 0) {
  for (const { name, file } of leaks) console.error(`LEAK: value of ${name} found in ${file}`);
  process.exit(1);
}

console.log(`OK: none of ${secrets.map(([name]) => name).join(', ')} appear under .next/static`);
