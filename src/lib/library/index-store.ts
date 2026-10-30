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
 */
import * as React from 'react';
import { decodeIndex, type LibraryIndexContent } from './wire';

interface Entry {
  index: LibraryIndexContent | null;
  error: boolean;
  /** Requested versions whose fetch completed successfully (body may be newer). */
  satisfied: ReadonlySet<string>;
}

const EMPTY_SATISFIED: ReadonlySet<string> = new Set();
const EMPTY: Entry = { index: null, error: false, satisfied: EMPTY_SATISFIED };

const entries = new Map<string, Entry>();
const inflight = new Map<string, Promise<void>>();
/** Latest version each user has asked for; responses for anything else are dropped. */
const latestRequested = new Map<string, string>();
const listeners = new Set<() => void>();

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

function isHeld(entry: Entry | undefined, version: string): boolean {
  if (!entry) return false;
  return entry.index?.version === version || entry.satisfied.has(version);
}

async function fetchIndex(version: string): Promise<LibraryIndexContent> {
  const res = await fetch(`/api/library/index?v=${encodeURIComponent(version)}`);
  if (!res.ok) throw new Error(`Library index failed (${res.status})`);
  const index = decodeIndex(await res.json());
  if (!index) throw new Error('Library index had an unexpected shape');
  return index;
}

/** Starts loading `version` unless it is already held or on its way. */
export function ensureIndex(userId: string, version: string): void {
  if (isHeld(entries.get(userId), version)) return;
  const key = `${userId}:${version}`;
  if (inflight.has(key)) return;
  latestRequested.set(userId, version);
  const requested = version;
  const run = fetchIndex(version)
    .then((index) => {
      if (latestRequested.get(userId) !== requested) return;
      const prev = entries.get(userId);
      const satisfied = new Set(prev?.satisfied ?? EMPTY_SATISFIED);
      satisfied.add(requested);
      publish(userId, { index, error: false, satisfied });
    })
    .catch(() => {
      if (latestRequested.get(userId) !== requested) return;
      const prev = entries.get(userId);
      publish(userId, {
        index: prev?.index ?? null,
        error: true,
        satisfied: prev?.satisfied ?? EMPTY_SATISFIED,
      });
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, run);
}

/** Forgets everything held: sign-out, and tests. */
export function clearLibraryIndex(): void {
  entries.clear();
  inflight.clear();
  latestRequested.clear();
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
  const held = isHeld(entry, version);
  React.useEffect(() => {
    if (!held) ensureIndex(userId, version);
  }, [userId, version, held]);
  const retry = React.useCallback(() => {
    const prev = entries.get(userId);
    publish(userId, {
      index: prev?.index ?? null,
      error: false,
      satisfied: prev?.satisfied ?? EMPTY_SATISFIED,
    });
    ensureIndex(userId, version);
  }, [userId, version]);
  return { index: entry.index, error: entry.error && !held, retry };
}
