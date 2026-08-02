import { sql } from 'drizzle-orm';
import { db } from '../db/index.js';

export type TimelineEventType = 'note' | 'deposit' | 'loan_requested' | 'loan_repaid';

export interface TimelineEvent {
  id: string;
  memberId: string;
  eventType: TimelineEventType;
  eventTime: Date | string;
  description: string;
  tags: string[] | null;
  complianceFlag: boolean;
}

interface TimelineRow {
  id: string;
  member_id: string;
  event_type: string;
  event_time: Date | string;
  description: string;
  tags: string[] | null;
  compliance_flag: boolean;
}

export const MEMBER_TIMELINE_VIEW_SQL = `
CREATE OR REPLACE VIEW member_timeline AS
SELECT
  id::STRING AS id,
  member_id::STRING AS member_id,
  'note'::STRING AS event_type,
  created_at AS event_time,
  raw_text AS description,
  tags,
  compliance_flag
FROM notes

UNION ALL

SELECT
  id::STRING AS id,
  member_id::STRING AS member_id,
  'deposit'::STRING AS event_type,
  created_at AS event_time,
  ('Deposited ' || amount::STRING || ' USD') AS description,
  NULL::STRING[] AS tags,
  false AS compliance_flag
FROM transactions
WHERE type = 'saved'

UNION ALL

SELECT
  id::STRING AS id,
  member_id::STRING AS member_id,
  'loan_requested'::STRING AS event_type,
  created_at AS event_time,
  (
    'Requested loan of ' ||
    COALESCE(principal, requested_amount)::STRING || ' ' ||
    COALESCE(currency::STRING, 'USD') || ' over ' ||
    COALESCE(term_months, 0)::STRING || ' months'
  ) AS description,
  NULL::STRING[] AS tags,
  false AS compliance_flag
FROM loan_requests

UNION ALL

SELECT
  id::STRING AS id,
  member_id::STRING AS member_id,
  'loan_repaid'::STRING AS event_type,
  created_at AS event_time,
  ('Repaid ' || amount::STRING || ' USD') AS description,
  NULL::STRING[] AS tags,
  false AS compliance_flag
FROM transactions
WHERE type = 'repaid_loan'
`;

export async function ensureMemberTimelineView(): Promise<void> {
  await db.execute(sql.raw(MEMBER_TIMELINE_VIEW_SQL));
}

function mapTimelineRow(row: TimelineRow): TimelineEvent {
  return {
    id: String(row.id),
    memberId: String(row.member_id),
    eventType: row.event_type as TimelineEventType,
    eventTime: row.event_time,
    description: row.description,
    tags: row.tags,
    complianceFlag: row.compliance_flag,
  };
}

export async function getMemberTimeline(
  memberId: string,
  limit?: number
): Promise<TimelineEvent[]> {
  const result =
    limit != null && limit > 0
      ? await db.execute(sql`
          SELECT id, member_id, event_type, event_time, description, tags, compliance_flag
          FROM member_timeline
          WHERE member_id = ${memberId}
          ORDER BY event_time DESC
          LIMIT ${limit}
        `)
      : await db.execute(sql`
          SELECT id, member_id, event_type, event_time, description, tags, compliance_flag
          FROM member_timeline
          WHERE member_id = ${memberId}
          ORDER BY event_time DESC
        `);

  return (result.rows as unknown as TimelineRow[]).map(mapTimelineRow);
}
