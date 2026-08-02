import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { sql } from 'drizzle-orm';
import { connectDB, disconnectDB } from '../src/config/db.js';
import { db } from '../src/db/index.js';
import { getEmbedding } from '../src/services/embeddings.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

async function reembedAll(): Promise<void> {
  await connectDB();

  const notes = await db.execute(sql`SELECT id, raw_text FROM notes ORDER BY created_at`);
  const rows = notes.rows as Array<{ id: string; raw_text: string }>;

  if (rows.length === 0) {
    console.log('No notes to re-embed.');
    await disconnectDB();
    return;
  }

  let updated = 0;
  for (const note of rows) {
    const embedding = await getEmbedding(note.raw_text, 'document');
    const vectorLiteral = `'[${embedding.join(',')}]'`;
    const escapedId = String(note.id).replace(/'/g, "''");

    const result = await db.execute(sql.raw(`
      UPDATE notes SET embedding = ${vectorLiteral}::vector WHERE id = '${escapedId}'
      RETURNING id, embedding IS NULL AS is_null
    `));

    const row = result.rows[0] as { id: string; is_null: boolean } | undefined;
    if (!row || row.is_null) {
      throw new Error(`Failed to persist embedding for note ${note.id}`);
    }

    updated += 1;
    console.log(`Re-embedded note ${note.id}`);
  }

  const verify = await db.execute(sql`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE embedding IS NULL)::int AS null_count
    FROM notes
  `);
  const stats = verify.rows[0] as { total: number; null_count: number };
  console.log(`Re-embedding complete. Updated ${updated}/${rows.length} notes.`);
  console.log('Verification:', stats);

  if (Number(stats.null_count) > 0) {
    throw new Error(`${stats.null_count} notes still have NULL embeddings`);
  }

  await disconnectDB();
}

reembedAll()
  .then(() => process.exit(0))
  .catch(async (err) => {
    console.error('Re-embedding failed:', err);
    await disconnectDB().catch(() => {});
    process.exit(1);
  });
