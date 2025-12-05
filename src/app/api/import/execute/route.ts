import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { validateRows, preparePlacesForImport } from '@/lib/import-service';
import { batchCreatePlaces } from '@/lib/db-mutations';
import type { ColumnMapping, ImportOptions, ImportResult } from '@/types/import';

export const runtime = 'nodejs';

const ExecuteRequestSchema = z.object({
  rows: z.array(z.array(z.string())),
  mappings: z.array(z.object({
    sourceColumn: z.string(),
    sourceIndex: z.number(),
    targetField: z.string().nullable(),
    confidence: z.number(),
  })),
  options: z.object({
    confidentMode: z.boolean(),
    targetStatus: z.enum(['inbox', 'library']),
    collectionId: z.string().optional(),
    template: z.enum(['auto', 'travel-dreams', 'notion', 'airtable', 'google-sheets']),
  }),
  confirmedRowIndices: z.array(z.number()).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const validated = ExecuteRequestSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        {
          status: 'error',
          message: 'Invalid request data',
          errors: validated.error.errors.map(e => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        },
        { status: 400 }
      );
    }

    const { rows, mappings, options, confirmedRowIndices } = validated.data;

    const hasNameMapping = mappings.some(m => m.targetField === 'name');
    if (!hasNameMapping) {
      return NextResponse.json(
        { status: 'error', message: 'Name column must be mapped' },
        { status: 400 }
      );
    }

    const { valid, invalid } = validateRows(rows, mappings as ColumnMapping[]);

    if (valid.length === 0) {
      return NextResponse.json(
        {
          status: 'error',
          message: 'No valid rows to import',
          validationErrors: invalid.map(row => ({
            row: row.rowNumber,
            errors: row.errors,
          })),
        },
        { status: 400 }
      );
    }

    const confirmedSet = confirmedRowIndices
      ? new Set(confirmedRowIndices)
      : undefined;

    const placesToCreate = preparePlacesForImport(
      valid,
      options as ImportOptions,
      confirmedSet
    );

    const createResult = await batchCreatePlaces(
      placesToCreate.map(p => p.data),
      {
        collectionId: options.collectionId,
        defaultStatus: options.confidentMode ? undefined : 'inbox',
      }
    );

    const toLibrary = placesToCreate.filter(p => p.toLibrary).length;
    const toInbox = createResult.success.length - toLibrary;

    const result: ImportResult = {
      success: true,
      total: rows.length,
      created: createResult.success.length,
      toLibrary,
      toInbox,
      failed: invalid.length + createResult.failed.length,
      errors: [
        ...invalid.map(row => ({
          row: row.rowNumber,
          error: row.errors.map(e => `${e.field}: ${e.message}`).join('; '),
        })),
        ...createResult.failed.map(f => ({
          row: placesToCreate[f.index]?.rowNumber || f.index + 2,
          error: f.error,
        })),
      ],
      placeIds: createResult.success.map(p => p.id),
    };

    return NextResponse.json({
      status: 'success',
      result,
    });
  } catch (error) {
    console.error('[API /import/execute] Error:', error);
    return NextResponse.json(
      {
        status: 'error',
        message: error instanceof Error ? error.message : 'Failed to execute import',
      },
      { status: 500 }
    );
  }
}
