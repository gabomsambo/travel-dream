/**
 * Turns the free-text `places.best_time` column into structured hints.
 *
 * The column is whatever the extraction LLM wrote (max 100 chars): "summer",
 * "November to March", "Sunset, May to October", "Dry season (Nov–Apr)",
 * "Early morning, year-round". Explore needs two things from it: which months
 * a place is good in (for the seasonal rails) and which time of day (for the
 * sunrise / golden-hour / after-dark rails).
 *
 * Explicit months always beat season words, so "dry season (November–April)"
 * is Nov–Apr rather than a guess about which dry season was meant. Season
 * words are flipped for the southern hemisphere when coordinates say so:
 * "summer" at Boulders Beach means December, not July.
 */

export type DayTime = 'sunrise' | 'morning' | 'sunset' | 'night';

export interface BestTime {
  /** 1–12, sorted, de-duplicated. Empty when the text names no season or month. */
  months: number[];
  /** "year-round" / "any time" — good every month, but says nothing *timely*. */
  yearRound: boolean;
  times: DayTime[];
}

const MONTHS: Array<[RegExp, number]> = [
  [/\bjan(uary)?\b/, 1], [/\bfeb(ruary)?\b/, 2], [/\bmar(ch)?\b/, 3], [/\bapr(il)?\b/, 4],
  [/\bmay\b/, 5], [/\bjun(e)?\b/, 6], [/\bjul(y)?\b/, 7], [/\baug(ust)?\b/, 8],
  [/\bsep(t|tember)?\b/, 9], [/\boct(ober)?\b/, 10], [/\bnov(ember)?\b/, 11], [/\bdec(ember)?\b/, 12],
];

const SEASONS: Array<[RegExp, number[]]> = [
  [/\bspring\b/, [3, 4, 5]],
  [/\bsummer\b/, [6, 7, 8]],
  // "fall" but not "rain fall" / "snowfall" (the Pantheon row says "watch rain fall").
  [/\bautumn\b|(?<!(rain|snow|water)\s?)\bfall\b/, [9, 10, 11]],
  [/\bwinter\b/, [12, 1, 2]],
  [/\b(cherry blossom|hanami|sakura)/, [3, 4]],
  [/\b(momiji|autumn leaves|fall foliage)/, [11]],
  [/\bchristmas\b/, [12]],
];

const TIMES: Array<[RegExp, DayTime]> = [
  [/\b(sunrise|dawn|daybreak|first light)\b/, 'sunrise'],
  [/\b(early morning|mornings?|opening time|at opening|first entry|first bus|first slot)\b/, 'morning'],
  [/\b(sunset|dusk|golden hour)\b/, 'sunset'],
  [/\b(night|late night|evening|after dark|nightlife)\b/, 'night'],
];

const MONTH_ALT = 'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?';
const RANGE = new RegExp(`\\b(${MONTH_ALT})\\b(?:\\s*(?:-|–|—|to|through|until)\\s*(?:early |mid-?|late )?)\\b(${MONTH_ALT})\\b`, 'g');

function monthOf(token: string): number {
  return MONTHS.find(([re]) => re.test(token))?.[1] ?? 0;
}

/** Inclusive month range that may wrap the year: Nov..Mar -> 11,12,1,2,3. */
export function monthSpan(from: number, to: number): number[] {
  const out: number[] = [];
  for (let m = from; ; m = (m % 12) + 1) {
    out.push(m);
    if (m === to || out.length > 12) break;
  }
  return out;
}

export function parseBestTime(text: string | null | undefined, lat?: number | null): BestTime {
  const empty: BestTime = { months: [], yearRound: false, times: [] };
  if (!text) return empty;
  const t = text.toLowerCase();

  const months = new Set<number>();
  // Ranges first ("November to March"), then any lone month left over.
  let rest = t;
  for (const m of t.matchAll(RANGE)) {
    monthSpan(monthOf(m[1]), monthOf(m[2])).forEach((x) => months.add(x));
    rest = rest.replace(m[0], ' ');
  }
  for (const [re, n] of MONTHS) if (re.test(rest)) months.add(n);

  if (months.size === 0) {
    const southern = typeof lat === 'number' && lat < -10;
    for (const [re, ms] of SEASONS) {
      if (!re.test(t)) continue;
      const flipSeason = southern && !/blossom|hanami|sakura|momiji|leaves|foliage|christmas/.test(re.source);
      for (const m of ms) months.add(flipSeason ? ((m + 5) % 12) + 1 : m);
    }
  }

  const yearRound = /\b(year[- ]round|all year|any ?time|every season)\b/.test(t);
  const times = TIMES.filter(([re]) => re.test(t)).map(([, d]) => d);

  return { months: [...months].sort((a, b) => a - b), yearRound, times: [...new Set(times)] };
}

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
