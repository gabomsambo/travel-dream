import { describe, it, expect } from '@jest/globals';
import {
  FIELD_DEFINITIONS,
  FIELD_PRESETS,
  getFieldsForPreset,
  transformValue
} from '../export-field-metadata';
import type { Place } from '@/types/database';

describe('export-field-metadata', () => {
  describe('FIELD_PRESETS', () => {
    it('should have minimal preset with 8 fields', () => {
      expect(FIELD_PRESETS.minimal).toHaveLength(8);
      expect(FIELD_PRESETS.minimal).toContain('name');
      expect(FIELD_PRESETS.minimal).toContain('kind');
      expect(FIELD_PRESETS.minimal).toContain('coords_lat');
      expect(FIELD_PRESETS.minimal).toContain('coords_lon');
    });

    it('should have standard preset with 15 fields', () => {
      expect(FIELD_PRESETS.standard).toHaveLength(15);
      expect(FIELD_PRESETS.standard).toContain('description');
      expect(FIELD_PRESETS.standard).toContain('tags');
      expect(FIELD_PRESETS.standard).toContain('vibes');
    });

    it('should have complete preset with 30+ fields', () => {
      expect(FIELD_PRESETS.complete.length).toBeGreaterThanOrEqual(30);
      expect(FIELD_PRESETS.complete).toContain('google_maps_link');
      expect(FIELD_PRESETS.complete).toContain('full_address');
    });
  });

  describe('getFieldsForPreset', () => {
    it('should return field definitions for minimal preset', () => {
      const fields = getFieldsForPreset('minimal');
      expect(fields).toHaveLength(8);
      expect(fields[0]).toHaveProperty('dbField');
      expect(fields[0]).toHaveProperty('csvHeader');
    });

    it('should return field definitions for standard preset', () => {
      const fields = getFieldsForPreset('standard');
      expect(fields).toHaveLength(15);
    });

    it('should return field definitions for complete preset', () => {
      const fields = getFieldsForPreset('complete');
      expect(fields.length).toBeGreaterThanOrEqual(30);
    });
  });

  describe('transformValue - null handling', () => {
    const mockPlace: Place = {
      id: 'plc_test',
      name: 'Test Place',
      kind: 'restaurant',
      status: 'library',
      confidence: 0.95,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
      city: null,
      country: null,
      admin: null,
      coords: null,
      address: null,
      altNames: [],
      description: null,
      tags: [],
      vibes: [],
      ratingSelf: 0,
      notes: null,
      price_level: null,
      best_time: null,
      activities: null,
      cuisine: null,
      amenities: null,
      website: null,
      phone: null,
      email: null,
      hours: null,
      visitStatus: 'not_visited',
      priority: 0,
      lastVisited: null,
      plannedVisit: null,
      recommendedBy: null,
      companions: null,
      practicalInfo: null
    };

    it('should return empty string for null values', () => {
      const cityField = FIELD_DEFINITIONS['city'];
      const result = transformValue(cityField, mockPlace);
      expect(result).toBe('');
    });

    it('should return empty string for undefined values', () => {
      const websiteField = FIELD_DEFINITIONS['website'];
      const result = transformValue(websiteField, mockPlace);
      expect(result).toBe('');
    });
  });

  describe('transformValue - array handling', () => {
    const mockPlace: Place = {
      id: 'plc_test',
      name: 'Test Place',
      kind: 'restaurant',
      status: 'library',
      confidence: 0.95,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
      tags: ['sunset', 'rooftop', 'iconic'],
      vibes: ['romantic', 'hidden-gem'],
      city: null,
      country: null,
      admin: null,
      coords: null,
      address: null,
      altNames: [],
      description: null,
      ratingSelf: 0,
      notes: null,
      price_level: null,
      best_time: null,
      activities: null,
      cuisine: null,
      amenities: null,
      website: null,
      phone: null,
      email: null,
      hours: null,
      visitStatus: 'not_visited',
      priority: 0,
      lastVisited: null,
      plannedVisit: null,
      recommendedBy: null,
      companions: null,
      practicalInfo: null
    };

    it('should join tags with comma and space', () => {
      const tagsField = FIELD_DEFINITIONS['tags'];
      const result = transformValue(tagsField, mockPlace);
      expect(result).toBe('sunset, rooftop, iconic');
    });

    it('should join vibes with comma and space', () => {
      const vibesField = FIELD_DEFINITIONS['vibes'];
      const result = transformValue(vibesField, mockPlace);
      expect(result).toBe('romantic, hidden-gem');
    });

    it('should return empty string for empty arrays', () => {
      const altNamesField = FIELD_DEFINITIONS['alt_names'];
      const result = transformValue(altNamesField, mockPlace);
      expect(result).toBe('');
    });
  });

  describe('transformValue - coords splitting', () => {
    const mockPlace: Place = {
      id: 'plc_test',
      name: 'Test Place',
      kind: 'restaurant',
      status: 'library',
      confidence: 0.95,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
      coords: { lat: 48.8566, lon: 2.3522 },
      city: null,
      country: null,
      admin: null,
      address: null,
      altNames: [],
      description: null,
      tags: [],
      vibes: [],
      ratingSelf: 0,
      notes: null,
      price_level: null,
      best_time: null,
      activities: null,
      cuisine: null,
      amenities: null,
      website: null,
      phone: null,
      email: null,
      hours: null,
      visitStatus: 'not_visited',
      priority: 0,
      lastVisited: null,
      plannedVisit: null,
      recommendedBy: null,
      companions: null,
      practicalInfo: null
    };

    it('should extract latitude from coords', () => {
      const latField = FIELD_DEFINITIONS['coords_lat'];
      const result = transformValue(latField, mockPlace);
      expect(result).toBe('48.8566');
    });

    it('should extract longitude from coords', () => {
      const lonField = FIELD_DEFINITIONS['coords_lon'];
      const result = transformValue(lonField, mockPlace);
      expect(result).toBe('2.3522');
    });

    it('should return empty string for null coords', () => {
      const placeWithoutCoords = { ...mockPlace, coords: null };
      const latField = FIELD_DEFINITIONS['coords_lat'];
      const result = transformValue(latField, placeWithoutCoords);
      expect(result).toBe('');
    });
  });

  describe('transformValue - computed fields', () => {
    const mockPlace: Place = {
      id: 'plc_test',
      name: 'Café de Flore',
      kind: 'cafe',
      status: 'library',
      confidence: 0.95,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
      coords: { lat: 48.8542, lon: 2.3320 },
      address: '172 Boulevard Saint-Germain',
      city: 'Paris',
      country: 'France',
      admin: 'Île-de-France',
      altNames: [],
      description: null,
      tags: [],
      vibes: [],
      ratingSelf: 0,
      notes: null,
      price_level: null,
      best_time: null,
      activities: null,
      cuisine: null,
      amenities: null,
      website: null,
      phone: null,
      email: null,
      hours: null,
      visitStatus: 'not_visited',
      priority: 0,
      lastVisited: null,
      plannedVisit: null,
      recommendedBy: null,
      companions: null,
      practicalInfo: null
    };

    it('should generate Google Maps link from coords', () => {
      const googleMapsField = FIELD_DEFINITIONS['google_maps_link'];
      const result = transformValue(googleMapsField, mockPlace);
      expect(result).toBe('https://www.google.com/maps/search/?api=1&query=48.8542,2.3320');
    });

    it('should build full address from components', () => {
      const fullAddressField = FIELD_DEFINITIONS['full_address'];
      const result = transformValue(fullAddressField, mockPlace);
      expect(result).toBe('172 Boulevard Saint-Germain, Paris, Île-de-France, France');
    });

    it('should handle missing address components', () => {
      const placeWithoutAddress = { ...mockPlace, address: null, admin: null };
      const fullAddressField = FIELD_DEFINITIONS['full_address'];
      const result = transformValue(fullAddressField, placeWithoutAddress);
      expect(result).toBe('Paris, France');
    });
  });

  describe('transformValue - relation metadata', () => {
    const mockPlace: Place = {
      id: 'plc_test',
      name: 'Test Place',
      kind: 'restaurant',
      status: 'library',
      confidence: 0.95,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
      city: null,
      country: null,
      admin: null,
      coords: null,
      address: null,
      altNames: [],
      description: null,
      tags: [],
      vibes: [],
      ratingSelf: 0,
      notes: null,
      price_level: null,
      best_time: null,
      activities: null,
      cuisine: null,
      amenities: null,
      website: null,
      phone: null,
      email: null,
      hours: null,
      visitStatus: 'not_visited',
      priority: 0,
      lastVisited: null,
      plannedVisit: null,
      recommendedBy: null,
      companions: null,
      practicalInfo: null
    };

    it('should extract collection order from relation metadata', () => {
      const collectionOrderField = FIELD_DEFINITIONS['collection_order'];
      const relationData = { orderIndex: 5, isPinned: false, note: null };
      const result = transformValue(collectionOrderField, mockPlace, relationData);
      expect(result).toBe('5');
    });

    it('should extract isPinned status from relation metadata', () => {
      const isPinnedField = FIELD_DEFINITIONS['is_pinned'];
      const relationData = { orderIndex: 0, isPinned: true, note: null };
      const result = transformValue(isPinnedField, mockPlace, relationData);
      expect(result).toBe('Yes');
    });

    it('should return empty string when relation metadata is missing', () => {
      const collectionOrderField = FIELD_DEFINITIONS['collection_order'];
      const result = transformValue(collectionOrderField, mockPlace);
      expect(result).toBe('');
    });
  });
});
