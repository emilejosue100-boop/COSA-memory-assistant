import type { LoanRequestRow } from '../db/schema.js';
import type { LoanRequest } from '../types/index.js';
import {
  calculateTotalOwed,
  DEFAULT_INTEREST_RATE,
} from './loanCalculations.js';

export function mapLoanRequest(loan: LoanRequestRow): LoanRequest {
  const principal = loan.principal ?? loan.requestedAmount;
  const termMonths = (loan.termMonths ?? 6) as 6 | 12;
  const interestRate = loan.interestRate ?? DEFAULT_INTEREST_RATE;

  let totalOwed = loan.totalOwed;
  if (totalOwed == null && loan.status === 'approved') {
    totalOwed = calculateTotalOwed(principal, interestRate, termMonths);
  }

  const amountPaid = loan.amountPaid ?? loan.repaidAmount ?? 0;

  let remainingBalance = loan.remainingBalance;
  if (remainingBalance == null && loan.status === 'approved') {
    if (totalOwed != null) {
      remainingBalance = Math.max(0, totalOwed - amountPaid);
    } else if (!loan.repaid) {
      remainingBalance = loan.requestedAmount;
    } else {
      remainingBalance = 0;
    }
  }

  return {
    id: loan.externalId,
    memberName: loan.memberName,
    memberImage: loan.memberImage,
    date: loan.date,
    requestedAmount: loan.requestedAmount,
    reasonEn: loan.reasonEn,
    reasonFr: loan.reasonFr,
    status: loan.status,
    repaymentDueDate: loan.repaymentDueDate ?? undefined,
    repaid: loan.repaid ?? undefined,
    repaidAmount: loan.repaidAmount ?? amountPaid,
    principal,
    termMonths,
    interestRate,
    totalOwed: totalOwed ?? undefined,
    amountPaid,
    remainingBalance: remainingBalance ?? undefined,
    currency: loan.currency ?? 'USD',
    finalOutcome: (loan.finalOutcome as LoanRequest['finalOutcome']) ?? undefined,
    outcomeRecordedAt:
      loan.outcomeRecordedAt instanceof Date
        ? loan.outcomeRecordedAt.toISOString()
        : loan.outcomeRecordedAt ?? undefined,
  };
}
