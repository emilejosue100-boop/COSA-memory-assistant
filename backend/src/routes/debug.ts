import { Router } from 'express';
import { sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { requireAdmin } from '../middleware/auth.js';

const router = Router();

router.get('/debug/embedding-status', requireAdmin, async (_req, res) => {
  try {
    const result = await db.execute(sql`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE embedding IS NULL)::int AS null_embeddings,
        COUNT(*) FILTER (WHERE embedding IS NOT NULL)::int AS embedded
      FROM notes
    `);
    const columnResult = await db.execute(sql.raw(`
      SELECT format_type(a.atttypid, a.atttypmod) AS type, a.atttypmod
      FROM pg_attribute a
      JOIN pg_class t ON a.attrelid = t.oid
      WHERE t.relname = 'notes' AND a.attname = 'embedding' AND NOT a.attisdropped
    `));
    const row = columnResult.rows[0] as { type?: string; atttypmod?: number | null } | undefined;

    res.json({
      ...(result.rows[0] as Record<string, unknown>),
      embedding_column: {
        type: row?.type ?? null,
        atttypmod: row?.atttypmod ?? null,
      },
    });
  } catch (err) {
    console.error('embedding-status error:', err);
    res.status(500).json({ error: 'Failed to read embedding status' });
  }
});

export default router;
