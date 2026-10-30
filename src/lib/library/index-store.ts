/**
 * The browser's copy of the Library index: fetched once per version from
 * `/api/library/index?v=<version>` (the browser's own HTTP cache keeps it
 * between visits) and held in memory so moving around the app and back costs
 * nothing.
 *
 * Stale while revalidating: when the page asks for a newer version, the older
 * copy stays on screen until the new one lands, so the Library never falls back
 * to its first screen after an edit.
 */
import * as React from 'react';
import { decodeIndex, type LibraryIndexContent } from './wire';

interface Entry {
  index: LibraryIndexContent | null;
  error: boolean;
}

const EMPTY: Entry = { index: null, error: false };

const entries = new Map<string, Entry>();
const inflight = new Map<string, Promise<void>>();
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

async function fetchIndex(version: string): Promise<LibraryIndexContent> {
  const res = await fetch(`/api/library/index?v=${encodeURIComponent(version)}`);
  if (!res.ok) throw new Error(`Library index failed (${res.status})`);
  const index = decodeIndex(await res.json());
  if (!index) throw new Error('Library index had an unexpected shape');
  return index;
}

/** Starts loading `version` unless it is already held or on its way. */
export function ensureIndex(userId: string, version: string): void {
  const held = entries.get(userId);
  if (held?.index?.version === version) return;
  const key = `${userId}:${version}`;
  if (inflight.has(key)) return;
  const run = fetchIndex(version)
    .then((index) => publish(userId, { index, error: false }))
    .catch(() => publish(userId, { index: entries.get(userId)?.index ?? null, error: true }))
    .finally(() => inflight.delete(key));
  inflight.set(key, run);
}

/** Forgets everything held: sign-out, and tests. */
export function clearLibraryIndex(): void {
  entries.clear();
  inflight.clear();
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
  const held = entry.index?.version === version;
  React.useEffect(() => {
    if (!held) ensureIndex(userId, version);
  }, [userId, version, held]);
  const retry = React.useCallback(() => {
    publish(userId, { index: entries.get(userId)?.index ?? null, error: false });
    ensureIndex(userId, version);
  }, [userId, version]);
  return { index: entry.index, error: entry.error && !held, retry };
}
