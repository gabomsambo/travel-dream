import React from 'react'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { DayPlannerClient } from '../day-planner-client'
import type { Collection, Place } from '@/types/database'

jest.mock('../day-column', () => ({ DayColumn: () => null }))
jest.mock('../unscheduled-list', () => ({ UnscheduledList: () => null }))
jest.mock('../day-metrics', () => ({ DayMetrics: () => null }))
jest.mock('../auto-create-days-dialog', () => ({ AutoCreateDaysDialog: () => null }))
jest.mock('@/components/collections/collection-map-renderer', () => ({
  CollectionMapRenderer: () => null,
}))
jest.mock('@/components/collections/collection-map-context', () => ({
  useCollectionMapContextOptional: () => null,
}))

const collection = {
  id: 'col_1',
  name: 'Trip',
  places: [] as Place[],
  dayBuckets: [],
  unscheduledPlaceIds: [],
  transportMode: 'drive',
} as unknown as Collection & { places: Place[] }

const SAVE_DEBOUNCE_MS = 1000
const SAVE_ERROR = 'Failed to save changes — retry by editing again'

function deferredResponse() {
  let settle!: (value: { ok: boolean; json: () => Promise<unknown> }) => void
  const promise = new Promise<{ ok: boolean; json: () => Promise<unknown> }>((resolve) => {
    settle = resolve
  })
  return {
    promise,
    succeed: () => settle({ ok: true, json: async () => ({ status: 'success' }) }),
    fail: () => settle({ ok: false, json: async () => ({ message: 'boom' }) }),
  }
}

describe('DayPlannerClient save status', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    jest.spyOn(console, 'log').mockImplementation(() => {})
    jest.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    jest.useRealTimers()
    jest.restoreAllMocks()
  })

  it('keeps the newest save failure when a slower older save succeeds afterwards', async () => {
    const saveA = deferredResponse()
    const saveB = deferredResponse()
    global.fetch = jest
      .fn()
      .mockReturnValueOnce(saveA.promise)
      .mockReturnValueOnce(saveB.promise) as unknown as typeof fetch

    render(<DayPlannerClient initialCollection={collection} />)

    // Save A leaves on the mount autosave and stays in flight.
    await act(async () => {
      jest.advanceTimersByTime(SAVE_DEBOUNCE_MS)
    })

    fireEvent.click(screen.getByRole('button', { name: /new day/i }))
    await act(async () => {
      jest.advanceTimersByTime(SAVE_DEBOUNCE_MS)
    })

    await act(async () => {
      saveB.fail()
      await saveB.promise
    })
    expect(screen.getByRole('alert')).toHaveTextContent(SAVE_ERROR)

    await act(async () => {
      saveA.succeed()
      await saveA.promise
    })

    expect(screen.getByRole('alert')).toHaveTextContent(SAVE_ERROR)
    expect(screen.queryByText('Saved')).not.toBeInTheDocument()
  })

  it('reports saved once the newest save succeeds', async () => {
    const saveA = deferredResponse()
    global.fetch = jest.fn().mockReturnValueOnce(saveA.promise) as unknown as typeof fetch

    render(<DayPlannerClient initialCollection={collection} />)

    await act(async () => {
      jest.advanceTimersByTime(SAVE_DEBOUNCE_MS)
    })
    expect(screen.getByText('Saving...')).toBeInTheDocument()

    await act(async () => {
      saveA.succeed()
      await saveA.promise
    })

    expect(screen.getByText('Saved')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
