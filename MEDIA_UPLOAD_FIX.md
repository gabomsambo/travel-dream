# Media Upload Fix

## Issue
Photo uploads in the Media tab were failing with "Upload failed" error.

## Root Cause
**Field name mismatch** between frontend and backend:

- **Frontend** (`media-tab.tsx:32`): Sent files with field name `"files"` (plural)
- **Backend** (`attachments/route.ts:17`): Expected field name `"file"` (singular)

This caused the API to return 400 error: "No file provided"

## What Was Fixed

### File: `src/components/places/place-details-tabs/media-tab.tsx`

**Before:**
```typescript
const formData = new FormData()
Array.from(files).forEach((file) => {
  formData.append("files", file)  // ❌ Wrong field name
})

const response = await fetch(`/api/places/${place.id}/attachments`, {
  method: "POST",
  body: formData,  // ❌ All files in one request
})
```

**After:**
```typescript
for (const file of Array.from(files)) {
  const formData = new FormData()
  formData.append("file", file)  // ✅ Correct field name

  const response = await fetch(`/api/places/${place.id}/attachments`, {
    method: "POST",
    body: formData,  // ✅ One file per request
  })
}
```

## Changes Made

1. ✅ Fixed field name: `"files"` → `"file"`
2. ✅ Changed to upload files sequentially (API handles one file at a time)
3. ✅ Improved error handling to show backend error messages

## Verification

Database setup confirmed:
- ✅ `attachments` table exists
- ✅ `public/uploads/` directory exists with correct permissions
- ✅ `createAttachment()` function implemented
- ✅ Sharp image processing configured

## How to Test

1. Navigate to http://localhost:3000/library
2. Click "View" on any place
3. Go to "Media" tab
4. Click "Click to upload photos"
5. Select one or more image files (JPEG, PNG, WebP)
6. Upload should succeed and photos should appear

## Expected Behavior

**During Upload:**
- Shows "Uploading photos..." message
- Multiple files upload one at a time

**After Upload:**
- Page refreshes automatically
- Photos appear in grid view
- Thumbnails generated at 400x400px
- Full images stored in `/uploads/places/[placeId]/`
- Thumbnails stored in `/uploads/places/[placeId]/thumbnails/`

## Features Supported

- ✅ Multiple file upload (processed sequentially)
- ✅ JPEG, PNG, WebP, HEIC formats
- ✅ Max 10MB per file
- ✅ Automatic thumbnail generation (400x400px, 80% quality)
- ✅ Metadata extraction (width, height, file size)
- ✅ Photo deletion with confirmation
- ✅ Hover to show delete button

## Related Files

- Frontend: `src/components/places/place-details-tabs/media-tab.tsx`
- API: `src/app/api/places/[id]/attachments/route.ts`
- Database: `src/db/schema/attachments.ts`
- Mutations: `src/lib/db-mutations.ts` (createAttachment, deleteAttachment)

## Status
✅ **Fixed and ready to test**
