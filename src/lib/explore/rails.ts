/**
 * Explore's themed rails. Every rail is a pure rule over the user's own saved
 * places — no new columns, no LLM calls, no writes. A rail that would have
 * fewer than MIN_RAIL places is dropped rather than shown thin.
 *
 * Ordering is deterministic per calendar day (seeded by the date), so the page
 * feels alive day to day without reshuffling under the user on every refresh.
 */
import { MONTH_NAMES } from './best-time';
import { slugify } from './geo';
import type { ExplorePlace, Rail, RailGroup, RailShape } from './types';

export const MIN_RAIL = 4;
export const MAX_RAIL = 18;
/** Rails on the home page; the rest wait in "Browse all", rotating in day by day. */
export const HOME_RAILS = 12;

const FOOD_KINDS = new Set(['restaurant', 'cafe', 'bar', 'market']);

function has(p: ExplorePlace, ...vibes: string[]): boolean {
  return p.vibes.some((v) => vibes.includes(v.toLowerCase()));
}

const notVisited = (p: ExplorePlace) => p.visitStatus !== 'visited';
const byPriority = (a: ExplorePlace, b: ExplorePlace) =>
  b.priority - a.priority || Number(b.photos.length > 0) - Number(a.photos.length > 0) || a.name.localeCompare(b.name);

/** mulberry32 — tiny seeded PRNG, so "today's order" is stable for a day. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function daySeed(now: Date): number {
  return now.getUTCFullYear() * 1000 + Math.floor((now.getTime() - Date.UTC(now.getUTCFullYear(), 0, 1)) / 864e5);
}

function shuffled<T>(items: T[], rand: () => number): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function monthsAgo(iso: string, now: Date): number {
  const d = new Date(iso.includes('T') ? iso : `${iso.replace(' ', 'T')}Z`);
  return (now.getTime() - d.getTime()) / (30.44 * 864e5);
}

export function savedAgoLabel(iso: string, now: Date): string {
  const m = monthsAgo(iso, now);
  if (m < 1) return 'Saved this month';
  if (m < 12) return `Saved ${Math.round(m)} month${Math.round(m) === 1 ? '' : 's'} ago`;
  const y = m / 12;
  return y < 1.5 ? 'Saved a year ago' : `Saved ${Math.round(y)} years ago`;
}

/** "Sarah" / "Mom" read as people; handles and publications read as sources. */
function recommenderEyebrow(name: string): string {
  if (name.startsWith('@') || /instagram|tiktok|youtube/i.test(name)) return 'From your feed';
  if (/^[A-Z][a-z]+$/.test(name.trim())) return 'From a friend';
  return 'From your reading';
}

interface Theme {
  id: string;
  title: string;
  eyebrow: string;
  blurb: string;
  shape?: RailShape;
  group?: RailGroup;
  test: (p: ExplorePlace) => boolean;
}

const THEMES: Theme[] = [
  { id: 'beach', title: 'Beach vibes', eyebrow: 'Salt water', blurb: 'Coves, cliffs and turquoise water you saved for later.',
    test: (p) => p.kind === 'beach' || has(p, 'beach', 'turquoise', 'swimming', 'coastal') },
  { id: 'golden-hour', title: 'Golden hour', eyebrow: 'Best at sunset', blurb: 'Places that are at their best when the light goes gold.',
    test: (p) => p.bestTime.times.includes('sunset') || has(p, 'sunset') },
  { id: 'sunrise', title: 'Worth the early alarm', eyebrow: 'Sunrise club', blurb: 'Go at dawn, before anyone else is awake.',
    test: (p) => p.bestTime.times.includes('sunrise') || has(p, 'sunrise') },
  { id: 'after-dark', title: 'After dark', eyebrow: 'Night owls', blurb: 'Tiny bars, neon streets and late-night food.',
    test: (p) => p.bestTime.times.includes('night') || has(p, 'nightlife', 'neon') },
  { id: 'hidden-gems', title: 'Hidden gems', eyebrow: 'Off the postcard', blurb: 'The ones most people walk straight past.',
    test: (p) => has(p, 'hidden-gem') },
  { id: 'wild', title: 'Into the wild', eyebrow: 'Boots on', shape: 'landscape', blurb: 'Glaciers, canyons, trails and big open sky.',
    test: (p) => p.kind === 'natural' || has(p, 'hiking', 'adventure', 'wild', 'glacier') },
  { id: 'culture', title: 'Rainy-day culture', eyebrow: 'Museums & bookshops', blurb: 'For the afternoons the weather has other plans.',
    test: (p) => ['museum', 'gallery'].includes(p.kind) || has(p, 'art', 'books') },
  { id: 'romantic', title: 'Somewhere romantic', eyebrow: 'For two', blurb: 'Saved with someone in mind.',
    test: (p) => has(p, 'romantic') },
  { id: 'icons', title: 'The icons', eyebrow: 'Once in a lifetime', shape: 'landscape', blurb: 'The postcard places. Go anyway.',
    test: (p) => has(p, 'iconic') },
  { id: 'views', title: 'Views for days', eyebrow: 'Look out', blurb: 'Viewpoints, rooftops and the long way up.',
    test: (p) => p.kind === 'viewpoint' || has(p, 'views') },
];

export function buildRails(all: ExplorePlace[], now: Date): Rail[] {
  const rand = seededRandom(daySeed(now));
  const rails: Rail[] = [];
  const push = (r: Omit<Rail, 'places'> & { places: ExplorePlace[] }) => {
    if (r.places.length >= MIN_RAIL) rails.push({ ...r, places: r.places.slice(0, MAX_RAIL) });
  };
  const open = all.filter(notVisited);

  // 1. Timely: this month and next. Year-round places say nothing timely, so
  //    they only count when the text also names months.
  const month = now.getMonth() + 1;
  const next = (month % 12) + 1;
  const goodIn = (m: number) => open.filter((p) => p.bestTime.months.includes(m)).sort(byPriority);
  const nowList = goodIn(month);
  push({
    id: `month-${month}`, title: `Good to visit in ${MONTH_NAMES[month - 1]}`, eyebrow: 'Right time, right place',
    blurb: `Everything you saved that is in season right now.`, shape: 'landscape', group: 'timing', places: nowList,
  });
  const nowIds = new Set(nowList.map((p) => p.id));
  push({
    id: `month-${next}`, title: `Good to visit in ${MONTH_NAMES[next - 1]}`, eyebrow: 'Plan ahead',
    blurb: `In season next month — still time to book.`, shape: 'poster', group: 'timing', places: goodIn(next).filter((p) => !nowIds.has(p.id)),
  });

  // 2. Forgotten: saved over a year ago and never visited, oldest first.
  push({
    id: 'forgotten', title: 'Saved long ago, never visited', eyebrow: 'Still dreaming',
    blurb: 'Remember these? You saved them over a year ago.', shape: 'poster', group: 'timing',
    places: open.filter((p) => monthsAgo(p.createdAt, now) >= 12).sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
  });

  // 2b. On this day: saved within two weeks of today's date, in an earlier year.
  const dayOfYear = (d: Date) => Math.floor((Date.UTC(2001, d.getUTCMonth(), d.getUTCDate()) - Date.UTC(2001, 0, 1)) / 864e5);
  const today = dayOfYear(now);
  push({
    id: 'on-this-day', title: 'Saved this time of year', eyebrow: 'On this day',
    blurb: 'Places you saved around this date in years past.', shape: 'poster', group: 'timing',
    places: all
      .filter((p) => {
        const d = new Date(p.createdAt.includes('T') ? p.createdAt : `${p.createdAt.replace(' ', 'T')}Z`);
        const diff = Math.abs(dayOfYear(d) - today);
        return d.getUTCFullYear() < now.getUTCFullYear() && Math.min(diff, 365 - diff) <= 14;
      })
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
  });

  // 3. Recommended by <person>: anyone who put enough places on your radar.
  const byRec = new Map<string, { name: string; places: ExplorePlace[] }>();
  for (const p of all) {
    const name = p.recommendedBy?.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    const entry = byRec.get(key) ?? { name, places: [] };
    entry.places.push(p);
    byRec.set(key, entry);
  }
  const recs = [...byRec.values()].filter((r) => r.places.length >= MIN_RAIL).sort((a, b) => b.places.length - a.places.length);
  // Every recommender gets a rail; today's order mixes the top five so the home page rotates.
  for (const r of [...shuffled(recs.slice(0, 5), rand), ...recs.slice(5)]) {
    push({
      id: `rec-${slugify(r.name)}`, title: `Recommended by ${r.name}`, eyebrow: recommenderEyebrow(r.name),
      blurb: `${r.places.length} places ${r.name} put on your radar.`, shape: 'poster', group: 'people', places: [...r.places].sort(byPriority),
    });
  }

  // 4. "Because you saved X": a daily seed place, and others sharing 2+ vibes elsewhere.
  const seeds = shuffled(open.filter((p) => p.priority >= 4 && p.photos.length && p.vibes.length >= 3), rand);
  for (const seed of seeds) {
    const rail = likeRail(seed, all);
    if (rail) {
      push(rail);
      break;
    }
  }

  // 5. Food spots in <country>, hungriest country first.
  const food = new Map<string, ExplorePlace[]>();
  for (const p of all) {
    if (!p.country || !(FOOD_KINDS.has(p.kind) || has(p, 'foodie', 'street-food'))) continue;
    food.set(p.country, [...(food.get(p.country) ?? []), p]);
  }
  for (const [country, list] of [...food].sort((a, b) => b[1].length - a[1].length)) {
    push({
      id: `food-${slugify(country)}`, title: `Food spots in ${country}`, eyebrow: 'Hungry?',
      blurb: `Markets, counters and tables you saved in ${country}.`, shape: 'poster', group: 'food', places: list.sort(byPriority),
    });
  }

  // 6. Mood rails, in today's order.
  for (const t of shuffled(THEMES, rand)) {
    push({
      id: t.id, title: t.title, eyebrow: t.eyebrow, blurb: t.blurb, shape: t.shape ?? 'poster', group: t.group ?? 'moods',
      places: all.filter(t.test).sort(byPriority),
    });
  }

  // 7. Bookends.
  push({
    id: 'bucket-list', title: 'Your bucket list', eyebrow: 'Top priority', blurb: 'The ones you marked as must-do.', shape: 'landscape', group: 'list',
    places: open.filter((p) => p.priority >= 5).sort(byPriority),
  });
  push({
    id: 'recent', title: 'Freshly saved', eyebrow: 'New in', blurb: 'The latest additions to your saves.', shape: 'poster', group: 'list',
    places: [...all].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 12),
  });
  push({
    id: 'been-there', title: "Places you've been", eyebrow: 'Memory lane', blurb: 'Already lived these. Worth going back?', shape: 'poster', group: 'list',
    places: all.filter((p) => p.visitStatus === 'visited'),
  });

  return rails;
}

function likeRail(seed: ExplorePlace, all: ExplorePlace[]): Rail | null {
  const sv = new Set(seed.vibes);
  const similar = all
    .filter((p) => p.id !== seed.id && p.city !== seed.city)
    .map((p) => ({ p, score: p.vibes.filter((v) => sv.has(v)).length + (p.kind === seed.kind ? 1 : 0) }))
    .filter((x) => x.score >= 2)
    .sort((a, b) => b.score - a.score || byPriority(a.p, b.p))
    .map((x) => x.p);
  if (similar.length < MIN_RAIL) return null;
  return {
    id: `like-${seed.id}`, title: `Because you saved ${seed.name}`, eyebrow: 'More like this',
    blurb: `Same feeling as ${seed.name}, somewhere else in the world.`, shape: 'landscape', group: 'moods',
    places: [seed, ...similar].slice(0, MAX_RAIL),
  };
}

/**
 * The rail behind /explore/r/[id]. A "Because you saved X" link keeps working
 * after the daily seed moves on, as long as X still has enough look-alikes.
 */
export function findRail(all: ExplorePlace[], id: string, now: Date): Rail | null {
  const rail = buildRails(all, now).find((r) => r.id === id);
  if (rail) return rail;
  if (!id.startsWith('like-')) return null;
  const seed = all.find((p) => `like-${p.id}` === id);
  return seed ? likeRail(seed, all) : null;
}

/**
 * The caption under a card explains *why it is in this rail* — never the
 * location, which the card already shows above the name.
 */
export function captionFor(rail: Rail, p: ExplorePlace, now: Date): string {
  if (rail.id.startsWith('month-') || rail.id === 'golden-hour' || rail.id === 'sunrise' || rail.id === 'after-dark') {
    return p.bestTimeText ?? '';
  }
  if (rail.id === 'forgotten' || rail.id === 'on-this-day') return savedAgoLabel(p.createdAt, now);
  if (rail.id.startsWith('like-')) return p.vibes.slice(0, 3).map((v) => v.replace(/-/g, ' ')).join(' · ');
  return firstSentence(p.notes ?? p.description) || p.bestTimeText || '';
}

function firstSentence(text: string | null): string {
  if (!text) return '';
  const m = text.match(/^.+?[.!?](\s|$)/);
  return (m ? m[0] : text).trim();
}

export function toRailRef(rail: Rail, now: Date): import('./types').RailRef {
  const { places: list, ...rest } = rail;
  return {
    ...rest,
    placeIds: list.map((p) => p.id),
    captions: Object.fromEntries(list.map((p) => [p.id, captionFor(rail, p, now)])),
  };
}

// The home page is a fixed rhythm of slots, so a big library never turns into
// twelve recommender rails in a row. Each slot takes the next unused rail that
// fits; empty slots collapse. Anything left over lives in "Browse all".
type Slotted = Pick<Rail, 'id' | 'group'>;

const HOME_SLOTS: Array<(r: Slotted) => boolean> = [
  (r) => r.id.startsWith('month-'),
  (r) => r.id.startsWith('like-'),
  (r) => r.id === 'forgotten',
  (r) => r.id.startsWith('rec-'),
  (r) => r.group === 'moods',
  (r) => r.id === 'on-this-day',
  (r) => r.group === 'food',
  (r) => r.group === 'moods',
  (r) => r.id.startsWith('month-'),
  (r) => r.id.startsWith('rec-'),
  (r) => r.group === 'moods',
  (r) => r.id === 'bucket-list',
  (r) => r.group === 'moods',
  (r) => r.group === 'food',
  (r) => r.id.startsWith('rec-'),
  (r) => r.group === 'moods',
];

export function homeRails<T extends Slotted>(rails: T[], limit = HOME_RAILS): T[] {
  const used = new Set<string>();
  const out: T[] = [];
  for (const slot of HOME_SLOTS) {
    if (out.length >= limit) break;
    const rail = rails.find((r) => !used.has(r.id) && slot(r));
    if (!rail) continue;
    used.add(rail.id);
    out.push(rail);
  }
  return out;
}

export type RailOrder = 'top' | 'newest' | 'shuffle';

/** Countries in a rail, most places first: the opened row's quick filter chips. */
export function countriesIn(list: ExplorePlace[]): Array<{ country: string; count: number }> {
  const counts = new Map<string, number>();
  for (const p of list) if (p.country) counts.set(p.country, (counts.get(p.country) ?? 0) + 1);
  return [...counts]
    .map(([country, count]) => ({ country, count }))
    .sort((a, b) => b.count - a.count || a.country.localeCompare(b.country));
}

/** "Top" keeps the rail's own order; "Shuffle" is a fresh order per seed. */
export function orderRail(list: ExplorePlace[], order: RailOrder, seed = 0): ExplorePlace[] {
  if (order === 'newest') return [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  if (order === 'shuffle') return shuffled(list, seededRandom(seed));
  return list;
}
