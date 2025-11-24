import type { Place } from '@/types/database';
import type { FieldDefinition, FieldPreset, FieldCategory } from '@/types/export';

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
    'full_address',
    'google_place_id'
  ],

  custom: []
};

export const FIELD_DEFINITIONS: Record<string, FieldDefinition> = {
  id: {
    dbField: 'id',
    csvHeader: 'ID',
    category: 'system_meta',
    includeInPreset: ['complete']
  },

  name: {
    dbField: 'name',
    csvHeader: 'Name',
    category: 'essentials',
    includeInPreset: ['minimal', 'standard', 'complete']
  },

  alt_names: {
    dbField: 'altNames',
    csvHeader: 'Alternative Names',
    category: 'system_meta',
    transform: (value: any) => {
      if (!value || !Array.isArray(value)) return '';
      return value.join(', ');
    },
    includeInPreset: ['complete']
  },

  kind: {
    dbField: 'kind',
    csvHeader: 'Type',
    category: 'essentials',
    includeInPreset: ['minimal', 'standard', 'complete']
  },

  description: {
    dbField: 'description',
    csvHeader: 'Description',
    category: 'essentials',
    includeInPreset: ['standard', 'complete']
  },

  city: {
    dbField: 'city',
    csvHeader: 'City',
    category: 'location',
    includeInPreset: ['minimal', 'standard', 'complete']
  },

  country: {
    dbField: 'country',
    csvHeader: 'Country',
    category: 'location',
    includeInPreset: ['minimal', 'standard', 'complete']
  },

  admin: {
    dbField: 'admin',
    csvHeader: 'State/Region',
    category: 'location',
    includeInPreset: ['complete']
  },

  address: {
    dbField: 'address',
    csvHeader: 'Address',
    category: 'location',
    includeInPreset: ['standard', 'complete']
  },

  coords_lat: {
    dbField: 'coords',
    csvHeader: 'Latitude',
    category: 'location',
    transform: (value: any) => {
      if (!value || typeof value !== 'object') return '';
      return value.lat?.toString() || '';
    },
    includeInPreset: ['minimal', 'standard', 'complete']
  },

  coords_lon: {
    dbField: 'coords',
    csvHeader: 'Longitude',
    category: 'location',
    transform: (value: any) => {
      if (!value || typeof value !== 'object') return '';
      return value.lon?.toString() || '';
    },
    includeInPreset: ['minimal', 'standard', 'complete']
  },

  tags: {
    dbField: 'tags',
    csvHeader: 'Tags',
    category: 'categorization',
    transform: (value: any) => {
      if (!value || !Array.isArray(value)) return '';
      return value.join(', ');
    },
    includeInPreset: ['standard', 'complete']
  },

  vibes: {
    dbField: 'vibes',
    csvHeader: 'Vibes',
    category: 'categorization',
    transform: (value: any) => {
      if (!value || !Array.isArray(value)) return '';
      return value.join(', ');
    },
    includeInPreset: ['standard', 'complete']
  },

  rating_self: {
    dbField: 'ratingSelf',
    csvHeader: 'Your Rating',
    category: 'user_notes',
    transform: (value: any) => {
      if (value === null || value === undefined) return '';
      return value.toString();
    },
    includeInPreset: ['standard', 'complete']
  },

  notes: {
    dbField: 'notes',
    csvHeader: 'Notes',
    category: 'user_notes',
    includeInPreset: ['minimal', 'standard', 'complete']
  },

  status: {
    dbField: 'status',
    csvHeader: 'Status',
    category: 'system_meta',
    includeInPreset: ['complete']
  },

  confidence: {
    dbField: 'confidence',
    csvHeader: 'Confidence Score',
    category: 'system_meta',
    transform: (value: any) => {
      if (value === null || value === undefined) return '';
      return value.toString();
    },
    includeInPreset: ['complete']
  },

  website: {
    dbField: 'website',
    csvHeader: 'Website',
    category: 'contact',
    includeInPreset: ['minimal', 'standard', 'complete']
  },

  phone: {
    dbField: 'phone',
    csvHeader: 'Phone',
    category: 'contact',
    includeInPreset: ['standard', 'complete']
  },

  email: {
    dbField: 'email',
    csvHeader: 'Email',
    category: 'contact',
    includeInPreset: ['complete']
  },

  hours: {
    dbField: 'hours',
    csvHeader: 'Hours',
    category: 'contact',
    transform: (value: any) => {
      if (!value || typeof value !== 'object') return '';
      return JSON.stringify(value);
    },
    includeInPreset: ['complete']
  },

  price_level: {
    dbField: 'price_level',
    csvHeader: 'Price Level',
    category: 'categorization',
    includeInPreset: ['standard', 'complete']
  },

  best_time: {
    dbField: 'best_time',
    csvHeader: 'Best Time to Visit',
    category: 'llm_metadata',
    includeInPreset: ['complete']
  },

  activities: {
    dbField: 'activities',
    csvHeader: 'Activities',
    category: 'llm_metadata',
    transform: (value: any) => {
      if (!value || !Array.isArray(value)) return '';
      return value.join(', ');
    },
    includeInPreset: ['complete']
  },

  cuisine: {
    dbField: 'cuisine',
    csvHeader: 'Cuisine',
    category: 'llm_metadata',
    transform: (value: any) => {
      if (!value || !Array.isArray(value)) return '';
      return value.join(', ');
    },
    includeInPreset: ['complete']
  },

  amenities: {
    dbField: 'amenities',
    csvHeader: 'Amenities',
    category: 'llm_metadata',
    transform: (value: any) => {
      if (!value || !Array.isArray(value)) return '';
      return value.join(', ');
    },
    includeInPreset: ['complete']
  },

  visit_status: {
    dbField: 'visitStatus',
    csvHeader: 'Visit Status',
    category: 'visit_tracking',
    includeInPreset: ['complete']
  },

  priority: {
    dbField: 'priority',
    csvHeader: 'Priority',
    category: 'visit_tracking',
    transform: (value: any) => {
      if (value === null || value === undefined) return '';
      return value.toString();
    },
    includeInPreset: ['complete']
  },

  last_visited: {
    dbField: 'lastVisited',
    csvHeader: 'Last Visited',
    category: 'visit_tracking',
    includeInPreset: ['complete']
  },

  planned_visit: {
    dbField: 'plannedVisit',
    csvHeader: 'Planned Visit',
    category: 'visit_tracking',
    includeInPreset: ['complete']
  },

  recommended_by: {
    dbField: 'recommendedBy',
    csvHeader: 'Recommended By',
    category: 'social',
    includeInPreset: ['complete']
  },

  companions: {
    dbField: 'companions',
    csvHeader: 'Companions',
    category: 'social',
    transform: (value: any) => {
      if (!value || !Array.isArray(value)) return '';
      return value.join(', ');
    },
    includeInPreset: ['complete']
  },

  practical_info: {
    dbField: 'practicalInfo',
    csvHeader: 'Practical Info',
    category: 'user_notes',
    includeInPreset: ['complete']
  },

  created_at: {
    dbField: 'createdAt',
    csvHeader: 'Created At',
    category: 'system_meta',
    includeInPreset: ['complete']
  },

  updated_at: {
    dbField: 'updatedAt',
    csvHeader: 'Updated At',
    category: 'system_meta',
    includeInPreset: ['complete']
  },

  google_maps_link: {
    dbField: 'coords',
    csvHeader: 'Google Maps Link',
    category: 'location',
    transform: (value: any, place: Place) => {
      if (!place.coords) return '';
      return `https://www.google.com/maps/search/?api=1&query=${place.coords.lat},${place.coords.lon}`;
    },
    includeInPreset: ['complete']
  },

  full_address: {
    dbField: 'address',
    csvHeader: 'Full Address',
    category: 'location',
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

  google_place_id: {
    dbField: 'googlePlaceId',
    csvHeader: 'Google Place ID',
    category: 'location',
    includeInPreset: ['complete']
  },

  collection_order: {
    dbField: 'orderIndex',
    csvHeader: 'Collection Order',
    category: 'system_meta',
    transform: (value: any, place: Place, relationMetadata?: any) => {
      if (!relationMetadata) return '';
      return relationMetadata.orderIndex?.toString() || '';
    },
    includeInPreset: ['complete']
  },

  is_pinned: {
    dbField: 'isPinned',
    csvHeader: 'Pinned',
    category: 'system_meta',
    transform: (value: any, place: Place, relationMetadata?: any) => {
      if (!relationMetadata) return '';
      return relationMetadata.isPinned ? 'Yes' : 'No';
    },
    includeInPreset: ['complete']
  },

  collection_note: {
    dbField: 'note',
    csvHeader: 'Collection Note',
    category: 'system_meta',
    transform: (value: any, place: Place, relationMetadata?: any) => {
      if (!relationMetadata) return '';
      return relationMetadata.note || '';
    },
    includeInPreset: ['complete']
  }
};

export const FIELD_CATEGORIES: Record<FieldCategory, {
  label: string;
  description: string;
  fields: string[];
}> = {
  essentials: {
    label: 'Essentials',
    description: 'Core place information',
    fields: ['name', 'kind', 'description']
  },
  location: {
    label: 'Location',
    description: 'Geographic information',
    fields: ['city', 'country', 'admin', 'address', 'coords_lat', 'coords_lon', 'google_maps_link', 'full_address', 'google_place_id']
  },
  contact: {
    label: 'Contact',
    description: 'Contact information and hours',
    fields: ['website', 'phone', 'email', 'hours']
  },
  categorization: {
    label: 'Categorization',
    description: 'Tags, vibes, and pricing',
    fields: ['tags', 'vibes', 'price_level']
  },
  visit_tracking: {
    label: 'Visit Tracking',
    description: 'Visit status and planning',
    fields: ['visit_status', 'priority', 'last_visited', 'planned_visit']
  },
  social: {
    label: 'Social',
    description: 'Recommendations and companions',
    fields: ['recommended_by', 'companions']
  },
  llm_metadata: {
    label: 'LLM Metadata',
    description: 'AI-extracted details',
    fields: ['best_time', 'activities', 'cuisine', 'amenities']
  },
  user_notes: {
    label: 'User Notes',
    description: 'Personal notes and ratings',
    fields: ['notes', 'rating_self', 'practical_info']
  },
  system_meta: {
    label: 'System Metadata',
    description: 'System-generated information',
    fields: ['id', 'alt_names', 'status', 'confidence', 'created_at', 'updated_at', 'collection_order', 'is_pinned', 'collection_note']
  }
};

export function getFieldsForPreset(
  preset: FieldPreset,
  customFields?: string[]
): FieldDefinition[] {
  if (preset === 'custom' && customFields) {
    return customFields.map(fieldId => FIELD_DEFINITIONS[fieldId]).filter(Boolean);
  }

  const fieldIds = FIELD_PRESETS[preset as 'minimal' | 'standard' | 'complete'];
  if (!fieldIds) {
    return [];
  }

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
