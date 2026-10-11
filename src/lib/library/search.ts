/**
 * The Library's own search: every word of the query has to match somewhere in
 * the place, in any order, forgiving accents and a typo or two.
 *
 * Fuse (used by the Archive) matches the whole query against each field, so
 * "ramen tokyo" finds nothing — no single field contains both words — and it
 * does not fold accents. This index is per word instead: each query word looks
 * for its best match across the place's fields (exact word, word prefix,
 * substring, then a bounded edit distance), and a place is a hit only when
 * every word found one. Pure and client-safe; built once per item list.
 */
import { kindLabel } from '@/components/explore/kind-icon';
import type { LibraryItem } from './types';

export type SearchField =
  | 'name'
  | 'altNames'
  | 'city'
  | 'country'
  | 'kind'
  | 'tags'
  | 'cuisine'
  | 'vibes'
  | 'recommendedBy'
  | 'notes'
  | 'description'
  | 'address'
  | 'activities'
  | 'amenities'
  | 'practicalInfo';

const WEIGHTS: Record<SearchField, number> = {
  name: 5,
  altNames: 4,
  city: 4,
  country: 3.5,
  tags: 3,
  kind: 3,
  cuisine: 2.5,
  vibes: 2,
  recommendedBy: 2,
  notes: 1.5,
  description: 1,
  address: 1,
  activities: 1,
  amenities: 0.5,
  practicalInfo: 0.5,
};

/** How a field reads in "matched in …" hints. Name, city and country explain themselves. */
export const FIELD_HINT: Partial<Record<SearchField, string>> = {
  altNames: 'also known as',
  kind: 'kind',
  tags: 'tag',
  cuisine: 'cuisine',
  vibes: 'vibe',
  recommendedBy: 'tip from',
  notes: 'your note',
  description: 'description',
  address: 'address',
  activities: 'activities',
  amenities: 'amenities',
  practicalInfo: 'practical info',
};

/** Lower case, accents folded (é → e, ü → u, ø → o), anything but letters and digits a space. */
export function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ø/gi, 'o')
    .replace(/æ/gi, 'ae')
    .replace(/ß/g, 'ss')
    .replace(/ł/gi, 'l')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

export function tokenize(query: string): string[] {
  return [...new Set(normalize(query).split(' ').filter(Boolean))];
}

interface IndexedField {
  field: SearchField;
  weight: number;
  words: string[];
  /** The whole field, normalized, for substrings that span a word boundary. */
  text: string;
}

export interface SearchDoc {
  id: string;
  fields: IndexedField[];
}

export interface SearchIndex {
  docs: SearchDoc[];
}

function fieldValues(p: LibraryItem): Array<[SearchField, string | null | undefined | string[]]> {
  return [
    ['name', p.name],
    ['altNames', p.altNames],
    ['city', p.city],
    ['country', p.country],
    ['kind', [p.kind, kindLabel(p.kind)]],
    ['tags', p.tags],
    ['cuisine', p.cuisine],
    ['vibes', p.vibes],
    ['recommendedBy', p.recommendedBy],
    ['notes', p.notes],
    ['description', p.description],
    ['address', p.address],
    ['activities', p.activities],
    ['amenities', p.amenities],
    ['practicalInfo', p.practicalInfo],
  ];
}

export function buildSearchIndex(items: LibraryItem[]): SearchIndex {
  return {
    docs: items.map((p) => ({
      id: p.id,
      fields: fieldValues(p).flatMap(([field, value]) => {
        const raw = Array.isArray(value) ? value.join(' ') : value ?? '';
        const text = normalize(raw);
        if (!text) return [];
        return [{ field, weight: WEIGHTS[field], words: [...new Set(text.split(' '))], text }];
      }),
    })),
  };
}

/** Damerau–Levenshtein (optimal string alignment), stopping early past `max`. */
export function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const rows: number[][] = [];
  for (let i = 0; i <= a.length; i++) rows.push([i]);
  for (let j = 1; j <= b.length; j++) rows[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    let rowMin = Infinity;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, rows[i - 2][j - 2] + 1);
      rows[i][j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
  }
  return rows[a.length][b.length];
}

/** Typos forgiven for a word of this length: none under 4 letters, one up to 7, two after. */
export function typoBudget(token: string): number {
  if (token.length < 4) return 0;
  return token.length < 8 ? 1 : 2;
}

/** How well one query word matches one indexed word: 0 (no match) to 1 (the same word). */
function wordScore(token: string, word: string): number {
  if (word === token) return 1;
  if (word.startsWith(token)) return 0.85;
  if (token.length >= 3 && word.includes(token)) return 0.6;
  const budget = typoBudget(token);
  if (!budget || word.length < 3) return 0;
  // Compare against the word and against its prefixes around the query's length,
  // so "kyto" finds "kyoto" and "sevile" finds "sevilla" as you type.
  let best = budget + 1;
  for (const candidate of [word, word.slice(0, token.length), word.slice(0, token.length + 1), word.slice(0, token.length - 1)]) {
    if (candidate.length < 3) continue;
    best = Math.min(best, editDistance(token, candidate, budget));
    if (best === 1) break;
  }
  return best <= budget ? 0.45 - 0.1 * (best - 1) : 0;
}

/**
 * Words repeat across places (cities, countries, tags), so each query word
 * scores each distinct indexed word once per search rather than once per place.
 */
type Scorer = (word: string) => number;

function scorer(token: string): Scorer {
  const memo = new Map<string, number>();
  return (word) => {
    let v = memo.get(word);
    if (v === undefined) {
      v = wordScore(token, word);
      memo.set(word, v);
    }
    return v;
  };
}

function tokenMatch(token: string, score: Scorer, doc: SearchDoc): { score: number; field: SearchField } | null {
  let best: { score: number; field: SearchField } | null = null;
  for (const f of doc.fields) {
    let s = 0;
    for (const w of f.words) {
      const ws = score(w);
      if (ws > s) s = ws;
      if (s === 1) break;
    }
    // "new york" style tokens are single words, but a multi-word field ("mexico city")
    // should still count a substring that spans its words.
    if (!s && token.length >= 3 && f.text.includes(token)) s = 0.55;
    if (s && (!best || s * f.weight > best.score)) best = { score: s * f.weight, field: f.field };
  }
  return best;
}

export interface SearchHit {
  id: string;
  score: number;
  /** The field that explains the match: a non-obvious one (tag, note…) when any word matched there. */
  field: SearchField;
}

/** Every place where all query words match, best first. */
export function searchLibrary(index: SearchIndex, query: string): SearchHit[] {
  const tokens = tokenize(query);
  if (!tokens.length) return [];
  const scorers = tokens.map(scorer);
  const hits: SearchHit[] = [];
  for (const doc of index.docs) {
    let total = 0;
    let field: SearchField = 'name';
    let fieldScore = -1;
    let ok = true;
    for (const [i, t] of tokens.entries()) {
      const m = tokenMatch(t, scorers[i], doc);
      if (!m) {
        ok = false;
        break;
      }
      total += m.score;
      // The hint names the field that isn't obvious from the result row ("matched tag",
      // "matched your note"); name, city and country already show on it.
      const hinted = FIELD_HINT[m.field] !== undefined;
      const current = FIELD_HINT[field] !== undefined;
      if ((hinted && !current) || (hinted === current && m.score > fieldScore)) {
        fieldScore = m.score;
        field = m.field;
      }
    }
    if (ok) hits.push({ id: doc.id, score: total, field });
  }
  return hits.sort((a, b) => b.score - a.score);
}

/** Does a facet value (a country, a tag…) answer the query? Used for "Filter to …" suggestions. */
export function matchesValue(query: string, value: string): boolean {
  const tokens = tokenize(query);
  if (!tokens.length) return false;
  const words = normalize(value).split(' ');
  return tokens.every((t) => words.some((w) => wordScore(t, w) > 0));
}
