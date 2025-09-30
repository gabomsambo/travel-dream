# Docker Development Setup

This guide helps you run Travel Dreams Collection in Docker with live reloading for development.

## Quick Start

1. **Initial Setup**
   ```bash
   npm run docker:setup
   ```
   This script will:
   - Create `.env.local` from template
   - Build Docker images
   - Start all services
   - Initialize the database

2. **Configure Environment**
   Edit `.env.local` with your API keys:
   ```bash
   # Required
   OPENAI_API_KEY=your_key_here
   ANTHROPIC_API_KEY=your_key_here

   # Database options:
   # Option 1: Local SQLite (easier for development)
   TURSO_DATABASE_URL=file:./local.db

   # Option 2: Turso Cloud (production-like)
   TURSO_DATABASE_URL=libsql://your-db.turso.io
   TURSO_AUTH_TOKEN=your_token_here
   ```

3. **Start Development**
   ```bash
   npm run docker:dev
   ```

## Available Commands

- `npm run docker:setup` - Complete initial setup
- `npm run docker:dev` - Start all services
- `npm run docker:dev:build` - Rebuild and start services
- `npm run docker:down` - Stop all services
- `npm run docker:logs` - View application logs
- `npm run docker:shell` - Access container shell

## Services

- **travel-dreams**: Main Next.js application (port 3000)
- **redis**: Local Redis for rate limiting (port 6379)
- **db-volume**: SQLite data persistence

## Development Features

### Live Reloading
- Source code changes automatically reload the application
- Uses volume mounting for real-time file sync
- Optimized for development with polling enabled

### Persistent Storage
- `uploads_data` volume: Uploaded files persist between restarts
- `redis_data` volume: Redis data persistence
- `sqlite_data` volume: Local SQLite database (if using local DB)

### Database Options

**Option 1: Local SQLite (Recommended for Development)**
```env
TURSO_DATABASE_URL=file:./local.db
TURSO_AUTH_TOKEN=
```

**Option 2: Turso Cloud (Production-like)**
```env
TURSO_DATABASE_URL=libsql://your-database.turso.io
TURSO_AUTH_TOKEN=your_token_here
```

## Accessing the Application

- **Application**: http://localhost:3000
- **Redis**: localhost:6379 (for debugging)

## Troubleshooting

### File Changes Not Detected
```bash
# Ensure polling is enabled in .env.local
CHOKIDAR_USEPOLLING=true
WATCHPACK_POLLING=true
```

### Permission Issues
```bash
# Fix upload directory permissions
docker-compose exec travel-dreams chmod 755 public/uploads
```

### Database Issues
```bash
# Reset local database
npm run docker:shell
npm run db:push  # For local SQLite
# or
npm run db:migrate  # For Turso
```

### Port Conflicts
If port 3000 is already in use, modify `docker-compose.yml`:
```yaml
ports:
  - "3001:3000"  # Use port 3001 instead
```

### Rebuilding from Scratch
```bash
npm run docker:down
docker-compose build --no-cache
npm run docker:dev
```

## Development Workflow

1. Make code changes in your editor
2. Changes automatically sync to container
3. Next.js hot reloads the application
4. View changes at http://localhost:3000

Uploads, database, and Redis data persist between container restarts.