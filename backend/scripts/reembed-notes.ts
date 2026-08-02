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
  await disconnectDB();
}

reembedAll()
  .then(() => process.exit(0))
  .catch(async (err) => {
    console.error('Re-embedding failed:', err);
    await disconnectDB().catch(() => {});
    process.exit(1);
  });
