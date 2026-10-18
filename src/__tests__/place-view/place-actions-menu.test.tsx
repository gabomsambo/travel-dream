import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PlaceActionsMenu } from '@/components/places/place-view/place-actions-menu'
import { PlaceHero } from '@/components/places/place-view/place-hero'
import { notify } from '@/lib/notify'
import { toastWithNavigate } from '@/lib/toast-navigate'
import type { PlaceWithRelations } from '@/types/database'

const mockRouter = { back: jest.fn(), push: jest.fn(), refresh: jest.fn() }
jest.mock('next/navigation', () => ({ useRouter: () => mockRouter }))
jest.mock('@/lib/notify', () => ({ notify: { success: jest.fn(), error: jest.fn() } }))
jest.mock('@/lib/toast-navigate', () => ({ toastWithNavigate: jest.fn() }))

const ok = { ok: true, json: async () => ({ status: 'success' }) }

function renderMenu(status = 'library') {
  render(<PlaceActionsMenu placeId="plc_fushimi" placeName="Fushimi Inari-taisha" status={status} />)
}

async function openMenu() {
  await userEvent.click(screen.getByRole('button', { name: 'More actions' }))
}

describe('PlaceActionsMenu', () => {
  let fetchMock: jest.Mock
  const originalLength = Object.getOwnPropertyDescriptor(window.History.prototype, 'length')

  const setHistoryLength = (length: number) => {
    Object.defineProperty(window.history, 'length', { configurable: true, get: () => length })
  }

  beforeEach(() => {
    jest.clearAllMocks()
    fetchMock = jest.fn().mockResolvedValue(ok)
    global.fetch = fetchMock as unknown as typeof fetch
    setHistoryLength(3)
  })

  afterAll(() => {
    if (originalLength) Object.defineProperty(window.History.prototype, 'length', originalLength)
  })

  it('offers Open classic editor without changing the place', async () => {
    const onOpenClassic = jest.fn()
    render(<PlaceActionsMenu placeId="plc_fushimi" placeName="Fushimi Inari-taisha" status="library" onOpenClassic={onOpenClassic} />)
    await openMenu()
    await userEvent.click(screen.getByRole('menuitem', { name: 'Open classic editor' }))
    expect(onOpenClassic).toHaveBeenCalledTimes(1)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('archives through the existing PATCH endpoint, points to the Archive and goes back', async () => {
    renderMenu()
    await openMenu()
    await userEvent.click(screen.getByRole('menuitem', { name: /Archive/ }))

    await waitFor(() => expect(mockRouter.back).toHaveBeenCalled())
    expect(fetchMock).toHaveBeenCalledWith('/api/places/plc_fushimi', expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({ status: 'archived' }),
    }))
    expect(toastWithNavigate).toHaveBeenCalledWith('Archived “Fushimi Inari-taisha”', '/archive', expect.objectContaining({ actionLabel: 'View archive' }))
  })

  it('lands on the Library when there is no page to go back to', async () => {
    setHistoryLength(1)
    renderMenu()
    await openMenu()
    await userEvent.click(screen.getByRole('menuitem', { name: /Archive/ }))

    await waitFor(() => expect(mockRouter.push).toHaveBeenCalledWith('/library'))
    expect(mockRouter.back).not.toHaveBeenCalled()
  })

  it('offers Restore on an archived place and stays on the page', async () => {
    renderMenu('archived')
    await openMenu()
    expect(screen.queryByRole('menuitem', { name: /^Archive$/ })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('menuitem', { name: /Restore to library/ }))

    await waitFor(() => expect(mockRouter.refresh).toHaveBeenCalled())
    expect(fetchMock).toHaveBeenCalledWith('/api/places/plc_fushimi', expect.objectContaining({ body: JSON.stringify({ status: 'library' }) }))
    expect(mockRouter.back).not.toHaveBeenCalled()
  })

  it('tells Review a restore succeeded before the refresh', async () => {
    const order: string[] = []
    mockRouter.refresh.mockImplementation(() => { order.push('refresh') })
    const onRestored = jest.fn(() => { order.push('restored') })
    render(<PlaceActionsMenu placeId="plc_fushimi" placeName="Fushimi Inari-taisha" status="archived" onRestored={onRestored} />)
    await openMenu()
    await userEvent.click(screen.getByRole('menuitem', { name: /Restore to library/ }))

    await waitFor(() => expect(onRestored).toHaveBeenCalledTimes(1))
    expect(order).toEqual(['restored', 'refresh'])
    expect(fetchMock).toHaveBeenCalledWith('/api/places/plc_fushimi', expect.objectContaining({ body: JSON.stringify({ status: 'library' }) }))
    expect(mockRouter.back).not.toHaveBeenCalled()
  })

  it('does not tell Review to restore when the request fails', async () => {
    const onRestored = jest.fn()
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ message: 'Place not found' }) })
    render(<PlaceActionsMenu placeId="plc_fushimi" placeName="Fushimi Inari-taisha" status="archived" onRestored={onRestored} />)
    await openMenu()
    await userEvent.click(screen.getByRole('menuitem', { name: /Restore to library/ }))

    await waitFor(() => expect(notify.error).toHaveBeenCalledWith('Place not found'))
    expect(onRestored).not.toHaveBeenCalled()
    expect(mockRouter.refresh).not.toHaveBeenCalled()
    expect(mockRouter.back).not.toHaveBeenCalled()
  })

  it('asks before deleting, naming the place, and Cancel deletes nothing', async () => {
    renderMenu()
    await openMenu()
    await userEvent.click(screen.getByRole('menuitem', { name: /Delete/ }))

    expect(screen.getByRole('alertdialog')).toHaveTextContent('Delete “Fushimi Inari-taisha”?')
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('deletes through the existing DELETE endpoint once confirmed, then goes back', async () => {
    renderMenu()
    await openMenu()
    await userEvent.click(screen.getByRole('menuitem', { name: /Delete/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Delete place' }))

    await waitFor(() => expect(mockRouter.back).toHaveBeenCalled())
    expect(fetchMock).toHaveBeenCalledWith('/api/places/plc_fushimi', { method: 'DELETE' })
    expect(notify.success).toHaveBeenCalledWith('Deleted “Fushimi Inari-taisha”')
  })

  it('lets the surrounding queue archive without leaving the page', async () => {
    const onArchive = jest.fn()
    render(<PlaceActionsMenu placeId="plc_fushimi" placeName="Fushimi Inari-taisha" status="inbox" onArchive={onArchive} />)
    await openMenu()
    await userEvent.click(screen.getByRole('menuitem', { name: /Archive/ }))

    expect(onArchive).toHaveBeenCalledTimes(1)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(toastWithNavigate).not.toHaveBeenCalled()
    expect(mockRouter.back).not.toHaveBeenCalled()
    expect(mockRouter.push).not.toHaveBeenCalled()
  })

  it('deletes after confirmation and lets the queue advance instead of going back', async () => {
    const onDeleted = jest.fn()
    render(<PlaceActionsMenu placeId="plc_fushimi" placeName="Fushimi Inari-taisha" status="inbox" onDeleted={onDeleted} />)
    await openMenu()
    await userEvent.click(screen.getByRole('menuitem', { name: /Delete/ }))

    expect(screen.getByRole('alertdialog')).toHaveTextContent('Delete “Fushimi Inari-taisha”?')
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(fetchMock).not.toHaveBeenCalled()
    expect(onDeleted).not.toHaveBeenCalled()

    await openMenu()
    await userEvent.click(screen.getByRole('menuitem', { name: /Delete/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Delete place' }))

    await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1))
    expect(fetchMock).toHaveBeenCalledWith('/api/places/plc_fushimi', { method: 'DELETE' })
    expect(notify.success).toHaveBeenCalledWith('Deleted “Fushimi Inari-taisha”')
    expect(mockRouter.back).not.toHaveBeenCalled()
    expect(mockRouter.push).not.toHaveBeenCalled()
  })

  it('does not tell the queue to advance when delete fails', async () => {
    const onDeleted = jest.fn()
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ message: 'Place not found' }) })
    render(<PlaceActionsMenu placeId="plc_fushimi" placeName="Fushimi Inari-taisha" status="inbox" onDeleted={onDeleted} />)
    await openMenu()
    await userEvent.click(screen.getByRole('menuitem', { name: /Delete/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Delete place' }))

    await waitFor(() => expect(notify.error).toHaveBeenCalledWith('Place not found'))
    expect(onDeleted).not.toHaveBeenCalled()
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    expect(mockRouter.back).not.toHaveBeenCalled()
  })

  it('keeps the dialog open and stays put when the delete fails', async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ message: 'Place not found' }) })
    renderMenu()
    await openMenu()
    await userEvent.click(screen.getByRole('menuitem', { name: /Delete/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Delete place' }))

    await waitFor(() => expect(notify.error).toHaveBeenCalledWith('Place not found'))
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    expect(mockRouter.back).not.toHaveBeenCalled()
    expect(mockRouter.push).not.toHaveBeenCalled()
  })
})

describe('postcard menu inside Review', () => {
  let fetchMock: jest.Mock

  beforeEach(() => {
    jest.clearAllMocks()
    fetchMock = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ status: 'success' }) })
    global.fetch = fetchMock as unknown as typeof fetch
    Object.defineProperty(window.history, 'length', { configurable: true, get: () => 3 })
  })

  function renderHero(onArchive: () => void, onDeleted: () => void, onRestored?: () => void, status = 'inbox') {
    const place = {
      id: 'plc_fushimi',
      name: 'Fushimi Inari-taisha',
      kind: 'temple',
      status,
      city: 'Kyoto',
      country: 'Japan',
      vibes: [],
      visitStatus: 'not_visited',
      priority: 0,
      googlePlaceId: null,
    } as unknown as PlaceWithRelations
    render(
      <PlaceHero
        place={place}
        photos={[]}
        onEdit={() => {}}
        onOpenPhoto={() => {}}
        onPhotoAttached={() => {}}
        onArchive={onArchive}
        onDeleted={onDeleted}
        onRestored={onRestored}
      />
    )
  }

  it('archives and deletes through the queue without going back', async () => {
    const onArchive = jest.fn()
    const onDeleted = jest.fn()
    renderHero(onArchive, onDeleted)

    await userEvent.click(screen.getByRole('button', { name: 'More actions' }))
    await userEvent.click(screen.getByRole('menuitem', { name: /Archive/ }))
    expect(onArchive).toHaveBeenCalledTimes(1)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(mockRouter.back).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: 'More actions' }))
    await userEvent.click(screen.getByRole('menuitem', { name: /Delete/ }))
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Delete place' }))

    await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1))
    expect(fetchMock).toHaveBeenCalledWith('/api/places/plc_fushimi', { method: 'DELETE' })
    expect(mockRouter.back).not.toHaveBeenCalled()
    expect(mockRouter.push).not.toHaveBeenCalled()
  })

  it('restores through the hero menu before refreshing', async () => {
    const order: string[] = []
    mockRouter.refresh.mockImplementation(() => { order.push('refresh') })
    const onRestored = jest.fn(() => { order.push('restored') })
    renderHero(jest.fn(), jest.fn(), onRestored, 'archived')

    await userEvent.click(screen.getByRole('button', { name: 'More actions' }))
    await userEvent.click(screen.getByRole('menuitem', { name: /Restore to library/ }))

    await waitFor(() => expect(onRestored).toHaveBeenCalledTimes(1))
    expect(order).toEqual(['restored', 'refresh'])
    expect(mockRouter.back).not.toHaveBeenCalled()
    expect(mockRouter.push).not.toHaveBeenCalled()
  })
})
