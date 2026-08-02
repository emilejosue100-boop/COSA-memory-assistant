import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { sql } from 'drizzle-orm';
import { db } from '../src/db/index.js';
import { getEmbedding } from '../src/services/embeddings.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

async function reembedAll(): Promise<void> {
  const notes = await db.execute(sql`SELECT id, raw_text FROM notes`);

  for (const note of notes.rows as Array<{ id: string; raw_text: string }>) {
    const embedding = await getEmbedding(note.raw_text, 'document');
    const vectorLiteral = `'[${embedding.join(',')}]'`;
    const escapedId = String(note.id).replace(/'/g, "''");

    await db.execute(sql.raw(`
      UPDATE notes SET embedding = ${vectorLiteral}::vector WHERE id = '${escapedId}'
    `));
    console.log(`Re-embedded note ${note.id}`);
  }

  console.log('Re-embedding complete.');
}

reembedAll()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Re-embedding failed:', err);
    process.exit(1);
  });
