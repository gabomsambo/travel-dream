'use client'

import { ChevronDown, Luggage } from 'lucide-react'
import { Button } from '@/components/adapters/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { ExploreCollection } from '@/lib/explore/types'

interface BatchTripMenuProps {
  trips: ExploreCollection[]
  /** The trip that Adds will use, or null for Library only. */
  selectedId: string | null
  onSelect: (choice: string | 'none') => void
}

function TripMenuItems({ trips, selectedId, onSelect }: BatchTripMenuProps) {
  return (
    <>
      <DropdownMenuLabel>Also add to</DropdownMenuLabel>
      <DropdownMenuSeparator />
      <DropdownMenuRadioGroup
        value={selectedId ?? 'none'}
        onValueChange={(value) => onSelect(value === 'none' ? 'none' : value)}
      >
        <DropdownMenuRadioItem value="none">No trip</DropdownMenuRadioItem>
        {trips.map((trip) => (
          <DropdownMenuRadioItem key={trip.id} value={trip.id}>
            {trip.name}
          </DropdownMenuRadioItem>
        ))}
      </DropdownMenuRadioGroup>
    </>
  )
}

/** Sticky batch trip: “Also add to London long weekend”, or “No trip” when nothing is chosen. */
export function BatchTripChip({
  trips,
  selectedId,
  selectedName,
  onSelect,
}: BatchTripMenuProps & { selectedName: string | null }) {
  const label = selectedName ? `Also add to ${selectedName}` : 'No trip'
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={label}
          className="inline-flex max-w-full items-center gap-2 whitespace-nowrap rounded-full border bg-background py-1 pl-1 pr-3 text-xs shadow-sm"
        >
          <span className="grid h-6 w-6 place-items-center rounded-full bg-primary/10 text-primary">
            <Luggage className="h-3.5 w-3.5" aria-hidden />
          </span>
          {selectedName ? (
            <span className="truncate">Also add to <strong className="font-semibold">{selectedName}</strong></span>
          ) : (
            <span>No trip</span>
          )}
          <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="z-[60] min-w-56">
        <TripMenuItems trips={trips} selectedId={selectedId} onSelect={onSelect} />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** The split-button chevron beside Add, so the batch trip can be changed from the decision itself. */
export function BatchTripChevron({ trips, selectedId, onSelect }: BatchTripMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" className="rounded-l-none px-2.5" aria-label="Choose a trip">
          <ChevronDown className="h-4 w-4" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="z-[60] min-w-56">
        <TripMenuItems trips={trips} selectedId={selectedId} onSelect={onSelect} />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
