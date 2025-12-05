import { FIELD_DEFINITIONS } from './export-field-metadata';
import type { ColumnMapping, ImportTemplate } from '@/types/import';
import { splitArrayField } from '@/types/import';

export interface ReverseFieldDefinition {
  dbField: string;
  reverseTransform?: (value: string) => unknown;
}

const REVERSE_TRANSFORMS: Record<string, (value: string) => unknown> = {
  tags: splitArrayField,
  vibes: splitArrayField,
  activities: splitArrayField,
  cuisine: splitArrayField,
  amenities: splitArrayField,
  companions: splitArrayField,
  altNames: splitArrayField,
  ratingSelf: (v) => v ? parseInt(v, 10) : null,
  priority: (v) => v ? parseInt(v, 10) : null,
  confidence: (v) => v ? parseFloat(v) : null,
  hours: (v) => {
    if (!v || v.trim() === '') return null;
    try {
      return JSON.parse(v);
    } catch {
      return null;
    }
  },
};

export const REVERSE_FIELD_MAP: Record<string, ReverseFieldDefinition> = {};
for (const [fieldKey, fieldDef] of Object.entries(FIELD_DEFINITIONS)) {
  if (fieldKey === 'google_maps_link' || fieldKey === 'full_address') continue;
  if (fieldKey === 'collection_order' || fieldKey === 'is_pinned' || fieldKey === 'collection_note') continue;

  const csvHeader = fieldDef.csvHeader.toLowerCase();
  REVERSE_FIELD_MAP[csvHeader] = {
    dbField: fieldDef.dbField,
    reverseTransform: REVERSE_TRANSFORMS[fieldDef.dbField],
  };
}

export const HEADER_ALIASES: Record<string, string[]> = {
  name: ['name', 'place name', 'title', 'place', 'location name', 'venue', 'spot'],
  kind: ['type', 'category', 'kind', 'place type', 'venue type'],
  description: ['description', 'desc', 'details', 'about', 'summary'],

  city: ['city', 'town', 'municipality', 'locality'],
  country: ['country', 'nation', 'country name'],
  admin: ['state', 'region', 'province', 'state/region', 'admin', 'administrative area'],
  address: ['address', 'street', 'street address', 'location address', 'full address'],
  googlePlaceId: ['google place id', 'place id', 'google_place_id', 'googleplaceid'],

  latitude: ['latitude', 'lat', 'y'],
  longitude: ['longitude', 'lon', 'lng', 'long', 'x'],

  tags: ['tags', 'keywords', 'categories', 'labels', 'tag'],
  vibes: ['vibes', 'atmosphere', 'mood', 'ambiance', 'vibe', 'feel'],

  website: ['website', 'url', 'web', 'link', 'site', 'webpage'],
  phone: ['phone', 'tel', 'telephone', 'contact', 'phone number'],
  email: ['email', 'e-mail', 'mail', 'email address'],
  hours: ['hours', 'opening hours', 'business hours', 'schedule'],

  ratingSelf: ['rating', 'my rating', 'stars', 'score', 'your rating', 'personal rating'],
  notes: ['notes', 'personal notes', 'comments', 'memo', 'note'],
  practicalInfo: ['practical info', 'practical information', 'tips', 'practical'],

  price_level: ['price', 'price level', 'cost', 'pricing', '$$'],
  best_time: ['best time', 'best time to visit', 'best season', 'when to visit'],

  activities: ['activities', 'things to do', 'activity'],
  cuisine: ['cuisine', 'food type', 'cuisines', 'food'],
  amenities: ['amenities', 'facilities', 'features', 'amenity'],

  visitStatus: ['visit status', 'visited', 'status', 'visit'],
  priority: ['priority', 'importance', 'must see'],
  lastVisited: ['last visited', 'visited date', 'visit date'],
  plannedVisit: ['planned visit', 'plan date', 'planned date', 'when'],

  recommendedBy: ['recommended by', 'source', 'recommendation', 'from', 'referral'],
  companions: ['companions', 'with', 'travel with', 'people', 'who'],

  altNames: ['alternative names', 'alt names', 'aliases', 'other names', 'aka'],

  status: ['status', 'workflow status', 'place status'],
  confidence: ['confidence', 'confidence score', 'accuracy'],

  id: ['id', 'place id', 'identifier'],
  createdAt: ['created', 'created at', 'date added', 'added'],
  updatedAt: ['updated', 'updated at', 'modified', 'last modified'],
};

export const IMPORT_TEMPLATES: Record<ImportTemplate, Record<string, string> | null> = {
  'auto': null,

  'travel-dreams': Object.fromEntries(
    Object.entries(FIELD_DEFINITIONS)
      .filter(([key]) => !['google_maps_link', 'full_address', 'collection_order', 'is_pinned', 'collection_note'].includes(key))
      .map(([_, def]) => [def.csvHeader.toLowerCase(), def.dbField])
  ),

  'notion': {
    'name': 'name',
    'title': 'name',
    'type': 'kind',
    'category': 'kind',
    'location': 'city',
    'city': 'city',
    'country': 'country',
    'tags': 'tags',
    'rating': 'ratingSelf',
    'notes': 'notes',
    'url': 'website',
    'description': 'description',
    'status': 'visitStatus',
    'priority': 'priority',
  },

  'airtable': {
    'name': 'name',
    'category': 'kind',
    'type': 'kind',
    'city': 'city',
    'country': 'country',
    'address': 'address',
    'tags': 'tags',
    'rating': 'ratingSelf',
    'notes': 'notes',
    'website': 'website',
    'phone': 'phone',
    'latitude': 'latitude',
    'longitude': 'longitude',
    'description': 'description',
  },

  'google-sheets': {
    'place name': 'name',
    'name': 'name',
    'type': 'kind',
    'category': 'kind',
    'city': 'city',
    'country': 'country',
    'address': 'address',
    'lat': 'latitude',
    'lng': 'longitude',
    'latitude': 'latitude',
    'longitude': 'longitude',
    'tags': 'tags',
    'rating': 'ratingSelf',
    'notes': 'notes',
    'url': 'website',
    'description': 'description',
  },
};

export function detectTemplate(headers: string[]): ImportTemplate | null {
  const normalizedHeaders = headers.map(h => h.toLowerCase().trim());

  const travelDreamsHeaders = ['name', 'type', 'city', 'country', 'latitude', 'longitude', 'tags', 'vibes'];
  const matchCount = travelDreamsHeaders.filter(h => normalizedHeaders.includes(h)).length;
  if (matchCount >= 6) {
    return 'travel-dreams';
  }

  if (normalizedHeaders.includes('title') && normalizedHeaders.includes('category')) {
    return 'notion';
  }

  return null;
}

export function autoMapColumns(
  headers: string[],
  template: ImportTemplate = 'auto'
): ColumnMapping[] {
  const normalizedHeaders = headers.map(h => h.toLowerCase().trim());

  if (template !== 'auto' && IMPORT_TEMPLATES[template]) {
    const templateMap = IMPORT_TEMPLATES[template]!;
    return headers.map((header, idx) => {
      const normalized = header.toLowerCase().trim();
      const targetField = templateMap[normalized] || null;
      return {
        sourceColumn: header,
        sourceIndex: idx,
        targetField,
        confidence: targetField ? 1.0 : 0,
      };
    });
  }

  const detectedTemplate = detectTemplate(headers);
  if (detectedTemplate && IMPORT_TEMPLATES[detectedTemplate]) {
    const templateMap = IMPORT_TEMPLATES[detectedTemplate]!;
    return headers.map((header, idx) => {
      const normalized = header.toLowerCase().trim();
      const targetField = templateMap[normalized] || null;
      if (targetField) {
        return {
          sourceColumn: header,
          sourceIndex: idx,
          targetField,
          confidence: 0.95,
        };
      }
      return autoMapSingleColumn(header, idx);
    });
  }

  return headers.map((header, idx) => autoMapSingleColumn(header, idx));
}

function autoMapSingleColumn(header: string, index: number): ColumnMapping {
  const normalized = header.toLowerCase().trim();

  if (REVERSE_FIELD_MAP[normalized]) {
    return {
      sourceColumn: header,
      sourceIndex: index,
      targetField: REVERSE_FIELD_MAP[normalized].dbField,
      confidence: 0.95,
    };
  }

  for (const [dbField, aliases] of Object.entries(HEADER_ALIASES)) {
    if (aliases.includes(normalized)) {
      return {
        sourceColumn: header,
        sourceIndex: index,
        targetField: dbField,
        confidence: 0.9,
      };
    }
  }

  for (const [dbField, aliases] of Object.entries(HEADER_ALIASES)) {
    for (const alias of aliases) {
      if (normalized.includes(alias) || alias.includes(normalized)) {
        return {
          sourceColumn: header,
          sourceIndex: index,
          targetField: dbField,
          confidence: 0.6,
        };
      }
    }
  }

  return {
    sourceColumn: header,
    sourceIndex: index,
    targetField: null,
    confidence: 0,
  };
}

export function getTargetFieldOptions(): Array<{ value: string; label: string; category: string }> {
  const options: Array<{ value: string; label: string; category: string }> = [];

  const categoryOrder = [
    'essentials',
    'location',
    'contact',
    'categorization',
    'user_notes',
    'visit_tracking',
    'social',
    'llm_metadata',
    'system_meta',
  ];

  const categoryLabels: Record<string, string> = {
    essentials: 'Essentials',
    location: 'Location',
    contact: 'Contact',
    categorization: 'Tags & Categories',
    user_notes: 'Notes & Ratings',
    visit_tracking: 'Visit Tracking',
    social: 'Social',
    llm_metadata: 'Details',
    system_meta: 'System',
  };

  for (const [fieldKey, fieldDef] of Object.entries(FIELD_DEFINITIONS)) {
    if (['google_maps_link', 'full_address', 'collection_order', 'is_pinned', 'collection_note'].includes(fieldKey)) {
      continue;
    }

    options.push({
      value: fieldDef.dbField,
      label: fieldDef.csvHeader,
      category: categoryLabels[fieldDef.category] || fieldDef.category,
    });
  }

  options.push({
    value: 'latitude',
    label: 'Latitude (coordinate)',
    category: 'Location',
  });

  options.push({
    value: 'longitude',
    label: 'Longitude (coordinate)',
    category: 'Location',
  });

  return options;
}

export function getReverseTransform(dbField: string): ((value: string) => unknown) | undefined {
  return REVERSE_TRANSFORMS[dbField];
}

export { REVERSE_TRANSFORMS };
