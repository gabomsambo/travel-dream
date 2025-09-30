# PRP-3: Screenshot Ingestion Pipeline - Initial Planning Document

## Overview
Create a manual upload pipeline that accepts screenshot images through the web interface, performs OCR text extraction, and stores raw data in the database for further processing by the LLM service.

## Core Requirements

### 1. Upload Interface
- Drag-and-drop zone for images
- Multi-file selection support
- Bulk upload capability (100+ files)
- Support .png, .jpg, .jpeg, .webp, .heic formats
- File size validation (max 10MB per image)
- Upload progress indicators

### 2. OCR Processing
- Extract text from uploaded screenshots using Tesseract.js or cloud API
- Preserve text positioning and layout information
- Handle multiple languages (prioritize English)
- Extract with high accuracy for both printed and stylized text
- Process images in queue to avoid overwhelming system
- Client-side or server-side processing options

### 3. Data Storage
- Store uploaded screenshot file in cloud storage or local directory
- Save OCR extracted text to database
- Track processing status (pending, processing, completed, failed)
- Store metadata (original filename, timestamp, dimensions, file size)
- Link to Source entity in database
- Generate thumbnails for quick preview

### 4. Error Handling
- Validate image formats before processing
- Retry failed OCR attempts (max 3 times)
- Log errors for debugging
- Provide user feedback for failures
- Handle corrupted or invalid images gracefully
- Clear error messages for user action

## Technical Considerations

### Upload Architecture
- **Client-side Upload**
  - Next.js API routes for handling
  - Multipart form data processing
  - Stream large files to avoid memory issues
  - Client-side image validation

- **Storage Options**
  1. Local file system (development)
  2. Vercel Blob Storage (production)
  3. AWS S3 / Cloudflare R2 (scalable option)

### OCR Technology Options
1. **Tesseract.js** (Browser/Server)
   - Pros: Runs locally, free, no API limits, privacy-focused
   - Cons: Slower, larger bundle size
   - Can run in Web Worker for non-blocking

2. **Cloud OCR APIs** (Google Vision, AWS Textract)
   - Pros: Most accurate, handles complex layouts, fast
   - Cons: Costs money, requires internet, privacy considerations

3. **Hybrid Approach**
   - Quick preview with Tesseract.js
   - Optional high-quality with cloud API
   - User choice per batch

### Processing Pipeline
```typescript
// Upload flow
1. User selects/drops images
2. Client validates files
3. Upload to server with progress
4. Server stores originals
5. Queue for OCR processing
6. Update UI with results
7. Trigger LLM processing (PRP-4)
```

### Performance Requirements
- Handle 100+ image uploads in single batch
- Process each image within 5 seconds
- Show real-time progress for each file
- Non-blocking UI during processing
- Memory efficient for large batches
- Parallel processing where possible

## User Experience

### Upload Interface Design
```
┌─────────────────────────────────────┐
│   📸 Drop Screenshots Here          │
│                                     │
│   or click to browse                │
│                                     │
│   [ Browse Files ]                  │
└─────────────────────────────────────┘

Processing Queue:
✅ image1.png - Complete
⏳ image2.png - Extracting text...
⏸️ image3.png - Queued
```

### Bulk Operations
- Select all/none functionality
- Batch actions (delete, reprocess)
- Filtering by status
- Sort by date, name, status
- Keyboard shortcuts for power users

### Progress Feedback
- Individual file progress bars
- Overall batch progress
- Time remaining estimates
- Success/failure counts
- Detailed error messages

### Manual Controls
- Pause/resume processing
- Cancel individual uploads
- Retry failed items
- Clear completed items
- Download OCR results

## Integration Points

### With PRP-1 (Database)
- Create Source records with type='screenshot'
- Store OCR text in raw_content field
- Track upload_status and processing_status
- Link file storage location

### With PRP-2 (Web UI)
- Upload component in header or dedicated page
- Processing status in navigation badge
- Recent uploads in inbox view
- Detailed view for each upload

### With PRP-4 (LLM Structuring)
- Automatic trigger after OCR complete
- Pass OCR text and metadata
- Link structured results back
- Show LLM processing status

## Data Schema Extensions

### Upload Session
```typescript
interface UploadSession {
  id: string
  user_id: string
  started_at: Date
  file_count: number
  completed_count: number
  failed_count: number
  status: 'active' | 'completed' | 'cancelled'
}

interface UploadedFile {
  id: string
  session_id: string
  original_name: string
  stored_path: string
  thumbnail_path?: string
  file_size: number
  mime_type: string
  dimensions: { width: number, height: number }
  ocr_status: 'pending' | 'processing' | 'completed' | 'failed'
  ocr_text?: string
  ocr_confidence?: number
  error_message?: string
}
```

## Success Metrics
- Successfully process 95%+ of uploaded images
- OCR accuracy >90% for standard web content
- <5 second processing time per image
- Handle 100+ file uploads without crashes
- Clear feedback for all error cases
- Zero data loss after upload starts

## Potential Gotchas
- Large file uploads timing out
- HEIC format from iOS needing conversion
- Memory issues with multiple large images
- Browser limits on concurrent uploads
- Network interruptions during upload
- Rate limiting on OCR APIs
- Image orientation (EXIF data)

## Security Considerations
- File type validation (prevent malicious uploads)
- File size limits
- Rate limiting per user
- Virus scanning for uploaded files
- Secure file storage with proper permissions
- Clean up temporary files

## Dependencies
- Upload library (react-dropzone or filepond)
- Image processing (Sharp for optimization/thumbnails)
- OCR library (Tesseract.js or API client)
- Queue system (p-queue or bull)
- File storage SDK (S3, Vercel Blob, etc.)
- Image format converter (for HEIC)

## Settings & Configuration
- Max file size per image
- Max total upload size
- Allowed file formats
- OCR quality settings
- Auto-process vs manual trigger
- Thumbnail generation settings
- Storage location preference

## Future Enhancements
- Mobile app for direct upload
- Browser extension for web clipping
- Screenshot annotation before OCR
- Automatic image enhancement
- Batch editing tools
- OCR language detection
- Smart cropping suggestions
- Duplicate image detection
- Image similarity search