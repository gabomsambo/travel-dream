import { createClient } from '@libsql/client';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const client = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN!,
});

async function addDescriptionColumn() {
  try {
    console.log('Adding description column to places table...');

    await client.execute('ALTER TABLE places ADD COLUMN description TEXT;');

    console.log('✅ Successfully added description column');

    const result = await client.execute('PRAGMA table_info(places);');
    console.log('\nCurrent places table columns:');
    console.log(result.rows.map(r => `- ${r.name} (${r.type})`).join('\n'));

  } catch (error: any) {
    if (error.message?.includes('duplicate column name')) {
      console.log('✅ Description column already exists');
    } else {
      console.error('❌ Error adding column:', error.message);
      throw error;
    }
  } finally {
    client.close();
  }
}

addDescriptionColumn();
