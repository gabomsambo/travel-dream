/**
 * Runs ONE invocation of a mass-upload processing route in this process, then
 * hard-kills the process at KILL_AFTER_MS — the way Vercel kills a function that
 * exceeds maxDuration (no cleanup, no catch block, no finally).
 *
 * Usage: tsx scripts/mass-upload-loadtest/run-cron-child.mjs <cron|process>
 */
const target = process.argv[2] ?? 'cron';
const killAfterMs = Number(process.env.KILL_AFTER_MS ?? 120000);
const started = Date.now();

const killer = setTimeout(() => {
  console.log(JSON.stringify({ event: 'killed', target, afterMs: Date.now() - started }));
  process.exit(137); // SIGKILL-shaped exit: nothing runs after this
}, killAfterMs);

const mod =
  target === 'process'
    ? await import('../../src/app/api/mass-upload/process/route.ts')
    : await import('../../src/app/api/mass-upload/cron/route.ts');

const handler = target === 'process' ? mod.POST : mod.GET;
const req = new Request(`http://localhost:3000/api/mass-upload/${target}`, {
  method: target === 'process' ? 'POST' : 'GET',
  headers: { authorization: `Bearer ${process.env.CRON_SECRET}`, 'content-type': 'application/json' },
  // `wait` runs the queue inline instead of in after(), which needs a real
  // Next.js request context.
  body: target === 'process' ? JSON.stringify({ wait: true, reason: 'loadtest' }) : undefined,
});

try {
  const res = await handler(req);
  const body = await res.json();
  console.log(JSON.stringify({ event: 'completed', target, status: res.status, elapsedMs: Date.now() - started, body }));
} catch (err) {
  console.log(JSON.stringify({ event: 'threw', target, elapsedMs: Date.now() - started, error: String(err) }));
} finally {
  clearTimeout(killer);
}
process.exit(0);
