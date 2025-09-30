import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';
import * as schema from './schema';

// Validate environment variables
if (!process.env.TURSO_DATABASE_URL) {
  throw new Error('TURSO_DATABASE_URL environment variable is required');
}

if (!process.env.TURSO_AUTH_TOKEN) {
  throw new Error('TURSO_AUTH_TOKEN environment variable is required');
}

// Create libSQL client
const client = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

// Create Drizzle database instance with schema
export const db = drizzle(client, { schema });

// Export client for direct access if needed
export { client };

// Connection test function
export async function testConnection(): Promise<boolean> {
  try {
    const result = await client.execute('SELECT 1 as test');
    return result.rows.length > 0;
  } catch (error) {
    console.error('Database connection test failed:', error);
    return false;
  }
}
