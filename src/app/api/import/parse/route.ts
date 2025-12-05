import { NextRequest, NextResponse } from 'next/server';
import { parseFile } from '@/lib/import-service';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json(
        { status: 'error', message: 'No file provided' },
        { status: 400 }
      );
    }

    const filename = file.name.toLowerCase();
    const validExtensions = ['.csv', '.xlsx', '.xls'];
    const hasValidExtension = validExtensions.some(ext => filename.endsWith(ext));

    if (!hasValidExtension) {
      return NextResponse.json(
        { status: 'error', message: 'Invalid file type. Please upload a CSV or Excel file.' },
        { status: 400 }
      );
    }

    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      return NextResponse.json(
        { status: 'error', message: 'File too large. Maximum size is 10MB.' },
        { status: 400 }
      );
    }

    const buffer = await file.arrayBuffer();
    const result = await parseFile(buffer, file.name);

    if (!result.success) {
      return NextResponse.json(
        { status: 'error', message: result.error },
        { status: 400 }
      );
    }

    return NextResponse.json({
      status: 'success',
      ...result.preview,
    });
  } catch (error) {
    console.error('[API /import/parse] Error:', error);
    return NextResponse.json(
      {
        status: 'error',
        message: error instanceof Error ? error.message : 'Failed to parse file',
      },
      { status: 500 }
    );
  }
}
