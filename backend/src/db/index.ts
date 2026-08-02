import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema.js';

let pool: Pool | undefined;

export type Db = ReturnType<typeof drizzle<typeof schema>>;

export let db: Db;

export async function connectCockroachDB(): Promise<void> {
  const connectionString = process.env.COCKROACH_DB_URL?.trim();
  if (!connectionString) {
    throw new Error('COCKROACH_DB_URL environment variable is not configured');
  }

  pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: true },
  });

  db = drizzle(pool, { schema });
  await db.execute(sql`SELECT 1`);
  console.log('CockroachDB connected');
}

export async function disconnectCockroachDB(): Promise<void> {
  await pool?.end();
  pool = undefined;
}
