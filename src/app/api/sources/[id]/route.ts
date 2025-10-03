import { NextRequest, NextResponse } from 'next/server'
import { deleteSource } from '@/lib/db-mutations'
import { z } from 'zod'

export const runtime = 'nodejs'

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
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

    await deleteSource(id)

    return NextResponse.json({
      status: 'success',
      message: 'Source deleted successfully',
    })
  } catch (error: any) {
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
