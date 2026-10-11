/** Account hearts. One save per place; a click during it keeps only the latest desired state. */
import { notify } from '@/lib/notify';

const HEARTS_URL = '/api/library/hearts';
const SAVE_FAILED = "Couldn't save that heart. Try again in a moment.";
const REMOVE_FAILED = "Couldn't remove that heart. Try again in a moment.";
const BATCH = 1000;

type Lane = { confirmed: boolean; desired: boolean; busy: boolean; clicks: number; snapshot: boolean | null };
const lanes = new Map<string, Lane>();
let generation = 0;
let refreshUi: (() => void) | null = null;
let tail: Promise<void> = Promise.resolve();

const fresh = (on: boolean): Lane => ({ confirmed: on, desired: on, busy: false, clicks: 0, snapshot: null });
const publish = () => refreshUi?.();

export function resetHeartWriterForTests(): void {
  generation += 1;
  lanes.clear();
  refreshUi = null;
}

export function bindHeartUi(refresh: (() => void) | null): void {
  refreshUi = refresh;
}

function lane(id: string): Lane {
  const row = lanes.get(id);
  if (row) return row;
  const created = fresh(false);
  lanes.set(id, created);
  return created;
}

export const isDream = (id: string): boolean => lanes.get(id)?.desired ?? false;

export function heartSet(): Set<string> {
  const next = new Set<string>();
  for (const [id, row] of lanes) if (row.desired) next.add(id);
  return next;
}

/** Idle places take this account snapshot. An in-flight save settles against it if that save fails. */
export function seedAccountHearts(ids: readonly string[]): void {
  const on = new Set(ids);
  for (const [id, row] of lanes) {
    const next = on.has(id);
    if (row.busy) {
      row.snapshot = next;
      continue;
    }
    row.confirmed = next;
    row.desired = row.confirmed;
    row.snapshot = null;
  }
  for (const id of on) if (!lanes.has(id)) lanes.set(id, fresh(true));
  publish();
}

async function postChunk(ids: string[], on: boolean): Promise<Set<string> | null> {
  try {
    const res = await fetch(HEARTS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ placeIds: ids, on }),
      keepalive: true,
    });
    if (!res.ok) return null;
    const body = (await res.json().catch(() => null)) as { placeIds?: unknown } | null;
    const applied = new Set<string>();
    if (Array.isArray(body?.placeIds)) for (const id of body.placeIds) if (typeof id === 'string') applied.add(id);
    return applied;
  } catch {
    return null;
  }
}

async function send(ids: string[], on: boolean, gen: number, started: Map<string, number>): Promise<boolean> {
  const applied = new Set<string>();
  for (let i = 0; i < ids.length; i += BATCH) {
    const got = await postChunk(ids.slice(i, i + BATCH), on);
    if (generation !== gen) return true;
    if (!got) break;
    for (const id of got) applied.add(id);
  }
  if (generation !== gen) return true;
  let toast = false;
  for (const id of ids) {
    const row = lanes.get(id);
    if (!row) continue;
    if (applied.has(id)) {
      row.confirmed = on;
      row.snapshot = null;
    }
    row.busy = false;
    if (row.clicks === started.get(id) && !applied.has(id)) {
      if (row.snapshot !== null) row.confirmed = row.snapshot;
      row.snapshot = null;
      row.desired = row.confirmed;
      toast = true;
    } else if (!applied.has(id) && row.snapshot !== null) {
      row.confirmed = row.snapshot;
      row.snapshot = null;
    }
  }
  if (toast) notify.error(on ? SAVE_FAILED : REMOVE_FAILED);
  publish();
  return !toast;
}

async function drain(gen: number): Promise<boolean> {
  let ok = true;
  while (generation === gen) {
    const onIds: string[] = [];
    const offIds: string[] = [];
    const started = new Map<string, number>();
    for (const [id, row] of lanes) {
      if (row.busy || row.desired === row.confirmed) continue;
      row.busy = true;
      started.set(id, row.clicks);
      (row.desired ? onIds : offIds).push(id);
    }
    if (!started.size) return ok;
    const [onOk, offOk] = await Promise.all([
      onIds.length ? send(onIds, true, gen, started) : true,
      offIds.length ? send(offIds, false, gen, started) : true,
    ]);
    if (!onOk || !offOk) ok = false;
  }
  return ok;
}

/** Saves `on` for each place. False when any id did not land. */
export function writeHearts(ids: string[], on: boolean): Promise<boolean> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return Promise.resolve(true);
  for (const id of unique) {
    const row = lane(id);
    row.desired = on;
    row.clicks += 1;
  }
  publish();
  const gen = generation;
  const run = tail.then(() => drain(gen));
  tail = run.then(
    () => undefined,
    () => undefined
  );
  return run.then(
    (ok) => ok && unique.every((id) => lanes.get(id)?.confirmed === on && lanes.get(id)?.desired === on)
  );
}

export function setDream(id: string, on: boolean): void {
  void writeHearts([id], on);
}
