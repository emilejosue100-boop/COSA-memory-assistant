import { Router } from 'express';
import { eq, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { members } from '../db/schema.js';
import { requireAdmin, requireMember, type AuthRequest } from '../middleware/auth.js';
import { EmbeddingsError, getEmbedding, padEmbeddingForStorage } from '../services/embeddings.js';
import { saveNote } from '../services/notes.js';

const router = Router();

interface NoteListRow {
  id: string;
  created_at: Date | string;
  created_by: string;
  source: string;
  raw_text: string;
  tags: string[] | null;
  compliance_flag: boolean;
  compliance_summary: string | null;
}

router.get('/notes/:memberId', requireAdmin, async (req: AuthRequest, res) => {
  try {
    const memberId = req.params.memberId?.trim();
    if (!memberId) {
      res.status(400).json({ error: 'memberId is required' });
      return;
    }

    const member = await db.query.members.findFirst({
      where: eq(members.id, memberId),
    });
    if (!member) {
      res.status(404).json({ error: 'Member not found' });
      return;
    }

    const result = await db.execute(sql.raw(`
      SELECT id, created_at, created_by, source, raw_text, tags, compliance_flag, compliance_summary
      FROM notes
      WHERE member_id = '${memberId}'
      ORDER BY created_at DESC
    `));

    const rows = result.rows as unknown as NoteListRow[];
    res.json(
      rows.map((row) => ({
        id: String(row.id),
        createdAt: row.created_at,
        createdBy: row.created_by,
        source: row.source,
        rawText: row.raw_text,
        tags: row.tags ?? [],
        complianceFlag: row.compliance_flag,
        complianceSummary: row.compliance_summary,
      }))
    );
  } catch (err) {
    console.error('GET /api/notes/:memberId error:', err);
    res.status(500).json({ error: 'Failed to fetch notes' });
  }
});

router.post('/add-note', requireAdmin, async (req: AuthRequest, res) => {
  try {
    const {
      memberId,
      rawText,
      structuredText,
      tags,
      source,
      complianceFlag,
      complianceSummary,
    } = req.body as {
      memberId?: string;
      rawText?: string;
      structuredText?: string;
      tags?: string[];
      source?: string;
      complianceFlag?: boolean;
      complianceSummary?: string;
    };

    if (!memberId?.trim() || !rawText?.trim()) {
      res.status(400).json({ error: 'memberId and rawText are required' });
      return;
    }

    const trimmedMemberId = memberId.trim();
    const trimmedRawText = rawText.trim();

    const member = await db.query.members.findFirst({
      where: eq(members.id, trimmedMemberId),
    });
    if (!member) {
      res.status(404).json({ error: 'Member not found' });
      return;
    }

    const admin = req.userId
      ? await db.query.members.findFirst({ where: eq(members.id, req.userId) })
      : null;
    const createdBy = admin?.name ?? 'admin';

    const inserted = await saveNote({
      memberId: trimmedMemberId,
      createdBy,
      rawText: trimmedRawText,
      structuredText: structuredText?.trim(),
      tags,
      source: source?.trim() || 'manual',
      complianceFlag: complianceFlag ?? false,
      complianceSummary: complianceSummary?.trim(),
    });

    res.status(201).json({
      id: inserted.id,
      memberId: inserted.memberId,
      rawText: inserted.rawText,
      tags: inserted.tags,
      createdAt: inserted.createdAt,
    });
  } catch (err) {
    if (err instanceof EmbeddingsError) {
      console.error('add-note Gemini error:', err);
      res.status(503).json({ error: `Gemini embeddings unavailable: ${err.message}` });
      return;
    }
    console.error('add-note error:', err);
    res.status(500).json({ error: 'Failed to add note' });
  }
});

router.post('/payment-update', requireMember, async (req: AuthRequest, res) => {
  try {
    const { message } = req.body as { message?: string };

    if (!message?.trim()) {
      res.status(400).json({ error: 'message is required' });
      return;
    }

    const trimmedMessage = message.trim();
    const memberId = req.userId!;

    const member = await db.query.members.findFirst({
      where: eq(members.id, memberId),
    });
    if (!member) {
      res.status(404).json({ error: 'Member not found' });
      return;
    }

    const embedding = padEmbeddingForStorage(await getEmbedding(trimmedMessage, 'document'));
    const vectorLiteral = `'[${embedding.join(',')}]'`;
    const escapedCreatedBy = `member:${memberId}`.replace(/'/g, "''");
    const escapedMessage = trimmedMessage.replace(/'/g, "''");
    const tagsLiteral = '{"#member-reported","#payment-intent"}';

    const insertResult = await db.execute(sql.raw(`
      INSERT INTO notes (member_id, created_by, source, raw_text, structured_text, tags, compliance_flag, compliance_summary, embedding)
      VALUES (
        '${memberId}',
        '${escapedCreatedBy}',
        'member_payment_update',
        '${escapedMessage}',
        '${escapedMessage}',
        '${tagsLiteral}'::text[],
        false,
        NULL,
        ${vectorLiteral}::vector
      )
      RETURNING id, created_at
    `));

    const inserted = insertResult.rows[0] as { id: string; created_at: Date | string };

    res.status(201).json({
      id: String(inserted.id),
      createdAt: inserted.created_at,
    });
  } catch (err) {
    if (err instanceof EmbeddingsError) {
      console.error('payment-update Gemini error:', err);
      res.status(503).json({ error: `Gemini embeddings unavailable: ${err.message}` });
      return;
    }
    console.error('payment-update error:', err);
    res.status(500).json({ error: 'Failed to submit payment update' });
  }
});

export default router;
