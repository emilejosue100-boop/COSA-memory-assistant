import { Router } from 'express';
import { eq, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { members, notes } from '../db/schema.js';
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
  voided: boolean | null;
  void_reason: string | null;
  voided_by: string | null;
  voided_at: Date | string | null;
  corrected_note_id: string | null;
}

function mapNoteListRow(row: NoteListRow) {
  return {
    id: String(row.id),
    createdAt: row.created_at,
    createdBy: row.created_by,
    source: row.source,
    rawText: row.raw_text,
    tags: row.tags ?? [],
    complianceFlag: row.compliance_flag,
    complianceSummary: row.compliance_summary,
    voided: row.voided === true,
    voidReason: row.void_reason ?? null,
    voidedBy: row.voided_by ?? null,
    voidedAt: row.voided_at ?? null,
    correctedNoteId: row.corrected_note_id ? String(row.corrected_note_id) : null,
  };
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
      SELECT id, created_at, created_by, source, raw_text, tags, compliance_flag, compliance_summary,
             voided, void_reason, voided_by, voided_at, corrected_note_id
      FROM notes
      WHERE member_id = '${memberId.replace(/'/g, "''")}'
      ORDER BY created_at DESC
    `));

    const rows = result.rows as unknown as NoteListRow[];
    res.json(rows.map(mapNoteListRow));
  } catch (err) {
    console.error('GET /api/notes/:memberId error:', err);
    res.status(500).json({ error: 'Failed to fetch notes' });
  }
});

router.post('/notes/:noteId/void-and-correct', requireAdmin, async (req: AuthRequest, res) => {
  try {
    const noteId = req.params.noteId?.trim();
    const { reason, correctMemberId, correctText, correctTags } = req.body as {
      reason?: string;
      correctMemberId?: string;
      correctText?: string;
      correctTags?: string[];
    };

    if (!noteId) {
      res.status(400).json({ error: 'noteId is required' });
      return;
    }

    const trimmedReason = reason?.trim();
    if (!trimmedReason) {
      res.status(400).json({ error: 'A reason is required to void a note' });
      return;
    }

    const existing = await db.query.notes.findFirst({
      where: eq(notes.id, noteId),
    });
    if (!existing) {
      res.status(404).json({ error: 'Note not found' });
      return;
    }
    if (existing.voided) {
      res.status(409).json({ error: 'Note is already voided' });
      return;
    }

    const admin = req.userId
      ? await db.query.members.findFirst({ where: eq(members.id, req.userId) })
      : null;
    const voidedBy = admin?.name ?? 'admin';

    let correctedNoteId: string | null = null;
    let correctedMemberId: string | null = null;

    const trimmedCorrectText = correctText?.trim();
    const trimmedCorrectMemberId = correctMemberId?.trim();

    if (trimmedCorrectMemberId && trimmedCorrectText) {
      const targetMember = await db.query.members.findFirst({
        where: eq(members.id, trimmedCorrectMemberId),
      });
      if (!targetMember) {
        res.status(404).json({ error: 'Correct member not found' });
        return;
      }

      const corrected = await saveNote({
        memberId: trimmedCorrectMemberId,
        createdBy: voidedBy,
        rawText: trimmedCorrectText,
        tags: correctTags,
        source: 'manual',
      });
      correctedNoteId = corrected.id;
      correctedMemberId = corrected.memberId;
    } else if (trimmedCorrectMemberId || trimmedCorrectText) {
      res.status(400).json({
        error: 'Both correctMemberId and correctText are required to create a correction',
      });
      return;
    }

    const updateResult = await db.execute(sql`
      UPDATE notes
      SET voided = true,
          void_reason = ${trimmedReason},
          voided_by = ${voidedBy},
          voided_at = now(),
          corrected_note_id = ${correctedNoteId}
      WHERE id = ${noteId}
        AND COALESCE(voided, false) = false
      RETURNING id
    `);

    if (updateResult.rows.length === 0) {
      res.status(409).json({ error: 'Note could not be voided' });
      return;
    }

    res.json({
      success: true,
      correctedNoteId,
      correctedMemberId,
    });
  } catch (err) {
    if (err instanceof EmbeddingsError) {
      console.error('void-and-correct Gemini error:', err);
      res.status(503).json({ error: `Gemini embeddings unavailable: ${err.message}` });
      return;
    }
    console.error('POST /api/notes/:noteId/void-and-correct error:', err);
    res.status(500).json({ error: 'Failed to void note' });
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