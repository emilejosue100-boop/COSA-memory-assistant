import { sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { EmbeddingsError, getEmbedding, padEmbeddingForStorage } from './embeddings.js';

export interface SaveNoteOptions {
  memberId: string;
  createdBy: string;
  rawText: string;
  tags?: string[];
  source?: string;
  structuredText?: string;
  complianceFlag?: boolean;
  complianceSummary?: string;
}

export interface SavedNote {
  id: string;
  memberId: string;
  rawText: string;
  tags: string[];
  createdAt: Date | string;
}

export async function saveNote(opts: SaveNoteOptions): Promise<SavedNote> {
  const trimmedMemberId = opts.memberId.trim();
  const trimmedRawText = opts.rawText.trim();

  const embedding = padEmbeddingForStorage(await getEmbedding(trimmedRawText));
  const vectorLiteral = `'[${embedding.join(',')}]'`;
  const escapedCreatedBy = opts.createdBy.replace(/'/g, "''");
  const escapedSource = (opts.source?.trim() || 'manual').replace(/'/g, "''");
  const escapedStructured = (opts.structuredText?.trim() || trimmedRawText).replace(/'/g, "''");
  const escapedRaw = trimmedRawText.replace(/'/g, "''");
  const escapedSummary = opts.complianceSummary?.trim()
    ? `'${opts.complianceSummary.trim().replace(/'/g, "''")}'`
    : 'NULL';
  const tagsLiteral = `{${(opts.tags ?? []).map((t) => `"${t.replace(/"/g, '\\"')}"`).join(',')}}`;

  const insertResult = await db.execute(sql.raw(`
    INSERT INTO notes (member_id, created_by, source, raw_text, structured_text, tags, compliance_flag, compliance_summary, embedding)
    VALUES (
      '${trimmedMemberId}',
      '${escapedCreatedBy}',
      '${escapedSource}',
      '${escapedRaw}',
      '${escapedStructured}',
      '${tagsLiteral}'::text[],
      ${opts.complianceFlag ?? false},
      ${escapedSummary},
      ${vectorLiteral}::vector
    )
    RETURNING id, member_id, raw_text, tags, created_at
  `));

  const inserted = insertResult.rows[0] as {
    id: string;
    member_id: string;
    raw_text: string;
    tags: string[];
    created_at: Date | string;
  };

  return {
    id: String(inserted.id),
    memberId: String(inserted.member_id),
    rawText: inserted.raw_text,
    tags: inserted.tags,
    createdAt: inserted.created_at,
  };
}

export { EmbeddingsError };
