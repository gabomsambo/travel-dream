import {
  CITY_ALIAS_GROUPS,
  GOOGLE_PLACES_LANGUAGE,
  canonicalCityName,
  citiesMatch,
  citiesMatchInCountry,
  cityFilterLabels,
  cityGroupLabel,
  cityMatchKey,
  collapseCityCounts,
  foldCityName,
  storedCitiesMatching,
  tallyCities,
} from '@/lib/city-names';

describe('foldCityName', () => {
  it('trims, case-folds, collapses whitespace and strips diacritics', () => {
    expect(foldCityName('  São   Paulo ')).toBe('sao paulo');
    expect(foldCityName('MÜNCHEN')).toBe('munchen');
    expect(foldCityName('Kraków')).toBe('krakow');
  });
});

describe('city aliases', () => {
  it('asks Google for English names', () => {
    expect(GOOGLE_PLACES_LANGUAGE).toBe('en');
  });

  it('treats the reported exonyms as one city and leaves unrelated cities apart', () => {
    expect(citiesMatch('Lisbon', 'Lisboa')).toBe(true);
    expect(citiesMatch('lisboa', 'LISBON')).toBe(true);
    expect(citiesMatch('München', 'Munich')).toBe(true);
    expect(citiesMatch('Roma', 'Rome')).toBe(true);
    expect(citiesMatch('Lisbon', 'Porto')).toBe(false);
    expect(citiesMatch('Paris', 'París')).toBe(true);
    expect(citiesMatch(null, 'Lisbon')).toBe(false);
    expect(citiesMatch('  ', 'Lisbon')).toBe(false);
    expect(citiesMatchInCountry({ city: 'Lisboa', country: 'Portugal' }, { city: 'Lisbon', country: 'Portugal' })).toBe(true);
    expect(citiesMatchInCountry({ city: 'Roma', country: 'Italy' }, { city: 'Rome', country: 'Georgia' })).toBe(false);
    expect(citiesMatchInCountry({ city: 'Lisboa', country: null }, { city: 'Lisbon', country: null })).toBe(true);
    expect(citiesMatchInCountry({ city: 'Lisboa', country: null }, { city: 'Lisbon', country: 'Portugal' })).toBe(false);
    expect(citiesMatchInCountry({ city: 'Lisboa', country: '' }, { city: 'Lisbon', country: null })).toBe(true);
  });

  it('folds diacritics without requiring an alias entry', () => {
    expect(CITY_ALIAS_GROUPS.some((g) => g.names.some((n) => foldCityName(n) === 'sao paulo'))).toBe(false);
    expect(cityMatchKey('São Paulo')).toBe(cityMatchKey('Sao Paulo'));
    expect(canonicalCityName('São Paulo')).toBeNull();
    expect(cityGroupLabel('São Paulo')).toBe('São Paulo');
  });

  it('labels a known exonym with the English canonical and does not invent one otherwise', () => {
    expect(cityGroupLabel('Lisboa')).toBe('Lisbon');
    expect(cityGroupLabel('  Kyoto ')).toBe('Kyoto');
    expect(canonicalCityName('Kyoto')).toBeNull();
  });

  it('returns the original stored spellings for a query, not a rewritten form', () => {
    const stored = ['Lisboa', 'LISBON', ' Porto ', 'São Paulo', null, ''];
    expect(storedCitiesMatching(stored, 'Lisbon').sort()).toEqual(['LISBON', 'Lisboa']);
    expect(storedCitiesMatching(stored, 'Sao Paulo')).toEqual(['São Paulo']);
    expect(storedCitiesMatching(stored, '   ')).toEqual([]);
  });

  it('collapses filter labels and counts onto one row per city', () => {
    const cities = ['Lisboa', 'Lisbon', 'Lisboa', 'Porto', 'São Paulo', 'Sao Paulo'];
    expect(collapseCityCounts(cities)).toEqual([
      { city: 'Lisbon', count: 3 },
      { city: 'São Paulo', count: 2 },
      { city: 'Porto', count: 1 },
    ]);
    expect(cityFilterLabels(cities)).toEqual(['Lisbon', 'Porto', 'São Paulo']);
  });

  it('keeps the same exonym in two countries apart when tallying', () => {
    const rows = tallyCities([
      { city: 'Lisboa', country: 'Portugal' },
      { city: 'Lisbon', country: 'Portugal' },
      { city: 'Lisbon', country: 'United States' },
    ]);
    expect(rows).toEqual([
      { city: 'Lisbon', country: 'Portugal', count: 2 },
      { city: 'Lisbon', country: 'United States', count: 1 },
    ]);
  });
});
