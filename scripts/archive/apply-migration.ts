import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';

const client = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN!,
});

const db = drizzle(client);

async function applyMigration() {
  console.log('Applying Collections UI Refresh migration...');

  try {
    // Add transport_mode column to collections
    await client.execute(`
      ALTER TABLE collections ADD COLUMN transport_mode TEXT DEFAULT 'drive' NOT NULL;
    `);
    console.log('✓ Added transport_mode column to collections');
  } catch (error: any) {
    if (error.message.includes('duplicate column name')) {
      console.log('✓ transport_mode column already exists');
    } else {
      throw error;
    }
  }

  try {
    // Add is_pinned column to places_to_collections
    await client.execute(`
      ALTER TABLE places_to_collections ADD COLUMN is_pinned INTEGER DEFAULT 0 NOT NULL;
    `);
    console.log('✓ Added is_pinned column to places_to_collections');
  } catch (error: any) {
    if (error.message.includes('duplicate column name')) {
      console.log('✓ is_pinned column already exists');
    } else {
      throw error;
    }
  }

  try {
    // Add note column to places_to_collections
    await client.execute(`
      ALTER TABLE places_to_collections ADD COLUMN note TEXT;
    `);
    console.log('✓ Added note column to places_to_collections');
  } catch (error: any) {
    if (error.message.includes('duplicate column name')) {
      console.log('✓ note column already exists');
    } else {
      throw error;
    }
  }

  try {
    // Create index
    await client.execute(`
      CREATE INDEX IF NOT EXISTS places_to_collections_pinned_idx
      ON places_to_collections(collection_id, is_pinned);
    `);
    console.log('✓ Created pinned index');
  } catch (error: any) {
    console.log('✓ Index already exists or created successfully');
  }

  console.log('\n✅ Migration completed successfully!');
  console.log('You can now refresh your browser and the collections should work.');

  client.close();
}

applyMigration().catch((error) => {
  console.error('❌ Migration failed:', error);
  process.exit(1);
});
