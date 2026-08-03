import { sql } from 'drizzle-orm';
import { db } from '../db/index.js';

export const MCP_READONLY_TOOL_NAMES = [
  'get_flagged_notes',
  'get_broken_promise_notes',
  'get_member_audit_activity',
  'get_cooperative_loan_risks',
] as const;

export type McpReadOnlyToolName = (typeof MCP_READONLY_TOOL_NAMES)[number];

export function isAllowedMcpTool(name: string): name is McpReadOnlyToolName {
  return (MCP_READONLY_TOOL_NAMES as readonly string[]).includes(name);
}

export async function executeReadOnlyMcpTool(
  name: McpReadOnlyToolName,
  input: Record<string, unknown>
): Promise<string> {
  switch (name) {
    case 'get_flagged_notes':
      return getFlaggedNotes(input);
    case 'get_broken_promise_notes':
      return getBrokenPromiseNotes(input);
    case 'get_member_audit_activity':
      return getMemberAuditActivity(input);
    case 'get_cooperative_loan_risks':
      return getCooperativeLoanRisks();
    default:
      return JSON.stringify({ error: 'Unknown tool' });
  }
}

async function getFlaggedNotes(input: Record<string, unknown>): Promise<string> {
  const days = normalizeDays(input.days, 365);
  const result = await db.execute(sql.raw(`
    SELECT n.id, n.member_id::STRING AS member_id, m.name AS member_name,
           n.raw_text, n.compliance_summary, n.created_at
    FROM notes n
    JOIN members m ON m.id::STRING = n.member_id::STRING
    WHERE n.compliance_flag = true
      AND n.created_at >= now() - INTERVAL '${days} days'
      AND COALESCE(n.voided, false) = false
    ORDER BY n.created_at DESC
    LIMIT 50
  `));
  return JSON.stringify(result.rows);
}

async function getBrokenPromiseNotes(input: Record<string, unknown>): Promise<string> {
  const days = normalizeDays(input.days, 365);
  const result = await db.execute(sql.raw(`
    SELECT n.id, n.member_id::STRING AS member_id, m.name AS member_name,
           n.raw_text, n.tags, n.compliance_flag, n.created_at
    FROM notes n
    JOIN members m ON m.id::STRING = n.member_id::STRING
    WHERE EXISTS (
      SELECT 1 FROM unnest(n.tags) AS tag
      WHERE lower(tag) IN ('#broken-promise', '#payment-intent')
         OR lower(tag) LIKE '%broken%promise%'
    )
      AND n.created_at >= now() - INTERVAL '${days} days'
      AND COALESCE(n.voided, false) = false
    ORDER BY n.created_at DESC
    LIMIT 50
  `));
  return JSON.stringify(result.rows);
}

async function getMemberAuditActivity(input: Record<string, unknown>): Promise<string> {
  const days = normalizeDays(input.days, 60);
  const result = await db.execute(sql.raw(`
    SELECT member_id, MAX(created_at) AS last_officer_review
    FROM audit_log
    GROUP BY member_id
    HAVING MAX(created_at) >= now() - INTERVAL '${days} days'
    ORDER BY last_officer_review DESC
    LIMIT 100
  `));
  return JSON.stringify(result.rows);
}

async function getCooperativeLoanRisks(): Promise<string> {
  const result = await db.execute(sql.raw(`
    SELECT lr.member_id::STRING AS member_id, lr.member_name, lr.external_id,
           lr.status, lr.final_outcome, lr.remaining_balance, lr.repayment_due_date
    FROM loan_requests lr
    WHERE lr.status = 'approved'
      AND (
        lr.final_outcome IN ('defaulted', 'repaid_late')
        OR COALESCE(lr.remaining_balance, 0) > 0
      )
    ORDER BY lr.date DESC
    LIMIT 50
  `));
  return JSON.stringify(result.rows);
}

function normalizeDays(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.floor(n), 730);
}

export const MCP_READONLY_TOOL_DEFINITIONS = [
  {
    name: 'get_flagged_notes',
    description:
      'Read-only: list compliance-flagged officer notes across the cooperative, optionally within recent days.',
    input_schema: {
      type: 'object',
      properties: {
        days: { type: 'number', description: 'Look back this many days (default 365)' },
      },
    },
  },
  {
    name: 'get_broken_promise_notes',
    description:
      'Read-only: list notes tagged with broken repayment promises or similar risk tags.',
    input_schema: {
      type: 'object',
      properties: {
        days: { type: 'number', description: 'Look back this many days (default 365)' },
      },
    },
  },
  {
    name: 'get_member_audit_activity',
    description:
      'Read-only: list members who received an officer Memory Assistant review recently via audit_log.',
    input_schema: {
      type: 'object',
      properties: {
        days: { type: 'number', description: 'Look back this many days (default 60)' },
      },
    },
  },
  {
    name: 'get_cooperative_loan_risks',
    description:
      'Read-only: list approved loans with late/default outcomes or remaining balances.',
    input_schema: {
      type: 'object',
      properties: {},
    },
  },
] as const;
