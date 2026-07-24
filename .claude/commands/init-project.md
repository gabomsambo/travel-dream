# Initialize Project

Run the following commands to set up and start Travel Dreams locally:

## 1. Install Dependencies
```bash
npm install
```
Installs all Node.js packages defined in package.json.

## 2. Check Environment File
```bash
ls -la .env.local
```
Verify `.env.local` exists with credentials. If missing, copy from `.env.example` and fill in values:
```bash
cp .env.example .env.local
```

**Required env vars for basic functionality:**
- `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN` (database)
- `AUTH_SECRET` (session encryption)
- `AUTH_GOOGLE_ID` + `AUTH_GOOGLE_SECRET` (Google login)
- `AUTH_URL=http://localhost:3000`

## 3. Run Database Migrations
```bash
npm run db:generate
npm run db:migrate
```
Generates and applies any pending Drizzle ORM migrations to Turso.

## 4. Start Development Server
```bash
npm run dev
```
Starts the Next.js dev server with hot-reload on port 3000.

## 5. Validate Setup

Check that everything is working:

```bash
# Test app is responding
curl -s -o /dev/null -w "HTTP Status: %{http_code}\n" http://localhost:3000

# Test login page loads
curl -s -o /dev/null -w "HTTP Status: %{http_code}\n" http://localhost:3000/login
```

Both should return HTTP 200 responses.

## Access Points

- App: http://localhost:3000
- Login: http://localhost:3000/login
- Drizzle Studio (DB browser): `npm run db:studio` → http://localhost:4983

## Cleanup

To stop services:
```bash
# Stop dev server: Ctrl+C
# Or kill by port:
lsof -ti:3000 | xargs kill -9 2>/dev/null || true
```