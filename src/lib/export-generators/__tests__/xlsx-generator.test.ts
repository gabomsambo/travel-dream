/**
 * @jest-environment node
 *
 * Characterization tests for the XLSX export generator.
 *
 * These pin the *observable* workbook shape (sheet names, header row, cell
 * values) rather than the bytes, so the underlying spreadsheet library can be
 * swapped without changing a single assertion below. Values here were captured
 * from the pre-existing implementation.
 */
import { describe, it, expect } from '@jest/globals';
import { generateXLSX } from '../xlsx-generator';
import { parseXLSX, getSheetNames } from '../../import-parsers/xlsx-parser';
import type { Place } from '@/types/database';
import type { FieldDefinition } from '@/types/export';

const createMockPlace = (overrides: Partial<Place> = {}): Place => ({
  id: 'plc_test',
  userId: null,
  googlePlaceId: null,
  name: 'Test Place',
  kind: 'restaurant',
  status: 'library',
  confidence: 0.95,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
  city: 'Paris',
  country: 'France',
  admin: null,
  coords: { lat: 48.8566, lon: 2.3522 },
  address: '123 Test Street',
  altNames: [],
  description: 'A test place',
  tags: ['tag1', 'tag2'],
  vibes: ['cozy'],
  ratingSelf: 4,
  notes: 'Test notes',
  price_level: '$$',
  best_time: 'summer',
  activities: null,
  cuisine: null,
  amenities: null,
  website: 'https://example.com',
  phone: null,
  email: null,
  hours: null,
  visitStatus: 'not_visited',
  priority: 0,
  lastVisited: null,
  plannedVisit: null,
  recommendedBy: null,
  companions: null,
  practicalInfo: null,
  ...overrides
});

const mockFieldDefs: FieldDefinition[] = [
  {
    dbField: 'name',
    csvHeader: 'Name',
    category: 'essentials',
    includeInPreset: ['minimal', 'standard', 'complete']
  },
  {
    dbField: 'city',
    csvHeader: 'City',
    category: 'location',
    includeInPreset: ['minimal', 'standard', 'complete']
  },
  {
    dbField: 'country',
    csvHeader: 'Country',
    category: 'location',
    includeInPreset: ['minimal', 'standard', 'complete']
  },
  {
    dbField: 'tags',
    csvHeader: 'Tags',
    category: 'categorization',
    transform: (value: any) => {
      if (!value || !Array.isArray(value)) return '';
      return value.join(', ');
    },
    includeInPreset: ['standard', 'complete']
  },
  {
    dbField: 'ratingSelf',
    csvHeader: 'Rating',
    category: 'user_notes',
    includeInPreset: ['standard', 'complete']
  }
];

const samplePlaces = (): Place[] => [
  createMockPlace({
    id: 'plc_1',
    name: 'Café "Flore"',
    kind: 'cafe',
    city: 'Paris',
    country: 'France',
    ratingSelf: 5,
    confidence: 0.9
  }),
  createMockPlace({
    id: 'plc_2',
    name: 'Sushi, Bar',
    kind: 'restaurant',
    city: 'Tokyo',
    country: 'Japan',
    ratingSelf: 4,
    confidence: 0.8,
    tags: []
  }),
  createMockPlace({
    id: 'plc_3',
    name: 'Museum',
    kind: 'museum',
    city: 'Paris',
    country: 'France',
    ratingSelf: 0,
    confidence: 0.7,
    coords: null,
    tags: ['art']
  })
];

const toArrayBuffer = (buffer: Buffer): ArrayBuffer =>
  buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;

describe('xlsx-generator', () => {
  describe('generateXLSX', () => {
    it('should return a non-empty XLSX (zip) buffer', async () => {
      const buffer = await generateXLSX(samplePlaces(), mockFieldDefs);

      expect(Buffer.isBuffer(buffer)).toBe(true);
      expect(buffer.length).toBeGreaterThan(0);
      // XLSX files are zip containers -> "PK" local file header signature
      expect(buffer.subarray(0, 2).toString('latin1')).toBe('PK');
    });

    it('should create a Places sheet and a Summary sheet', async () => {
      const buffer = await generateXLSX(samplePlaces(), mockFieldDefs);

      expect(await getSheetNames(toArrayBuffer(buffer))).toEqual(['Places', 'Summary']);
    });

    it('should omit the Summary sheet when includeSummary is false', async () => {
      const buffer = await generateXLSX(samplePlaces(), mockFieldDefs, { includeSummary: false });

      expect(await getSheetNames(toArrayBuffer(buffer))).toEqual(['Places']);
    });

    it('should omit the Summary sheet when there are no places', async () => {
      const buffer = await generateXLSX([], mockFieldDefs);

      expect(await getSheetNames(toArrayBuffer(buffer))).toEqual(['Places']);
    });

    it('should write one header row derived from the field definitions', async () => {
      const buffer = await generateXLSX(samplePlaces(), mockFieldDefs);
      const parsed = await parseXLSX(toArrayBuffer(buffer));

      expect(parsed.sheetName).toBe('Places');
      expect(parsed.headers).toEqual(['Name', 'City', 'Country', 'Tags', 'Rating']);
    });

    it('should write one row per place, in input order, with transformed values', async () => {
      const buffer = await generateXLSX(samplePlaces(), mockFieldDefs);
      const parsed = await parseXLSX(toArrayBuffer(buffer));

      expect(parsed.totalRows).toBe(3);
      expect(parsed.rows).toEqual([
        ['Café "Flore"', 'Paris', 'France', 'tag1, tag2', '5'],
        ['Sushi, Bar', 'Tokyo', 'Japan', '', '4'],
        ['Museum', 'Paris', 'France', 'art', '0']
      ]);
    });

    it('should preserve commas, quotes and non-ASCII characters verbatim', async () => {
      const places = [
        createMockPlace({ name: 'Place, with "quotes" & ümlauts', city: 'Zürich', country: 'Switzerland' })
      ];
      const buffer = await generateXLSX(places, mockFieldDefs, { includeSummary: false });
      const parsed = await parseXLSX(toArrayBuffer(buffer));

      expect(parsed.rows[0][0]).toBe('Place, with "quotes" & ümlauts');
      expect(parsed.rows[0][1]).toBe('Zürich');
    });

    it('should build a Summary sheet with counts by type, city and country', async () => {
      const buffer = await generateXLSX(samplePlaces(), mockFieldDefs);
      const summary = await parseXLSX(toArrayBuffer(buffer), 'Summary');

      expect(summary.sheetName).toBe('Summary');
      expect(summary.headers).toEqual(['Metric', 'Count']);
      // Blank spacer rows are dropped by the parser, so only labelled rows remain.
      expect(summary.rows).toEqual([
        ['Total Places', '3'],
        ['By Type', ''],
        ['  cafe', '1'],
        ['  restaurant', '1'],
        ['  museum', '1'],
        ['By City', ''],
        ['  Paris', '2'],
        ['  Tokyo', '1'],
        ['By Country', ''],
        ['  France', '2'],
        ['  Japan', '1'],
        ['Average Confidence', '0.80'],
        ['Places with Coordinates', '2'],
        ['Places with Ratings', '2']
      ]);
    });

    it('should handle relation metadata via field transforms', async () => {
      const relationMetadata = new Map<string, any>();
      relationMetadata.set('plc_1', { orderIndex: 7, isPinned: true, note: 'Test note' });

      const fieldDefsWithRelation: FieldDefinition[] = [
        ...mockFieldDefs,
        {
          dbField: 'orderIndex',
          csvHeader: 'Order',
          category: 'system_meta',
          transform: (_value: any, _place: Place, relationData?: any) =>
            relationData?.orderIndex?.toString() || '',
          includeInPreset: ['complete']
        }
      ];

      const buffer = await generateXLSX([samplePlaces()[0]], fieldDefsWithRelation, {
        includeSummary: false,
        relationMetadata
      });
      const parsed = await parseXLSX(toArrayBuffer(buffer));

      expect(parsed.headers).toEqual(['Name', 'City', 'Country', 'Tags', 'Rating', 'Order']);
      expect(parsed.rows[0][5]).toBe('7');
    });

    it('should produce an empty Places sheet for an empty place list', async () => {
      const buffer = await generateXLSX([], mockFieldDefs);
      const parsed = await parseXLSX(toArrayBuffer(buffer));

      expect(parsed.headers).toEqual([]);
      expect(parsed.rows).toEqual([]);
      expect(parsed.totalRows).toBe(0);
      expect(parsed.errors[0].message).toBe('Sheet "Places" is empty');
    });
  });
});
