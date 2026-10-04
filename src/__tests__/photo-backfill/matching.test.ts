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

  it('does not let a short generic name match a long unrelated listing', () => {
    expect(
      nameSimilarity('W.MANAGEMENT', 'W Beauty Salon Dongling Agency Shen Cai Mian Rong Management Center'),
    ).toBeLessThan(0.75);
    expect(nameSimilarity('Sky 44', 'Sky 44 Rooftop Terraza & Bar Madrid')).toBeGreaterThanOrEqual(0.9);
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

  it('never lets a hotel stand in for a city', () => {
    const v = judgeGoogleCandidate(
      place({ name: 'Madrid', kind: 'city', coords: { lat: 40.4168, lon: -3.7038 } }),
      candidate({
        displayName: 'Madrid Marriott Hotel',
        location: { lat: 40.42, lon: -3.7 },
        types: ['lodging', 'hotel'],
      }),
    );
    expect(v.accepted).toBe(false);
    expect(v.reason).toMatch(/cannot be a lodging/);
  });

  it.each([
    ['Uganda', 'city', 'The Industrial Court Of Uganda', ['courthouse', 'establishment']],
    ['Dijon', 'city', 'Dijon railway station', ['train_station', 'transit_station']],
    ['Cyprus', 'landmark', 'Cyprus International University', ['university', 'school']],
    ['Canada', 'landmark', "Canada's Wonderland", ['amusement_park', 'tourist_attraction']],
    ['Cala Granadella', 'beach', 'Parking Cala Granadella', ['parking', 'establishment']],
    ['Flamingos', 'shop', 'Flamingos Bar', ['bar', 'food']],
    ['luna', 'bar', 'Luna Beauty & co', ['beauty_salon']],
    ['Masai', 'natural', 'MASAI K LTD', ['point_of_interest', 'establishment']],
    ['Oregon Coast', 'natural', 'Oregon Coast Military Museum', ['museum', 'tourist_attraction']],
  ])('rejects %s (%s) -> %s: wrong sort of place', (name, kind, matched, types) => {
    const v = judgeGoogleCandidate(
      place({ name, kind, coords: { lat: 10, lon: 10 } }),
      candidate({ displayName: matched, location: { lat: 10, lon: 10 }, types }),
    );
    expect(v.accepted).toBe(false);
  });

  it.each([
    ['Ho Chi Minh', 'city', 'Ho Chi Minh City', ['locality', 'political']],
    ['Sky 44', 'bar', 'Sky 44 Rooftop Terraza & Bar Madrid', ['bar', 'restaurant']],
    ['Matterhorn', 'natural', 'Matterhorn Glacier', ['natural_feature']],
    ['Paris', 'city', 'Paris', ['establishment']],
  ])('accepts %s (%s) -> %s', (name, kind, matched, types) => {
    const v = judgeGoogleCandidate(
      place({ name, kind, coords: { lat: 10, lon: 10 } }),
      candidate({ displayName: matched, location: { lat: 10, lon: 10 }, types }),
    );
    expect(v.accepted).toBe(true);
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

  it('does not confirm the area from a compound toponym that merely contains it', () => {
    const v = judgeGoogleCandidate(
      place({ name: 'York', kind: 'landmark', city: 'York', country: 'United Kingdom', coords: null }),
      candidate({
        displayName: 'New York',
        formattedAddress: 'New York, NY, USA',
        location: null,
        types: ['locality', 'political'],
      }),
    );
    expect(v.accepted).toBe(false);
    expect(v.reason).toBe('location could not be confirmed');
  });

  it('still confirms the area when it appears as a standalone toponym', () => {
    const v = judgeGoogleCandidate(
      place({ name: 'York', kind: 'landmark', city: 'York', country: 'United Kingdom', coords: null }),
      candidate({
        displayName: 'York',
        formattedAddress: 'York, England',
        location: null,
        types: ['locality', 'political'],
      }),
    );
    expect(v.accepted).toBe(true);
    expect(v.reason).toBe('address names the place\'s area');
  });

  it('confirms a multi-word area that is the address component itself', () => {
    const v = judgeGoogleCandidate(
      place({ name: 'New York', kind: 'city', city: 'New York', country: 'United States', coords: null }),
      candidate({
        displayName: 'New York',
        formattedAddress: 'New York, NY, USA',
        location: null,
        types: ['locality', 'political'],
      }),
    );
    expect(v.accepted).toBe(true);
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

  it('accepts an untagged file whose caption names the city', () => {
    const v = judgeWikimediaItem(place(), wikiItem({ caption: 'Sunrise over Última Esperanza' }));
    expect(v.accepted).toBe(true);
  });

  it('does not take a country mention alone as location evidence', () => {
    const v = judgeWikimediaItem(place(), wikiItem({ caption: 'Sunrise over the massif, Chile' }));
    expect(v.accepted).toBe(false);
  });

  it('rejects an untagged file with no location evidence', () => {
    expect(judgeWikimediaItem(place(), wikiItem()).accepted).toBe(false);
  });

  it('rejects maps and flags even when the name matches', () => {
    const v = judgeWikimediaItem(place(), wikiItem({ title: 'Torres del Paine map Chile.jpg' }));
    expect(v.accepted).toBe(false);
  });

  it.each([
    ['Canada', 'landmark', 'Canada', 'Wal-Mart Supercentre in Vaughan, Ontario, Canada, Jan 2008.jpg'],
    ['Masai', 'neighborhood', 'Kenya', 'Masai woman in Nairobi.jpg'],
    ['Austria', 'landmark', 'Austria', 'Austria wien Performance Graph.jpg'],
    ['Córdoba', 'city', 'Spain', 'Francisco Hernandez de Cordoba (focus).png'],
    ['Oceanogràfic', 'museum', 'Spain', 'Parada Oceanogràfic línea 10 Metro Valencia.jpg'],
    ['Córdoba', 'city', 'Spain', '20-Córdoba Banknote Nicaragua 1985 Rückseite.jpg'],
  ])('rejects %s (%s) -> %s', (name, kind, country, title) => {
    const v = judgeWikimediaItem(
      place({ name, kind, country, city: 'Valencia', coords: null }),
      wikiItem({ title, caption: `${country} Valencia` }),
    );
    expect(v.accepted).toBe(false);
  });

  it('accepts a title that leads with the city, then the place', () => {
    const v = judgeWikimediaItem(
      place({ name: "Juliet's Balcony", kind: 'landmark', city: 'Verona', country: 'Italy', coords: null }),
      wikiItem({ title: "Verona-Juliet's balcony.jpg", caption: "Juliet's balcony, Verona" }),
    );
    expect(v.accepted).toBe(true);
  });

  it('never uses Wikimedia for a business', () => {
    const v = judgeWikimediaItem(
      place({ name: 'Bar Pinotxo', kind: 'bar' }),
      wikiItem({ title: 'Bar Pinotxo Chile.jpg', coords: { lat: -51.0, lon: -73.0 } }),
    );
    expect(v.accepted).toBe(false);
  });
});
