import { act, renderHook, waitFor } from '@testing-library/react'
import { clearLibraryIndex, useLibraryIndex } from '@/lib/library/index-store'
import { encodeIndex } from '@/lib/library/wire'
import { item, photo } from '../helpers/library-items'

const fetchMock = global.fetch as jest.Mock

const body = (version: string, ids: string[]) =>
  JSON.parse(JSON.stringify(encodeIndex({ version, items: ids.map((id) => item({ id, photos: [photo] })), collections: [] })))
const answer = (data: unknown, status = 200) => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(data) })

beforeEach(() => {
  clearLibraryIndex()
  fetchMock.mockReset()
})

describe('useLibraryIndex', () => {
  it('has nothing until the index arrives, then holds it', async () => {
    fetchMock.mockReturnValueOnce(answer(body('v1', ['a', 'b'])))
    const { result } = renderHook(() => useLibraryIndex('usr_1', 'v1'))
    expect(result.current.index).toBeNull()

    await waitFor(() => expect(result.current.index?.items.map((p) => p.id)).toEqual(['a', 'b']))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith('/api/library/index?v=v1')
    expect(result.current.error).toBe(false)
  })

  it('asks once for a version however many places want it, and not again once held', async () => {
    fetchMock.mockReturnValue(answer(body('v1', ['a'])))
    const first = renderHook(() => useLibraryIndex('usr_1', 'v1'))
    const second = renderHook(() => useLibraryIndex('usr_1', 'v1'))
    await waitFor(() => expect(first.result.current.index).not.toBeNull())
    expect(second.result.current.index).toBe(first.result.current.index)

    // Back to the Library later in the session: held in memory, nothing fetched.
    first.unmount()
    second.unmount()
    const again = renderHook(() => useLibraryIndex('usr_1', 'v1'))
    expect(again.result.current.index?.version).toBe('v1')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('keeps the previous index on screen while a newer version loads', async () => {
    fetchMock.mockReturnValueOnce(answer(body('v1', ['a'])))
    const { result, rerender } = renderHook(({ v }) => useLibraryIndex('usr_1', v), { initialProps: { v: 'v1' } })
    await waitFor(() => expect(result.current.index?.version).toBe('v1'))

    let release!: (b: unknown) => void
    fetchMock.mockReturnValueOnce(new Promise((resolve) => (release = (b) => resolve({ ok: true, status: 200, json: () => Promise.resolve(b) }))))
    rerender({ v: 'v2' })
    expect(result.current.index?.version).toBe('v1')
    expect(fetchMock).toHaveBeenLastCalledWith('/api/library/index?v=v2')

    await act(async () => release(body('v2', ['a', 'c'])))
    await waitFor(() => expect(result.current.index?.items.map((p) => p.id)).toEqual(['a', 'c']))
  })

  it('keeps one user’s index out of another’s', async () => {
    fetchMock.mockReturnValue(answer(body('v1', ['a'])))
    const mine = renderHook(() => useLibraryIndex('usr_1', 'v1'))
    await waitFor(() => expect(mine.result.current.index).not.toBeNull())
    const theirs = renderHook(() => useLibraryIndex('usr_2', 'v1'))
    expect(theirs.result.current.index).toBeNull()
  })

  it('reports a failed fetch, and fetches again on retry', async () => {
    fetchMock.mockReturnValueOnce(answer({ error: 'nope' }, 500))
    const { result } = renderHook(() => useLibraryIndex('usr_1', 'v1'))
    await waitFor(() => expect(result.current.error).toBe(true))
    expect(result.current.index).toBeNull()

    fetchMock.mockReturnValueOnce(answer(body('v1', ['a'])))
    act(() => result.current.retry())
    await waitFor(() => expect(result.current.index?.version).toBe('v1'))
    expect(result.current.error).toBe(false)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('treats a body of another shape as a failure, not a library', async () => {
    fetchMock.mockReturnValueOnce(answer({ format: 99, version: 'v1', items: [], collections: [] }))
    const { result } = renderHook(() => useLibraryIndex('usr_1', 'v1'))
    await waitFor(() => expect(result.current.error).toBe(true))
    expect(result.current.index).toBeNull()
  })

  it('does not count a failed newer version against the older index still on screen', async () => {
    fetchMock.mockReturnValueOnce(answer(body('v1', ['a'])))
    const { result, rerender } = renderHook(({ v }) => useLibraryIndex('usr_1', v), { initialProps: { v: 'v1' } })
    await waitFor(() => expect(result.current.index?.version).toBe('v1'))

    fetchMock.mockReturnValueOnce(answer({ error: 'down' }, 503))
    rerender({ v: 'v2' })
    await waitFor(() => expect(result.current.error).toBe(true))
    expect(result.current.index?.version).toBe('v1')
  })

  it('treats a successful response as satisfying the requested version even when the body is newer', async () => {
    fetchMock.mockReturnValue(answer(body('v2', ['a', 'b'])))
    const { result } = renderHook(() => useLibraryIndex('usr_1', 'v1'))

    await waitFor(() => expect(result.current.index?.version).toBe('v2'))
    expect(result.current.index?.items.map((p) => p.id)).toEqual(['a', 'b'])
    expect(result.current.error).toBe(false)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith('/api/library/index?v=v1')

    await act(async () => {
      await new Promise((r) => setTimeout(r, 20))
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('ignores a late response for an older request once a newer version was asked for', async () => {
    let releaseV1!: (b: unknown) => void
    let releaseV2!: (b: unknown) => void
    fetchMock
      .mockReturnValueOnce(new Promise((resolve) => (releaseV1 = (b) => resolve({ ok: true, status: 200, json: () => Promise.resolve(b) }))))
      .mockReturnValueOnce(new Promise((resolve) => (releaseV2 = (b) => resolve({ ok: true, status: 200, json: () => Promise.resolve(b) }))))

    const { result, rerender } = renderHook(({ v }) => useLibraryIndex('usr_1', v), { initialProps: { v: 'v1' } })
    expect(fetchMock).toHaveBeenCalledWith('/api/library/index?v=v1')

    rerender({ v: 'v2' })
    expect(fetchMock).toHaveBeenCalledWith('/api/library/index?v=v2')

    await act(async () => releaseV2(body('v2', ['new'])))
    await waitFor(() => expect(result.current.index?.items.map((p) => p.id)).toEqual(['new']))

    await act(async () => releaseV1(body('v1', ['stale'])))
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20))
    })
    expect(result.current.index?.items.map((p) => p.id)).toEqual(['new'])
    expect(result.current.index?.version).toBe('v2')
  })
})
