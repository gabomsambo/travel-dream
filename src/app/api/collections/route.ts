import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAllCollections } from '@/lib/db-queries';
import { createCollection } from '@/lib/db-mutations';
import { requireAuthForApi, isAuthError } from '@/lib/auth-helpers';

const CreateCollectionSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200, 'Name must be less than 200 characters'),
  description: z.string().max(1000, 'Description must be less than 1000 characters').nullable().optional(),
  filters: z.object({
    city: z.string().optional(),
    country: z.string().optional(),
    tags: z.array(z.string()).optional(),
    kinds: z.array(z.string()).optional(),
    vibes: z.array(z.string()).optional(),
    status: z.string().optional(),
    minRating: z.number().optional(),
    hasCoords: z.boolean().optional(),
  }).optional(),
});

export async function GET() {
  try {
    const user = await requireAuthForApi();
    const collections = await getAllCollections(user.id);

    return NextResponse.json({
      status: 'success',
      collections,
      message: 'Collections retrieved successfully',
    });
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    console.error('Error fetching collections:', error);
    return NextResponse.json(
      {
        status: 'error',
        message: 'Failed to fetch collections',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuthForApi();
    const body = await request.json();
    const validatedData = CreateCollectionSchema.parse(body);

    const newCollection = await createCollection({
      name: validatedData.name,
      description: validatedData.description ?? null,
      filters: validatedData.filters ?? null,
    }, user.id);

    return NextResponse.json({
      status: 'success',
      collection: newCollection,
      message: 'Collection created successfully',
    }, { status: 201 });
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
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

    console.error('Error creating collection:', error);
    return NextResponse.json(
      {
        status: 'error',
        message: 'Failed to create collection',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
