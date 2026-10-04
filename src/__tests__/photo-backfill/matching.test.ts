/**
 * @jest-environment node
 */
import {
  judgeGoogleCandidate,
  judgeWikimediaItem,
  nameSimilarity,
  haversineKm,
  type BackfillPlace,
} from '@/lib/photo-backfill/matching';
import type { GooglePlaceWithPhotos } from '@/lib/photo-sources/google-places';
import type { PhotoSearchItem } from '@/lib/photo-sources/types';

function place(over: Partial<BackfillPlace> = {}): BackfillPlace {
  return {
    id: 'plc_1',
    name: 'Torres del Paine',
    kind: 'natural',
    city: 'Última Esperanza',
    country: 'Chile',
    admin: null,
    address: null,
    coords: { lat: -51.0, lon: -73.0 },
    googlePlaceId: null,
    altNames: [],
    ...over,
  };
}

function candidate(over: Partial<GooglePlaceWithPhotos> = {}): GooglePlaceWithPhotos {
  return {
    googlePlaceId: 'gp_1',
    displayName: 'Torres del Paine National Park',
    location: { lat: -51.05, lon: -73.02 },
    formattedAddress: 'Torres del Paine, Magallanes, Chile',
    types: ['national_park', 'park'],
    photos: [],
    ...over,
  };
}

function wikiItem(over: Partial<PhotoSearchItem> = {}): PhotoSearchItem {
  return {
    source: 'wikimedia',
    sourceId: '123',
    thumbnailUrl: 'https://upload.wikimedia.org/thumb.jpg',
    fullUrl: 'https://upload.wikimedia.org/full.jpg',
    width: 800,
    height: 600,
    attribution: {
      kind: 'wikimedia',
      authorText: 'A',
      licenseShortName: 'CC BY-SA 4.0',
      licenseUrl: '',
      descriptionUrl: '',
    },
    title: 'Torres del Paine sunrise.jpg',
    coords: null,
    ...over,
  };
}

describe('nameSimilarity', () => {
  it('treats accents, case and punctuation as equal', () => {
    expect(nameSimilarity('Café de Flore', 'cafe de flore')).toBe(1);
    expect(nameSimilarity('Shkodër', 'Shkoder')).toBe(1);
  });

  it('scores word containment high', () => {
    expect(nameSimilarity('Torres del Paine', 'Torres del Paine National Park')).toBeGreaterThanOrEqual(0.9);
    expect(nameSimilarity('Plaza Mayor', 'Plaza Mayor de Madrid')).toBeGreaterThanOrEqual(0.9);
  });

  it('scores unrelated names low', () => {
    expect(nameSimilarity('Torres del Paine', 'Hotel Las Torres')).toBeLessThan(0.75);
    expect(nameSimilarity('Sagrada Familia', 'Casa Batlló')).toBeLessThan(0.5);
  });

  it('does not let a tiny shared word count as containment', () => {
    expect(nameSimilarity('Bo', 'Bo Restaurant Lisbon')).toBeLessThan(0.75);
  });
});

describe('haversineKm', () => {
  it('measures roughly Madrid to Barcelona', () => {
    const km = haversineKm({ lat: 40.4168, lon: -3.7038 }, { lat: 41.3874, lon: 2.1686 });
    expect(km).toBeGreaterThan(480);
    expect(km).toBeLessThan(520);
  });
});

describe('judgeGoogleCandidate', () => {
  it('accepts a matching name within the kind radius and reports the distance', () => {
    const v = judgeGoogleCandidate(place(), candidate());
    expect(v.accepted).toBe(true);
    expect(v.matchedName).toBe('Torres del Paine National Park');
    expect(v.distanceKm).toBeGreaterThan(0);
    expect(v.distanceKm).toBeLessThan(10);
  });

  it('rejects a matching name that is too far away', () => {
    const v = judgeGoogleCandidate(
      place({ kind: 'restaurant', name: 'Bar Pinotxo' }),
      candidate({ displayName: 'Bar Pinotxo', location: { lat: -51.2, lon: -73.0 } }),
    );
    expect(v.accepted).toBe(false);
    expect(v.reason).toMatch(/km away/);
  });

  it('rejects a nearby place with a different name', () => {
    const v = judgeGoogleCandidate(place(), candidate({ displayName: 'Hotel Las Torres' }));
    expect(v.accepted).toBe(false);
    expect(v.reason).toBe('name differs');
  });

  it('never lets a business stand in for a city', () => {
    const v = judgeGoogleCandidate(
      place({ name: 'Madrid', kind: 'city', coords: { lat: 40.4168, lon: -3.7038 } }),
      candidate({
        displayName: 'Madrid Marriott Hotel',
        location: { lat: 40.42, lon: -3.7 },
        types: ['lodging', 'hotel'],
      }),
    );
    expect(v.accepted).toBe(false);
    expect(v.reason).toMatch(/business/);
  });

  it('without coordinates, requires the address to name the place\'s area', () => {
    const noCoords = place({ coords: null, name: 'Plaza Mayor', kind: 'landmark', city: 'Madrid', country: 'Spain' });
    expect(
      judgeGoogleCandidate(noCoords, candidate({ displayName: 'Plaza Mayor', formattedAddress: 'Plaza Mayor, 28012 Madrid, Spain' })).accepted,
    ).toBe(true);
    expect(
      judgeGoogleCandidate(noCoords, candidate({ displayName: 'Plaza Mayor', formattedAddress: 'Plaza Mayor, Salamanca' })).accepted,
    ).toBe(false);
  });

  it('matches on an alternative name', () => {
    const v = judgeGoogleCandidate(
      place({ name: 'Lisbon', altNames: ['Lisboa'], kind: 'city', coords: { lat: 38.72, lon: -9.14 } }),
      candidate({ displayName: 'Lisboa', location: { lat: 38.72, lon: -9.13 }, types: ['locality'] }),
    );
    expect(v.accepted).toBe(true);
  });
});

describe('judgeWikimediaItem', () => {
  it('accepts a file named for the place and geotagged nearby', () => {
    const v = judgeWikimediaItem(place(), wikiItem({ coords: { lat: -51.01, lon: -73.0 } }));
    expect(v.accepted).toBe(true);
  });

  it('accepts an untagged file whose caption names the area', () => {
    const v = judgeWikimediaItem(place(), wikiItem({ caption: 'Sunrise over the massif, Chile' }));
    expect(v.accepted).toBe(true);
  });

  it('rejects an untagged file with no location evidence', () => {
    expect(judgeWikimediaItem(place(), wikiItem()).accepted).toBe(false);
  });

  it('rejects maps and flags even when the name matches', () => {
    const v = judgeWikimediaItem(place(), wikiItem({ title: 'Torres del Paine map Chile.jpg' }));
    expect(v.accepted).toBe(false);
  });

  it('never uses Wikimedia for a business', () => {
    const v = judgeWikimediaItem(
      place({ name: 'Bar Pinotxo', kind: 'bar' }),
      wikiItem({ title: 'Bar Pinotxo Chile.jpg', coords: { lat: -51.0, lon: -73.0 } }),
    );
    expect(v.accepted).toBe(false);
  });
});
