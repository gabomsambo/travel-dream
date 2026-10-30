import { act, renderHook } from '@testing-library/react'
import { useLibraryHearts } from '@/hooks/use-library-hearts'
import { resetHeartWriterForTests, seedAccountHearts } from '@/lib/explore/dreams'

// One array per test, as the page's `data.heartIds` is: a new one each render would reseed every render.
beforeEach(() => resetHeartWriterForTests())

describe('useLibraryHearts', () => {
  it('starts on the hearts the account sent', () => {
    const heartIds = ['plc_1', 'plc_2']
    const { result } = renderHook(() => useLibraryHearts({ heartIds }))
    expect([...result.current.hearts].sort()).toEqual(['plc_1', 'plc_2'])
  })

  it('keeps the same Set when the writer publishes the hearts it already had', () => {
    const heartIds = ['plc_1']
    const { result } = renderHook(() => useLibraryHearts({ heartIds }))
    const first = result.current.hearts
    act(() => seedAccountHearts(['plc_1']))
    expect(result.current.hearts).toBe(first)
  })

  it('takes a new Set when the hearts change', () => {
    const heartIds = ['plc_1']
    const { result } = renderHook(() => useLibraryHearts({ heartIds }))
    const first = result.current.hearts
    act(() => seedAccountHearts(['plc_1', 'plc_2']))
    expect(result.current.hearts).not.toBe(first)
    expect([...result.current.hearts].sort()).toEqual(['plc_1', 'plc_2'])
  })
})
