import * as React from 'react'
import { act, render, screen } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import {
  LibraryActionsProvider,
  createLibraryLive,
  useIsHearted,
  useIsSelected,
  useIsSelecting,
  useLibraryActions,
  type LibraryActionFns,
  type LibraryActions,
} from '@/components/library/library-actions'

function actionsWith(over: Partial<LibraryActions> = {}): LibraryActions {
  return {
    hearts: new Set(),
    toggleHeart: jest.fn(),
    selected: new Set(),
    selecting: false,
    toggleSelect: jest.fn(),
    select: jest.fn(),
    activate: jest.fn(),
    openPlace: jest.fn(),
    archive: jest.fn(),
    remove: jest.fn(),
    addToCollection: jest.fn(),
    findImage: jest.fn(),
    ...over,
  }
}

const renders: Record<string, number> = {}
const count = (key: string) => {
  renders[key] = (renders[key] ?? 0) + 1
}

/** One place's view of the store: what a tile reads. */
function Probe({ id }: { id: string }) {
  count(id)
  const hearted = useIsHearted(id)
  const selected = useIsSelected(id)
  return (
    <span data-testid={id}>
      {hearted ? 'hearted' : 'plain'}/{selected ? 'selected' : 'unselected'}
    </span>
  )
}

function Mode() {
  count('mode')
  return <span data-testid="mode">{useIsSelecting() ? 'selecting' : 'idle'}</span>
}

beforeEach(() => {
  for (const key of Object.keys(renders)) delete renders[key]
})

describe('createLibraryLive', () => {
  const base = { hearts: new Set<string>(), selected: new Set<string>(), selecting: false }

  it('tells subscribers when the state changes, and not when it is the same state again', () => {
    const live = createLibraryLive(base)
    const listener = jest.fn()
    live.subscribe(listener)
    live.set({ ...base })
    expect(listener).not.toHaveBeenCalled()
    const hearts = new Set(['plc_1'])
    live.set({ ...base, hearts })
    expect(listener).toHaveBeenCalledTimes(1)
    expect(live.get().hearts).toBe(hearts)
  })

  it('stops telling a subscriber that has left', () => {
    const live = createLibraryLive(base)
    const listener = jest.fn()
    const off = live.subscribe(listener)
    off()
    live.set({ ...base, selecting: true })
    expect(listener).not.toHaveBeenCalled()
  })
})

describe('LibraryActionsProvider', () => {
  it('hands places the same functions however often the page re-renders', () => {
    const seen: LibraryActionFns[] = []
    function Capture() {
      seen.push(useLibraryActions())
      return null
    }
    const { rerender } = render(
      <LibraryActionsProvider value={actionsWith()}>
        <Capture />
      </LibraryActionsProvider>
    )
    rerender(
      <LibraryActionsProvider value={actionsWith({ hearts: new Set(['plc_1']), selected: new Set(['plc_2']), selecting: true })}>
        <Capture />
      </LibraryActionsProvider>
    )
    expect(seen.length).toBeGreaterThan(0)
    for (const fns of seen) expect(fns).toBe(seen[0])
  })

  it('calls the latest functions the page gave it, through the fixed ones', () => {
    let fns!: LibraryActionFns
    function Capture() {
      fns = useLibraryActions()
      return null
    }
    const first = actionsWith()
    const second = actionsWith()
    const { rerender } = render(
      <LibraryActionsProvider value={first}>
        <Capture />
      </LibraryActionsProvider>
    )
    rerender(
      <LibraryActionsProvider value={second}>
        <Capture />
      </LibraryActionsProvider>
    )
    fns.toggleHeart('plc_1')
    fns.toggleSelect('plc_1', { shiftKey: true })
    fns.select('plc_1')
    fns.activate('plc_1', ['plc_1', 'plc_2'], { shiftKey: false })
    fns.openPlace('plc_1', ['plc_1'])
    fns.archive(['plc_1'])
    fns.remove(['plc_1'])
    fns.addToCollection(['plc_1'])
    fns.findImage({ id: 'plc_1' } as Parameters<LibraryActionFns['findImage']>[0])
    expect(first.toggleHeart).not.toHaveBeenCalled()
    expect(second.toggleHeart).toHaveBeenCalledWith('plc_1')
    expect(second.toggleSelect).toHaveBeenCalledWith('plc_1', { shiftKey: true })
    expect(second.select).toHaveBeenCalledWith('plc_1')
    expect(second.activate).toHaveBeenCalledWith('plc_1', ['plc_1', 'plc_2'], { shiftKey: false })
    expect(second.openPlace).toHaveBeenCalledWith('plc_1', ['plc_1'])
    expect(second.archive).toHaveBeenCalledWith(['plc_1'])
    expect(second.remove).toHaveBeenCalledWith(['plc_1'])
    expect(second.addToCollection).toHaveBeenCalledWith(['plc_1'])
    expect(second.findImage).toHaveBeenCalledWith({ id: 'plc_1' })
  })

  it('re-renders only the place whose heart changed', () => {
    // Built once: the same elements each time, so only a subscription can re-render a place.
    const kids = (
      <>
        <Probe id="plc_1" />
        <Probe id="plc_2" />
        <Probe id="plc_3" />
      </>
    )
    const view = (hearts: string[]) => <LibraryActionsProvider value={actionsWith({ hearts: new Set(hearts) })}>{kids}</LibraryActionsProvider>
    const { rerender } = render(view([]))
    const before = { ...renders }
    rerender(view(['plc_2']))
    expect(screen.getByTestId('plc_2')).toHaveTextContent('hearted/unselected')
    expect(screen.getByTestId('plc_1')).toHaveTextContent('plain/unselected')
    expect(renders.plc_2).toBeGreaterThan(before.plc_2)
    expect(renders.plc_1).toBe(before.plc_1)
    expect(renders.plc_3).toBe(before.plc_3)
  })

  it('re-renders only the places whose selection changed, and everything when Select turns on or off', () => {
    const kids = (
      <>
        <Probe id="plc_1" />
        <Probe id="plc_2" />
        <Mode />
      </>
    )
    const view = (selected: string[], selecting: boolean) => (
      <LibraryActionsProvider value={actionsWith({ selected: new Set(selected), selecting })}>{kids}</LibraryActionsProvider>
    )
    const { rerender } = render(view([], false))
    expect(screen.getByTestId('mode')).toHaveTextContent('idle')

    let before = { ...renders }
    rerender(view(['plc_1'], true))
    expect(screen.getByTestId('mode')).toHaveTextContent('selecting')
    expect(screen.getByTestId('plc_1')).toHaveTextContent('plain/selected')
    expect(renders.mode).toBeGreaterThan(before.mode)
    expect(renders.plc_2).toBe(before.plc_2)

    before = { ...renders }
    rerender(view(['plc_1', 'plc_2'], true))
    expect(screen.getByTestId('plc_2')).toHaveTextContent('plain/selected')
    expect(renders.plc_1).toBe(before.plc_1)
    expect(renders.mode).toBe(before.mode)
  })

  it('starts a place on the state the page started with, so the server markup is right', () => {
    // jsdom has a window, so React 18 warns about the layout effect a real server never sees.
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    const html = renderToString(
      <LibraryActionsProvider value={actionsWith({ hearts: new Set(['plc_1']), selected: new Set(['plc_2']), selecting: true })}>
        <Probe id="plc_1" />
        <Probe id="plc_2" />
        <Mode />
      </LibraryActionsProvider>
    )
    spy.mockRestore()
    expect(html).toContain('hearted')
    expect(html).toContain('selected')
    expect(html).toContain('selecting')
  })

  it('shows a place that mounts later the current state, not the one it started with', () => {
    function Later({ show }: { show: boolean }) {
      return (
        <LibraryActionsProvider value={actionsWith({ hearts: new Set(['plc_9']) })}>{show && <Probe id="plc_9" />}</LibraryActionsProvider>
      )
    }
    const { rerender } = render(<Later show={false} />)
    rerender(<Later show />)
    expect(screen.getByTestId('plc_9')).toHaveTextContent('hearted/unselected')
  })

  it('keeps an update a discarded render never committed out of the places', () => {
    const Suspender = React.lazy(() => new Promise<{ default: () => null }>(() => undefined))
    function Page({ hearts, hang }: { hearts: string[]; hang: boolean }) {
      return (
        <LibraryActionsProvider value={actionsWith({ hearts: new Set(hearts) })}>
          <Probe id="plc_1" />
          <React.Suspense fallback={null}>{hang && <Suspender />}</React.Suspense>
        </LibraryActionsProvider>
      )
    }
    const { rerender } = render(<Page hearts={[]} hang={false} />)
    act(() => {
      React.startTransition(() => rerender(<Page hearts={['plc_1']} hang />))
    })
    // The transition is suspended and not committed: the store still reads what is on screen.
    expect(screen.getByTestId('plc_1')).toHaveTextContent('plain/unselected')
  })

  it('refuses to render a place outside a provider', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    expect(() => render(<Probe id="plc_1" />)).toThrow(/LibraryActionsProvider/)
    spy.mockRestore()
  })
})
