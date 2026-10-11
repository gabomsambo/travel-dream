/**
 * Client-side "dreams" (hearts) from Shuffle and the Library. Hearts belong to
 * the account (`place_hearts`); this device keeps a copy under the storage key
 * the Library's old FavoriteManager (`src/lib/place-card-helpers.ts`) used, so
 * Shuffle can read them without a round-trip and older pages stay in step.
 *
 * - `setDream` writes the device copy and saves the heart to the account.
 * - Writes for one place are sent in order, including a Library replay of the
 *   pending queue. A save that does not reach the server is queued when it is
 *   still that place's latest intent, and the Library's next load replays it
 *   (`takePendingDreams`).
 * - The Library mirrors the account back onto the device (`writeDreams`) once
 *   this device's old hearts have been synced (see `use-library-hearts`).
 */
const KEY = 'travel-dreams-favorites';
const PENDING_KEY = 'td:hearts-pending:v1';
export const HEARTS_URL = '/api/library/hearts';

function read(key: string): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(key) ?? '[]'));
  } catch {
    return new Set();
  }
}

function write(key: string, s: Iterable<string>): void {
  try {
    localStorage.setItem(key, JSON.stringify([...s]));
  } catch {
    /* storage blocked: the heart just won't persist on this device */
  }
}

/** Every hearted id on this device. */
export function readDreams(): Set<string> {
  return read(KEY);
}

export function isDream(id: string): boolean {
  return read(KEY).has(id);
}

/** Replaces this device's copy (the Library mirrors the account onto it). */
export function writeDreams(ids: Iterable<string>): void {
  write(KEY, ids);
}

/** Changes this device's copy only. */
export function setDreamLocal(id: string, on: boolean): void {
  const s = read(KEY);
  if (on) s.add(id);
  else s.delete(id);
  write(KEY, s);
}

type Pending = Record<string, boolean>;

function readPending(): Pending {
  try {
    const v = JSON.parse(localStorage.getItem(PENDING_KEY) ?? '{}');
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Pending) : {};
  } catch {
    return {};
  }
}

function queue(ids: string[], on: boolean): void {
  const p = readPending();
  for (const id of ids) p[id] = on;
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify(p));
  } catch {
    /* storage blocked */
  }
}

/** The heart changes that have not reached the account yet, cleared as they are read. */
export function takePendingDreams(): { on: string[]; off: string[] } {
  const p = readPending();
  try {
    localStorage.removeItem(PENDING_KEY);
  } catch {
    /* storage blocked */
  }
  const entries = Object.entries(p).filter(([id, v]) => id && typeof v === 'boolean');
  return { on: entries.filter(([, v]) => v).map(([id]) => id), off: entries.filter(([, v]) => !v).map(([id]) => id) };
}

/** Puts changes back in the queue after a replay that failed. */
export function requeueDreams(ids: string[], on: boolean): void {
  queue(ids, on);
}

function dropPending(ids: string[]): void {
  if (!ids.length) return;
  const p = readPending();
  let changed = false;
  for (const id of ids) {
    if (id in p) {
      delete p[id];
      changed = true;
    }
  }
  if (!changed) return;
  try {
    if (Object.keys(p).length) localStorage.setItem(PENDING_KEY, JSON.stringify(p));
    else localStorage.removeItem(PENDING_KEY);
  } catch {
    /* storage blocked */
  }
}

const BATCH = 500;

type Lane = {
  seq: number;
  intent: boolean;
  committed: boolean | undefined;
  baseline: boolean;
  tail: Promise<void>;
};

const lanes = new Map<string, Lane>();
let epoch = 0;

export function resetHeartQueueForTests(): void {
  epoch += 1;
  lanes.clear();
}

type Claim = {
  ids: string[];
  seqs: Map<string, number>;
  ready: Promise<void>;
  release: () => void;
};

export type HeartSaveResult = {
  ok: boolean;
  applied: string[];
  /** Ids of this write that failed and were still the latest intent. */
  rejected: string[];
  seqs: ReadonlyMap<string, number>;
};

export type HeartWriteOptions = {
  /** Value before this place's first write, used when none of them land. */
  baseline?: (id: string) => boolean;
  /** On failure, queue these ids again when they are still the latest intent. */
  requeue?: ReadonlySet<string>;
};

const EMPTY_SAVE: HeartSaveResult = { ok: true, applied: [], rejected: [], seqs: new Map() };

function claim(ids: string[], on: boolean, baselineOf: (id: string) => boolean): Claim {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const seqs = new Map<string, number>();
  const prevs: Promise<void>[] = [];
  for (const id of ids) {
    let lane = lanes.get(id);
    if (!lane) {
      const baseline = baselineOf(id);
      lane = { seq: 0, intent: baseline, committed: undefined, baseline, tail: Promise.resolve() };
      lanes.set(id, lane);
    }
    lane.seq += 1;
    lane.intent = on;
    seqs.set(id, lane.seq);
    const prev = lane.tail.then(
      () => undefined,
      () => undefined,
    );
    prevs.push(prev);
    lane.tail = prev.then(() => gate);
  }
  return { ids, seqs, ready: Promise.all(prevs).then(() => undefined), release };
}

async function postHearts(placeIds: string[], on: boolean): Promise<string[]> {
  const res = await fetch(HEARTS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ placeIds, on }),
    keepalive: true,
  });
  if (!res.ok) throw new Error(`Saving hearts failed (${res.status})`);
  const body = (await res.json().catch(() => null)) as { placeIds?: unknown } | null;
  return Array.isArray(body?.placeIds) ? body.placeIds.filter((x): x is string => typeof x === 'string') : [];
}

async function finishClaim(
  held: Claim,
  on: boolean,
  requeue: ReadonlySet<string> | undefined,
  epochAtStart: number,
): Promise<HeartSaveResult> {
  try {
    await held.ready;
    if (epoch !== epochAtStart) return { ok: false, applied: [], rejected: [], seqs: held.seqs };
    const ids = held.ids;
    let applied: string[] = [];
    try {
      applied = await postHearts(ids, on);
      if (epoch !== epochAtStart) return { ok: false, applied: [], rejected: [], seqs: held.seqs };
    } catch {
      const rejected: string[] = [];
      const again: string[] = [];
      for (const id of ids) {
        const lane = lanes.get(id);
        if (!lane || lane.seq !== held.seqs.get(id)) continue;
        rejected.push(id);
        if (requeue?.has(id)) again.push(id);
        else lane.intent = lane.committed ?? lane.baseline;
      }
      if (again.length) requeueDreams(again, on);
      return { ok: false, applied: [], rejected, seqs: held.seqs };
    }
    const appliedSet = new Set(applied);
    const latest: string[] = [];
    for (const id of ids) {
      const lane = lanes.get(id);
      if (!lane) continue;
      if (appliedSet.has(id)) lane.committed = on;
      if (lane.seq === held.seqs.get(id)) latest.push(id);
    }
    if (latest.length) dropPending(latest);
    return { ok: true, applied, rejected: [], seqs: held.seqs };
  } finally {
    held.release();
  }
}

function mergeResults(parts: HeartSaveResult[]): HeartSaveResult {
  const seqs = new Map<string, number>();
  const applied: string[] = [];
  const rejected: string[] = [];
  let ok = true;
  for (const part of parts) {
    if (!part.ok) ok = false;
    applied.push(...part.applied);
    rejected.push(...part.rejected);
    for (const [id, seq] of part.seqs) seqs.set(id, seq);
  }
  return { ok, applied, rejected, seqs };
}

/**
 * Sends heart writes. Every id is claimed on its place's queue before the first
 * await, so the last intent for a place is the last request sent. `committed`
 * records what a completed write applied. A failure requeues or marks the id
 * for rollback only when no newer intent exists.
 */
export function queueHeartWrites(
  ids: string[],
  on: boolean,
  options?: HeartWriteOptions,
): { seqs: Map<string, number>; done: Promise<HeartSaveResult> } {
  if (!ids.length) return { seqs: new Map(), done: Promise.resolve(EMPTY_SAVE) };
  const baselineOf = options?.baseline ?? (() => false);
  const claims: Claim[] = [];
  for (let i = 0; i < ids.length; i += BATCH) claims.push(claim(ids.slice(i, i + BATCH), on, baselineOf));
  const seqs = new Map<string, number>();
  for (const held of claims) for (const [id, seq] of held.seqs) seqs.set(id, seq);
  const epochAtStart = epoch;
  const done = Promise.all(claims.map((held) => finishClaim(held, on, options?.requeue, epochAtStart))).then(mergeResults);
  return { seqs, done };
}

/** Last value a write actually applied, or the pre-write value when none have landed. */
export function heartRollbackValue(id: string, preserveUnsyncedDeviceHeart = false): boolean {
  const lane = lanes.get(id);
  if (!lane) return preserveUnsyncedDeviceHeart;
  if (lane.committed !== undefined) return lane.committed;
  return lane.baseline || preserveUnsyncedDeviceHeart;
}

/** The intent of `seq` while that write is still the latest one for the place. */
export function inflightHeart(id: string, seq: number): boolean | null {
  const lane = lanes.get(id);
  if (!lane || lane.seq !== seq) return null;
  return lane.intent;
}

/** Sequences at this moment, so a later claim can be told apart from one already made. */
export function heartSeqSnapshot(): Map<string, number> {
  return new Map([...lanes].map(([id, lane]) => [id, lane.seq]));
}

/** Intents claimed after `floor` (a snapshot, or the seq a sync write itself claimed). */
export function heartIntentsNewerThan(floor: ReadonlyMap<string, number>): Array<{ id: string; on: boolean }> {
  const out: Array<{ id: string; on: boolean }> = [];
  for (const [id, lane] of lanes) {
    if (lane.seq > (floor.get(id) ?? 0)) out.push({ id, on: lane.intent });
  }
  return out;
}

/**
 * Hearts or un-hearts a place: this device at once, the account in the
 * background. A save that fails is queued for the Library to replay when it
 * is still this place's latest intent.
 */
export function setDream(id: string, on: boolean): void {
  const before = readDreams().has(id);
  setDreamLocal(id, on);
  if (typeof fetch !== 'function') return;
  void queueHeartWrites([id], on, { baseline: () => before, requeue: new Set([id]) }).done;
}
