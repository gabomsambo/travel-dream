import { db } from '../src/db';
import { places } from '../src/db/schema';
import { sql } from 'drizzle-orm';

/**
 * Fix corrupted JSON data in places table
 * Run with: npx tsx scripts/fix-json-data.ts
 */

async function fixCorruptedJsonData() {
  console.log('🔧 Starting database cleanup...');

  try {
    // Fix alt_names
    await db.run(sql`
      UPDATE places
      SET alt_names = '[]'
      WHERE alt_names IS NULL
         OR alt_names = ''
         OR alt_names = 'alt_names'
         OR alt_names = 'array'
         OR alt_names NOT LIKE '[%'
    `);
    console.log('✅ Fixed alt_names');

    // Fix tags
    await db.run(sql`
      UPDATE places
      SET tags = '[]'
      WHERE tags IS NULL
         OR tags = ''
         OR tags = 'tags'
         OR tags = 'array'
         OR tags NOT LIKE '[%'
    `);
    console.log('✅ Fixed tags');

    // Fix vibes
    await db.run(sql`
      UPDATE places
      SET vibes = '[]'
      WHERE vibes IS NULL
         OR vibes = ''
         OR vibes = 'vibes'
         OR vibes = 'array'
         OR vibes NOT LIKE '[%'
    `);
    console.log('✅ Fixed vibes');

    // Fix coords (objects, not arrays)
    await db.run(sql`
      UPDATE places
      SET coords = NULL
      WHERE coords IS NOT NULL
        AND (coords = 'coords'
         OR coords = 'object'
         OR (coords NOT LIKE '{%' AND coords != 'null'))
    `);
    console.log('✅ Fixed coords');

    console.log('✨ Database cleanup complete!');
  } catch (error) {
    console.error('❌ Error during cleanup:', error);
    process.exit(1);
  }
}

fixCorruptedJsonData()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });