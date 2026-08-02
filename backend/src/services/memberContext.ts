import { sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { convertAmount } from './currency.js';

export interface MemberRecord {
  name: string;
  savings_balance: number;
  join_date: string;
  status: string;
}

export interface MemberStats {
  depositCount: number;
  totalSaved: number;
  loanCount: number;
  loansRepaid: number;
  activeLoans: number;
}

export interface MemberLoanRow {
  external_id: string;
  requested_amount: number;
  principal: number | null;
  term_months: number | null;
  interest_rate: number | null;
  total_owed: number | null;
  amount_paid: number | null;
  remaining_balance: number | null;
  currency: string | null;
  status: string;
  repayment_due_date: string | null;
  date: string;
  final_outcome: string | null;
  outcome_recorded_at: Date | string | null;
}

export interface MemberRecordDisplay extends MemberRecord {
  savingsBalanceDisplay: number;
  savingsBalanceCurrency: 'USD';
}

export interface MemberStatsDisplay extends MemberStats {
  totalSavedDisplay: number;
  totalSavedCurrency: 'USD';
}

export interface MemberLoanDisplay extends MemberLoanRow {
  principalDisplay: number;
  totalOwedDisplay: number | null;
  amountPaidDisplay: number;
  remainingBalanceDisplay: number | null;
  displayCurrency: string;
}

interface MemberRecordRow {
  name: string;
  savings_balance: number | string;
  join_date: string;
  status: string;
}

interface SavingsStatsRow {
  deposit_count: number | string;
  total_saved: number | string;
}

interface LoanStatsRow {
  loan_count: number | string;
  loans_repaid: number | string;
  active_loans: number | string;
}

function toNumber(value: number | string | null | undefined): number {
  if (value == null) return 0;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

export const EMPTY_MEMBER_STATS: MemberStats = {
  depositCount: 0,
  totalSaved: 0,
  loanCount: 0,
  loansRepaid: 0,
  activeLoans: 0,
};

export async function getMemberRecord(memberId: string): Promise<MemberRecord | null> {
  const result = await db.execute(sql`
    SELECT name, savings_balance, join_date, status
    FROM members
    WHERE id = ${memberId}
  `);

  const row = result.rows[0] as unknown as MemberRecordRow | undefined;
  if (!row) return null;

  return {
    name: row.name,
    savings_balance: toNumber(row.savings_balance),
    join_date: row.join_date,
    status: row.status,
  };
}

export async function getMemberStats(memberId: string): Promise<MemberStats> {
  const savingsResult = await db.execute(sql`
    SELECT COUNT(*) AS deposit_count, COALESCE(SUM(amount), 0) AS total_saved
    FROM transactions
    WHERE member_id = ${memberId} AND type = 'saved'
  `);

  const loanCountsResult = await db.execute(sql`
    SELECT
      COUNT(*) AS loan_count,
      SUM(
        CASE
          WHEN COALESCE(repaid, false) = true
            OR (
              status = 'approved'
              AND COALESCE(remaining_balance, 0) = 0
              AND COALESCE(amount_paid, 0) > 0
            )
          THEN 1
          ELSE 0
        END
      ) AS loans_repaid,
      SUM(
        CASE
          WHEN status = 'approved'
            AND COALESCE(repaid, false) = false
            AND COALESCE(remaining_balance, 0) > 0
          THEN 1
          ELSE 0
        END
      ) AS active_loans
    FROM loan_requests
    WHERE member_id = ${memberId}
  `);

  const savings = savingsResult.rows[0] as unknown as SavingsStatsRow | undefined;
  const loanCounts = loanCountsResult.rows[0] as unknown as LoanStatsRow | undefined;

  return {
    depositCount: toNumber(savings?.deposit_count),
    totalSaved: toNumber(savings?.total_saved),
    loanCount: toNumber(loanCounts?.loan_count),
    loansRepaid: toNumber(loanCounts?.loans_repaid),
    activeLoans: toNumber(loanCounts?.active_loans),
  };
}

export async function getMemberLoans(memberId: string): Promise<MemberLoanRow[]> {
  const result = await db.execute(sql`
    SELECT
      external_id,
      requested_amount,
      principal,
      term_months,
      interest_rate,
      total_owed,
      amount_paid,
      remaining_balance,
      currency,
      status,
      repayment_due_date,
      date,
      final_outcome,
      outcome_recorded_at
    FROM loan_requests
    WHERE member_id = ${memberId}
    ORDER BY date DESC
  `);

  return (result.rows as unknown as MemberLoanRow[]).map((row) => ({
    external_id: String(row.external_id),
    requested_amount: toNumber(row.requested_amount),
    principal: row.principal == null ? null : toNumber(row.principal),
    term_months: row.term_months == null ? null : toNumber(row.term_months),
    interest_rate: row.interest_rate == null ? null : toNumber(row.interest_rate),
    total_owed: row.total_owed == null ? null : toNumber(row.total_owed),
    amount_paid: row.amount_paid == null ? null : toNumber(row.amount_paid),
    remaining_balance:
      row.remaining_balance == null ? null : toNumber(row.remaining_balance),
    currency: row.currency ?? null,
    status: row.status,
    repayment_due_date: row.repayment_due_date ?? null,
    date: row.date,
    final_outcome: row.final_outcome ?? null,
    outcome_recorded_at: row.outcome_recorded_at ?? null,
  }));
}

export async function buildMemberRecordDisplay(
  member: MemberRecord
): Promise<MemberRecordDisplay> {
  const savingsBalanceDisplay = await convertAmount(member.savings_balance, 'USD');
  return {
    ...member,
    savingsBalanceDisplay,
    savingsBalanceCurrency: 'USD',
  };
}

export async function buildMemberStatsDisplay(
  stats: MemberStats
): Promise<MemberStatsDisplay> {
  const totalSavedDisplay = await convertAmount(stats.totalSaved, 'USD');
  return {
    ...stats,
    totalSavedDisplay,
    totalSavedCurrency: 'USD',
  };
}

export async function buildMemberLoansDisplay(
  loans: MemberLoanRow[]
): Promise<MemberLoanDisplay[]> {
  return Promise.all(
    loans.map(async (loan) => {
      const displayCurrency = loan.currency ?? 'USD';
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
}
