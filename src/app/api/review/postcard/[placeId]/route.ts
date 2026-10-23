import { NextResponse } from 'next/server'
import { requireAuthForApi, isAuthError } from '@/lib/auth-helpers'
import { loadReviewPostcard } from '@/lib/review-queue'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ placeId: string }> },
) {
  try {
    const user = await requireAuthForApi()
    const { placeId } = await params
    const postcard = await loadReviewPostcard(user.id, placeId)
    if (!postcard) {
      return NextResponse.json({ status: 'error', message: 'Place not found' }, { status: 404 })
    }
    return NextResponse.json(postcard)
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }
    console.error('Error loading review postcard:', error)
    return NextResponse.json({ status: 'error', message: 'Failed to load place' }, { status: 500 })
  }
}
