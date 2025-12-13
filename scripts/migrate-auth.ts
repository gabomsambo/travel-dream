import 'dotenv/config';
import { createClient } from '@libsql/client';

const client = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN!,
});

async function migrate() {
  console.log('Starting auth migration...');

  // Step 1: Create auth tables
  console.log('Creating auth tables...');

  await client.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id text PRIMARY KEY NOT NULL,
      name text,
      email text NOT NULL UNIQUE,
      email_verified integer,
      image text,
      hashed_password text,
      created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,
      updated_at text DEFAULT CURRENT_TIMESTAMP NOT NULL
    );
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS accounts (
      user_id text NOT NULL,
      type text NOT NULL,
      provider text NOT NULL,
      provider_account_id text NOT NULL,
      refresh_token text,
      access_token text,
      expires_at integer,
      token_type text,
      scope text,
      id_token text,
      session_state text,
      PRIMARY KEY(provider, provider_account_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS sessions (
      session_token text PRIMARY KEY NOT NULL,
      user_id text NOT NULL,
      expires integer NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS verification_tokens (
      identifier text NOT NULL,
      token text NOT NULL,
      expires integer NOT NULL,
      PRIMARY KEY(identifier, token)
    );
  `);

  // Step 2: Add user_id columns to existing tables
  console.log('Adding user_id columns...');

  const tables = ['places', 'sources', 'collections', 'upload_sessions'];

  for (const table of tables) {
    try {
      // Check if column exists
      const result = await client.execute(`PRAGMA table_info(${table})`);
      const hasUserId = result.rows.some((row: any) => row.name === 'user_id');

      if (!hasUserId) {
        console.log(`Adding user_id to ${table}...`);
        await client.execute(`ALTER TABLE ${table} ADD COLUMN user_id text REFERENCES users(id) ON DELETE CASCADE`);
      } else {
        console.log(`${table} already has user_id column`);
      }
    } catch (err) {
      console.error(`Error with ${table}:`, err);
    }
  }

  // Step 3: Create indexes
  console.log('Creating indexes...');

  const indexes = [
    { name: 'users_email_idx', sql: 'CREATE INDEX IF NOT EXISTS users_email_idx ON users(email)' },
    { name: 'accounts_user_idx', sql: 'CREATE INDEX IF NOT EXISTS accounts_user_idx ON accounts(user_id)' },
    { name: 'sessions_user_idx', sql: 'CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id)' },
    { name: 'places_user_idx', sql: 'CREATE INDEX IF NOT EXISTS places_user_idx ON places(user_id)' },
    { name: 'places_user_status_idx', sql: 'CREATE INDEX IF NOT EXISTS places_user_status_idx ON places(user_id, status)' },
    { name: 'sources_user_idx', sql: 'CREATE INDEX IF NOT EXISTS sources_user_idx ON sources(user_id)' },
    { name: 'collections_user_idx', sql: 'CREATE INDEX IF NOT EXISTS collections_user_idx ON collections(user_id)' },
    { name: 'upload_sessions_user_idx', sql: 'CREATE INDEX IF NOT EXISTS upload_sessions_user_idx ON upload_sessions(user_id)' },
  ];

  for (const index of indexes) {
    try {
      await client.execute(index.sql);
      console.log(`Created index: ${index.name}`);
    } catch (err) {
      console.log(`Index ${index.name} might already exist`);
    }
  }

  console.log('Migration completed!');
}

migrate().catch(console.error);
