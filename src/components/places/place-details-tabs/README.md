# Place Details Tabs

Enhanced place details dialog tabs for the Travel Dreams Collection app.

## Overview

Six tabbed components for displaying and editing detailed place information:

1. **OverviewTab** - Basic info, location, tags, vibes, activities, cuisine, amenities
2. **MediaTab** - Photo gallery with upload/delete functionality
3. **LinksTab** - Saved links with favicon display and type categorization
4. **BookingsTab** - Reservations, contact info, hours, practical details
5. **PlanningTab** - Visit status, priority rating, dates, companions
6. **NotesTab** - Personal notes and practical information

## Usage

```tsx
import { PlaceDetailsTabs } from "@/components/places/place-details-tabs"

// In your component
<PlaceDetailsTabs place={placeWithRelations} />
```

Or use individual tabs:

```tsx
import { OverviewTab, MediaTab } from "@/components/places/place-details-tabs"

<Tabs>
  <TabsContent value="overview">
    <OverviewTab place={place} />
  </TabsContent>
  <TabsContent value="media">
    <MediaTab place={place} />
  </TabsContent>
</Tabs>
```

## Type Requirements

All tabs require `PlaceWithRelations` type:

```typescript
type PlaceWithRelations = Place & {
  attachments: Attachment[]
  links: PlaceLink[]
  reservations: Reservation[]
  sources: Source[]
}
```

## API Integration

### MediaTab
- **POST** `/api/places/[id]/attachments` - Upload photos (FormData)
- **DELETE** `/api/places/[id]/attachments/[attachmentId]` - Delete photo

### LinksTab
- **POST** `/api/places/[id]/links` - Add link (JSON)
- **DELETE** `/api/places/[id]/links/[linkId]` - Delete link

### PlanningTab & NotesTab
- **PATCH** `/api/places/[id]` - Update place fields (JSON)

## Features

### OverviewTab
- Display kind badge and tags
- Show description
- Price level and best time metadata
- Vibes, activities, cuisine, amenities with color-coded badges
- Location details with coordinates

### MediaTab
- Drag-and-drop photo upload
- Thumbnail grid display
- Delete photos with confirmation
- Loading and error states
- Empty state with icon

### LinksTab
- Add links with type and platform selection
- Display favicons from URLs
- Categorize links (website, social, booking, review, article)
- Platform badges (Instagram, TikTok, YouTube, Google Maps, etc.)
- Delete links with confirmation

### BookingsTab
- Reservation list with date, time, party size
- Status badges (confirmed, pending, cancelled, completed)
- Booking platform links
- Contact information (phone, email, website, hours)
- Practical information display

### PlanningTab
- Visit status radio buttons (Not Visited, Planned, Visited)
- Priority star rating (0-5)
- Date inputs for last visited / planned visit
- Recommended by field
- Companions field (comma-separated)
- Save button with loading state

### NotesTab
- Personal notes textarea
- Practical information textarea
- Save button with loading state

## Styling

All components follow the project's design system:
- Radix UI primitives
- Tailwind CSS utilities
- CVA for variants
- Consistent spacing and colors
- Max line length: 100 characters

## File Structure

```
place-details-tabs/
├── overview-tab.tsx      (5.2K)
├── media-tab.tsx         (4.4K)
├── links-tab.tsx         (6.9K)
├── bookings-tab.tsx      (7.2K)
├── planning-tab.tsx      (5.4K)
├── notes-tab.tsx         (2.2K)
├── example-usage.tsx     (1.6K)
├── index.ts              (303B)
└── README.md
```

Total: ~33KB, 1078 lines of code

## Notes

- All components use "use client" directive for interactivity
- API calls reload page on success (future: optimistic updates)
- Error handling with alerts (future: toast notifications)
- Upload validation: images only, 10MB max per file
