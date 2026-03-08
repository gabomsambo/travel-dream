import { NextResponse } from 'next/server'
import { requireAuthForApi, isAuthError } from '@/lib/auth-helpers'
import { clearAllScreenshots } from '@/lib/db-mutations'

export const dynamic = 'force-dynamic'

export async function DELETE() {
  try {
    const user = await requireAuthForApi()
    const result = await clearAllScreenshots(user.id)

    return NextResponse.json({
      success: true,
      deleted: result.deleted,
    })
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }
    console.error('Clear all screenshots error:', error)
    return NextResponse.json(
      { error: 'Failed to clear screenshots' },
      { status: 500 }
    )
  }
}
