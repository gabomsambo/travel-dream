"use client"

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/adapters/command"
import {
  Inbox,
  Library,
  FolderOpen,
  GitPullRequest,
  Map,
  Plus,
  Search,
  Settings,
  Download,
  MapPin,
} from 'lucide-react'

interface CommandPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const router = useRouter()
  const [search, setSearch] = useState('')

  // Mock data - in real app this would come from database
  const mockPlaces = [
    { id: '1', name: 'Park Güell', city: 'Barcelona', kind: 'landmark' },
    { id: '2', name: 'Sagrada Familia', city: 'Barcelona', kind: 'landmark' },
    { id: '3', name: 'Casa Batlló', city: 'Barcelona', kind: 'landmark' },
    { id: '4', name: 'La Boqueria Market', city: 'Barcelona', kind: 'market' },
  ]

  const mockCollections = [
    { id: '1', name: 'Barcelona Weekend' },
    { id: '2', name: 'Hidden Gems Barcelona' },
    { id: '3', name: 'Sunset Spots' },
  ]

  const runCommand = (command: () => void) => {
    onOpenChange(false)
    command()
  }

  const filteredPlaces = mockPlaces.filter(place =>
    place.name.toLowerCase().includes(search.toLowerCase()) ||
    place.city.toLowerCase().includes(search.toLowerCase())
  )

  const filteredCollections = mockCollections.filter(collection =>
    collection.name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput 
        placeholder="Search places, collections, or commands..." 
        value={search}
        onValueChange={setSearch}
      />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        
        {/* Navigation Commands */}
        <CommandGroup heading="Navigation">
          <CommandItem onSelect={() => runCommand(() => router.push('/inbox'))}>
            <Inbox className="mr-2 h-4 w-4" />
            <span>Go to Inbox</span>
            <CommandShortcut>⌘I</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => router.push('/review'))}>
            <GitPullRequest className="mr-2 h-4 w-4" />
            <span>Go to Review</span>
            <CommandShortcut>⌘R</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => router.push('/library'))}>
            <Library className="mr-2 h-4 w-4" />
            <span>Go to Library</span>
            <CommandShortcut>⌘L</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => router.push('/collections'))}>
            <FolderOpen className="mr-2 h-4 w-4" />
            <span>Go to Collections</span>
            <CommandShortcut>⌘C</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => router.push('/map'))}>
            <Map className="mr-2 h-4 w-4" />
            <span>Go to Map</span>
            <CommandShortcut>⌘M</CommandShortcut>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        {/* Quick Actions */}
        <CommandGroup heading="Actions">
          <CommandItem onSelect={() => runCommand(() => console.log('Quick add'))}>
            <Plus className="mr-2 h-4 w-4" />
            <span>Quick Add Place</span>
            <CommandShortcut>⌘N</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => console.log('Advanced search'))}>
            <Search className="mr-2 h-4 w-4" />
            <span>Advanced Search</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => router.push('/settings'))}>
            <Settings className="mr-2 h-4 w-4" />
            <span>Settings</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => router.push('/export'))}>
            <Download className="mr-2 h-4 w-4" />
            <span>Export Data</span>
          </CommandItem>
        </CommandGroup>

        {/* Places */}
        {filteredPlaces.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Places">
              {filteredPlaces.slice(0, 5).map((place) => (
                <CommandItem
                  key={place.id}
                  onSelect={() => runCommand(() => router.push(`/library?place=${place.id}`))}
                >
                  <MapPin className="mr-2 h-4 w-4" />
                  <span>{place.name}</span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {place.city} • {place.kind}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {/* Collections */}
        {filteredCollections.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Collections">
              {filteredCollections.slice(0, 3).map((collection) => (
                <CommandItem
                  key={collection.id}
                  onSelect={() => runCommand(() => router.push(`/collections/${collection.id}`))}
                >
                  <FolderOpen className="mr-2 h-4 w-4" />
                  <span>{collection.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  )
}
