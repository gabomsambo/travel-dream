# Full-Screen Place View - Comprehensive Plan

## Overview

Create a full-screen, fully-editable detailed view for places where EVERYTHING can be viewed, edited, and looks beautiful. This is the "power user" mode - the complete place management interface.

---

## Current State Analysis

### ✅ What's Currently Editable (Quick View Dialog)
- Notes tab: `notes`, `practicalInfo`
- Planning tab: `visitStatus`, `priority`, `lastVisited`, `plannedVisit`, `recommendedBy`, `companions`
- Media tab: Upload/delete photos
- Links tab: Add/delete links

### ❌ What's MISSING or NOT Editable

#### Core Fields (Shown but NOT Editable):
1. **name** - Can't edit place name!
2. **description** - Shown but can't edit!
3. **kind** - Can't change category!
4. **tags** - Shown but can't edit!
5. **vibes** - Shown but can't edit!
6. **price_level** - Shown but can't edit!
7. **best_time** - Shown but can't edit!
8. **activities** - Shown but can't edit!
9. **cuisine** - Shown but can't edit!
10. **amenities** - Shown but can't edit!

#### Location Fields (Shown but NOT Editable):
11. **city** - Can't edit!
12. **country** - Can't edit!
13. **admin** - Can't edit state/region!
14. **coords** - Can't edit coordinates!
15. **address** - Can't edit full address!

#### Contact Fields (Shown but NOT Editable):
16. **website** - Display only!
17. **phone** - Display only!
18. **email** - Display only!
19. **hours** - Display only!

#### Completely MISSING from UI:
20. **altNames** - Alternative names array - NOT SHOWN ANYWHERE!
21. **ratingSelf** - Personal rating (0-5 stars) - NOT SHOWN ANYWHERE!
22. **createdAt** - When place was added - NOT SHOWN!
23. **updatedAt** - Last modified - NOT SHOWN!
24. **sources** - Original sources (screenshots/URLs) - NOT SHOWN!

#### Related Data (Partial Support):
25. **reservations** - Can VIEW but CANNOT ADD/EDIT!
26. **attachments** - Can upload photos but can't edit caption/metadata after upload!

---

## Full-Screen View Design

### Layout Structure

```
┌─────────────────────────────────────────────────────────────────────┐
│  [X Close]                                    [Save All Changes]     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌──────────────────────┐  ┌────────────────────────────────────┐  │
│  │                      │  │  SEYCHELLES BEACH               ⭐⭐⭐⭐  │
│  │   Hero Photo         │  │  beach • Seychelles                    │
│  │   (Largest from      │  │                                        │
│  │    attachments or    │  │  [Edit Name] [Edit Category] [Rating] │
│  │    placeholder)      │  │                                        │
│  │                      │  │  Description:                          │
│  │   Click to view      │  │  [Editable textarea - can be empty]    │
│  │   fullscreen         │  │                                        │
│  │                      │  │  📍 Location                           │
│  │                      │  │  City: [San Francisco]                 │
│  └──────────────────────┘  │  State: [California]                   │
│                             │  Country: [US ▼]                       │
│  ┌──────────────────────┐  │  Address: [Full address...]           │
│  │  Photo Gallery       │  │  Coords: [37.7749, -122.4194]         │
│  │  [+] [🖼️] [🖼️] [🖼️]  │  │  Alternative Names: [Seychelles,    │
│  └──────────────────────┘  │                      Seychelles Beach] │
│                             │                                        │
│                             └────────────────────────────────────────┘
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌─ 📋 Details ─────────────────────────────────────────────────┐   │
│  │                                                               │   │
│  │  Tags: [sunset] [beach] [photogenic] [+Add]                  │   │
│  │                                                               │   │
│  │  Vibes: [romantic] [peaceful] [scenic] [+Add]                │   │
│  │                                                               │   │
│  │  Price Level: [$$]  Best Time: [Summer]                      │   │
│  │                                                               │   │
│  │  Activities: [swimming] [snorkeling] [photography] [+Add]    │   │
│  │                                                               │   │
│  │  Cuisine: [seafood] [+Add]    Amenities: [parking] [+Add]    │   │
│  │                                                               │   │
│  └───────────────────────────────────────────────────────────────┘   │
│                                                                       │
│  ┌─ 📞 Contact & Practical Info ───────────────────────────────┐   │
│  │  Website: [https://example.com]                             │   │
│  │  Phone: [(555) 123-4567]        Email: [info@place.com]     │   │
│  │                                                              │   │
│  │  Hours:                                                      │   │
│  │  Monday: [9:00 AM - 5:00 PM]    Friday: [9:00 AM - 5:00 PM] │   │
│  │  Tuesday: [9:00 AM - 5:00 PM]   Saturday: [10:00 AM - 4:00] │   │
│  │  Wednesday: [Closed]            Sunday: [Closed]            │   │
│  │                                                              │   │
│  │  Practical Info:                                             │   │
│  │  [Bring cash, entrance on side street, book ahead...]       │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                       │
│  ┌─ 🗓️ Visit Planning ──────────────────────────────────────────┐   │
│  │  Status: ○ Not Visited  ◉ Visited  ○ Planned                │   │
│  │  Priority: ⭐⭐⭐⭐⭐ (5/5)                                      │   │
│  │  Last Visited: [2024-08-15]   Planned Visit: [2025-06-01]   │   │
│  │  Recommended By: [Sarah's Instagram]                         │   │
│  │  Companions: [Alice, Bob, Charlie]                           │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                       │
│  ┌─ 📝 Notes ──────────────────────────────────────────────────┐   │
│  │  Personal Notes:                                             │   │
│  │  [Large textarea for personal thoughts, tips, memories...]   │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                       │
│  ┌─ 🏨 Reservations & Bookings ────────────────────────────────┐   │
│  │  [+ Add Reservation]                                         │   │
│  │                                                              │   │
│  │  📅 Hotel Booking - Jun 15-18, 2025                         │   │
│  │     Confirmation: #ABC123  |  $450/night                     │   │
│  │     [Edit] [Delete]                                          │   │
│  │                                                              │   │
│  │  🍽️ Restaurant Reservation - Jun 16, 7:00 PM               │   │
│  │     Party of 4  |  Confirmed                                 │   │
│  │     [Edit] [Delete]                                          │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                       │
│  ┌─ 🔗 Saved Links ────────────────────────────────────────────┐   │
│  │  [+ Add Link]                                                │   │
│  │                                                              │   │
│  │  🌐 Official Website - https://example.com                   │   │
│  │     "Check opening hours"                                    │   │
│  │     [Edit] [Delete]                                          │   │
│  │                                                              │   │
│  │  📱 Instagram Post - https://instagram.com/p/xyz             │   │
│  │     [Edit] [Delete]                                          │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                       │
│  ┌─ 📸 Media Gallery ──────────────────────────────────────────┐   │
│  │  [+ Upload Photos]                                           │   │
│  │                                                              │   │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐       │   │
│  │  │  Photo  │  │  Photo  │  │  Photo  │  │  Photo  │       │   │
│  │  │   #1    │  │   #2    │  │   #3    │  │   #4    │       │   │
│  │  │ [Edit]  │  │ [Edit]  │  │ [Edit]  │  │ [Edit]  │       │   │
│  │  │ Caption │  │ Caption │  │ Caption │  │ Caption │       │   │
│  │  └─────────┘  └─────────┘  └─────────┘  └─────────┘       │   │
│  │                                                              │   │
│  │  Click any photo to view fullscreen with navigation          │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                       │
│  ┌─ 📚 Source Materials ───────────────────────────────────────┐   │
│  │  Original screenshots/notes that created this place:         │   │
│  │                                                              │   │
│  │  📷 Screenshot - Sept 28, 2025                               │   │
│  │     From: Instagram                                          │   │
│  │     [View]                                                   │   │
│  │                                                              │   │
│  │  🌐 URL - Sept 29, 2025                                      │   │
│  │     https://travelblog.com/seychelles                        │   │
│  │     [View]                                                   │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                       │
│  ┌─ ℹ️ Metadata ───────────────────────────────────────────────┐   │
│  │  Created: Sept 28, 2025 at 3:26 PM                          │   │
│  │  Last Updated: Oct 8, 2025 at 1:15 AM                       │   │
│  │  Confidence Score: 70% (from LLM extraction)                 │   │
│  │  Status: Library (inbox → library → archived)                │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Features & Functionality

### 1. **Hero Section** (Top)
- **Large featured photo** - Primary attachment or placeholder
- **Click to fullscreen** - Open photo lightbox
- **Editable name** - Inline editing with auto-save
- **Editable category** - Dropdown with all place kinds
- **Star rating** - `ratingSelf` 0-5 stars, editable by clicking
- **Editable description** - Rich textarea, can be empty

### 2. **Location Section**
All fields inline-editable:
- City (text input)
- State/Region (admin field, text input)
- Country (searchable dropdown with ISO codes)
- Full address (textarea)
- Coordinates (lat, lon - with map preview?)
- **Alternative names** (tag input, can add multiple)

### 3. **Details Section**
Tag-based inputs with autocomplete:
- Tags (removable pills, +Add button)
- Vibes (removable pills, +Add button)
- Price level ($$$ selector)
- Best time (text or dropdown: "Summer", "Year-round", etc.)
- Activities (tag pills)
- Cuisine (tag pills)
- Amenities (tag pills)

### 4. **Contact & Practical Info**
Form inputs:
- Website (URL validation)
- Phone (formatted input)
- Email (email validation)
- Hours (day-of-week editor with time pickers)
- Practical info (textarea for tips)

### 5. **Visit Planning Section**
- Visit status (radio buttons: Not Visited | Visited | Planned)
- Priority (1-5 stars, clickable)
- Last visited (date picker)
- Planned visit (date picker)
- Recommended by (text input)
- Companions (comma-separated tag input)

### 6. **Notes Section**
- Large textarea for personal notes (existing field)

### 7. **Reservations Section** ⭐ NEW FUNCTIONALITY
- **[+ Add Reservation]** button
- List of reservations with:
  - Type (hotel, restaurant, tour, flight, etc.)
  - Date/time
  - Confirmation number
  - Price
  - Status
  - Notes
  - **[Edit]** inline editing
  - **[Delete]** with confirmation

### 8. **Saved Links Section**
- Existing functionality
- Better visual cards with favicons
- Edit link title/description

### 9. **Media Gallery** ⭐ ENHANCED
- Grid of all photos/attachments
- **Edit caption** on each photo (currently can't do this!)
- **Set as primary** - Mark hero photo
- **Fullscreen lightbox** with keyboard navigation (←/→)
- Upload button
- Drag-to-reorder photos

### 10. **Source Materials** ⭐ NEW SECTION
- Show original sources (screenshots, URLs, notes)
- Link to the inbox items that created this place
- View original OCR text
- Helpful for verifying/correcting data

### 11. **Metadata Section**
Read-only info:
- Created date/time
- Last updated date/time
- Confidence score from LLM
- Status (inbox/library/archived) - maybe editable?

---

## Technical Implementation Plan

### New Components to Create

1. **`src/app/place/[id]/page.tsx`**
   - Full-screen page route (not dialog)
   - Server component - fetches place data
   - Passes to client component

2. **`src/components/places/place-full-view.tsx`**
   - Main client component
   - Manages edit state
   - Auto-save or manual save button
   - Optimistic updates

3. **Section Components:**
   - `place-full-view/hero-section.tsx`
   - `place-full-view/location-section.tsx`
   - `place-full-view/details-section.tsx`
   - `place-full-view/contact-section.tsx`
   - `place-full-view/planning-section.tsx`
   - `place-full-view/notes-section.tsx`
   - `place-full-view/reservations-section.tsx` (needs CRUD)
   - `place-full-view/links-section.tsx`
   - `place-full-view/media-section.tsx` (enhanced)
   - `place-full-view/sources-section.tsx` (new)
   - `place-full-view/metadata-section.tsx`

4. **UI Components:**
   - `tag-input.tsx` - Reusable tag/pill input
   - `star-rating-input.tsx` - Clickable star rating
   - `hours-editor.tsx` - Day-of-week time picker
   - `photo-lightbox.tsx` - Fullscreen photo viewer
   - `reservation-form.tsx` - Add/edit reservation modal

### New API Endpoints

5. **`src/app/api/places/[id]/reservations/route.ts`** - Needs POST method
6. **`src/app/api/places/[id]/reservations/[reservationId]/route.ts`** - PATCH, DELETE
7. **`src/app/api/places/[id]/attachments/[attachmentId]/route.ts`** - PATCH (for caption editing)

### Database Mutations to Add

8. **`src/lib/db-mutations.ts`:**
   - `updateReservation(id, data)`
   - `updateAttachment(id, data)` - For editing captions

### Entry Points

9. **From Dialog** - Add "Open Full View" button
   - `src/components/places/place-details-dialog-enhanced.tsx`
   - Button in header: "⤢ Full View"
   - Opens `/place/[id]` in new page (can be same tab or new tab)

10. **From Library Cards** - Right-click context menu or button
    - Add "Full View" option alongside "View"

---

## User Experience Flow

### Opening Full View

**From Quick View Dialog:**
```
User clicks "View" → Quick dialog opens
↓
User clicks "⤢ Full View" button
↓
Opens /place/[id] route in same/new tab
↓
Full-screen editable view loads
```

**From Library Card:**
```
User right-clicks card OR clicks "..." menu
↓
Selects "Full View"
↓
Opens /place/[id] directly
```

### Editing & Saving

**Auto-save approach** (RECOMMENDED):
- Edit any field
- Debounced auto-save after 1 second of inactivity
- Visual indicator: "Saving..." → "Saved ✓"
- Optimistic updates (immediate UI feedback)

**Manual save approach** (Alternative):
- Edit multiple fields
- "Save All Changes" button at top
- Shows unsaved changes indicator
- Confirm before leaving page

### Photo Lightbox

**Click any photo:**
```
Photo opens in fullscreen overlay
↓
Show: Current photo, caption, metadata
↓
Navigation: ← Previous | Next →
↓
Actions: Edit Caption | Set as Primary | Delete | Download
↓
ESC or X to close
```

---

## Data Coverage Completeness

### All 34 Place Fields - FULLY EDITABLE ✅

| Field | Current Quick View | Full View Status |
|-------|-------------------|------------------|
| id | Read-only | Read-only |
| name | Display only | ✅ Editable |
| kind | Display only | ✅ Editable |
| city | Display only | ✅ Editable |
| country | Display only | ✅ Editable |
| admin | Display only | ✅ Editable |
| coords | Display only | ✅ Editable |
| address | Display only | ✅ Editable |
| altNames | ❌ MISSING | ✅ Editable |
| description | Display only | ✅ Editable |
| tags | Display only | ✅ Editable |
| vibes | Display only | ✅ Editable |
| ratingSelf | ❌ MISSING | ✅ Editable |
| notes | ✅ Editable | ✅ Editable |
| status | Internal | Display/Edit? |
| confidence | Hidden | Display only |
| price_level | Display only | ✅ Editable |
| best_time | Display only | ✅ Editable |
| activities | Display only | ✅ Editable |
| cuisine | Display only | ✅ Editable |
| amenities | Display only | ✅ Editable |
| createdAt | ❌ MISSING | Display only |
| updatedAt | ❌ MISSING | Display only |
| website | Display only | ✅ Editable |
| phone | Display only | ✅ Editable |
| email | Display only | ✅ Editable |
| hours | Display only | ✅ Editable |
| visitStatus | ✅ Editable | ✅ Editable |
| priority | ✅ Editable | ✅ Editable |
| lastVisited | ✅ Editable | ✅ Editable |
| plannedVisit | ✅ Editable | ✅ Editable |
| recommendedBy | ✅ Editable | ✅ Editable |
| companions | ✅ Editable | ✅ Editable |
| practicalInfo | ✅ Editable | ✅ Editable |

### All Related Data - FULLY ACCESSIBLE ✅

| Relation | Current Quick View | Full View Status |
|----------|-------------------|------------------|
| attachments | ✅ View/Add/Delete | ✅ Enhanced with caption edit |
| links | ✅ View/Add/Delete | ✅ Enhanced display |
| reservations | Display only | ✅ Full CRUD |
| sources | ❌ MISSING | ✅ Display with links |

---

## Styling & Visual Design

### Design Principles
1. **Spacious** - Not cramped, generous padding
2. **Clear hierarchy** - Sections visually separated
3. **Inline editing** - Edit in place, no modals
4. **Responsive** - Works on desktop (optimized for large screens)
5. **Beautiful** - Professional, polished look
6. **Fast** - Auto-save, optimistic updates, no lag

### Color & Typography
- Use existing Tailwind + Radix UI components
- Section headers: Larger, bold, with icons
- Editable fields: Clear focus states
- Saved indicators: Subtle green checkmarks
- Unsaved changes: Subtle yellow warning

### Animations
- Smooth section expand/collapse (optional)
- Fade-in photo lightbox
- Slide transitions for photo navigation
- Pulse on auto-save

---

## Priority Features for MVP

### Phase 1 - Core Full View (Must Have):
1. ✅ Full-screen route `/place/[id]`
2. ✅ Hero section with name, category, description editing
3. ✅ All 34 place fields editable
4. ✅ Location section (all fields)
5. ✅ Details section (tags, vibes, etc.)
6. ✅ Contact section (website, phone, email, hours)
7. ✅ Auto-save functionality
8. ✅ "Open Full View" button in dialog

### Phase 2 - Enhanced Media (High Priority):
1. ✅ Photo lightbox with fullscreen view
2. ✅ Edit photo captions
3. ✅ Set primary photo
4. ✅ Photo navigation (keyboard arrows)

### Phase 3 - Complete CRUD (High Priority):
1. ✅ Reservation add/edit/delete
2. ✅ Hours editor (day-of-week picker)
3. ✅ Alternative names editor

### Phase 4 - Sources & Metadata (Nice to Have):
1. ✅ Show original sources
2. ✅ Display created/updated timestamps
3. ✅ Show confidence score

### Phase 5 - Polish (Nice to Have):
1. ✅ Drag-to-reorder photos
2. ✅ Map preview for coordinates
3. ✅ Favicon display for links
4. ✅ Export place data (JSON/PDF)

---

## File Structure

```
src/
├── app/
│   └── place/
│       └── [id]/
│           └── page.tsx                    # NEW - Full-screen route
│
├── components/
│   └── places/
│       ├── place-details-dialog-enhanced.tsx  # ADD button to open full view
│       ├── place-full-view.tsx               # NEW - Main component
│       └── place-full-view/                  # NEW - Section components
│           ├── hero-section.tsx
│           ├── location-section.tsx
│           ├── details-section.tsx
│           ├── contact-section.tsx
│           ├── planning-section.tsx
│           ├── notes-section.tsx
│           ├── reservations-section.tsx      # Enhanced CRUD
│           ├── links-section.tsx
│           ├── media-section.tsx             # Enhanced with editing
│           ├── sources-section.tsx           # NEW
│           └── metadata-section.tsx          # NEW
│
├── app/api/places/[id]/
│   ├── reservations/
│   │   ├── route.ts                         # ADD POST method
│   │   └── [reservationId]/
│   │       └── route.ts                     # NEW - PATCH, DELETE
│   └── attachments/
│       └── [attachmentId]/
│           └── route.ts                     # ADD PATCH for caption
│
└── lib/
    └── db-mutations.ts                      # ADD reservation & attachment updates
```

---

## Questions to Consider

1. **Auto-save vs Manual save?**
   - Recommend: Auto-save with debouncing (better UX)

2. **Same tab or new tab for full view?**
   - Recommend: Same tab, with back navigation

3. **Allow editing status field (inbox/library/archived)?**
   - Recommend: Yes, with dropdown

4. **Map integration for coordinates?**
   - Recommend: Phase 4, use Leaflet like library page

5. **Rich text editor for description/notes?**
   - Recommend: Start with textarea, upgrade later if needed

6. **Photo upload in full view or redirect to media section?**
   - Recommend: Both - have upload button in media section

7. **Validation on save?**
   - Recommend: Yes, show errors inline (e.g., invalid email)

---

## Success Metrics

Full-screen view is successful when:

✅ **Completeness**: All 34 place fields + 4 relations are viewable/editable
✅ **Usability**: Users prefer it for detailed editing over quick view
✅ **Performance**: Auto-save works smoothly, no lag
✅ **Visual Appeal**: Looks professional and polished
✅ **Functionality**: All CRUD operations work (especially reservations)
✅ **Data Integrity**: No data loss, validation works correctly

---

## Next Steps

1. ✅ Review this plan
2. ✅ Confirm design approach (auto-save, sections, etc.)
3. ✅ Prioritize phases
4. 🚀 Begin implementation with Phase 1 (core full view)

---

**Ready to implement when you give the go-ahead!** 🎯
