/**
 * The browser's copy of the Library index: fetched once per version from
 * `/api/library/index?v=<version>` (the browser's own HTTP cache keeps it
 * between visits) and held in memory so moving around the app and back costs
 * nothing.
 *
 * Stale while revalidating: when the page asks for a newer version, the older
 * copy stays on screen until the new one lands, so the Library never falls back
 * to its first screen after an edit.
 *
 * A successful response satisfies the *requested* `?v=` even when the body is
 * labelled with a newer version (the route's stale-`?v=` contract). Late
 * responses for an older request are ignored once a newer version has been
 * asked for.
 *
 * Edits patch the copy on screen instead of reloading the page (`beginMutation`).
 * What is shown is the last index fetched with the patches laid over it:
 *
 * - a patch is applied the moment the edit starts, so the page answers at once;
 * - when the server refuses the edit the patch comes off again (`rollback`);
 * - when the server takes it the patch stays on screen while the library is
 *   fetched again in the background (`revalidateIndex`: ask for the version,
 *   fetch the index only if it moved);
 * - a fetch replaces the patches that were committed before it started — the
 *   server had those edits when it answered — and leaves the rest on top.
 *
 * A fetch that only confirms what is on screen changes nothing on screen.
 */
import * as React from 'react';
import { applyPatch, sameValue, shareStructure, type IndexPatch } from './index-patch';
import { decodeIndex, type LibraryIndexContent } from './wire';

interface Entry {
  index: LibraryIndexContent | null;
  error: boolean;
}

interface PatchRecord {
  patch: IndexPatch;
  /** When the server took the edit, on the store's clock; null while it is still in flight. */
  committedAt: number | null;
}

const EMPTY: Entry = { index: null, error: false };

const entries = new Map<string, Entry>();
/** The last index fetched for each user: the server's word, before any patch. */
const bases = new Map<string, LibraryIndexContent>();
const patches = new Map<string, PatchRecord[]>();
/** Requested versions whose fetch completed successfully (body may be newer). */
const satisfied = new Map<string, Set<string>>();
const inflight = new Map<string, Promise<void>>();
/** Latest version each user has asked for; responses for anything else are dropped. */
const latestRequested = new Map<string, string>();
const revalidating = new Set<string>();
const revalidateAgain = new Set<string>();
const listeners = new Set<() => void>();
/** Orders fetch starts against commits: a fetch that began after a commit has that edit in it. */
let clock = 0;

function publish(userId: string, entry: Entry) {
  entries.set(userId, entry);
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function isHeld(userId: string, version: string): boolean {
  return bases.get(userId)?.version === version || (satisfied.get(userId)?.has(version) ?? false);
}

function markSatisfied(userId: string, ...versions: string[]) {
  const set = satisfied.get(userId) ?? new Set<string>();
  for (const v of versions) set.add(v);
  satisfied.set(userId, set);
}

/** The base with every patch that is still in force laid over it. */
function shownOf(userId: string): LibraryIndexContent | null {
  const base = bases.get(userId);
  if (!base) return null;
  return (patches.get(userId) ?? []).reduce((out, r) => applyPatch(out, r.patch), base);
}

function sameContent(a: LibraryIndexContent | null, b: LibraryIndexContent | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.items.length !== b.items.length) return false;
  return a.items.every((p, i) => p === b.items[i]) && sameValue(a.collections, b.collections);
}

/** Shows what the base and the patches now say, unless that is what is already shown. */
function show(userId: string, error?: boolean) {
  const prev = entries.get(userId) ?? EMPTY;
  const next = shownOf(userId);
  const index = sameContent(prev.index, next) ? prev.index : next;
  const nextError = error ?? prev.error;
  if (index === prev.index && nextError === prev.error) return;
  publish(userId, { index, error: nextError });
}

/** Takes a fetched index as the new base. `startedAt` is when its fetch began. */
function land(userId: string, requested: string, fetched: LibraryIndexContent, startedAt: number) {
  const prev = bases.get(userId);
  const shared = prev ? shareStructure(prev, fetched) : fetched;
  bases.set(userId, shared === prev ? { ...prev, version: fetched.version } : { ...shared, version: fetched.version });
  patches.set(
    userId,
    (patches.get(userId) ?? []).filter((r) => r.committedAt === null || r.committedAt > startedAt)
  );
  markSatisfied(userId, requested, fetched.version);
  show(userId, false);
}

async function fetchIndex(version: string): Promise<LibraryIndexContent> {
  const res = await fetch(`/api/library/index?v=${encodeURIComponent(version)}`);
  if (!res.ok) throw new Error(`Library index failed (${res.status})`);
  const index = decodeIndex(await res.json());
  if (!index) throw new Error('Library index had an unexpected shape');
  return index;
}

async function fetchVersion(): Promise<string> {
  const res = await fetch('/api/library/version');
  if (!res.ok) throw new Error(`Library version failed (${res.status})`);
  const body = (await res.json()) as { version?: unknown };
  if (typeof body.version !== 'string') throw new Error('Library version had an unexpected shape');
  return body.version;
}

/** Starts loading `version` unless it is already held or on its way. */
export function ensureIndex(userId: string, version: string): void {
  if (isHeld(userId, version)) return;
  const key = `${userId}:${version}`;
  if (inflight.has(key)) return;
  latestRequested.set(userId, version);
  const requested = version;
  const startedAt = ++clock;
  const run = fetchIndex(version)
    .then((index) => {
      if (latestRequested.get(userId) !== requested) return;
      land(userId, requested, index, startedAt);
    })
    .catch(() => {
      if (latestRequested.get(userId) !== requested) return;
      show(userId, true);
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, run);
}

/**
 * Brings the browser's copy up to the server's, in the background and without
 * touching what is on screen unless the library really differs: asks for the
 * current version, and fetches the index only when it is not the one held.
 * Calls that arrive while one is running are folded into one more run after it.
 * A failure leaves everything as it is; the next edit or page load tries again.
 */
export function revalidateIndex(userId: string): void {
  if (revalidating.has(userId)) {
    revalidateAgain.add(userId);
    return;
  }
  revalidating.add(userId);
  void (async () => {
    try {
      do {
        revalidateAgain.delete(userId);
        const startedAt = ++clock;
        try {
          const version = await fetchVersion();
          if (isHeld(userId, version)) {
            // The index held already is the server's: edits committed before this check are in it.
            patches.set(
              userId,
              (patches.get(userId) ?? []).filter((r) => r.committedAt === null || r.committedAt > startedAt)
            );
            show(userId);
          } else {
            latestRequested.set(userId, version);
            const index = await fetchIndex(version);
            if (latestRequested.get(userId) === version) land(userId, version, index, startedAt);
          }
        } catch {
          // Stay on what is shown.
        }
      } while (revalidateAgain.has(userId));
    } finally {
      revalidating.delete(userId);
    }
  })();
}

/** An edit that is showing on screen and waiting to hear from the server. */
export interface PendingMutation {
  /** The server took the edit: keep showing it, and fetch the library again in the background. */
  commit: () => void;
  /**
   * The server did not take it: take it off the screen. `keep` is the part of it that did land
   * (a bulk edit that failed after its first batches), which stays as if it had been committed.
   */
  rollback: (keep?: IndexPatch) => void;
}

/** Shows `patch` at once. A user whose index is not loaded yet has nothing to patch; the fetch that follows the commit brings the edit in. */
export function beginMutation(userId: string, patch: IndexPatch): PendingMutation {
  const record: PatchRecord = { patch, committedAt: null };
  patches.set(userId, [...(patches.get(userId) ?? []), record]);
  show(userId);
  let settled = false;
  return {
    commit: () => {
      if (settled) return;
      settled = true;
      record.committedAt = ++clock;
      revalidateIndex(userId);
    },
    rollback: (keep) => {
      if (settled) return;
      settled = true;
      if (keep) {
        record.patch = keep;
        record.committedAt = ++clock;
      } else {
        patches.set(
          userId,
          (patches.get(userId) ?? []).filter((r) => r !== record)
        );
      }
      show(userId);
      // The edit may have half landed; look.
      revalidateIndex(userId);
    },
  };
}

/** Forgets everything held: sign-out, and tests. */
export function clearLibraryIndex(): void {
  entries.clear();
  bases.clear();
  patches.clear();
  satisfied.clear();
  inflight.clear();
  latestRequested.clear();
  revalidating.clear();
  revalidateAgain.clear();
  listeners.forEach((l) => l());
}

/**
 * The index for this user, as new as the page asked for when it is held, the
 * previous one while that loads, and null until the first one arrives. The
 * server renders the null case, so hydration matches.
 */
export function useLibraryIndex(userId: string, version: string): { index: LibraryIndexContent | null; error: boolean; retry: () => void } {
  const entry = React.useSyncExternalStore(
    subscribe,
    () => entries.get(userId) ?? EMPTY,
    () => EMPTY
  );
  const held = isHeld(userId, version);
  React.useEffect(() => {
    if (!held) ensureIndex(userId, version);
  }, [userId, version, held]);
  const retry = React.useCallback(() => {
    show(userId, false);
    ensureIndex(userId, version);
  }, [userId, version]);
  return { index: entry.index, error: entry.error && !held, retry };
}
