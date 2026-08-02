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
  const userResult = await pool.query('SELECT current_user');
  const currentUser = userResult.rows[0]?.current_user as string;
  console.log('Connected as:', currentUser);

  try {
    await pool.query('SELECT 1 FROM notes LIMIT 1');
    console.log('SELECT on notes: OK');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('SELECT on notes: FAILED —', message);
    console.log('\nRun as table owner / cluster admin:');
    console.log(`GRANT ALL ON TABLE notes TO ${currentUser};`);
    process.exit(1);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO notes (member_id, created_by, source, raw_text, structured_text, tags, compliance_flag)
       SELECT id::text, 'permission-check', 'diagnostic', 'test', 'test', '{}', false
       FROM members LIMIT 1`
    );
    await client.query('ROLLBACK');
    console.log('INSERT on notes (rolled back): OK');
  } catch (err) {
    await client.query('ROLLBACK');
    const message = err instanceof Error ? err.message : String(err);
    console.error('INSERT on notes: FAILED —', message);
    console.log('\nRun as table owner / cluster admin:');
    console.log(`GRANT ALL ON TABLE notes TO ${currentUser};`);
    process.exit(1);
  } finally {
    client.release();
  }

  console.log('\nNotes table permissions look good for', currentUser);

  const typeResult = await pool.query(`
    SELECT format_type(a.atttypid, a.atttypmod) AS type
    FROM pg_attribute a
    JOIN pg_class t ON a.attrelid = t.oid
    WHERE t.relname = 'notes' AND a.attname = 'embedding'
  `);
  const embeddingType = typeResult.rows[0]?.type as string | undefined;
  console.log('notes.embedding type:', embeddingType ?? 'unknown');

  if (embeddingType && !String(embeddingType).includes('1024') && embeddingType !== 'vector') {
    console.warn(
      `\nWarning: notes.embedding is ${embeddingType}. Voyage voyage-2 outputs 1024 dims; storage pads to 1536.`
    );
  }
} catch (err) {
  console.error('Permission check failed:', err);
  process.exit(1);
} finally {
  await pool.end();
}
