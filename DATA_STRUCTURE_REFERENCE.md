# 📊 Data Structure Reference - Enhanced Library Page

## PlaceWithRelations Type Definition

This is what the frontend expects:

```typescript
// src/types/database.ts
interface PlaceWithRelations {
  // Base Place Fields (from places table)
  id: string
  name: string
  kind: string
  description: string | null
  city: string | null
  country: string | null
  admin: string | null
  coords: { lat: number; lon: number } | null
  address: string | null
  altNames: string[] | null
  tags: string[] | null
  vibes: string[] | null
  price_level: string | null
  best_time: string | null
  activities: string[] | null
  cuisine: string[] | null
  amenities: string[] | null
  ratingSelf: number | null
  notes: string | null
  status: 'inbox' | 'library' | 'archived'
  confidence: number | null
  createdAt: string
  updatedAt: string

  // NEW Enhanced Fields (added to places table)
  website: string | null
  phone: string | null
  email: string | null
  hours: Record<string, string> | null  // e.g. { "monday": "9am-5pm" }
  visitStatus: 'not_visited' | 'visited' | 'planned'
  priority: number  // 0-5 stars
  lastVisited: string | null  // ISO date
  plannedVisit: string | null  // ISO date
  recommendedBy: string | null
  companions: string[] | null  // Array of names
  practicalInfo: string | null

  // Relations (NEW - from joined tables)
  attachments: Attachment[]
  links: PlaceLink[]
  reservations: Reservation[]
  sources: Source[]
}

// Attachment Type
interface Attachment {
  id: string  // att_xxx
  placeId: string
  type: 'photo' | 'document' | 'receipt'
  uri: string  // /uploads/places/{placeId}/filename.jpg
  filename: string
  mimeType: string
  fileSize: number
  thumbnailUri: string | null  // /uploads/places/{placeId}/thumbnails/filename.jpg
  caption: string | null
  isPrimary: boolean
  createdAt: string
}

// PlaceLink Type
interface PlaceLink {
  id: string  // lnk_xxx
  placeId: string
  url: string
  title: string | null
  type: 'website' | 'social' | 'booking' | 'review' | 'article' | null
  platform: string | null  // 'instagram', 'tiktok', etc.
  createdAt: string
}

// Reservation Type
interface Reservation {
  id: string  // rsv_xxx
  placeId: string
  reservationDate: string  // ISO date
  status: 'confirmed' | 'pending' | 'cancelled'
  confirmationNumber: string | null
  partySize: number | null
  specialRequests: string | null
  totalCost: number | null
  currency: string | null
  notes: string | null
  createdAt: string
}
```

## API Response Example

What `GET /api/places/{id}` should return:

```json
{
  "id": "plc_abc123",
  "name": "Café de Flore",
  "kind": "cafe",
  "description": "Historic café in Saint-Germain-des-Prés",
  "city": "Paris",
  "country": "FR",
  "admin": "Île-de-France",
  "coords": { "lat": 48.8542, "lon": 2.3325 },
  "address": "172 Boulevard Saint-Germain",
  "altNames": ["Cafe de Flore"],
  "tags": ["historic", "literary"],
  "vibes": ["elegant", "intellectual"],
  "price_level": "$$$",
  "best_time": "morning",
  "activities": ["coffee", "people-watching"],
  "cuisine": ["french", "cafe"],
  "amenities": ["wifi", "outdoor-seating"],
  "ratingSelf": 4.5,
  "notes": "Famous literary café, great for morning coffee",
  "status": "library",
  "confidence": 0.95,
  "createdAt": "2025-01-15T10:30:00Z",
  "updatedAt": "2025-01-15T10:30:00Z",

  "website": "https://cafedeflore.fr",
  "phone": "+33 1 45 48 55 26",
  "email": "contact@cafedeflore.fr",
  "hours": {
    "monday": "7:00-1:30",
    "tuesday": "7:00-1:30",
    "wednesday": "7:00-1:30",
    "thursday": "7:00-1:30",
    "friday": "7:00-1:30",
    "saturday": "7:00-1:30",
    "sunday": "7:00-1:30"
  },
  "visitStatus": "visited",
  "priority": 5,
  "lastVisited": "2024-06-15",
  "plannedVisit": null,
  "recommendedBy": "Food blogger Emma",
  "companions": ["Sarah", "Mike"],
  "practicalInfo": "Reserve in advance for terrace seating",

  "attachments": [
    {
      "id": "att_xyz789",
      "placeId": "plc_abc123",
      "type": "photo",
      "uri": "/uploads/places/plc_abc123/cafe-exterior.jpg",
      "filename": "cafe-exterior.jpg",
      "mimeType": "image/jpeg",
      "fileSize": 1234567,
      "thumbnailUri": "/uploads/places/plc_abc123/thumbnails/cafe-exterior.jpg",
      "caption": "Beautiful Art Deco exterior",
      "isPrimary": true,
      "createdAt": "2025-01-15T11:00:00Z"
    }
  ],

  "links": [
    {
      "id": "lnk_def456",
      "placeId": "plc_abc123",
      "url": "https://www.instagram.com/cafedeflore_paris_officiel",
      "title": "Official Instagram",
      "type": "social",
      "platform": "instagram",
      "createdAt": "2025-01-15T11:15:00Z"
    }
  ],

  "reservations": [
    {
      "id": "rsv_ghi789",
      "placeId": "plc_abc123",
      "reservationDate": "2025-02-14T19:00:00Z",
      "status": "confirmed",
      "confirmationNumber": "CF2025-1234",
      "partySize": 2,
      "specialRequests": "Window table if possible",
      "totalCost": 85.00,
      "currency": "EUR",
      "notes": "Valentine's Day dinner",
      "createdAt": "2025-01-15T11:30:00Z"
    }
  ],

  "sources": [
    {
      "id": "src_jkl012",
      "type": "screenshot",
      "uri": "/uploads/screenshots/src_jkl012.png",
      "ocrText": "Café de Flore - Best coffee in Paris",
      "createdAt": "2025-01-15T10:00:00Z"
    }
  ]
}
```

## Database Schema

### places table (extended)
```sql
CREATE TABLE places (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  description TEXT,
  city TEXT,
  country TEXT,
  -- ... base fields

  -- NEW: Contact Info
  website TEXT,
  phone TEXT,
  email TEXT,
  hours TEXT,  -- JSON string

  -- NEW: Visit Tracking
  visitStatus TEXT DEFAULT 'not_visited',
  priority INTEGER DEFAULT 0,
  lastVisited TEXT,
  plannedVisit TEXT,

  -- NEW: Social
  recommendedBy TEXT,
  companions TEXT,  -- JSON array string

  -- NEW: Notes
  practicalInfo TEXT,

  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

### attachments table (NEW)
```sql
CREATE TABLE attachments (
  id TEXT PRIMARY KEY,  -- att_xxx
  place_id TEXT NOT NULL REFERENCES places(id) ON DELETE CASCADE,
  type TEXT NOT NULL,  -- 'photo' | 'document' | 'receipt'
  uri TEXT NOT NULL,
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  thumbnail_uri TEXT,
  caption TEXT,
  is_primary INTEGER DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE INDEX attachments_place_id_idx ON attachments(place_id);
```

### place_links table (NEW)
```sql
CREATE TABLE place_links (
  id TEXT PRIMARY KEY,  -- lnk_xxx
  place_id TEXT NOT NULL REFERENCES places(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  title TEXT,
  type TEXT,  -- 'website' | 'social' | 'booking' | 'review' | 'article'
  platform TEXT,  -- 'instagram', 'tiktok', etc.
  created_at TEXT NOT NULL
);

CREATE INDEX place_links_place_id_idx ON place_links(place_id);
```

### reservations table (NEW)
```sql
CREATE TABLE reservations (
  id TEXT PRIMARY KEY,  -- rsv_xxx
  place_id TEXT NOT NULL REFERENCES places(id) ON DELETE CASCADE,
  reservation_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'confirmed',
  confirmation_number TEXT,
  party_size INTEGER,
  special_requests TEXT,
  total_cost REAL,
  currency TEXT,
  notes TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX reservations_place_id_idx ON reservations(place_id);
```

## Query Implementation

### getPlaceWithRelations() in db-queries.ts

```typescript
export async function getPlaceWithRelations(placeId: string) {
  return withErrorHandling(async () => {
    // Get base place
    const place = await db.select().from(places)
      .where(eq(places.id, placeId))
      .limit(1);

    if (!place[0]) return null;

    // Get all relations in parallel
    const [attachments, links, reservations, sources] = await Promise.all([
      getAttachmentsForPlace(placeId),
      getLinksForPlace(placeId),
      getReservationsForPlace(placeId),
      // Get sources via sourcesToPlaces join
      db.select({ sources })
        .from(sourcesToPlaces)
        .innerJoin(sources, eq(sources.id, sourcesToPlaces.sourceId))
        .where(eq(sourcesToPlaces.placeId, placeId))
    ]);

    return {
      ...place[0],
      attachments,
      links,
      reservations,
      sources: sources.map(s => s.sources)
    };
  }, 'getPlaceWithRelations');
}
```

## Component Usage

### PlaceDetailsDialogEnhanced Component

```tsx
export function PlaceDetailsDialogEnhanced({
  open,
  onOpenChange,
  placeId
}: Props) {
  const [place, setPlace] = useState<PlaceWithRelations | null>(null);

  useEffect(() => {
    if (placeId) {
      fetch(`/api/places/${placeId}`)
        .then(res => res.json())
        .then(data => setPlace(data));
    }
  }, [placeId]);

  // Pass to tabs:
  // <OverviewTab place={place} />
  // <MediaTab placeId={placeId} attachments={place.attachments} />
  // <LinksTab placeId={placeId} links={place.links} />
  // etc.
}
```

## Tab Component Props

### MediaTab
```tsx
interface MediaTabProps {
  placeId: string
  attachments: Attachment[]
  onUpdate?: () => void
}
```

### LinksTab
```tsx
interface LinksTabProps {
  placeId: string
  links: PlaceLink[]
  onUpdate?: () => void
}
```

### BookingsTab
```tsx
interface BookingsTabProps {
  place: PlaceWithRelations
  reservations: Reservation[]
  onUpdate?: () => void
}
```

## Verification Checklist

- [ ] API returns all 34+ place fields
- [ ] API returns attachments array (even if empty)
- [ ] API returns links array (even if empty)
- [ ] API returns reservations array (even if empty)
- [ ] API returns sources array (even if empty)
- [ ] Array fields are parsed from JSON strings (tags, vibes, etc.)
- [ ] hours field is parsed from JSON string to object
- [ ] companions field is parsed from JSON string to array
- [ ] All fields match TypeScript types exactly
- [ ] No undefined values where null expected
- [ ] Date strings in ISO format
- [ ] File URIs start with /uploads/

## Common Issues

### Issue 1: Arrays are null instead of []
```typescript
// BAD
attachments: null

// GOOD
attachments: []
```

### Issue 2: JSON fields not parsed
```typescript
// BAD (string)
hours: "{\"monday\":\"9am-5pm\"}"

// GOOD (object)
hours: { "monday": "9am-5pm" }
```

### Issue 3: Missing fields in query
```typescript
// BAD - Missing new fields
await db.select({
  id: places.id,
  name: places.name
  // Missing 30+ other fields!
})

// GOOD - All fields selected
await db.select().from(places)  // Selects ALL columns
```

### Issue 4: Relations not loaded
```typescript
// BAD
return place  // Just the place, no relations

// GOOD
return {
  ...place,
  attachments: await getAttachmentsForPlace(placeId),
  links: await getLinksForPlace(placeId),
  reservations: await getReservationsForPlace(placeId),
  sources: await getSourcesForPlace(placeId)
}
```
