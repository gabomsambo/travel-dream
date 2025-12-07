"use client"

import { useState, type ReactNode } from 'react'
import { Map } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { useCollectionMapContext } from './collection-map-context'

interface MobileMapSheetProps {
  children: ReactNode
}

export function MobileMapSheet({ children }: MobileMapSheetProps) {
  const [isOpen, setIsOpen] = useState(false)
  const { currentPlaces } = useCollectionMapContext()

  const placeCount = currentPlaces.length

  return (
    <>
      <Button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 right-4 z-40 lg:hidden h-14 w-14 rounded-full shadow-lg"
        size="icon"
      >
        <Map className="h-6 w-6" />
        {placeCount > 0 && (
          <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-primary-foreground text-primary text-xs font-medium flex items-center justify-center">
            {placeCount > 99 ? '99+' : placeCount}
          </span>
        )}
      </Button>

      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <SheetContent
          side="bottom"
          className="h-[70vh] p-0 rounded-t-xl"
        >
          <SheetHeader className="px-4 py-3 border-b">
            <div className="flex items-center justify-between">
              <SheetTitle className="text-base">
                Map View ({placeCount} {placeCount === 1 ? 'place' : 'places'})
              </SheetTitle>
            </div>
            <div className="w-12 h-1 bg-muted rounded-full mx-auto" />
          </SheetHeader>
          <div className="h-[calc(70vh-60px)] w-full">
            {children}
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
