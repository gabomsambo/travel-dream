import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LibraryClient } from '@/components/library/library-client'
import type { LibraryData } from '@/lib/library/types'
import { item, photo } from '../helpers/library-items'

const countries = ['Japan', 'Italy', 'Mexico']
const items = Array.from({ length: 14 }, (_, i) =>
  item({
    id: `plc_${i}`,
    name: `Place ${i}`,
    country: countries[i % 3],
    city: `City ${i % 3}`,
    photos: i === 0 ? [] : [photo],
    visitStatus: i < 4 ? 'visited' : i < 6 ? 'planned' : 'not_visited',
    lastVisited: i < 4 ? '2024-04-12' : null,
    createdAt: `2025-0${(i % 9) + 1}-01T00:00:00Z`,
  })
)

const data: LibraryData = {
  items,
  collections: [{ id: 'col_1', name: 'Kyoto in autumn', placeIds: ['plc_1', 'plc_4'] }],
  inboxCount: 3,
}

beforeEach(() => {
  localStorage.clear()
  ;(global.fetch as jest.Mock).mockReset()
})

describe('LibraryClient', () => {
  it('opens on the journal cover, the shelves and country chapters', () => {
    render(<LibraryClient data={data} />)
    expect(screen.getByRole('heading', { level: 1, name: 'Your atlas' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Been\s*4/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Needs review/ })).toHaveAttribute('href', '/inbox')
    expect(screen.getByRole('heading', { level: 2, name: 'Japan' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Kyoto in autumn/ })).toHaveAttribute('href', '/collections/col_1')
  })

  it('opens the quick-look sheet on click, which leads to the Postcard — not the old tabbed dialog', async () => {
    const user = userEvent.setup()
    render(<LibraryClient data={data} />)
    await user.click(screen.getAllByRole('button', { name: /^Place 3,/ })[0])
    const sheet = await screen.findByRole('dialog', { name: 'Place 3' })
    expect(within(sheet).getByRole('link', { name: /Open place/ })).toHaveAttribute('href', '/place/plc_3')
    expect(within(sheet).queryByRole('tab')).not.toBeInTheDocument()
  })

  it('gives every card a working ⋯ menu, and Delete goes through the typed confirmation', async () => {
    const user = userEvent.setup()
    render(<LibraryClient data={data} />)
    await user.click(screen.getByRole('button', { name: 'More for Place 0' }))
    const menu = await screen.findByRole('menu')
    for (const label of [/Quick look/, /Open place/, /Heart it/, /Find image/, /Select/, /Archive/, /Delete/]) {
      expect(within(menu).getByRole('menuitem', { name: label })).toBeInTheDocument()
    }
    await user.click(within(menu).getByRole('menuitem', { name: /Delete/ }))
    const confirm = await screen.findByRole('alertdialog')
    expect(within(confirm).getByRole('button', { name: /Delete Permanently/ })).toBeDisabled()
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('hearts a place on this device, shared with Shuffle', async () => {
    const user = userEvent.setup()
    render(<LibraryClient data={data} />)
    await user.click(screen.getByRole('button', { name: 'Heart Place 2' }))
    expect(JSON.parse(localStorage.getItem('travel-dreams-favorites') ?? '[]')).toEqual(['plc_2'])
    expect(screen.getByRole('button', { name: 'Remove heart from Place 2' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('narrows to a shelf', async () => {
    const user = userEvent.setup()
    render(<LibraryClient data={data} />)
    await user.click(screen.getByRole('button', { name: /Planned\s*2/ }))
    expect(screen.getByRole('button', { name: /Planned\s*2/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByRole('button', { name: /^Place 0,/ })).not.toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /^Place 4,/ }).length).toBeGreaterThan(0)
  })

  it('switches between the four views', async () => {
    const user = userEvent.setup()
    render(<LibraryClient data={data} />)
    for (const name of ['Gallery', 'Journal', 'Compact list', 'Map']) {
      expect(screen.getByRole('radio', { name })).toBeInTheDocument()
    }
    await user.click(screen.getByRole('radio', { name: 'Compact list' }))
    expect(screen.getAllByRole('table', { name: 'Places' }).length).toBeGreaterThan(0)
    await user.click(screen.getByRole('radio', { name: 'Journal' }))
    expect(screen.getAllByRole('article').length).toBeGreaterThan(0)
  })
})
