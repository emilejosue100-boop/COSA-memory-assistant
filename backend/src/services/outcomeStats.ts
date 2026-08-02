import { sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import type { LoanFinalOutcome } from '../types/index.js';

export interface FlagAccuracyBreakdownRow {
  flagStatus: 'had_flag' | 'no_flag';
  finalOutcome: LoanFinalOutcome;
  count: number;
}

export interface FlagAccuracySummary {
  flaggedBadRate: number | null;
  unflaggedBadRate: number | null;
  flaggedTotal: number;
  unflaggedTotal: number;
  flaggedBadCount: number;
  unflaggedBadCount: number;
}

export interface FlagAccuracyStats {
  breakdown: FlagAccuracyBreakdownRow[];
  summary: FlagAccuracySummary;
}

interface RawBreakdownRow {
  flag_status: string;
  final_outcome: string;
  count: number | string;
}

const BAD_OUTCOMES = new Set<LoanFinalOutcome>(['repaid_late', 'defaulted']);

function toCount(value: number | string): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function buildSummary(breakdown: FlagAccuracyBreakdownRow[]): FlagAccuracySummary {
  const flaggedByOutcome = new Map<LoanFinalOutcome, number>();
  const unflaggedByOutcome = new Map<LoanFinalOutcome, number>();

  for (const row of breakdown) {
    const target = row.flagStatus === 'had_flag' ? flaggedByOutcome : unflaggedByOutcome;
    target.set(row.finalOutcome, (target.get(row.finalOutcome) ?? 0) + row.count);
  }

  const flaggedTotal = [...flaggedByOutcome.values()].reduce((sum, n) => sum + n, 0);
  const unflaggedTotal = [...unflaggedByOutcome.values()].reduce((sum, n) => sum + n, 0);

  const flaggedBadCount = [...flaggedByOutcome.entries()]
    .filter(([outcome]) => BAD_OUTCOMES.has(outcome))
    .reduce((sum, [, count]) => sum + count, 0);

  const unflaggedBadCount = [...unflaggedByOutcome.entries()]
    .filter(([outcome]) => BAD_OUTCOMES.has(outcome))
    .reduce((sum, [, count]) => sum + count, 0);

  return {
    flaggedBadRate: flaggedTotal > 0 ? flaggedBadCount / flaggedTotal : null,
    unflaggedBadRate: unflaggedTotal > 0 ? unflaggedBadCount / unflaggedTotal : null,
    flaggedTotal,
    unflaggedTotal,
    flaggedBadCount,
    unflaggedBadCount,
  };
}

export async function getFlagAccuracyStats(): Promise<FlagAccuracyStats> {
  const result = await db.execute(sql.raw(`
    SELECT
      CASE WHEN EXISTS (
        SELECT 1 FROM notes n
        WHERE n.member_id::STRING = lr.member_id::STRING
          AND n.compliance_flag = true
      ) THEN 'had_flag' ELSE 'no_flag' END AS flag_status,
      lr.final_outcome,
      COUNT(*) AS count
    FROM loan_requests lr
    WHERE lr.final_outcome IS NOT NULL
    GROUP BY flag_status, lr.final_outcome
  `));

  const breakdown = (result.rows as unknown as RawBreakdownRow[]).map((row) => ({
    flagStatus: row.flag_status as FlagAccuracyBreakdownRow['flagStatus'],
    finalOutcome: row.final_outcome as LoanFinalOutcome,
    count: toCount(row.count),
  }));

  return {
    breakdown,
    summary: buildSummary(breakdown),
  };
}
