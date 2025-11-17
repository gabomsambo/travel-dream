import { NextRequest, NextResponse } from 'next/server';
import { ExportRequestSchema } from '@/types/export';
import type { ExportErrorResponse } from '@/types/export';
import { exportData } from '@/lib/export-service';

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const validation = ExportRequestSchema.safeParse(body);

    if (!validation.success) {
      const errorResponse: ExportErrorResponse = {
        status: 'error',
        message: 'Invalid request data',
        errors: validation.error.errors.map(err => ({
          field: err.path.join('.'),
          message: err.message
        })),
        timestamp: new Date().toISOString()
      };

      return NextResponse.json(errorResponse, { status: 400 });
    }

    const result = await exportData(validation.data);

    const buffer = typeof result.buffer === 'string'
      ? Buffer.from(result.buffer, 'utf-8')
      : result.buffer;

    return new Response(buffer, {
      headers: {
        'Content-Type': result.mimeType,
        'Content-Disposition': `attachment; filename="${result.filename}"`
      }
    });

  } catch (error) {
    console.error('Export error:', error);

    const errorResponse: ExportErrorResponse = {
      status: 'error',
      message: error instanceof Error ? error.message : 'Failed to export data',
      timestamp: new Date().toISOString()
    };

    const status = error instanceof Error && error.message.includes('not found') ? 404 : 500;

    return NextResponse.json(errorResponse, { status });
  }
}
