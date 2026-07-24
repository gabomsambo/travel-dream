/**
 * @jest-environment node
 *
 * Characterization tests for the PDF export generator.
 *
 * A PDF is not worth diffing byte-for-byte, so these assert the things a reader
 * would actually see: that the output is a real PDF, and that the title, export
 * date, table headers, place names, day-group headings and page footers all end
 * up in the document text.
 */
import { describe, it, expect } from '@jest/globals';
import { inflateSync } from 'zlib';
import { generatePDF } from '../pdf-generator';
import type { DayBucket, Place } from '@/types/database';
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
  }
];

/**
 * Returns the raw PDF plus the inflated contents of every FlateDecode stream,
 * so text assertions hold whether or not the generator compresses its streams.
 */
const pdfText = (buffer: Buffer): string => {
  const raw = buffer.toString('latin1');
  const parts = [raw];

  const streamStart = /stream\r?\n/g;
  let match: RegExpExecArray | null;
  while ((match = streamStart.exec(raw)) !== null) {
    const start = match.index + match[0].length;
    const end = raw.indexOf('endstream', start);
    if (end === -1) continue;
    try {
      parts.push(inflateSync(Buffer.from(raw.slice(start, end), 'latin1')).toString('latin1'));
    } catch {
      // Not a deflate stream (or truncated) - the raw copy already covers it.
    }
  }

  return parts.join('\n');
};

describe('pdf-generator', () => {
  describe('generatePDF', () => {
    it('should return a non-empty buffer with a PDF header', async () => {
      const buffer = await generatePDF([createMockPlace()], mockFieldDefs);

      expect(Buffer.isBuffer(buffer)).toBe(true);
      expect(buffer.length).toBeGreaterThan(1000);
      expect(buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-');
      expect(buffer.subarray(-6).toString('latin1')).toContain('EOF');
    });

    it('should render the default title when none is supplied', async () => {
      const text = pdfText(await generatePDF([createMockPlace()], mockFieldDefs));

      expect(text).toContain('Places Export');
    });

    it('should render the supplied title and an export date line', async () => {
      const text = pdfText(await generatePDF([createMockPlace()], mockFieldDefs, { title: 'My Trip' }));

      expect(text).toContain('My Trip');
      expect(text).toContain('Exported:');
    });

    it('should render the table headers from the field definitions', async () => {
      const text = pdfText(await generatePDF([createMockPlace()], mockFieldDefs));

      expect(text).toContain('Name');
      expect(text).toContain('City');
    });

    it('should render a row per place', async () => {
      const places = [
        createMockPlace({ id: 'a', name: 'Alpha Bistro', city: 'Lisbon' }),
        createMockPlace({ id: 'b', name: 'Beta Rooftop', city: 'Porto' })
      ];
      const text = pdfText(await generatePDF(places, mockFieldDefs));

      expect(text).toContain('Alpha Bistro');
      expect(text).toContain('Beta Rooftop');
      expect(text).toContain('Lisbon');
      expect(text).toContain('Porto');
    });

    it('should truncate cell values longer than 50 characters', async () => {
      const longName = 'A'.repeat(80);
      const text = pdfText(await generatePDF([createMockPlace({ name: longName })], mockFieldDefs));

      expect(text).toContain(`${'A'.repeat(47)}...`);
      expect(text).not.toContain('A'.repeat(51));
    });

    it('should stamp page numbers in the footer', async () => {
      const text = pdfText(await generatePDF([createMockPlace()], mockFieldDefs));

      expect(text).toContain('Page 1 of 1');
    });

    it('should paginate large exports and number every page', async () => {
      const places = Array.from({ length: 120 }, (_, i) =>
        createMockPlace({ id: `plc_${i}`, name: `Place Number ${i}` })
      );
      const text = pdfText(await generatePDF(places, mockFieldDefs));

      expect(text).toContain('Page 1 of ');
      expect(text).toContain('Page 2 of ');
    });

    it('should render day headings and an unscheduled section when grouping by day', async () => {
      const places = [
        createMockPlace({ id: 'a', name: 'Alpha Bistro' }),
        createMockPlace({ id: 'b', name: 'Beta Rooftop' }),
        createMockPlace({ id: 'c', name: 'Gamma Market' })
      ];
      const dayBuckets = [
        { dayNumber: 1, placeIds: ['a'] },
        { dayNumber: 2, placeIds: ['b'] }
      ] as DayBucket[];

      const text = pdfText(
        await generatePDF(places, mockFieldDefs, { title: 'Trip', groupByDay: true, dayBuckets })
      );

      expect(text).toContain('Day 1');
      expect(text).toContain('Day 2');
      expect(text).toContain('Unscheduled Places');
      expect(text).toContain('Gamma Market');
    });

    it('should omit the unscheduled section when every place is scheduled', async () => {
      const places = [createMockPlace({ id: 'a', name: 'Alpha Bistro' })];
      const dayBuckets = [{ dayNumber: 1, placeIds: ['a'] }] as DayBucket[];

      const text = pdfText(
        await generatePDF(places, mockFieldDefs, { groupByDay: true, dayBuckets })
      );

      expect(text).toContain('Day 1');
      expect(text).not.toContain('Unscheduled Places');
    });

    it('should apply field transforms and relation metadata', async () => {
      const relationMetadata = new Map<string, any>();
      relationMetadata.set('plc_test', { orderIndex: 42 });

      const fieldDefs: FieldDefinition[] = [
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

      const text = pdfText(await generatePDF([createMockPlace()], fieldDefs, { relationMetadata }));

      expect(text).toContain('Order');
      expect(text).toContain('42');
    });

    it('should still produce a valid PDF for an empty place list', async () => {
      const buffer = await generatePDF([], mockFieldDefs, { title: 'Empty Trip' });

      expect(buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-');
      expect(pdfText(buffer)).toContain('Empty Trip');
    });
  });
});
