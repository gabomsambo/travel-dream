/**
 * The billboard at the top of Explore: five picks for today, each chosen for a
 * different reason so the hero tells five different stories — in season now,
 * saved long ago, a must-do, a friend's tip, and a wildcard. Photo-first, at
 * most one per country, stable for the day.
 */
import { daySeed, monthsAgo, savedAgoLabel, seededRandom } from './rails';
import type { ExplorePlace, FeaturedPick } from './types';

export const FEATURED_COUNT = 5;

const open = (p: ExplorePlace) => p.visitStatus !== 'visited';

export function pickFeatured(places: ExplorePlace[], now: Date, count = FEATURED_COUNT): FeaturedPick[] {
  const month = now.getMonth() + 1;
  // One eligibility rule for every bucket: unvisited, with a photo. Explore is a
  // daydream page, so a place already been to must never headline under a
  // "must-do" or "recommended" label — and fewer qualifying picks simply means
  // fewer hero slides rather than reaching for somewhere already visited.
  const pool = places.filter((p) => p.photos.length > 0 && open(p));

  const buckets: Array<{ match: (p: ExplorePlace) => boolean; reason: (p: ExplorePlace) => string }> = [
    { match: (p) => p.bestTime.months.includes(month), reason: (p) => `Best right now · ${p.bestTimeText}` },
    { match: (p) => monthsAgo(p.createdAt, now) >= 12, reason: (p) => `${savedAgoLabel(p.createdAt, now)} · never visited` },
    { match: (p) => p.priority >= 5, reason: () => 'One of your must-dos' },
    { match: (p) => Boolean(p.recommendedBy?.trim()), reason: (p) => `Recommended by ${p.recommendedBy!.trim()}` },
    { match: () => true, reason: (p) => savedAgoLabel(p.createdAt, now) },
  ];

  const picks: FeaturedPick[] = [];
  const taken = new Set<string>();
  const countries = new Set<string>();
  buckets.forEach((bucket, i) => {
    if (picks.length >= count) return;
    const rand = seededRandom(daySeed(now) * 31 + i);
    // A seeded shuffle, then places with a description first: the hero has room to tell the story.
    const ranked = pool
      .filter(bucket.match)
      .map((p) => ({ p, key: rand() }))
      .sort((a, b) => Number(Boolean(b.p.description)) - Number(Boolean(a.p.description)) || a.key - b.key)
      .map((x) => x.p);
    const pick = ranked.find((p) => !taken.has(p.id) && !(p.country && countries.has(p.country)));
    if (!pick) return;
    taken.add(pick.id);
    if (pick.country) countries.add(pick.country);
    picks.push({ placeId: pick.id, reason: bucket.reason(pick) });
  });
  return picks;
}
