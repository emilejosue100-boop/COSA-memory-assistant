import { sql } from 'drizzle-orm';
import { db } from '../db/index.js';

export async function ensureLoanOutcomeColumns(): Promise<void> {
  await db.execute(
    sql.raw(`ALTER TABLE loan_requests ADD COLUMN IF NOT EXISTS final_outcome STRING`)
  );
  await db.execute(
    sql.raw(`ALTER TABLE loan_requests ADD COLUMN IF NOT EXISTS outcome_recorded_at TIMESTAMPTZ`)
  );
}

export async function ensureRiskScanLogTable(): Promise<void> {
  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS risk_scan_log (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      scan_result STRING NOT NULL,
      created_at TIMESTAMPTZ DEFAULT now(),
      reviewed BOOL DEFAULT false,
      reviewed_by STRING,
      reviewed_at TIMESTAMPTZ
    )
  `));
}
