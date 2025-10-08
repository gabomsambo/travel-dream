# Docker Setup Changes Summary

## Overview

Your Docker setup has been updated to fully support the Enhanced Library Page features, including:
- ✅ Map visualization (Leaflet)
- ✅ Image uploads and processing (Sharp)
- ✅ Place attachments and thumbnails
- ✅ OCR with Tesseract
- ✅ Proper directory structure

## Files Updated

### 1. **Dockerfile** (Updated)

**Changes:**
- Added additional image processing dependencies:
  - `fribidi-dev` - Text rendering support for Sharp
  - `harfbuzz-dev` - Advanced text shaping for Sharp
  - `python3`, `make`, `g++` - Build tools for native modules
- Created comprehensive upload directory structure:
  - `public/uploads/screenshots/` - Source screenshots
  - `public/uploads/thumbnails/` - Source thumbnails
  - `public/uploads/places/` - Place-specific attachments (subdirs created at runtime)
- Improved directory permissions with `chmod -R 755`

**Why:** The enhanced library page now supports uploading photos, documents, and receipts to individual places. Sharp needs additional dependencies to handle all image formats properly.

### 2. **docker-compose.yml** (Updated)

**Changes:**
- Added `.next` volume exclusion to prevent build conflicts
- Added `HOSTNAME=0.0.0.0` environment variable for Next.js 15
- Added `restart: unless-stopped` for better reliability
- Enhanced volume comments for clarity

**Why:** Next.js 15 requires the HOSTNAME variable for Docker, and excluding .next prevents permission issues during hot reload.

### 3. **package.json** (Updated)

**Added script:**
```json
"docker:health": "./scripts/docker-health-check.sh"
```

**Why:** Convenient way to verify Docker setup is working correctly.

### 4. **DOCKER.md** (New File)

Complete Docker setup guide including:
- Quick start instructions
- Environment variable configuration
- Common commands reference
- Troubleshooting section
- Enhanced Library Page specific features
- Production deployment notes
- Architecture diagram

### 5. **scripts/docker-health-check.sh** (New File)

Automated health check script that verifies:
- Docker and docker-compose are installed
- Environment variables are configured
- Services are running
- Upload directories exist
- Volumes are created
- Application is responding
- Required dependencies are installed (Sharp, Tesseract)

### 6. **README.md** (Updated)

Added "Docker Development (Alternative Setup)" section with:
- Quick setup commands
- Feature highlights
- Link to detailed DOCKER.md guide

## What's Now Supported in Docker

### Image Processing
- **Sharp**: Fully configured with VIPS, fribidi, and harfbuzz
- **Thumbnails**: Automatic 400x400 JPEG generation
- **Format Support**: JPEG, PNG, WebP, HEIC/HEIF (with conversion)

### Uploads & Storage
- **Persistent Volumes**: All uploads survive container restarts
- **Directory Structure**:
  ```
  public/uploads/
  ├── screenshots/           # Source screenshots
  ├── thumbnails/            # Source thumbnails
  └── places/
      └── {placeId}/         # Per-place attachments
          ├── photo.jpg
          └── thumbnails/    # Attachment thumbnails
              └── photo.jpg
  ```

### Map Features
- **Leaflet**: No additional config needed - works out of the box
- **React-Leaflet**: Full clustering and marker support
- **Tiles**: Loaded from OpenStreetMap CDN

### OCR
- **Tesseract**: Pre-installed with English language data
- **Image Preprocessing**: Sharp handles optimization before OCR

## Testing Your Setup

### 1. Quick Health Check

```bash
npm run docker:health
```

This will verify:
- ✅ Docker is running
- ✅ Services are up
- ✅ Upload directories exist
- ✅ Volumes are created
- ✅ App is responding
- ✅ Dependencies are installed

### 2. Manual Verification

```bash
# Start services
npm run docker:dev:build

# In another terminal, check:
npm run docker:logs

# Visit the app
open http://localhost:3000
```

### 3. Test Enhanced Features

Once the app is running:

1. **Map View**: Go to Library → Switch to Map View
   - Should see map tiles loading
   - Places with coordinates appear as markers

2. **Image Upload**:
   - Navigate to a place details
   - Upload a photo in the Media tab
   - Verify thumbnail generation

3. **OCR**:
   - Upload a screenshot with text
   - Check OCR extraction in logs

## Troubleshooting

### Build Fails

```bash
# Clean everything and rebuild
docker-compose down -v
docker-compose build --no-cache
docker-compose up
```

### Sharp Errors

Sharp errors usually mean native bindings need reinstalling:

```bash
docker-compose up --build
```

### Permission Errors

```bash
# Reset upload volumes
docker-compose down -v
docker volume rm travel-dreams_uploads_data
docker-compose up --build
```

### Hot Reload Not Working

Ensure these are in docker-compose.yml (already added):
```yaml
environment:
  - CHOKIDAR_USEPOLLING=true
  - WATCHPACK_POLLING=true
```

## Migration from Local Development

If you were running locally and want to switch to Docker:

1. **Export your database** (if using local SQLite):
   ```bash
   cp local.db local.db.backup
   ```

2. **Copy your uploads**:
   ```bash
   # Uploads will be in the Docker volume
   # Your local uploads won't be accessible
   ```

3. **Update environment**:
   ```bash
   cp .env.local .env.local.backup
   cp .env.docker .env.local
   # Edit .env.local with your settings
   ```

4. **Start Docker**:
   ```bash
   npm run docker:dev:build
   ```

## Next Steps

1. **Run Health Check**: `npm run docker:health`
2. **Read Full Guide**: See [DOCKER.md](./DOCKER.md)
3. **Test Enhanced Features**: Try map view and photo uploads
4. **Check Logs**: `npm run docker:logs` if any issues

## Docker Commands Quick Reference

```bash
# Development
npm run docker:dev          # Start services
npm run docker:dev:build    # Rebuild and start
npm run docker:down         # Stop services
npm run docker:logs         # View logs
npm run docker:shell        # Open shell in container
npm run docker:health       # Check system health

# Database (inside container)
docker-compose exec travel-dreams npm run db:generate
docker-compose exec travel-dreams npm run db:migrate
docker-compose exec travel-dreams npm run db:studio

# Cleanup
docker-compose down -v      # Remove all volumes (CAREFUL!)
docker system prune -a      # Clean all Docker cache
```

## Support

If you encounter issues:
1. Run `npm run docker:health`
2. Check logs: `npm run docker:logs`
3. Review [DOCKER.md](./DOCKER.md)
4. Check [AGENTS.md](./AGENTS.md) for architecture details

---

**Note**: All changes are backward compatible. If you prefer local development without Docker, continue using `npm run dev` as before.
