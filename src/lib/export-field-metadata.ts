import type { Place } from '@/types/database';
import type { FieldDefinition, FieldPreset } from '@/types/export';

export const FIELD_PRESETS: Record<FieldPreset, string[]> = {
  minimal: [
    'name',
    'kind',
    'city',
    'country',
    'coords_lat',
    'coords_lon',
    'website',
    'notes'
  ],

  standard: [
    'name',
    'description',
    'kind',
    'city',
    'country',
    'address',
    'coords_lat',
    'coords_lon',
    'tags',
    'vibes',
    'website',
    'phone',
    'price_level',
    'rating_self',
    'notes'
  ],

  complete: [
    'id',
    'name',
    'alt_names',
    'kind',
    'description',
    'city',
    'country',
    'admin',
    'address',
    'coords_lat',
    'coords_lon',
    'tags',
    'vibes',
    'rating_self',
    'notes',
    'status',
    'confidence',
    'website',
    'phone',
    'email',
    'hours',
    'price_level',
    'best_time',
    'activities',
    'cuisine',
    'amenities',
    'visit_status',
    'priority',
    'last_visited',
    'planned_visit',
    'recommended_by',
    'companions',
    'practical_info',
    'created_at',
    'updated_at',
    'google_maps_link',
    'full_address'
  ]
};

export const FIELD_DEFINITIONS: Record<string, FieldDefinition> = {
  id: {
    dbField: 'id',
    csvHeader: 'ID',
    includeInPreset: ['complete']
  },

  name: {
    dbField: 'name',
    csvHeader: 'Name',
    includeInPreset: ['minimal', 'standard', 'complete']
  },

  alt_names: {
    dbField: 'altNames',
    csvHeader: 'Alternative Names',
    transform: (value: any) => {
      if (!value || !Array.isArray(value)) return '';
      return value.join(', ');
    },
    includeInPreset: ['complete']
  },

  kind: {
    dbField: 'kind',
    csvHeader: 'Type',
    includeInPreset: ['minimal', 'standard', 'complete']
  },

  description: {
    dbField: 'description',
    csvHeader: 'Description',
    includeInPreset: ['standard', 'complete']
  },

  city: {
    dbField: 'city',
    csvHeader: 'City',
    includeInPreset: ['minimal', 'standard', 'complete']
  },

  country: {
    dbField: 'country',
    csvHeader: 'Country',
    includeInPreset: ['minimal', 'standard', 'complete']
  },

  admin: {
    dbField: 'admin',
    csvHeader: 'State/Region',
    includeInPreset: ['complete']
  },

  address: {
    dbField: 'address',
    csvHeader: 'Address',
    includeInPreset: ['standard', 'complete']
  },

  coords_lat: {
    dbField: 'coords',
    csvHeader: 'Latitude',
    transform: (value: any) => {
      if (!value || typeof value !== 'object') return '';
      return value.lat?.toString() || '';
    },
    includeInPreset: ['minimal', 'standard', 'complete']
  },

  coords_lon: {
    dbField: 'coords',
    csvHeader: 'Longitude',
    transform: (value: any) => {
      if (!value || typeof value !== 'object') return '';
      return value.lon?.toString() || '';
    },
    includeInPreset: ['minimal', 'standard', 'complete']
  },

  tags: {
    dbField: 'tags',
    csvHeader: 'Tags',
    transform: (value: any) => {
      if (!value || !Array.isArray(value)) return '';
      return value.join(', ');
    },
    includeInPreset: ['standard', 'complete']
  },

  vibes: {
    dbField: 'vibes',
    csvHeader: 'Vibes',
    transform: (value: any) => {
      if (!value || !Array.isArray(value)) return '';
      return value.join(', ');
    },
    includeInPreset: ['standard', 'complete']
  },

  rating_self: {
    dbField: 'ratingSelf',
    csvHeader: 'Your Rating',
    transform: (value: any) => {
      if (value === null || value === undefined) return '';
      return value.toString();
    },
    includeInPreset: ['standard', 'complete']
  },

  notes: {
    dbField: 'notes',
    csvHeader: 'Notes',
    includeInPreset: ['minimal', 'standard', 'complete']
  },

  status: {
    dbField: 'status',
    csvHeader: 'Status',
    includeInPreset: ['complete']
  },

  confidence: {
    dbField: 'confidence',
    csvHeader: 'Confidence Score',
    transform: (value: any) => {
      if (value === null || value === undefined) return '';
      return value.toString();
    },
    includeInPreset: ['complete']
  },

  website: {
    dbField: 'website',
    csvHeader: 'Website',
    includeInPreset: ['minimal', 'standard', 'complete']
  },

  phone: {
    dbField: 'phone',
    csvHeader: 'Phone',
    includeInPreset: ['standard', 'complete']
  },

  email: {
    dbField: 'email',
    csvHeader: 'Email',
    includeInPreset: ['complete']
  },

  hours: {
    dbField: 'hours',
    csvHeader: 'Hours',
    transform: (value: any) => {
      if (!value || typeof value !== 'object') return '';
      return JSON.stringify(value);
    },
    includeInPreset: ['complete']
  },

  price_level: {
    dbField: 'price_level',
    csvHeader: 'Price Level',
    includeInPreset: ['standard', 'complete']
  },

  best_time: {
    dbField: 'best_time',
    csvHeader: 'Best Time to Visit',
    includeInPreset: ['complete']
  },

  activities: {
    dbField: 'activities',
    csvHeader: 'Activities',
    transform: (value: any) => {
      if (!value || !Array.isArray(value)) return '';
      return value.join(', ');
    },
    includeInPreset: ['complete']
  },

  cuisine: {
    dbField: 'cuisine',
    csvHeader: 'Cuisine',
    transform: (value: any) => {
      if (!value || !Array.isArray(value)) return '';
      return value.join(', ');
    },
    includeInPreset: ['complete']
  },

  amenities: {
    dbField: 'amenities',
    csvHeader: 'Amenities',
    transform: (value: any) => {
      if (!value || !Array.isArray(value)) return '';
      return value.join(', ');
    },
    includeInPreset: ['complete']
  },

  visit_status: {
    dbField: 'visitStatus',
    csvHeader: 'Visit Status',
    includeInPreset: ['complete']
  },

  priority: {
    dbField: 'priority',
    csvHeader: 'Priority',
    transform: (value: any) => {
      if (value === null || value === undefined) return '';
      return value.toString();
    },
    includeInPreset: ['complete']
  },

  last_visited: {
    dbField: 'lastVisited',
    csvHeader: 'Last Visited',
    includeInPreset: ['complete']
  },

  planned_visit: {
    dbField: 'plannedVisit',
    csvHeader: 'Planned Visit',
    includeInPreset: ['complete']
  },

  recommended_by: {
    dbField: 'recommendedBy',
    csvHeader: 'Recommended By',
    includeInPreset: ['complete']
  },

  companions: {
    dbField: 'companions',
    csvHeader: 'Companions',
    transform: (value: any) => {
      if (!value || !Array.isArray(value)) return '';
      return value.join(', ');
    },
    includeInPreset: ['complete']
  },

  practical_info: {
    dbField: 'practicalInfo',
    csvHeader: 'Practical Info',
    includeInPreset: ['complete']
  },

  created_at: {
    dbField: 'createdAt',
    csvHeader: 'Created At',
    includeInPreset: ['complete']
  },

  updated_at: {
    dbField: 'updatedAt',
    csvHeader: 'Updated At',
    includeInPreset: ['complete']
  },

  google_maps_link: {
    dbField: 'coords',
    csvHeader: 'Google Maps Link',
    transform: (value: any, place: Place) => {
      if (!place.coords) return '';
      return `https://www.google.com/maps/search/?api=1&query=${place.coords.lat},${place.coords.lon}`;
    },
    includeInPreset: ['complete']
  },

  full_address: {
    dbField: 'address',
    csvHeader: 'Full Address',
    transform: (value: any, place: Place) => {
      const parts = [
        place.address,
        place.city,
        place.admin,
        place.country
      ].filter(Boolean);
      return parts.join(', ');
    },
    includeInPreset: ['complete']
  },

  collection_order: {
    dbField: 'orderIndex',
    csvHeader: 'Collection Order',
    transform: (value: any, place: Place, relationMetadata?: any) => {
      if (!relationMetadata) return '';
      return relationMetadata.orderIndex?.toString() || '';
    },
    includeInPreset: ['complete']
  },

  is_pinned: {
    dbField: 'isPinned',
    csvHeader: 'Pinned',
    transform: (value: any, place: Place, relationMetadata?: any) => {
      if (!relationMetadata) return '';
      return relationMetadata.isPinned ? 'Yes' : 'No';
    },
    includeInPreset: ['complete']
  },

  collection_note: {
    dbField: 'note',
    csvHeader: 'Collection Note',
    transform: (value: any, place: Place, relationMetadata?: any) => {
      if (!relationMetadata) return '';
      return relationMetadata.note || '';
    },
    includeInPreset: ['complete']
  }
};

export function getFieldsForPreset(preset: FieldPreset): FieldDefinition[] {
  const fieldIds = FIELD_PRESETS[preset];
  return fieldIds.map(fieldId => FIELD_DEFINITIONS[fieldId]).filter(Boolean);
}

export function transformValue(
  fieldDef: FieldDefinition,
  place: Place,
  relationMetadata?: any
): string {
  const value = (place as any)[fieldDef.dbField];

  if (fieldDef.transform) {
    return fieldDef.transform(value, place, relationMetadata);
  }

  if (value === null || value === undefined) {
    return '';
  }

  if (typeof value === 'object') {
    return JSON.stringify(value);
  }

  return String(value);
}
