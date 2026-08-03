import { sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import type { ContextNote } from './bedrock.js';
import {
  buildMemberLoansDisplay,
  buildMemberRecordDisplay,
  buildMemberStatsDisplay,
  getMemberLoans,
  getMemberRecord,
  getMemberStats,
  type MemberLoanDisplay,
  type MemberRecordDisplay,
  type MemberStatsDisplay,
} from './memberContext.js';

export interface ResolvedMember {
  id: string;
  name: string;
}

export interface NamedMemberProfile {
  memberId: string;
  name: string;
  record: MemberRecordDisplay;
  stats: MemberStatsDisplay;
  loans: MemberLoanDisplay[];
  notes: ContextNote[];
}

interface MemberNameRow {
  id: string;
  name: string;
}

interface NoteRow {
  id: string;
  raw_text: string;
  tags: string[] | null;
  compliance_flag: boolean;
  compliance_summary: string | null;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Word-boundary match for full name or first name (≥3 chars). */
export function memberNameAppearsInQuestion(name: string, question: string): boolean {
  const trimmedName = name.trim();
  if (!trimmedName) return false;

  const fullPattern = new RegExp(`\\b${escapeRegex(trimmedName)}\\b`, 'i');
  if (fullPattern.test(question)) return true;

  const firstName = trimmedName.split(/\s+/)[0];
  if (firstName.length >= 3 && firstName.toLowerCase() !== trimmedName.toLowerCase()) {
    const firstPattern = new RegExp(`\\b${escapeRegex(firstName)}\\b`, 'i');
    return firstPattern.test(question);
  }

  return false;
}

export async function resolveMembersByName(question: string): Promise<ResolvedMember[]> {
  const result = await db.execute(sql`
    SELECT id, name
    FROM members
    WHERE role = 'member'
    ORDER BY LENGTH(name) DESC
  `);

  const rows = result.rows as unknown as MemberNameRow[];
  const mentioned: ResolvedMember[] = [];
  const matchedIds = new Set<string>();

  for (const row of rows) {
    const id = String(row.id);
    if (matchedIds.has(id)) continue;

    if (memberNameAppearsInQuestion(row.name, question)) {
      mentioned.push({ id, name: row.name });
      matchedIds.add(id);
    }
  }

  return mentioned;
}

async function fetchMemberNotes(memberId: string): Promise<ContextNote[]> {
  const notesResult = await db.execute(sql`
    SELECT id, raw_text, tags, compliance_flag, compliance_summary
    FROM notes
    WHERE member_id = ${memberId}
      AND source != 'member_payment_update'
      AND COALESCE(voided, false) = false
    ORDER BY created_at DESC
  `);

  const rows = notesResult.rows as unknown as NoteRow[];
  return rows.map((n) => ({
    id: String(n.id),
    text: n.raw_text,
    tags: n.tags ?? [],
    complianceFlag: n.compliance_flag,
    complianceSummary: n.compliance_summary ?? undefined,
  }));
}

export async function fetchNamedMemberProfile(
  memberId: string,
  memberName: string
): Promise<NamedMemberProfile | null> {
  const member = await getMemberRecord(memberId);
  if (!member) return null;

  const [stats, loans, notes] = await Promise.all([
    getMemberStats(memberId),
    getMemberLoans(memberId),
    fetchMemberNotes(memberId),
  ]);

  const [record, statsDisplay, loansDisplay] = await Promise.all([
    buildMemberRecordDisplay(member),
    buildMemberStatsDisplay(stats),
    buildMemberLoansDisplay(loans),
  ]);

  return {
    memberId,
    name: memberName,
    record,
    stats: statsDisplay,
    loans: loansDisplay,
    notes,
  };
}

export async function fetchNamedMemberProfiles(
  resolved: ResolvedMember[]
): Promise<NamedMemberProfile[]> {
  const profiles = await Promise.all(
    resolved.map((m) => fetchNamedMemberProfile(m.id, m.name))
  );
  return profiles.filter((p): p is NamedMemberProfile => p !== null);
}

const COOPERATIVE_COMPARISON_PATTERNS = [
  /\ball other members\b/i,
  /\brest of the cooperative\b/i,
  /\bcompared to everyone\b/i,
  /\bcompare overall\b/i,
  /\bhow does (?:he|she|they) compare overall\b/i,
  /\bcompared to the cooperative\b/i,
  /\bversus everyone\b/i,
  /\bagainst the (?:rest of the )?group\b/i,
  /\brest of the members\b/i,
  /\bother members(?:\s+of\s+the\s+cooperative)?\b/i,
  /\bwhole cooperative\b/i,
  /\bentire cooperative\b/i,
  /\bcooperative-?wide\b/i,
  /\bcompared to all\b/i,
  /\bcompare to all\b/i,
  /\bhow does .+ compare to all\b/i,
];

export function questionRequestsCooperativeComparison(question: string): boolean {
  return COOPERATIVE_COMPARISON_PATTERNS.some((pattern) => pattern.test(question));
}

export interface CooperativeLoanOutcomes {
  totalLoans: number;
  repaidOnTime: number;
  repaidLate: number;
  defaulted: number;
  active: number;
}

export interface CooperativeAggregateStats {
  avgSavings: number;
  totalMembers: number;
  loanOutcomes: CooperativeLoanOutcomes;
  flaggedMembers: number;
}

function aggregateToNumber(value: number | string | null | undefined): number {
  if (value == null) return 0;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

export async function getCooperativeAggregateStats(
  excludeMemberId: string
): Promise<CooperativeAggregateStats> {
  const [memberResult, loanStatsResult, flaggedResult] = await Promise.all([
    db.execute(sql`
      SELECT
        AVG(savings_balance) AS avg_savings,
        COUNT(*)::int AS total_members
      FROM members
      WHERE role = 'member'
        AND id != ${excludeMemberId}
    `),
    db.execute(sql`
      SELECT
        COUNT(*)::int AS total_loans,
        SUM(CASE WHEN final_outcome = 'repaid_on_time' THEN 1 ELSE 0 END)::int AS repaid_on_time,
        SUM(CASE WHEN final_outcome = 'repaid_late' THEN 1 ELSE 0 END)::int AS repaid_late,
        SUM(CASE WHEN final_outcome = 'defaulted' THEN 1 ELSE 0 END)::int AS defaulted,
        SUM(CASE WHEN final_outcome IS NULL THEN 1 ELSE 0 END)::int AS active
      FROM loan_requests
      WHERE member_id != ${excludeMemberId}
    `),
    db.execute(sql`
      SELECT COUNT(DISTINCT member_id)::int AS flagged_members
      FROM notes
      WHERE compliance_flag = true
        AND member_id != ${excludeMemberId}
        AND COALESCE(voided, false) = false
    `),
  ]);

  const memberRow = memberResult.rows[0] as {
    avg_savings: number | string | null;
    total_members: number | string;
  };
  const loanRow = loanStatsResult.rows[0] as {
    total_loans: number | string;
    repaid_on_time: number | string;
    repaid_late: number | string;
    defaulted: number | string;
    active: number | string;
  };
  const flaggedRow = flaggedResult.rows[0] as { flagged_members: number | string };

  return {
    avgSavings: aggregateToNumber(memberRow?.avg_savings),
    totalMembers: aggregateToNumber(memberRow?.total_members),
    loanOutcomes: {
      totalLoans: aggregateToNumber(loanRow?.total_loans),
      repaidOnTime: aggregateToNumber(loanRow?.repaid_on_time),
      repaidLate: aggregateToNumber(loanRow?.repaid_late),
      defaulted: aggregateToNumber(loanRow?.defaulted),
      active: aggregateToNumber(loanRow?.active),
    },
    flaggedMembers: aggregateToNumber(flaggedRow?.flagged_members),
  };
}
