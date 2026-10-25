import { buildBrowseRails } from '@/lib/explore/browse';
import { parseBestTime } from '@/lib/explore/best-time';
import type { ExplorePhoto, ExplorePlace, Rail } from '@/lib/explore/types';

function place(id: string, photos: ExplorePhoto[], over: Partial<ExplorePlace> = {}): ExplorePlace {
  return {
    id, name: `Place ${id}`, kind: 'cafe', city: 'Lisbon', country: 'Portugal', description: null, notes: null, vibes: [],
    bestTimeText: null, bestTime: parseBestTime(null, null), recommendedBy: null, visitStatus: 'not_visited', priority: 0,
    ratingSelf: 0, priceLevel: null, createdAt: '2026-09-01 10:00:00', lat: null, lon: null, photos, ...over,
  };
}

const photo = (name: string): ExplorePhoto => ({ thumb: `https://img.test/${name}-thumb.jpg`, uri: `https://img.test/${name}.jpg` });

function rail(id: string, places: ExplorePlace[]): Rail {
  return { id, title: `Rail ${id}`, eyebrow: '', blurb: '', shape: 'poster', group: 'moods', places };
}

describe('buildBrowseRails', () => {
  it('carries a count and no places, so nothing but the tile crosses to the client', () => {
    const [tile] = buildBrowseRails([rail('a', [place('1', [photo('x')]), place('2', [])])]);
    expect(tile).toEqual({
      id: 'a', title: 'Rail a', group: 'moods', count: 2, cover: 'https://img.test/x-thumb.jpg',
      fallback: { name: 'Place 1', kind: 'cafe' },
    });
  });

  it('never repeats a cover while the rail has another photo to offer', () => {
    const shared = place('1', [photo('shared')]);
    const other = place('2', [photo('other')]);
    const tiles = buildBrowseRails([rail('a', [shared]), rail('b', [shared, other])]);
    expect(tiles.map((t) => t.cover)).toEqual(['https://img.test/shared-thumb.jpg', 'https://img.test/other-thumb.jpg']);
  });

  it('reuses a cover when the rail has nothing else', () => {
    const shared = place('1', [photo('shared')]);
    const tiles = buildBrowseRails([rail('a', [shared]), rail('b', [shared])]);
    expect(tiles.map((t) => t.cover)).toEqual(['https://img.test/shared-thumb.jpg', 'https://img.test/shared-thumb.jpg']);
  });

  it('has no cover for a rail without photos, and falls back to its first place', () => {
    const [tile] = buildBrowseRails([rail('a', [place('1', [], { name: 'Ramen Ya', kind: 'restaurant' })])]);
    expect(tile.cover).toBeNull();
    expect(tile.fallback).toEqual({ name: 'Ramen Ya', kind: 'restaurant' });
  });

  it('does not let a coverless rail use up a cover', () => {
    const solo = place('1', [photo('solo')]);
    const tiles = buildBrowseRails([rail('empty', [place('2', [])]), rail('a', [solo])]);
    expect(tiles.map((t) => t.cover)).toEqual([null, 'https://img.test/solo-thumb.jpg']);
  });
});
