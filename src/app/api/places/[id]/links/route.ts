import { NextRequest, NextResponse } from 'next/server';
import { createPlaceLink } from '@/lib/db-mutations';
import { z } from 'zod';

export const runtime = 'nodejs';

const LinkSchema = z.object({
  url: z.string().url('Invalid URL format'),
  title: z.string().optional(),
  description: z.string().optional(),
  type: z.enum(['website', 'social', 'booking', 'review', 'article']).optional(),
  platform: z.string().optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: placeId } = await params;
    const body = await request.json();

    const validatedData = LinkSchema.parse(body);

    const link = await createPlaceLink({
      placeId,
      ...validatedData,
    });

    return NextResponse.json({
      status: 'success',
      link,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          status: 'error',
          message: 'Validation failed',
          errors: error.errors,
        },
        { status: 400 }
      );
    }

    console.error('Link creation error:', error);
    return NextResponse.json(
      {
        status: 'error',
        message: error instanceof Error ? error.message : 'Failed to create link',
      },
      { status: 500 }
    );
  }
}
