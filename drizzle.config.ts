import { config } from 'dotenv';
import { defineConfig } from 'drizzle-kit';

// Load environment variables from .env.local
config({ path: '.env.local' });

export default defineConfig({
  schema: './src/db/schema/index.ts',
  out: './src/db/migrations',
  // drizzle-kit >=0.30 replaced the `dialect: 'sqlite'` + `driver: 'turso'` pair
  // with a first-class 'turso' dialect. Same target, new spelling.
  dialect: 'turso',
  dbCredentials: {
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN!,
  },
  verbose: true,
  strict: true,
  // Ensure migrations are generated with proper naming
  migrations: {
    prefix: 'timestamp',
  },
});
