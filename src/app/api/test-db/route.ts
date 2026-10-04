import { NextResponse } from 'next/server';
import { requireAuthForApi, isAuthError } from '@/lib/auth-helpers';
// TODO(tenant-db): migrate to `forUser(user.id)` from '@/lib/tenant-db'.
// Not migrated in the change that introduced the accessor: a debug endpoint
// that enumerates `sqlite_master` through `db.all()`. It has no tenant data
// and no scoped equivalent, and it 404s in production (see the gate in GET).
// See AGENTS.md § Multi-Tenancy for the rule this exemption suspends.
// eslint-disable-next-line no-restricted-imports -- unmigrated; see the TODO above
import { db, testConnection } from '@/db';
import { sql } from 'drizzle-orm';
import { getPlaceStats } from '@/lib/db-queries';

export async function GET() {
  // Debug endpoint: never expose the schema or credential state in production
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  try {
    const user = await requireAuthForApi();

    // Test basic connection
    const isConnected = await testConnection();
    
    if (!isConnected) {
      return NextResponse.json(
        { 
          status: 'error', 
          message: 'Database connection failed',
          connected: false 
        },
        { status: 500 }
      );
    }

    // Get table information
    const tablesResult = await db.all(sql`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name NOT LIKE 'sqlite_%'
      ORDER BY name
    `);
    
    const tables = tablesResult.map((row: any) => row.name);

    // Get basic statistics if tables exist
    let stats = null;
    try {
      if (tables.includes('places')) {
        stats = await getPlaceStats(user.id);
      }
    } catch (error) {
      console.warn('Could not fetch stats:', error);
    }

    // Test a simple query on each table
    const tableStatus: Record<string, boolean> = {};
    for (const table of tables) {
      try {
        await db.all(sql.raw(`SELECT COUNT(*) FROM ${table} LIMIT 1`));
        tableStatus[table] = true;
      } catch (error) {
        tableStatus[table] = false;
      }
    }

    return NextResponse.json({
      status: 'connected',
      connected: true,
      timestamp: new Date().toISOString(),
      database: {
        tables,
        tableStatus,
        stats,
      },
      environment: {
        nodeEnv: process.env.NODE_ENV,
        hasDbUrl: !!process.env.TURSO_DATABASE_URL,
        hasAuthToken: !!process.env.TURSO_AUTH_TOKEN,
      }
    });

  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    console.error('Database test error:', error);

    return NextResponse.json(
      {
        status: 'error',
        connected: false,
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
