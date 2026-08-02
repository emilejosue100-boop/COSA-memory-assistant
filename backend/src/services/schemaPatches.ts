import { sql } from 'drizzle-orm';
import { db } from '../db/index.js';

const NOTES_EMBEDDING_INDEX = 'notes_embedding_idx';
const TARGET_EMBEDDING_DIM = 768;

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

async function getNotesEmbeddingColumnDim(): Promise<number | null> {
  const typeResult = await db.execute(sql.raw(`
    SELECT format_type(a.atttypid, a.atttypmod) AS type, a.atttypmod
    FROM pg_attribute a
    JOIN pg_class t ON a.attrelid = t.oid
    WHERE t.relname = 'notes' AND a.attname = 'embedding' AND NOT a.attisdropped
  `));
  const row = typeResult.rows[0] as { type?: string; atttypmod?: number | null } | undefined;
  if (!row) return null;

  const typmod = Number(row.atttypmod ?? 0);
  if (typmod === TARGET_EMBEDDING_DIM) {
    return TARGET_EMBEDDING_DIM;
  }

  // format_type() often returns plain "vector" even for VECTOR(768); atttypmod is authoritative.
  const typeLabel = String(row.type ?? '');
  if (typeLabel.includes(String(TARGET_EMBEDDING_DIM))) {
    return TARGET_EMBEDDING_DIM;
  }

  return typmod > 0 ? typmod : null;
}

export async function ensureNotesEmbedding768(): Promise<void> {
  const currentDim = await getNotesEmbeddingColumnDim();
  if (currentDim === TARGET_EMBEDDING_DIM) {
    await ensureNotesEmbeddingIndex();
    return;
  }

  console.log(
    `Migrating notes.embedding${currentDim ? ` from VECTOR(${currentDim})` : ''} to VECTOR(${TARGET_EMBEDDING_DIM})...`
  );
  // CockroachDB cannot ALTER COLUMN TYPE while the vector index exists.
  await db.execute(sql.raw(`DROP INDEX IF EXISTS ${NOTES_EMBEDDING_INDEX}`));
  await db.execute(sql.raw(`UPDATE notes SET embedding = NULL WHERE embedding IS NOT NULL`));
  await db.execute(
    sql.raw(`ALTER TABLE notes ALTER COLUMN embedding TYPE VECTOR(${TARGET_EMBEDDING_DIM})`)
  );
  await ensureNotesEmbeddingIndex();
  console.log(
    `notes.embedding is VECTOR(${TARGET_EMBEDDING_DIM}). Run: npm run reembed-notes -w kumbuka-backend`
  );
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
