import { createClient } from '@libsql/client';
import * as dotenv from 'dotenv';

dotenv.config();

const client = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN!,
});

async function migrate() {
  console.log('🔄 Adding missing columns to places table...');

  try {
    // Add columns one by one
    await client.execute('ALTER TABLE places ADD COLUMN price_level TEXT');
    console.log('✅ Added price_level');

    await client.execute('ALTER TABLE places ADD COLUMN best_time TEXT');
    console.log('✅ Added best_time');

    await client.execute('ALTER TABLE places ADD COLUMN activities TEXT');
    console.log('✅ Added activities');

    await client.execute('ALTER TABLE places ADD COLUMN cuisine TEXT');
    console.log('✅ Added cuisine');

    await client.execute('ALTER TABLE places ADD COLUMN amenities TEXT');
    console.log('✅ Added amenities');

    console.log('✨ Migration complete!');
  } catch (error: any) {
    if (error.message.includes('duplicate column name')) {
      console.log('ℹ️  Columns already exist, skipping...');
    } else {
      console.error('❌ Migration failed:', error);
      process.exit(1);
    }
  }
}

migrate()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });