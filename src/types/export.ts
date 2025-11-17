import { z } from 'zod';
import type { Place } from './database';

export type ExportFormat = 'csv' | 'xlsx' | 'pdf';

export type FieldPreset = 'minimal' | 'standard' | 'complete';

export interface LibraryFilters {
  status?: 'library' | 'inbox' | 'archived';
  city?: string;
  country?: string;
  kind?: string;
  tags?: string[];
  vibes?: string[];
  hasCoords?: boolean;
  minRating?: number;
  searchText?: string;
}

export type ExportScope =
  | { type: 'collection'; collectionId: string }
  | { type: 'library'; filters?: LibraryFilters }
  | { type: 'selected'; placeIds: string[] };

export const ExportRequestSchema = z.object({
  scope: z.discriminatedUnion('type', [
    z.object({
      type: z.literal('collection'),
      collectionId: z.string().min(1)
    }),
    z.object({
      type: z.literal('library'),
      filters: z.object({
        status: z.enum(['library', 'inbox', 'archived']).optional(),
        city: z.string().optional(),
        country: z.string().optional(),
        kind: z.string().optional(),
        tags: z.array(z.string()).optional(),
        vibes: z.array(z.string()).optional(),
        hasCoords: z.boolean().optional(),
        minRating: z.number().min(0).max(5).optional(),
        searchText: z.string().optional()
      }).optional()
    }),
    z.object({
      type: z.literal('selected'),
      placeIds: z.array(z.string().min(1)).min(1).max(500)
    })
  ]),
  format: z.enum(['csv', 'xlsx', 'pdf']),
  preset: z.enum(['minimal', 'standard', 'complete']).default('standard'),
  options: z.object({
    includeCollectionMetadata: z.boolean().optional(),
    filename: z.string().optional()
  }).optional()
});

export type ExportRequest = z.infer<typeof ExportRequestSchema>;

export interface ExportErrorResponse {
  status: 'error';
  message: string;
  errors?: { field: string; message: string }[];
  timestamp: string;
}

export interface FieldDefinition {
  dbField: string;
  csvHeader: string;
  transform?: (value: any, place: Place, relationMetadata?: any) => string;
  includeInPreset: FieldPreset[];
}

export interface ExportResult {
  buffer: Buffer | string;
  mimeType: string;
  filename: string;
}
