import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { sql } from 'drizzle-orm';
import { connectDB, disconnectDB } from '../src/config/db.js';
import { db } from '../src/db/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

await connectDB();

const summary = await db.execute(sql`
  SELECT
    COUNT(*)::int AS total,
    COUNT(*) FILTER (WHERE embedding IS NULL)::int AS null_count,
    COUNT(*) FILTER (WHERE embedding IS NOT NULL)::int AS embedded_count,
    COUNT(DISTINCT member_id)::int AS member_count
  FROM notes
`);
console.log('Summary:', summary.rows[0]);

const sample = await db.execute(sql`
  SELECT id, member_id::text AS member_id, embedding IS NULL AS is_null,
         CASE WHEN embedding IS NULL THEN NULL ELSE vector_dims(embedding) END AS dims
  FROM notes
  ORDER BY created_at DESC
  LIMIT 20
`);
console.log('\nSample notes:');
for (const row of sample.rows) {
  console.log(row);
}

const typeResult = await db.execute(sql`
  SELECT format_type(a.atttypid, a.atttypmod) AS embedding_type, a.atttypmod
  FROM pg_attribute a
  JOIN pg_class t ON a.attrelid = t.oid
  WHERE t.relname = 'notes' AND a.attname = 'embedding' AND NOT a.attisdropped
`);
console.log('\nColumn type:', typeResult.rows[0]);

const probe = await db.execute(sql.raw(`
  SELECT vector_dims('[${Array(768).fill(0).join(',')}]'::vector) AS probe_dims
`));
console.log('Probe dims:', probe.rows[0]);

await disconnectDB();
