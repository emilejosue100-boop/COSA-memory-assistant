import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { Pool } from 'pg';
import { MEMBER_TIMELINE_VIEW_SQL } from '../src/services/timeline.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const pool = new Pool({
  connectionString: process.env.COCKROACH_DB_URL,
  ssl: { rejectUnauthorized: true },
});

try {
  await pool.query(MEMBER_TIMELINE_VIEW_SQL);
  console.log('member_timeline view applied successfully.');
} catch (err) {
  console.error('Timeline view apply failed:', err);
  process.exit(1);
} finally {
  await pool.end();
}
