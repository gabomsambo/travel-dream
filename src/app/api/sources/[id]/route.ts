import { NextRequest, NextResponse } from 'next/server'
import { deleteSource } from '@/lib/db-mutations'
import { requireAuthForApi, isAuthError } from '@/lib/auth-helpers'
import { z } from 'zod'

export const runtime = 'nodejs'

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuthForApi()
    const { id } = await params

    if (!id) {
      return NextResponse.json(
        {
          status: 'error',
          message: 'Source ID is required',
        },
        { status: 400 }
      )
    }

    await deleteSource(id, user.id)

    return NextResponse.json({
      status: 'success',
      message: 'Source deleted successfully',
    })
  } catch (error: any) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }
    console.error('Error deleting source:', error)
    return NextResponse.json(
      {
        status: 'error',
        message: error.message || 'Failed to delete source',
      },
      { status: 500 }
    )
  }
}
