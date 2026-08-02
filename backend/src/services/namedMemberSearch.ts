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
