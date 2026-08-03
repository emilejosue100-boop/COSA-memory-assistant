import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { Pool } from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const pool = new Pool({
  connectionString: process.env.COCKROACH_DB_URL,
  ssl: { rejectUnauthorized: true },
});

const statements = [
  `CREATE TYPE IF NOT EXISTS language AS ENUM ('en', 'fr')`,
  `CREATE TYPE IF NOT EXISTS user_role AS ENUM ('member', 'admin')`,
  `CREATE TYPE IF NOT EXISTS user_status AS ENUM ('active', 'pending')`,
  `CREATE TYPE IF NOT EXISTS transaction_type AS ENUM ('saved', 'withdrew', 'repaid_loan')`,
  `CREATE TYPE IF NOT EXISTS transaction_status AS ENUM ('success', 'pending')`,
  `CREATE TYPE IF NOT EXISTS loan_status AS ENUM ('pending', 'approved', 'declined')`,
  `CREATE TYPE IF NOT EXISTS currency_code AS ENUM ('USD', 'CDF')`,
  `CREATE TABLE IF NOT EXISTS cooperatives (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name STRING NOT NULL UNIQUE,
    group_savings FLOAT8 NOT NULL DEFAULT 0,
    active_loans_count FLOAT8 NOT NULL DEFAULT 0,
    active_loans_amount FLOAT8 NOT NULL DEFAULT 0,
    default_language language NOT NULL DEFAULT 'en',
    current_tip JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name STRING NOT NULL,
    phone STRING NOT NULL UNIQUE,
    pin_hash STRING NOT NULL,
    role user_role NOT NULL DEFAULT 'member',
    cooperative_id UUID NOT NULL REFERENCES cooperatives(id),
    cooperative_name STRING NOT NULL,
    savings_balance FLOAT8 NOT NULL DEFAULT 0,
    profile_image STRING NOT NULL,
    status user_status NOT NULL DEFAULT 'active',
    join_date STRING NOT NULL,
    language language,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    external_id STRING NOT NULL UNIQUE,
    member_id UUID NOT NULL REFERENCES members(id),
    cooperative_id UUID NOT NULL REFERENCES cooperatives(id),
    date STRING NOT NULL,
    type transaction_type NOT NULL,
    amount FLOAT8 NOT NULL,
    running_balance FLOAT8 NOT NULL,
    member_name STRING NOT NULL,
    status transaction_status NOT NULL DEFAULT 'success',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS loan_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    external_id STRING NOT NULL UNIQUE,
    member_id UUID NOT NULL REFERENCES members(id),
    cooperative_id UUID NOT NULL REFERENCES cooperatives(id),
    member_name STRING NOT NULL,
    member_image STRING NOT NULL,
    date STRING NOT NULL,
    requested_amount FLOAT8 NOT NULL,
    reason_en STRING NOT NULL,
    reason_fr STRING NOT NULL,
    status loan_status NOT NULL DEFAULT 'pending',
    repayment_due_date STRING,
    repaid BOOL DEFAULT false,
    repaid_amount FLOAT8,
    principal FLOAT8,
    term_months FLOAT8,
    interest_rate FLOAT8 DEFAULT 0.05,
    total_owed FLOAT8,
    amount_paid FLOAT8 DEFAULT 0,
    remaining_balance FLOAT8,
    currency currency_code DEFAULT 'USD',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `ALTER TABLE loan_requests ADD COLUMN IF NOT EXISTS final_outcome STRING`,
  `ALTER TABLE loan_requests ADD COLUMN IF NOT EXISTS outcome_recorded_at TIMESTAMPTZ`,
  `ALTER TABLE notes ADD COLUMN IF NOT EXISTS voided BOOL DEFAULT false`,
  `ALTER TABLE notes ADD COLUMN IF NOT EXISTS void_reason STRING`,
  `ALTER TABLE notes ADD COLUMN IF NOT EXISTS voided_by STRING`,
  `ALTER TABLE notes ADD COLUMN IF NOT EXISTS voided_at TIMESTAMPTZ`,
  `ALTER TABLE notes ADD COLUMN IF NOT EXISTS corrected_note_id UUID`,
  `CREATE TABLE IF NOT EXISTS opportunities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    external_id STRING NOT NULL UNIQUE,
    cooperative_id UUID NOT NULL REFERENCES cooperatives(id),
    title_en STRING NOT NULL,
    title_fr STRING NOT NULL,
    source STRING NOT NULL,
    return_rate STRING NOT NULL,
    summary_en STRING NOT NULL,
    summary_fr STRING NOT NULL,
    ai_analysis_en STRING,
    ai_analysis_fr STRING,
    is_flagged BOOL NOT NULL DEFAULT false,
    found_ago STRING NOT NULL,
    category STRING NOT NULL,
    source_url STRING,
    image STRING,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    member_id UUID NOT NULL REFERENCES members(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by STRING NOT NULL,
    source STRING NOT NULL,
    raw_text STRING NOT NULL,
    structured_text STRING NOT NULL,
    tags STRING[] NOT NULL DEFAULT '{}',
    compliance_flag BOOL NOT NULL DEFAULT false,
    compliance_summary STRING,
    embedding VECTOR(768)
  )`,
  `CREATE INDEX IF NOT EXISTS notes_embedding_idx ON notes USING cspann (embedding vector_l2_ops)`,
  `CREATE TABLE IF NOT EXISTS exchange_rates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    base_currency STRING NOT NULL DEFAULT 'USD',
    currency STRING NOT NULL,
    rate DECIMAL(18, 6) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now(),
    updated_by STRING
  )`,
  `CREATE TABLE IF NOT EXISTS audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    member_id STRING NOT NULL,
    question STRING NOT NULL,
    answer STRING NOT NULL,
    notes_used STRING[],
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS risk_scan_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scan_result STRING NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    reviewed BOOL DEFAULT false,
    reviewed_by STRING,
    reviewed_at TIMESTAMPTZ
  )`,
  `CREATE OR REPLACE VIEW member_timeline AS
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
    WHERE type = 'repaid_loan'`,
];

try {
  for (const sql of statements) {
    await pool.query(sql);
    console.log('OK:', sql.slice(0, 60).replace(/\s+/g, ' ') + '...');
  }
  console.log('\nSchema applied successfully.');
} catch (err) {
  console.error('Schema apply failed:', err);
  process.exit(1);
} finally {
  await pool.end();
}
