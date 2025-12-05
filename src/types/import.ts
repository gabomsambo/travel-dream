import { z } from 'zod';
import { PLACE_KINDS, PLACE_STATUSES } from './database';
import type { NewPlace, Place } from './database';

export type ImportFormat = 'csv' | 'xlsx';

export interface ColumnMapping {
  sourceColumn: string;
  sourceIndex: number;
  targetField: string | null;
  confidence: number;
  transform?: (value: string) => unknown;
}

export interface ValidationError {
  field: string;
  message: string;
  value: unknown;
}

export interface ParsedRow {
  rowNumber: number;
  rawValues: string[];
  mappedData: Partial<NewPlace>;
  errors: ValidationError[];
  isValid: boolean;
}

export interface ImportOptions {
  confidentMode: boolean;
  targetStatus: 'inbox' | 'library';
  collectionId?: string;
  template: ImportTemplate;
}

export interface ImportResult {
  success: boolean;
  total: number;
  created: number;
  toLibrary: number;
  toInbox: number;
  failed: number;
  errors: Array<{ row: number; error: string }>;
  placeIds: string[];
}

export interface ImportPreviewResponse {
  headers: string[];
  sampleRows: string[][];
  totalRows: number;
  suggestedMappings: ColumnMapping[];
  detectedTemplate: ImportTemplate | null;
  format: ImportFormat;
}

export type ImportTemplate = 'auto' | 'travel-dreams' | 'notion' | 'airtable' | 'google-sheets';

export interface ImportExecuteRequest {
  rows: string[][];
  mappings: ColumnMapping[];
  options: ImportOptions;
  confirmedRowIndices?: number[];
}

function splitArrayField(value: string): string[] {
  if (!value || value.trim() === '') return [];
  return value.split(/[,;|]\s*/).map(s => s.trim()).filter(Boolean);
}

function parseNumber(value: string): number | null {
  if (value === '' || value === null || value === undefined) return null;
  const num = Number(value);
  return isNaN(num) ? null : num;
}

function parseCoords(latStr: string, lonStr: string): { lat: number; lon: number } | null {
  const lat = parseFloat(latStr);
  const lon = parseFloat(lonStr);
  if (isNaN(lat) || isNaN(lon)) return null;
  if (lat < -90 || lat > 90) return null;
  if (lon < -180 || lon > 180) return null;
  return { lat, lon };
}

const ArrayFieldSchema = z.preprocess(
  (val) => {
    if (Array.isArray(val)) return val;
    if (typeof val === 'string') return splitArrayField(val);
    return [];
  },
  z.array(z.string()).default([])
);

const NullableArrayFieldSchema = z.preprocess(
  (val) => {
    if (val === null || val === undefined || val === '') return null;
    if (Array.isArray(val)) return val;
    if (typeof val === 'string') return splitArrayField(val);
    return null;
  },
  z.array(z.string()).nullable()
);

const NullableNumberSchema = z.preprocess(
  (val) => {
    if (val === '' || val === null || val === undefined) return null;
    const num = Number(val);
    return isNaN(num) ? null : num;
  },
  z.number().nullable()
);

const RatingSchema = z.preprocess(
  (val) => {
    if (val === '' || val === null || val === undefined) return 0;
    const num = Number(val);
    return isNaN(num) ? 0 : Math.min(5, Math.max(0, num));
  },
  z.number().min(0).max(5).default(0)
);

const ConfidenceSchema = z.preprocess(
  (val) => {
    if (val === '' || val === null || val === undefined) return 0;
    const num = Number(val);
    return isNaN(num) ? 0 : Math.min(1, Math.max(0, num));
  },
  z.number().min(0).max(1).default(0)
);

const CoordsSchema = z.object({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180)
}).nullable().optional();

const HoursSchema = z.preprocess(
  (val) => {
    if (val === '' || val === null || val === undefined) return null;
    if (typeof val === 'object' && val !== null) return val;
    if (typeof val === 'string') {
      try {
        return JSON.parse(val);
      } catch {
        return null;
      }
    }
    return null;
  },
  z.record(z.string(), z.string()).nullable()
);

const KindSchema = z.preprocess(
  (val) => {
    if (!val || typeof val !== 'string') return 'tip';
    const normalized = val.toLowerCase().trim();
    const kindAliases: Record<string, string> = {
      'type': 'tip',
      'attraction': 'landmark',
      'sight': 'landmark',
      'sightseeing': 'landmark',
      'accommodation': 'stay',
      'lodging': 'stay',
      'food': 'restaurant',
      'dining': 'restaurant',
      'drinks': 'bar',
      'nightlife': 'bar',
      'shopping': 'shop',
      'store': 'shop',
      'activity': 'experience',
      'nature': 'natural',
      'outdoors': 'natural',
      'transportation': 'transit',
      'transport': 'transit',
      'spa': 'thermal',
      'wellness': 'thermal',
      'event': 'festival',
      'art': 'gallery',
      'coffee': 'cafe',
    };
    if (PLACE_KINDS.includes(normalized as any)) {
      return normalized;
    }
    return kindAliases[normalized] || 'tip';
  },
  z.enum(PLACE_KINDS).default('tip')
);

export const ImportPlaceSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  kind: KindSchema,
  status: z.enum(PLACE_STATUSES).default('inbox'),

  city: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
  admin: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  googlePlaceId: z.string().nullable().optional(),
  coords: CoordsSchema,

  altNames: ArrayFieldSchema,
  tags: ArrayFieldSchema,
  vibes: ArrayFieldSchema,
  activities: NullableArrayFieldSchema,
  cuisine: NullableArrayFieldSchema,
  amenities: NullableArrayFieldSchema,
  companions: NullableArrayFieldSchema,

  description: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  practicalInfo: z.string().nullable().optional(),

  ratingSelf: RatingSchema,
  confidence: ConfidenceSchema,
  priority: z.preprocess(
    (val) => {
      if (val === '' || val === null || val === undefined) return 0;
      const num = Number(val);
      return isNaN(num) ? 0 : Math.min(5, Math.max(0, num));
    },
    z.number().min(0).max(5).default(0)
  ),

  price_level: z.string().nullable().optional(),
  best_time: z.string().nullable().optional(),

  website: z.preprocess(
    (val) => {
      if (!val || val === '') return null;
      return val;
    },
    z.string().nullable().optional()
  ),
  phone: z.string().nullable().optional(),
  email: z.preprocess(
    (val) => {
      if (!val || val === '') return null;
      return val;
    },
    z.string().email().nullable().optional().or(z.null()).or(z.literal(''))
  ),
  hours: HoursSchema,

  visitStatus: z.enum(['not_visited', 'visited', 'planned']).default('not_visited'),
  lastVisited: z.string().nullable().optional(),
  plannedVisit: z.string().nullable().optional(),

  recommendedBy: z.string().nullable().optional(),
});

export type ImportPlaceInput = z.input<typeof ImportPlaceSchema>;
export type ImportPlaceOutput = z.output<typeof ImportPlaceSchema>;

export { splitArrayField, parseNumber, parseCoords };
