/**
 * Shared helpers for the mass-upload load/reliability harness.
 *
 * These scripts talk to a THROWAWAY libSQL server (Docker), never to Turso.
 * `LOADTEST_DB_URL` must be set and must not look like a Turso URL.
 */
import { createClient } from '@libsql/client';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = join(HERE, '..', '..');

export function getClient() {
  const url = process.env.LOADTEST_DB_URL;
  if (!url) throw new Error('LOADTEST_DB_URL is required (throwaway Docker libSQL server)');
  if (/turso\.io|libsql:\/\//.test(url)) {
    throw new Error(`Refusing to run load tests against a remote database: ${url}`);
  }
  return createClient({ url });
}

/**
 * Apply the checked-in migrations to a FRESH container.
 * Run scripts/mass-upload-loadtest/reset-db.sh first — recreating the throwaway
 * container is more reliable than dropping tables over HTTP, where each
 * statement can land on a different connection.
 */
export async function resetSchema(client) {
  const migrationsDir = join(REPO_ROOT, 'src', 'db', 'migrations');
  const files = readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    const sql = readFileSync(join(migrationsDir, file), 'utf8');
    for (const stmt of sql.split('--> statement-breakpoint')) {
      const trimmed = stmt.trim();
      if (trimmed) await client.execute(trimmed);
    }
  }
  return files;
}

export async function seedQueue(
  client,
  {
    count,
    userId = 'user_loadtest',
    sessionId = 'ses_loadtest',
    // Where the pipeline downloads screenshots from. Defaults to the intercepted
    // host; the scale test points it at the local blob server for real HTTP.
    uriBase = 'https://fake-blob.local/screenshots',
  }
) {
  const now = new Date().toISOString();
  await client.execute({
    sql: `INSERT OR REPLACE INTO users (id, name, email, email_verified, image) VALUES (?, ?, ?, ?, ?)`,
    args: [userId, 'Load Test', 'loadtest@example.com', null, null],
  });
  const sourceIds = Array.from({ length: count }, (_, i) => `src_load_${String(i).padStart(4, '0')}`);
  await client.execute({
    sql: `INSERT OR REPLACE INTO upload_sessions (id, user_id, started_at, file_count, completed_count, failed_count, status, meta)
          VALUES (?, ?, ?, ?, 0, 0, 'active', ?)`,
    args: [sessionId, userId, now, count, JSON.stringify({ uploadedFiles: sourceIds })],
  });

  // Distinct created_at so the queue order (created_at ASC) is deterministic.
  const base = Date.parse('2026-01-01T00:00:00.000Z');
  const batch = sourceIds.map((id, i) => ({
    sql: `INSERT OR REPLACE INTO sources (id, user_id, type, uri, meta, created_at, updated_at, processing_status, processing_attempts, processing_error, processing_started_at)
          VALUES (?, ?, 'screenshot', ?, ?, ?, ?, 'queued', 0, NULL, NULL)`,
    args: [
      id,
      userId,
      `${uriBase}/${id}.jpg`,
      JSON.stringify({ uploadInfo: { sessionId, originalName: `shot-${i}.jpg`, mimeType: 'image/jpeg', fileSize: 120000 } }),
      new Date(base + i * 1000).toISOString(),
      now,
    ],
  }));
  for (let i = 0; i < batch.length; i += 50) {
    await client.batch(batch.slice(i, i + 50), 'write');
  }
  return sourceIds;
}

export async function statusCounts(client) {
  const res = await client.execute(
    `SELECT processing_status AS status, COUNT(*) AS n FROM sources GROUP BY processing_status`
  );
  return Object.fromEntries(res.rows.map((r) => [r.status, Number(r.n)]));
}

export async function detail(client) {
  const res = await client.execute(
    `SELECT id, processing_status, processing_attempts, processing_error FROM sources ORDER BY id`
  );
  return res.rows;
}

export function fmt(obj) {
  return JSON.stringify(obj);
}
