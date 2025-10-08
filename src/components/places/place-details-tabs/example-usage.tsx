"use client"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { OverviewTab } from "./overview-tab"
import { MediaTab } from "./media-tab"
import { LinksTab } from "./links-tab"
import { BookingsTab } from "./bookings-tab"
import { PlanningTab } from "./planning-tab"
import { NotesTab } from "./notes-tab"
import type { PlaceWithRelations } from "@/types/database"

interface PlaceDetailsTabsProps {
  place: PlaceWithRelations
}

export function PlaceDetailsTabs({ place }: PlaceDetailsTabsProps) {
  return (
    <Tabs defaultValue="overview" className="w-full">
      <TabsList className="grid w-full grid-cols-6">
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="media">Media</TabsTrigger>
        <TabsTrigger value="links">Links</TabsTrigger>
        <TabsTrigger value="bookings">Bookings</TabsTrigger>
        <TabsTrigger value="planning">Planning</TabsTrigger>
        <TabsTrigger value="notes">Notes</TabsTrigger>
      </TabsList>

      <TabsContent value="overview">
        <OverviewTab place={place} />
      </TabsContent>

      <TabsContent value="media">
        <MediaTab place={place} />
      </TabsContent>

      <TabsContent value="links">
        <LinksTab place={place} />
      </TabsContent>

      <TabsContent value="bookings">
        <BookingsTab place={place} />
      </TabsContent>

      <TabsContent value="planning">
        <PlanningTab place={place} />
      </TabsContent>

      <TabsContent value="notes">
        <NotesTab place={place} />
      </TabsContent>
    </Tabs>
  )
}
