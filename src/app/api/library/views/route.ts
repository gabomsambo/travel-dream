import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuthForApi, isAuthError } from '@/lib/auth-helpers';
import { countSavedViews, createSavedView, listSavedViews } from '@/lib/library/store';
import { MAX_SAVED_VIEWS, SavedViewName, SavedViewQuery } from '@/lib/library/view-schema';

const CreateSchema = z.object({ name: SavedViewName, query: SavedViewQuery });

export async function GET() {
  try {
    const user = await requireAuthForApi();
    return NextResponse.json({ status: 'success', views: await listSavedViews(user.id) });
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    console.error('Error listing saved views:', error);
    return NextResponse.json({ status: 'error', message: 'Failed to list saved views' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuthForApi();
    const { name, query } = CreateSchema.parse(await request.json());
    if ((await countSavedViews(user.id)) >= MAX_SAVED_VIEWS) {
      return NextResponse.json(
        { status: 'error', message: `You can keep up to ${MAX_SAVED_VIEWS} saved views. Delete one to save another.` },
        { status: 409 }
      );
    }
    const view = await createSavedView(user.id, name, query);
    return NextResponse.json({ status: 'success', view }, { status: 201 });
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ status: 'error', message: error.errors[0]?.message ?? 'Invalid request' }, { status: 400 });
    }
    if (error instanceof SyntaxError) {
      return NextResponse.json({ status: 'error', message: 'Invalid request' }, { status: 400 });
    }
    console.error('Error saving a view:', error);
    return NextResponse.json({ status: 'error', message: 'Failed to save the view' }, { status: 500 });
  }
}
