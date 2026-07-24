import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';

const client = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN!,
});

const db = drizzle(client);

async function applyMigration() {
  console.log('Applying Day Planner migration...');

  try {
    await client.execute(`
      ALTER TABLE collections ADD COLUMN day_buckets TEXT DEFAULT '[]' NOT NULL;
    `);
    console.log('✓ Added day_buckets column to collections');
  } catch (error: any) {
    if (error.message.includes('duplicate column name')) {
      console.log('✓ day_buckets column already exists');
    } else {
      throw error;
    }
  }

  try {
    await client.execute(`
      ALTER TABLE collections ADD COLUMN unscheduled_place_ids TEXT DEFAULT '[]' NOT NULL;
    `);
    console.log('✓ Added unscheduled_place_ids column to collections');
  } catch (error: any) {
    if (error.message.includes('duplicate column name')) {
      console.log('✓ unscheduled_place_ids column already exists');
    } else {
      throw error;
    }
  }

  console.log('\n✅ Day Planner migration completed successfully!');
  console.log('Collections table now supports day planning with JSON fields.');

  client.close();
}

applyMigration().catch((error) => {
  console.error('❌ Migration failed:', error);
  process.exit(1);
});
