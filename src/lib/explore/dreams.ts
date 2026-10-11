/**
 * Client-side "dreams" (hearts) from Shuffle and the Library. Hearts belong to
 * the account (`place_hearts`); this device keeps a copy under the storage key
 * the Library's old FavoriteManager (`src/lib/place-card-helpers.ts`) used, so
 * Shuffle can read them without a round-trip and older pages stay in step.
 *
 * - `setDream` writes the device copy and saves the heart to the account.
 * - A save that does not reach the server is queued here and replayed by the
 *   Library's next load (`takePendingDreams`), so a heart is never lost to a
 *   dropped request.
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

const heartWriteTail = new Map<string, Promise<void>>();

/** Saves heart changes to the account. Resolves the ids the server applied; rejects on failure. */
export async function saveDreams(placeIds: string[], on: boolean): Promise<string[]> {
  const earlier = Promise.all(
    placeIds.map((id) =>
      (heartWriteTail.get(id) ?? Promise.resolve()).then(
        () => undefined,
        () => undefined,
      ),
    ),
  );
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const finished = earlier.then(() => gate);
  for (const id of placeIds) heartWriteTail.set(id, finished);

  try {
    await earlier;
    const res = await fetch(HEARTS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ placeIds, on }),
      keepalive: true,
    });
    if (!res.ok) throw new Error(`Saving hearts failed (${res.status})`);
    const body = (await res.json().catch(() => null)) as { placeIds?: unknown } | null;
    return Array.isArray(body?.placeIds) ? body.placeIds.filter((x): x is string => typeof x === 'string') : [];
  } finally {
    release();
    for (const id of placeIds) if (heartWriteTail.get(id) === finished) heartWriteTail.delete(id);
  }
}

/**
 * Hearts or un-hearts a place: this device at once, the account in the
 * background. A save that fails is queued for the Library to replay.
 */
export function setDream(id: string, on: boolean): void {
  setDreamLocal(id, on);
  if (typeof fetch !== 'function') return;
  try {
    saveDreams([id], on).catch(() => queue([id], on));
  } catch {
    queue([id], on);
  }
}
