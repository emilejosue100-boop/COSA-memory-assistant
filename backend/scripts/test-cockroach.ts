import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { Pool } from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const pool = new Pool({
  connectionString: process.env.COCKROACH_DB_URL,
  ssl: { rejectUnauthorized: true },
});

try {
  const result = await pool.query('SELECT 1 AS ok');
  console.log('Connection OK:', result.rows[0]);
} catch (err) {
  console.error('Connection failed:', err);
  process.exit(1);
} finally {
  await pool.end();
}
