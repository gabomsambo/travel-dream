/**
 * Client-side "dreams" (hearts) from Shuffle. Shares the storage key with the
 * Library's FavoriteManager (`src/lib/place-card-helpers.ts`) so a heart in one
 * is a heart in the other.
 */
const KEY = 'travel-dreams-favorites';

function read(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(KEY) ?? '[]'));
  } catch {
    return new Set();
  }
}

function write(s: Set<string>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify([...s]));
  } catch {
    /* storage blocked: the heart just won't persist */
  }
}

export function isDream(id: string): boolean {
  return read().has(id);
}

export function setDream(id: string, on: boolean): void {
  const s = read();
  if (on) s.add(id);
  else s.delete(id);
  write(s);
}
