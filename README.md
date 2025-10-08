# Travel Dreams Collection

A purpose-built application to capture, structure, and retrieve travel inspirations using Next.js 15, Drizzle ORM, and Turso SQLite database.

## Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Set Up Environment
```bash
node setup-env.js
```

### 3. Configure Turso Database
Follow the instructions printed by the setup script:
1. Install Turso CLI: `curl -sSfL https://get.tur.so/install.sh | bash`
2. Login: `turso auth login`
3. Create database: `turso db create travel-dreams`
4. Get URL: `turso db show travel-dreams --url`
5. Create token: `turso db tokens create travel-dreams -e none`
6. Update `.env.local` with your actual values

### 4. Generate and Apply Database Schema
```bash
npm run db:generate
npm run db:migrate
```

### 5. Start Development Server
```bash
npm run dev
```

## Database Scripts

- `npm run db:generate` - Generate migrations from schema changes
- `npm run db:migrate` - Apply migrations to database
- `npm run db:push` - Push schema directly (development only)
- `npm run db:studio` - Open Drizzle Studio (database GUI)
- `npm run db:drop` - Drop database tables

## Docker Development (Alternative Setup)

Prefer containerized development? Use Docker:

```bash
# Initial setup
cp .env.docker .env.local
# Edit .env.local with your credentials

# Start all services (app + redis + db)
npm run docker:dev:build

# View logs
npm run docker:logs

# Check health
npm run docker:health

# Stop services
npm run docker:down
```

**Features included in Docker setup:**
- ✅ Next.js app with hot reload
- ✅ Local Redis for rate limiting
- ✅ All image processing dependencies (Sharp, VIPS)
- ✅ Tesseract OCR pre-installed
- ✅ Persistent upload storage
- ✅ Automatic directory creation

See **[DOCKER.md](./DOCKER.md)** for detailed Docker setup guide.

## Project Structure

```
src/
├── app/                    # Next.js 15 App Router
│   ├── layout.tsx
│   ├── page.tsx
│   └── api/                # API Routes
├── db/
│   ├── index.ts            # Database connection
│   ├── schema/             # Schema definitions
│   └── migrations/         # Generated migrations
├── lib/
│   ├── db-queries.ts      # Database query functions
│   └── db-mutations.ts    # Database mutation functions
└── types/
    └── database.ts         # Inferred TypeScript types
```

## Core Entities

- **Sources**: Where travel ideas originate (screenshots, URLs, notes)
- **Places**: Canonical travel destinations with taxonomy and metadata
- **Collections**: Curated lists of places for trip planning

## Development

This project follows the Travel Dreams Collection domain model with support for:
- OCR text extraction and LLM structuring
- Deduplication and canonicalization
- Flexible tagging and categorization
- Performance-optimized queries with proper indexing
