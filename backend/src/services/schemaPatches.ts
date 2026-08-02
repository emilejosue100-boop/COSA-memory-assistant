import { sql } from 'drizzle-orm';
import { db } from '../db/index.js';

const NOTES_EMBEDDING_INDEX = 'notes_embedding_idx';

export async function ensureLoanOutcomeColumns(): Promise<void> {
  await db.execute(
    sql.raw(`ALTER TABLE loan_requests ADD COLUMN IF NOT EXISTS final_outcome STRING`)
  );
  await db.execute(
    sql.raw(`ALTER TABLE loan_requests ADD COLUMN IF NOT EXISTS outcome_recorded_at TIMESTAMPTZ`)
  );
}

async function ensureNotesEmbeddingIndex(): Promise<void> {
  await db.execute(sql.raw(`
    CREATE INDEX IF NOT EXISTS ${NOTES_EMBEDDING_INDEX}
    ON notes USING cspann (embedding vector_l2_ops)
  `));
}

export async function ensureNotesEmbedding768(): Promise<void> {
  const typeResult = await db.execute(sql.raw(`
    SELECT format_type(a.atttypid, a.atttypmod) AS type
    FROM pg_attribute a
    JOIN pg_class t ON a.attrelid = t.oid
    WHERE t.relname = 'notes' AND a.attname = 'embedding' AND NOT a.attisdropped
  `));
  const embeddingType = String((typeResult.rows[0] as { type?: string })?.type ?? '');
  if (embeddingType.includes('768')) {
    await ensureNotesEmbeddingIndex();
    return;
  }

  console.log(
    `Migrating notes.embedding${embeddingType ? ` from ${embeddingType}` : ''} to VECTOR(768)...`
  );
  // CockroachDB cannot ALTER COLUMN TYPE while the vector index exists.
  await db.execute(sql.raw(`DROP INDEX IF EXISTS ${NOTES_EMBEDDING_INDEX}`));
  await db.execute(sql.raw(`UPDATE notes SET embedding = NULL WHERE embedding IS NOT NULL`));
  await db.execute(sql.raw(`ALTER TABLE notes ALTER COLUMN embedding TYPE VECTOR(768)`));
  await ensureNotesEmbeddingIndex();
  console.log('notes.embedding is VECTOR(768). Run: npm run reembed-notes -w kumbuka-backend');
}

export async function ensureRiskScanLogTable(): Promise<void> {
  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS risk_scan_log (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      scan_result STRING NOT NULL,
      created_at TIMESTAMPTZ DEFAULT now(),
      reviewed BOOL DEFAULT false,
      reviewed_by STRING,
      reviewed_at TIMESTAMPTZ
    )
  `));
}
