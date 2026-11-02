import * as React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ScopeSelector } from '@/components/export/scope-selector'
import type { Collection } from '@/types/database'
import type { ExportScope } from '@/types/export'

const collections = [
  { id: 'col_first', name: 'First Trip' },
  { id: 'col_japan', name: 'Japan Spring Trip' },
] as Collection[]

const filterOptions = {
  kinds: ['landmark'],
  cities: ['Kyoto'],
  countries: ['Japan'],
  tags: [],
  vibes: [],
}

function Harness({ initial }: { initial: ExportScope }) {
  const [scope, setScope] = React.useState(initial)
  return (
    <ScopeSelector
      scope={scope}
      onScopeChange={setScope}
      collections={collections}
      filterOptions={filterOptions}
    />
  )
}

describe('export scope mobile tap targets', () => {
  it('lets the whole Library row label select that scope', async () => {
    const user = userEvent.setup()
    const onScopeChange = jest.fn()
    render(
      <ScopeSelector
        scope={{ type: 'collection', collectionId: 'col_japan' }}
        onScopeChange={onScopeChange}
        collections={collections}
        filterOptions={filterOptions}
      />,
    )

    await user.click(screen.getByText('Library'))
    expect(onScopeChange).toHaveBeenCalledWith({ type: 'library' })
  })

  it('does not reset a chosen collection when Collection is tapped again', async () => {
    const user = userEvent.setup()
    const onScopeChange = jest.fn()
    render(
      <ScopeSelector
        scope={{ type: 'collection', collectionId: 'col_japan' }}
        onScopeChange={onScopeChange}
        collections={collections}
        filterOptions={filterOptions}
      />,
    )

    await user.click(screen.getByText('Collection'))
    expect(onScopeChange).not.toHaveBeenCalled()
  })

  it('switches scope via row labels and restores Collection with the first collection', async () => {
    const user = userEvent.setup()
    render(<Harness initial={{ type: 'collection', collectionId: 'col_japan' }} />)

    await user.click(screen.getByText('Library'))
    expect(screen.getByLabelText('Filter by City')).toBeInTheDocument()

    await user.click(screen.getByText('Collection'))
    expect(screen.getByRole('combobox')).toHaveTextContent('First Trip')
  })
})
