import { Router } from 'express';
import { sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { auditLog } from '../db/schema.js';
import { requireAdmin, type AuthRequest } from '../middleware/auth.js';
import { EmbeddingsError, getEmbedding, padEmbeddingForStorage } from '../services/embeddings.js';
import {
  askClaude,
  askClaudeNamedMemberComparison,
  askClaudeNamedVsCooperativeComparison,
  askClaudePatternSearch,
  BedrockError,
  type ContextNote,
  type ConversationTurn,
  type PatternSearchCase,
} from '../services/bedrock.js';
import { ACTIVE_NOTE_SQL_FILTER, activeNoteFilter, saveNote } from '../services/notes.js';
import {
  fetchNamedMemberProfiles,
  getCooperativeAggregateStats,
  questionRequestsCooperativeComparison,
  resolveMembersByName,
} from '../services/namedMemberSearch.js';
import { convertAmount } from '../services/currency.js';
import {
  getMemberLoans,
  getMemberRecord,
  getMemberStats,
  type MemberLoanDisplay,
  type MemberRecordDisplay,
  type MemberStatsDisplay,
} from '../services/memberContext.js';
import { getMemberTimeline } from '../services/timeline.js';
import { isValidCurrency } from '../utils/exchangeRates.js';

interface NoteRow {
  id: string;
  raw_text: string;
  tags: string[] | null;
  compliance_flag: boolean;
  compliance_summary: string | null;
}

interface PaymentUpdateRow {
  id: string;
  raw_text: string;
  created_at: Date | string;
}

interface PatternNoteRow {
  id: string;
  member_id: string;
  raw_text: string;
  tags: string[] | null;
  compliance_flag: boolean;
  compliance_summary: string | null;
  created_at: Date | string;
  member_name: string;
}

interface LoanOutcomeRow {
  member_id: string;
  status: string;
  repaid: boolean | null;
  remaining_balance: number | null;
}

const router = Router();

const MAX_CONVERSATION_TURNS = 6;

function normalizeConversationHistory(raw: unknown): ConversationTurn[] {
  if (!Array.isArray(raw)) return [];

  return raw
    .filter(
      (item): item is { role: string; content: string } =>
        !!item &&
        typeof item === 'object' &&
        (item.role === 'user' || item.role === 'assistant') &&
        typeof item.content === 'string' &&
        item.content.trim().length > 0
    )
    .slice(-MAX_CONVERSATION_TURNS)
    .map((item) => ({
      role: item.role as ConversationTurn['role'],
      content: item.content.trim(),
    }));
}

router.post('/ask-assistant', requireAdmin, async (req: AuthRequest, res) => {
  
  try {
    const {
      memberId,
      question,
      displayCurrency: rawDisplayCurrency,
      conversationHistory: rawConversationHistory,
    } = req.body as {
      memberId?: string;
      question?: string;
      displayCurrency?: string;
      conversationHistory?: unknown;
    };

    if (!memberId?.trim() || !question?.trim()) {
      res.status(400).json({ error: 'memberId and question are required' });
      return;
    }

    const trimmedMemberId = memberId.trim();
    const trimmedQuestion = question.trim();
    const normalizedDisplayCurrency = (rawDisplayCurrency ?? 'USD').toUpperCase();
    const displayCurrency = isValidCurrency(normalizedDisplayCurrency)
      ? normalizedDisplayCurrency
      : 'USD';
    const conversationHistory = normalizeConversationHistory(rawConversationHistory);

    const member = await getMemberRecord(trimmedMemberId);
    if (!member) {
      res.status(404).json({ error: 'Member not found' });
      return;
    }

    const questionEmbedding = padEmbeddingForStorage(await getEmbedding(trimmedQuestion, 'query'));
    const vectorLiteral = `'[${questionEmbedding.join(',')}]'`;

    const [relevantNotesResult, paymentUpdatesResult, stats, loans, timelineEvents] =
      await Promise.all([
      // memberId validated via members lookup; vector literal must be inlined for Cockroach VECTOR ops
      db.execute(sql.raw(`
        SELECT id, raw_text, tags, compliance_flag, compliance_summary
        FROM notes
        WHERE member_id = '${trimmedMemberId}'
          AND embedding IS NOT NULL
          AND source != 'member_payment_update'
          AND ${ACTIVE_NOTE_SQL_FILTER}
        ORDER BY embedding <-> ${vectorLiteral}::vector
        LIMIT 5
      `)),
      db.execute(sql.raw(`
        SELECT id, raw_text, created_at
        FROM notes
        WHERE member_id = '${trimmedMemberId}'
          AND source = 'member_payment_update'
          AND ${ACTIVE_NOTE_SQL_FILTER}
        ORDER BY created_at DESC
        LIMIT 5
      `)),
      getMemberStats(trimmedMemberId),
      getMemberLoans(trimmedMemberId),
      getMemberTimeline(trimmedMemberId, 25),
    ]);

    const rows = relevantNotesResult.rows as unknown as NoteRow[];
    const paymentUpdateRows = paymentUpdatesResult.rows as unknown as PaymentUpdateRow[];

    const contextNotes: ContextNote[] = rows.map((n) => ({
      id: String(n.id),
      text: n.raw_text,
      tags: n.tags ?? [],
      complianceFlag: n.compliance_flag,
      complianceSummary: n.compliance_summary ?? undefined,
    }));

    const paymentUpdates = paymentUpdateRows.map((p) => ({
      id: String(p.id),
      rawText: p.raw_text,
      createdAt: p.created_at,
    }));

    const memberDisplay = {
      ...member,
      savingsBalanceDisplay: await convertAmount(member.savings_balance, displayCurrency),
      savingsBalanceCurrency: displayCurrency,
    } as MemberRecordDisplay;

    const statsDisplay = {
      ...stats,
      totalSavedDisplay: await convertAmount(stats.totalSaved, displayCurrency),
      totalSavedCurrency: displayCurrency,
    } as MemberStatsDisplay;

    const loansDisplay: MemberLoanDisplay[] = await Promise.all(
      loans.map(async (loan) => {
        const principalUsd = loan.principal ?? loan.requested_amount;
        const [principalDisplay, totalOwedDisplay, amountPaidDisplay, remainingBalanceDisplay] =
          await Promise.all([
            convertAmount(principalUsd, displayCurrency),
            loan.total_owed == null
              ? Promise.resolve(null)
              : convertAmount(loan.total_owed, displayCurrency),
            convertAmount(loan.amount_paid ?? 0, displayCurrency),
            loan.remaining_balance == null
              ? Promise.resolve(null)
              : convertAmount(loan.remaining_balance, displayCurrency),
          ]);

        return {
          ...loan,
          principalDisplay,
          totalOwedDisplay,
          amountPaidDisplay,
          remainingBalanceDisplay,
          displayCurrency,
        };
      })
    );

    const answer = await askClaude(
      trimmedQuestion,
      contextNotes,
      memberDisplay,
      statsDisplay,
      loansDisplay,
      paymentUpdates,
      timelineEvents,
      conversationHistory,
      displayCurrency
    );
    const flaggedNotes = contextNotes.filter((n) => n.complianceFlag);

    await db.insert(auditLog).values({
      memberId: trimmedMemberId,
      question: trimmedQuestion,
      answer,
      notesUsed: contextNotes.map((n) => n.id),
    });

    res.json({
      answer,
      flags: flaggedNotes
        .map((n) => n.complianceSummary)
        .filter((summary): summary is string => !!summary),
      citations: contextNotes.map((n) => ({
        id: n.id,
        tags: n.tags,
        text: n.text,
      })),
    });
  } catch (err) {
    if (err instanceof EmbeddingsError) {
      console.error('ask-assistant Gemini error:', err);
      res.status(503).json({ error: `Gemini embeddings unavailable: ${err.message}` });
      return;
    }
    if (err instanceof BedrockError) {
      console.error('ask-assistant Bedrock error:', err);
      res.status(503).json({ error: `Bedrock unavailable: ${err.message}` });
      return;
    }
    console.error('ask-assistant error:', err);
    res.status(500).json({ error: 'Failed to process assistant question' });
  }
});

router.post('/pattern-search', requireAdmin, async (req: AuthRequest, res) => {
  try {
    const { question, excludeMemberId } = req.body as {
      question?: string;
      excludeMemberId?: string;
    };

    if (!question?.trim()) {
      res.status(400).json({ error: 'question is required' });
      return;
    }

    const trimmedQuestion = question.trim();
    const trimmedExcludeMemberId = excludeMemberId?.trim();

    const resolvedMembers = await resolveMembersByName(trimmedQuestion);
    if (resolvedMembers.length > 0) {
      const profiles = await fetchNamedMemberProfiles(resolvedMembers);

      if (profiles.length === 0) {
        res.status(404).json({ error: 'Named member(s) not found in the cooperative records' });
        return;
      }

      if (
        resolvedMembers.length === 1 &&
        questionRequestsCooperativeComparison(trimmedQuestion)
      ) {
        const profile = profiles[0];
        const aggregate = await getCooperativeAggregateStats(profile.memberId);
        const analysis = await askClaudeNamedVsCooperativeComparison(
          trimmedQuestion,
          profile,
          aggregate
        );

        res.json({
          analysis,
          comparisonMode: 'named_vs_cooperative',
          casesReferenced: profile.notes.length
            ? profile.notes.map((note) => ({
                noteId: note.id,
                memberName: profile.name,
              }))
            : [{ noteId: profile.memberId, memberName: profile.name }],
          membersCompared: [{ memberId: profile.memberId, memberName: profile.name }],
          cooperativeAggregate: aggregate,
        });
        return;
      }

      const analysis = await askClaudeNamedMemberComparison(trimmedQuestion, profiles);

      res.json({
        analysis,
        casesReferenced: profiles.flatMap((profile) =>
          profile.notes.length > 0
            ? profile.notes.map((note) => ({
                noteId: note.id,
                memberName: profile.name,
              }))
            : [{ noteId: profile.memberId, memberName: profile.name }]
        ),
        membersCompared: profiles.map((p) => ({ memberId: p.memberId, memberName: p.name })),
      });
      return;
    }

    const questionEmbedding = padEmbeddingForStorage(await getEmbedding(trimmedQuestion, 'query'));
    const vectorLiteral = `'[${questionEmbedding.join(',')}]'`;

    const excludeSql = trimmedExcludeMemberId
      ? `AND n.member_id != '${trimmedExcludeMemberId.replace(/'/g, "''")}'`
      : '';

    const similarNotesResult = await db.execute(sql.raw(`
      SELECT n.id, n.member_id, n.raw_text, n.tags, n.compliance_flag, n.compliance_summary, n.created_at,
             m.name AS member_name
      FROM notes n
      JOIN members m ON m.id::text = n.member_id
      WHERE n.embedding IS NOT NULL
        AND ${activeNoteFilter('n')}
      ${excludeSql}
      ORDER BY n.embedding <-> ${vectorLiteral}::vector
      LIMIT 8
    `));

    const similarNotes = similarNotesResult.rows as unknown as PatternNoteRow[];
    const memberIds = [...new Set(similarNotes.map((n) => String(n.member_id)))];

    let outcomeRows: LoanOutcomeRow[] = [];
    if (memberIds.length > 0) {
      const idsLiteral = memberIds.map((id) => `'${id.replace(/'/g, "''")}'`).join(',');
      const outcomesResult = await db.execute(sql.raw(`
        SELECT member_id::text AS member_id, status, repaid, remaining_balance
        FROM loan_requests
        WHERE member_id::text IN (${idsLiteral})
      `));
      outcomeRows = outcomesResult.rows as unknown as LoanOutcomeRow[];
    }

    const contextCases: PatternSearchCase[] = similarNotes.map((n) => ({
      noteId: String(n.id),
      memberId: String(n.member_id),
      memberName: n.member_name,
      text: n.raw_text,
      tags: n.tags ?? [],
      complianceFlag: n.compliance_flag,
      complianceSummary: n.compliance_summary ?? undefined,
      loanOutcomes: outcomeRows
        .filter((o) => String(o.member_id) === String(n.member_id))
        .map((o) => ({
          status: o.status,
          repaid: o.repaid,
          remainingBalance: o.remaining_balance,
        })),
    }));

    const analysis = await askClaudePatternSearch(trimmedQuestion, contextCases);

    res.json({
      analysis,
      casesReferenced: contextCases.map((c) => ({
        noteId: c.noteId,
        memberName: c.memberName,
      })),
    });
  } catch (err) {
    if (err instanceof EmbeddingsError) {
      console.error('pattern-search Gemini error:', err);
      res.status(503).json({ error: `Gemini embeddings unavailable: ${err.message}` });
      return;
    }
    if (err instanceof BedrockError) {
      console.error('pattern-search Bedrock error:', err);
      res.status(503).json({ error: `Bedrock unavailable: ${err.message}` });
      return;
    }
    console.error('pattern-search error:', err);
    res.status(500).json({ error: 'Failed to process pattern search' });
  }
});

export default router;
