/**
 * Hearts belong to the account (`place_hearts`). This device still keeps the
 * old favorites list (`travel-dreams-favorites`) so Shuffle can mark a dream
 * without a round-trip.
 *
 * A heart is one account request per place. A click while that request is in
 * flight keeps only the latest desired state and sends it when the current
 * request finishes, so saves cannot land out of order. A failed save puts the
 * place back to the last state the account confirmed.
 *
 * The Library copies this device's old hearts onto the account once: ids the
 * account does not already have, only ever turning hearts on. The device list
 * is left in place and marked migrated; a failed copy is tried again next load.
 */
import { notify } from '@/lib/notify';

const KEY = 'travel-dreams-favorites';
export const HEARTS_URL = '/api/library/hearts';

const SAVE_FAILED = "Couldn't save that heart. Try again in a moment.";
const REMOVE_FAILED = "Couldn't remove that heart. Try again in a moment.";
const BATCH = 1000;

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

function setDreamLocal(id: string, on: boolean): void {
  const s = read(KEY);
  if (on) s.add(id);
  else s.delete(id);
  write(KEY, s);
}

type Waiter = { on: boolean; resolve: (ok: boolean) => void };

type Lane = {
  confirmed: boolean;
  /** A write has landed, so the visible heart follows `confirmed` ahead of a stale account snapshot. */
  confirmedLocal: boolean;
  inflightOn: boolean | null;
  quiet: boolean;
  pending: boolean | null;
  pendingQuiet: boolean;
  waiters: Waiter[];
  inflightWaiters: Waiter[];
  drivesDevice: boolean;
  deviceRestore: boolean;
};

const lanes = new Map<string, Lane>();
let generation = 0;
let refreshUi: (() => void) | null = null;

export function resetHeartWriterForTests(): void {
  generation += 1;
  lanes.clear();
}

export function bindHeartUi(refresh: (() => void) | null): void {
  refreshUi = refresh;
}

function createLane(confirmed: boolean): Lane {
  return {
    confirmed,
    confirmedLocal: false,
    inflightOn: null,
    quiet: false,
    pending: null,
    pendingQuiet: false,
    waiters: [],
    inflightWaiters: [],
    drivesDevice: false,
    deviceRestore: false,
  };
}

function ensure(id: string, has: boolean): Lane {
  let lane = lanes.get(id);
  if (!lane) {
    lane = createLane(has);
    lanes.set(id, lane);
  }
  return lane;
}

function displayOverride(lane: Lane): boolean | null {
  if (lane.pending !== null) return lane.pending;
  if (lane.inflightOn !== null && !lane.quiet) return lane.inflightOn;
  if (lane.confirmedLocal) return lane.confirmed;
  return null;
}

/** Account hearts overlaid with any save that is in flight or already confirmed locally. */
export function visibleHeartIds(accountIds: Iterable<string>): Set<string> {
  const next = new Set(accountIds);
  for (const [id, lane] of lanes) {
    const over = displayOverride(lane);
    if (over === null) continue;
    if (over) next.add(id);
    else next.delete(id);
  }
  return next;
}

/** Records the account snapshot for places that do not have a newer local result. */
export function seedAccountHearts(ids: readonly string[]): void {
  const on = new Set(ids);
  for (const [id, lane] of lanes) {
    if (lane.inflightOn !== null || lane.pending !== null) continue;
    if (lane.confirmedLocal && on.has(id) === lane.confirmed) lane.confirmedLocal = false;
    if (!lane.confirmedLocal) lane.confirmed = on.has(id);
  }
  for (const id of on) if (!lanes.has(id)) lanes.set(id, createLane(true));
}

function publish(): void {
  refreshUi?.();
}

async function postHearts(placeIds: string[], on: boolean): Promise<{ httpOk: boolean; applied: Set<string> }> {
  const applied = new Set<string>();
  for (let i = 0; i < placeIds.length; i += BATCH) {
    const part = placeIds.slice(i, i + BATCH);
    let res: Response | undefined;
    try {
      res = await fetch(HEARTS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ placeIds: part, on }),
        keepalive: true,
      });
    } catch {
      return { httpOk: false, applied };
    }
    if (!res?.ok) return { httpOk: false, applied };
    const body = (await res.json().catch(() => null)) as { placeIds?: unknown } | null;
    if (Array.isArray(body?.placeIds)) {
      for (const id of body.placeIds) if (typeof id === 'string') applied.add(id);
    }
  }
  return { httpOk: true, applied };
}

type Follow = { on: boolean; quiet: boolean; ids: string[]; waiters: Map<string, Waiter[]> };

function runBatch(
  ids: string[],
  on: boolean,
  quiet: boolean,
  inherited: Map<string, Waiter[]> | null,
): Promise<{ httpOk: boolean; applied: Set<string> }> {
  const gen = generation;
  const started = new Map<string, Lane>();
  for (const id of ids) {
    const lane = lanes.get(id);
    if (!lane) continue;
    lane.inflightOn = on;
    lane.quiet = quiet;
    lane.inflightWaiters = inherited?.get(id) ?? [];
    started.set(id, lane);
  }
  if (!quiet) publish();
  return postHearts(ids, on).then((result) => {
    if (generation !== gen) {
      for (const lane of started.values()) {
        for (const w of [...lane.inflightWaiters, ...lane.waiters]) w.resolve(false);
        lane.inflightWaiters = [];
        lane.waiters = [];
      }
      return { httpOk: false, applied: new Set<string>() };
    }
    let toast = false;
    const follow: Follow[] = [];
    const bucketFor = (nextOn: boolean, nextQuiet: boolean): Follow => {
      let found = follow.find((b) => b.on === nextOn && b.quiet === nextQuiet);
      if (!found) {
        found = { on: nextOn, quiet: nextQuiet, ids: [], waiters: new Map() };
        follow.push(found);
      }
      return found;
    };
    for (const id of ids) {
      const lane = lanes.get(id);
      if (!lane || started.get(id) !== lane) continue;
      const landed = result.httpOk && result.applied.has(id);
      if (landed) {
        lane.confirmed = on;
        lane.confirmedLocal = true;
        if (lane.drivesDevice) lane.deviceRestore = on;
      }
      for (const w of lane.inflightWaiters) w.resolve(w.on === on ? landed : false);
      lane.inflightWaiters = [];
      const gesture = lane.pending;
      const waiters = lane.waiters.splice(0);
      const gestureQuiet = lane.pendingQuiet;
      lane.pending = null;
      const following = gesture !== null && !(landed && gesture === on);
      if (following) {
        const keep: Waiter[] = [];
        for (const w of waiters) {
          if (w.on === gesture) keep.push(w);
          else w.resolve(false);
        }
        lane.inflightOn = gesture;
        lane.quiet = gestureQuiet;
        const bucket = bucketFor(gesture, gestureQuiet);
        bucket.ids.push(id);
        bucket.waiters.set(id, keep);
        if (lane.drivesDevice) setDreamLocal(id, gesture);
        continue;
      }
      lane.inflightOn = null;
      lane.quiet = false;
      for (const w of waiters) w.resolve(gesture !== null && w.on === gesture);
      if (lane.drivesDevice) setDreamLocal(id, landed ? on : lane.deviceRestore);
      if (!landed && !quiet) toast = true;
    }
    if (toast) notify.error(on ? SAVE_FAILED : REMOVE_FAILED);
    publish();
    for (const bucket of follow) void runBatch(bucket.ids, bucket.on, bucket.quiet, bucket.waiters);
    return result;
  });
}

export type HeartWriteResult = { httpOk: boolean; ok: boolean };

export type HeartWriteOptions = {
  /** Background copy: no optimistic heart and no error toast. */
  quiet?: boolean;
  /** Also mirror the desired state onto this device's favorites, and put that back if the save fails. */
  device?: boolean;
  /** Account value used when a place has no lane yet. */
  has?: (id: string) => boolean;
};

/**
 * Saves `on` for each place. Places already saving remember this as their latest
 * desired state and send it when the current request finishes.
 */
export function writeHearts(ids: string[], on: boolean, opts?: HeartWriteOptions): Promise<HeartWriteResult> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return Promise.resolve({ httpOk: true, ok: true });
  const has = opts?.has ?? (() => false);
  const immediate: string[] = [];
  const pendingFlags: Promise<boolean>[] = [];
  for (const id of unique) {
    const lane = ensure(id, has(id));
    if (opts?.device) {
      if (lane.inflightOn === null) lane.deviceRestore = isDream(id);
      lane.drivesDevice = true;
      setDreamLocal(id, on);
    }
    if (lane.inflightOn !== null) {
      lane.pending = on;
      lane.pendingQuiet = !!opts?.quiet;
      pendingFlags.push(new Promise((resolve) => lane.waiters.push({ on, resolve })));
    } else {
      immediate.push(id);
    }
  }
  const batch = immediate.length
    ? runBatch(immediate, on, !!opts?.quiet, null).then((result) => ({
        httpOk: result.httpOk,
        ok: result.httpOk && immediate.every((id) => result.applied.has(id)),
      }))
    : Promise.resolve({ httpOk: true, ok: true });
  publish();
  return Promise.all([batch, Promise.all(pendingFlags)]).then(([batchResult, flags]) => ({
    httpOk: batchResult.httpOk && flags.every(Boolean),
    ok: batchResult.ok && flags.every(Boolean),
  }));
}

/** Hearts or un-hearts a place on this device at once, and on the account in the background. */
export function setDream(id: string, on: boolean): void {
  if (typeof fetch !== 'function') {
    setDreamLocal(id, on);
    return;
  }
  void writeHearts([id], on, { device: true });
}
