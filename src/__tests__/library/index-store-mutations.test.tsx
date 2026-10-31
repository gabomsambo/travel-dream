import { act, renderHook, waitFor } from '@testing-library/react'
import { beginMutation, clearLibraryIndex, revalidateIndex, useLibraryIndex } from '@/lib/library/index-store'
import { encodeIndex } from '@/lib/library/wire'
import { item, photo } from '../helpers/library-items'

const fetchMock = global.fetch as jest.Mock

const places = (ids: string[], tweak: Record<string, object> = {}) => ids.map((id) => item({ id, photos: [photo], ...(tweak[id] ?? {}) }))
const indexBody = (version: string, ids: string[], tweak: Record<string, object> = {}) =>
  JSON.parse(JSON.stringify(encodeIndex({ version, items: places(ids, tweak), collections: [] })))
const answer = (data: unknown, status = 200) => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(data) })

/** A fake server: `current` is the version it reports, `library` what it serves under that version. */
function fakeServer(initial: { version: string; ids: string[] }) {
  const server = { ...initial, tweak: {} as Record<string, object>, versionAsks: 0, indexAsks: [] as string[] }
  fetchMock.mockImplementation((url: string) => {
    if (url === '/api/library/version') {
      server.versionAsks++
      return answer({ version: server.version })
    }
    if (url.startsWith('/api/library/index')) {
      server.indexAsks.push(url)
      return answer(indexBody(server.version, server.ids, server.tweak))
    }
    return answer({})
  })
  return server
}

const idsOf = (r: { current: ReturnType<typeof useLibraryIndex> }) => r.current.index?.items.map((p) => p.id)

async function loaded(userId = 'usr_1', version = 'v1') {
  const hook = renderHook(() => useLibraryIndex(userId, version))
  await waitFor(() => expect(hook.result.current.index).not.toBeNull())
  fetchMock.mockClear()
  return hook
}

beforeEach(() => {
  clearLibraryIndex()
  fetchMock.mockReset()
})

describe('beginMutation', () => {
  it('shows an edit at once, before the server has answered', async () => {
    const server = fakeServer({ version: 'v1', ids: ['a', 'b', 'c'] })
    const { result } = await loaded()

    act(() => {
      beginMutation('usr_1', { kind: 'remove', ids: ['b'] })
    })
    expect(idsOf(result)).toEqual(['a', 'c'])
    expect(server.indexAsks).toEqual(['/api/library/index?v=v1'])
  })

  it('takes a refused edit off again, and looks at the library without refetching it when nothing moved', async () => {
    const server = fakeServer({ version: 'v1', ids: ['a', 'b', 'c'] })
    const { result } = await loaded()

    let pending!: ReturnType<typeof beginMutation>
    act(() => {
      pending = beginMutation('usr_1', { kind: 'remove', ids: ['b'] })
    })
    expect(idsOf(result)).toEqual(['a', 'c'])

    act(() => pending.rollback())
    expect(idsOf(result)).toEqual(['a', 'b', 'c'])
    await waitFor(() => expect(server.versionAsks).toBe(1))
    // Same version: the index in hand is the server's, so nothing is downloaded.
    expect(fetchMock.mock.calls.map(([u]) => u)).toEqual(['/api/library/version'])
    expect(idsOf(result)).toEqual(['a', 'b', 'c'])
  })

  it('keeps the part of a bulk edit that landed when the rest was refused', async () => {
    fakeServer({ version: 'v1', ids: ['a', 'b', 'c'] })
    const { result } = await loaded()

    let pending!: ReturnType<typeof beginMutation>
    act(() => {
      pending = beginMutation('usr_1', { kind: 'remove', ids: ['a', 'b'] })
    })
    act(() => pending.rollback({ kind: 'remove', ids: ['a'] }))
    expect(idsOf(result)).toEqual(['b', 'c'])
  })

  it('after a commit asks for the version, then fetches only the new one, and keeps showing the edit meanwhile', async () => {
    const server = fakeServer({ version: 'v1', ids: ['a', 'b', 'c'] })
    const { result } = await loaded()

    server.version = 'v2'
    server.ids = ['a', 'c']
    let release!: (b: unknown) => void
    fetchMock.mockImplementation((url: string) => {
      if (url === '/api/library/version') return answer({ version: 'v2' })
      return new Promise((resolve) => (release = (b) => resolve({ ok: true, status: 200, json: () => Promise.resolve(b) })))
    })

    act(() => {
      beginMutation('usr_1', { kind: 'remove', ids: ['b'] }).commit()
    })
    expect(idsOf(result)).toEqual(['a', 'c'])
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/library/index?v=v2'))
    // Still the patched view while the index is on its way.
    expect(idsOf(result)).toEqual(['a', 'c'])
    expect(fetchMock.mock.calls.map(([u]) => u)).toEqual(['/api/library/version', '/api/library/index?v=v2'])

    await act(async () => release(indexBody('v2', ['a', 'c'])))
    expect(idsOf(result)).toEqual(['a', 'c'])
  })

  it('does not touch what is on screen when the fetched index only confirms it', async () => {
    const server = fakeServer({ version: 'v1', ids: ['a', 'b', 'c'] })
    const { result } = await loaded()

    server.version = 'v2'
    server.ids = ['a', 'c']
    act(() => {
      beginMutation('usr_1', { kind: 'remove', ids: ['b'] }).commit()
    })
    const shown = result.current.index
    const renders: unknown[] = []
    const probe = renderHook(() => {
      const r = useLibraryIndex('usr_1', 'v1')
      renders.push(r.index)
      return r
    })
    renders.length = 0
    await waitFor(() => expect(server.indexAsks).toContain('/api/library/index?v=v2'))
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20))
    })
    expect(result.current.index).toBe(shown)
    expect(result.current.index?.items[0]).toBe(shown?.items[0])
    expect(new Set(renders).size).toBeLessThanOrEqual(1)
    probe.unmount()
  })

  it('replaces the edit with the server’s word when the server turned out to hold something else', async () => {
    const server = fakeServer({ version: 'v1', ids: ['a', 'b', 'c'] })
    const { result } = await loaded()

    // The server archived only one of the two the page assumed it would.
    server.version = 'v2'
    server.ids = ['a', 'c']
    act(() => {
      beginMutation('usr_1', { kind: 'remove', ids: ['b', 'c'] }).commit()
    })
    expect(idsOf(result)).toEqual(['a'])
    await waitFor(() => expect(idsOf(result)).toEqual(['a', 'c']))
  })

  it('drops a committed edit that left the version where it was', async () => {
    fakeServer({ version: 'v1', ids: ['a', 'b'] })
    const { result } = await loaded()

    act(() => {
      beginMutation('usr_1', { kind: 'remove', ids: ['b'] }).commit()
    })
    expect(idsOf(result)).toEqual(['a'])
    await waitFor(() => expect(idsOf(result)).toEqual(['a', 'b']))
  })

  it('keeps an edit that is still in flight when a fetch lands, and one committed after the fetch began', async () => {
    const server = fakeServer({ version: 'v1', ids: ['a', 'b', 'c', 'd'] })
    const { result } = await loaded()

    // Revalidation starts and stalls on the version.
    let releaseVersion!: (v: string) => void
    fetchMock.mockImplementation((url: string) => {
      if (url === '/api/library/version') return new Promise((resolve) => (releaseVersion = (v) => resolve({ ok: true, status: 200, json: () => Promise.resolve({ version: v }) })))
      server.indexAsks.push(url)
      return answer(indexBody('v2', ['a', 'b', 'c', 'd']))
    })
    act(() => revalidateIndex('usr_1'))

    let inFlight!: ReturnType<typeof beginMutation>
    act(() => {
      inFlight = beginMutation('usr_1', { kind: 'remove', ids: ['a'] })
      beginMutation('usr_1', { kind: 'remove', ids: ['b'] }).commit()
    })
    expect(idsOf(result)).toEqual(['c', 'd'])

    await act(async () => releaseVersion('v2'))
    await waitFor(() => expect(server.indexAsks).toContain('/api/library/index?v=v2'))
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20))
    })
    // The fetch began before either edit was taken: both stay on top of it.
    expect(idsOf(result)).toEqual(['c', 'd'])

    act(() => inFlight.rollback())
    expect(idsOf(result)).toEqual(['a', 'c', 'd'])
  })

  it('runs one revalidation at a time, and one more for what arrived while it ran', async () => {
    const server = fakeServer({ version: 'v1', ids: ['a'] })
    await loaded()
    act(() => {
      revalidateIndex('usr_1')
      revalidateIndex('usr_1')
      revalidateIndex('usr_1')
    })
    await waitFor(() => expect(server.versionAsks).toBe(2))
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20))
    })
    expect(server.versionAsks).toBe(2)
  })

  it('stays on what is shown when the library cannot be checked', async () => {
    fakeServer({ version: 'v1', ids: ['a', 'b'] })
    const { result } = await loaded()
    fetchMock.mockImplementation(() => answer({ error: 'down' }, 503))

    act(() => {
      beginMutation('usr_1', { kind: 'remove', ids: ['b'] }).commit()
    })
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/library/version'))
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20))
    })
    expect(idsOf(result)).toEqual(['a'])
    expect(result.current.error).toBe(false)
  })

  it('holds an edit made before the index arrived, over the index that arrives', async () => {
    let release!: (b: unknown) => void
    fetchMock.mockImplementation((url: string) => {
      if (url === '/api/library/version') return answer({ version: 'v2' })
      return new Promise((resolve) => (release = (b) => resolve({ ok: true, status: 200, json: () => Promise.resolve(b) })))
    })
    const { result } = renderHook(() => useLibraryIndex('usr_1', 'v1'))
    expect(result.current.index).toBeNull()
    act(() => {
      beginMutation('usr_1', { kind: 'remove', ids: ['b'] })
    })
    expect(result.current.index).toBeNull()

    await act(async () => release(indexBody('v1', ['a', 'b', 'c'])))
    await waitFor(() => expect(idsOf(result)).toEqual(['a', 'c']))
  })

  it('keeps one user’s edits out of another’s index', async () => {
    fakeServer({ version: 'v1', ids: ['a', 'b'] })
    const mine = await loaded('usr_1')
    const theirs = await loaded('usr_2')
    act(() => {
      beginMutation('usr_1', { kind: 'remove', ids: ['b'] })
    })
    expect(idsOf(mine.result)).toEqual(['a'])
    expect(idsOf(theirs.result)).toEqual(['a', 'b'])
  })
})
