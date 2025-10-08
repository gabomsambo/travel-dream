# Docker Setup Guide for Travel Dreams Collection

## Prerequisites

- Docker Desktop installed and running
- Docker Compose installed (included with Docker Desktop)
- `.env.local` file configured (see below)

## Quick Start

### 1. Configure Environment Variables

Copy the Docker environment template:

```bash
cp .env.docker .env.local
```

Then edit `.env.local` with your actual credentials:

**Required:**
- `TURSO_DATABASE_URL` - Your Turso database URL or `file:./local.db` for local SQLite
- `TURSO_AUTH_TOKEN` - Your Turso auth token (leave empty for local SQLite)
- `OPENAI_API_KEY` - Your OpenAI API key
- `ANTHROPIC_API_KEY` - Your Anthropic API key

**Optional (Redis):**
- Leave Redis variables commented to use the local Docker Redis instance
- Or configure Upstash Redis for production-like rate limiting

### 2. Start the Application

```bash
# Build and start all services
npm run docker:dev:build

# Or if already built, just start:
npm run docker:dev
```

This will start:
- **travel-dreams** app on http://localhost:3000
- **redis** on localhost:6379
- **db-volume** for SQLite persistence (if using local DB)

### 3. Verify It's Working

Visit http://localhost:3000 in your browser.

Check the logs:
```bash
npm run docker:logs
```

## Enhanced Library Page Features

The Docker setup now includes support for all Enhanced Library Page features:

### Upload Directories (Auto-created)

The following directories are automatically created and persisted:

- `public/uploads/screenshots/` - Source screenshot uploads
- `public/uploads/thumbnails/` - Source screenshot thumbnails
- `public/uploads/places/{placeId}/` - Place-specific attachments
- `public/uploads/places/{placeId}/thumbnails/` - Place attachment thumbnails

All uploads are persisted in the `uploads_data` Docker volume.

### Image Processing

Sharp is pre-installed in the Docker image with all required dependencies:
- `vips-dev` - Core VIPS library for Sharp
- `fribidi-dev` - Text rendering support
- `harfbuzz-dev` - Advanced text shaping

### Map Features

Leaflet and React-Leaflet are fully functional:
- No additional system dependencies required
- Map tiles loaded from CDN (requires internet connection)
- Clustering works out of the box
- Webpack configured to exclude from server-side bundle (see `next.config.js`)

### Database Migrations

Run migrations inside the container:

```bash
# Generate migration
docker-compose exec travel-dreams npm run db:generate

# Apply migration
docker-compose exec travel-dreams npm run db:migrate

# Open Drizzle Studio
docker-compose exec travel-dreams npm run db:studio
```

## Common Commands

```bash
# Start services
npm run docker:dev

# Start with rebuild
npm run docker:dev:build

# Stop services
npm run docker:down

# View logs
npm run docker:logs

# Open shell in container
npm run docker:shell

# Restart after code changes (hot reload is automatic)
# Just save your files - Next.js will reload
```

## Troubleshooting

### Port Already in Use

If port 3000 is already in use:

```bash
# Stop the conflicting process or change the port in docker-compose.yml
ports:
  - "3001:3000"  # Change 3000 to 3001
```

### Volume Permissions Issues

If you get permission errors with uploads:

```bash
# Reset the uploads volume
docker-compose down -v
docker-compose up --build
```

### Hot Reload Not Working

The docker-compose.yml is configured with:
- `CHOKIDAR_USEPOLLING=true`
- `WATCHPACK_POLLING=true`

If changes still don't reload:
1. Restart the container: `docker-compose restart travel-dreams`
2. Check logs: `npm run docker:logs`

### Sharp/Image Processing Errors

If you get Sharp errors:

```bash
# Rebuild the container to reinstall Sharp with correct bindings
docker-compose up --build
```

### Database Connection Issues

**For Turso:**
- Verify your `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` are correct
- Ensure the format is: `libsql://your-database.turso.io`

**For Local SQLite:**
- Set `TURSO_DATABASE_URL=file:./local.db`
- Leave `TURSO_AUTH_TOKEN` empty
- The database file will be created automatically

### Redis Connection Issues

Using local Docker Redis (recommended for development):
- Redis should start automatically with docker-compose
- No configuration needed - rate limiting will be disabled if Redis isn't available

Using Upstash Redis:
- Set `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` in `.env.local`

## Development Workflow

### Making Code Changes

1. Edit files in your local project directory
2. Save changes - Next.js will auto-reload
3. View changes in browser

### Database Changes

1. Modify schema files in `src/db/schema/`
2. Generate migration: `docker-compose exec travel-dreams npm run db:generate`
3. Apply migration: `docker-compose exec travel-dreams npm run db:migrate`

### Installing New Dependencies

```bash
# Add dependency to package.json, then:
docker-compose up --build

# Or rebuild just the app:
docker-compose build travel-dreams
docker-compose up
```

### Viewing Database

```bash
# Start Drizzle Studio (opens on http://localhost:4983)
docker-compose exec travel-dreams npm run db:studio
```

## Production Deployment

For production, create a separate `Dockerfile.prod`:

```dockerfile
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:18-alpine AS runner
WORKDIR /app
RUN apk add --no-cache vips-dev tesseract-ocr
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
EXPOSE 3000
CMD ["node", "server.js"]
```

## Volumes and Data Persistence

### uploads_data
All user uploads and generated thumbnails

### redis_data
Redis cache and rate limiting data

### sqlite_data
Local SQLite database (if not using Turso)

**To back up data:**
```bash
# Back up uploads
docker cp $(docker-compose ps -q travel-dreams):/app/public/uploads ./uploads-backup

# Back up local database (if using local SQLite)
docker cp $(docker-compose ps -q travel-dreams):/app/local.db ./database-backup.db
```

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  Docker Compose Network: travel-dreams-network      │
│                                                      │
│  ┌────────────────┐  ┌──────────┐  ┌────────────┐  │
│  │ travel-dreams  │  │  redis   │  │ db-volume  │  │
│  │ (Next.js App)  │  │  :6379   │  │ (SQLite)   │  │
│  │ :3000          │  └──────────┘  └────────────┘  │
│  └────────────────┘                                 │
│         │                                            │
│         ├─ public/uploads (volume: uploads_data)    │
│         ├─ .next (excluded from volume)             │
│         └─ node_modules (excluded from volume)      │
└─────────────────────────────────────────────────────┘
         │
         └─ Exposed to host: localhost:3000
```

## Support

For issues or questions:
1. Check the logs: `npm run docker:logs`
2. Open shell and investigate: `npm run docker:shell`
3. Review CLAUDE.md and AGENTS.md for architecture details
4. Check GitHub issues if applicable
