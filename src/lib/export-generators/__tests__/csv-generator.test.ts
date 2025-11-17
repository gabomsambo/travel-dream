import { describe, it, expect } from '@jest/globals';
import { generateCSV } from '../csv-generator';
import type { Place } from '@/types/database';
import type { FieldDefinition } from '@/types/export';

const createMockPlace = (overrides: Partial<Place> = {}): Place => ({
  id: 'plc_test',
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
    includeInPreset: ['minimal', 'standard', 'complete']
  },
  {
    dbField: 'city',
    csvHeader: 'City',
    includeInPreset: ['minimal', 'standard', 'complete']
  },
  {
    dbField: 'tags',
    csvHeader: 'Tags',
    transform: (value: any) => {
      if (!value || !Array.isArray(value)) return '';
      return value.join(', ');
    },
    includeInPreset: ['standard', 'complete']
  }
];

describe('csv-generator', () => {
  describe('generateCSV', () => {
    it('should generate CSV with headers and data', async () => {
      const places = [createMockPlace()];
      const csv = await generateCSV(places, mockFieldDefs);

      expect(csv).toContain('Name,City,Tags');
      expect(csv).toContain('Test Place,Paris,tag1, tag2');
    });

    it('should include UTF-8 BOM by default', async () => {
      const places = [createMockPlace()];
      const csv = await generateCSV(places, mockFieldDefs);

      expect(csv.charCodeAt(0)).toBe(0xFEFF);
    });

    it('should skip UTF-8 BOM when disabled', async () => {
      const places = [createMockPlace()];
      const csv = await generateCSV(places, mockFieldDefs, { includeBOM: false });

      expect(csv.charCodeAt(0)).not.toBe(0xFEFF);
      expect(csv.startsWith('Name,City,Tags')).toBe(true);
    });

    it('should escape cells containing commas', async () => {
      const places = [createMockPlace({ name: 'Place, Name' })];
      const csv = await generateCSV(places, mockFieldDefs);

      expect(csv).toContain('"Place, Name"');
    });

    it('should escape cells containing double quotes', async () => {
      const places = [createMockPlace({ name: 'Place "Quote" Name' })];
      const csv = await generateCSV(places, mockFieldDefs);

      expect(csv).toContain('"Place ""Quote"" Name"');
    });

    it('should escape cells containing newlines', async () => {
      const places = [createMockPlace({ name: 'Place\nWith\nNewlines' })];
      const csv = await generateCSV(places, mockFieldDefs);

      expect(csv).toContain('"Place\nWith\nNewlines"');
    });

    it('should handle empty arrays', async () => {
      const places = [createMockPlace({ tags: [] })];
      const csv = await generateCSV(places, mockFieldDefs);

      const lines = csv.split('\n').filter(l => l.trim());
      expect(lines[1]).toMatch(/Test Place,Paris,$/);
    });

    it('should handle null values', async () => {
      const places = [createMockPlace({ city: null })];
      const csv = await generateCSV(places, mockFieldDefs);

      const lines = csv.split('\n').filter(l => l.trim());
      expect(lines[1]).toContain('Test Place,,tag1, tag2');
    });

    it('should handle multiple places', async () => {
      const places = [
        createMockPlace({ name: 'Place 1', city: 'Paris' }),
        createMockPlace({ name: 'Place 2', city: 'London' }),
        createMockPlace({ name: 'Place 3', city: 'Berlin' })
      ];
      const csv = await generateCSV(places, mockFieldDefs);

      const lines = csv.split('\n').filter(l => l.trim());
      expect(lines).toHaveLength(4); // header + 3 data rows
      expect(csv).toContain('Place 1,Paris');
      expect(csv).toContain('Place 2,London');
      expect(csv).toContain('Place 3,Berlin');
    });

    it('should handle special characters', async () => {
      const places = [createMockPlace({ name: 'Café "Flore" & Co.' })];
      const csv = await generateCSV(places, mockFieldDefs);

      expect(csv).toContain('"Café ""Flore"" & Co."');
    });

    it('should handle relation metadata', async () => {
      const places = [createMockPlace()];
      const relationMetadata = new Map();
      relationMetadata.set('plc_test', {
        orderIndex: 5,
        isPinned: true,
        note: 'Test note'
      });

      const fieldDefsWithRelation: FieldDefinition[] = [
        ...mockFieldDefs,
        {
          dbField: 'orderIndex',
          csvHeader: 'Order',
          transform: (value: any, place: Place, relationData?: any) => {
            return relationData?.orderIndex?.toString() || '';
          },
          includeInPreset: ['complete']
        }
      ];

      const csv = await generateCSV(places, fieldDefsWithRelation, { relationMetadata });

      expect(csv).toContain('Order');
      expect(csv).toContain('5');
    });

    it('should produce RFC 4180 compliant CSV', async () => {
      const places = [
        createMockPlace({
          name: 'Test "Quotes"',
          city: 'Paris, France',
          tags: ['sunset', 'rooftop']
        })
      ];
      const csv = await generateCSV(places, mockFieldDefs, { includeBOM: false });

      const lines = csv.split('\n');
      expect(lines[0]).toBe('Name,City,Tags');
      expect(lines[1]).toMatch(/^"Test ""Quotes""","Paris, France","sunset, rooftop"$/);
    });
  });
});
