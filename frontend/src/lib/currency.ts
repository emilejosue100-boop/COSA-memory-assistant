import type { CurrencyCode } from '../types';
import { buildRateMap } from './exchangeRates';

export function convertToUsd(
  amount: number,
  fromCurrency: CurrencyCode,
  cdfRate: number
): number {
  const rates = buildRateMap(cdfRate);
  return amount / rates[fromCurrency];
}

export function convertFromUsd(
  amountUsd: number,
  toCurrency: CurrencyCode,
  cdfRate: number
): number {
  const rates = buildRateMap(cdfRate);
  return amountUsd * rates[toCurrency];
}

export function formatCurrency(
  amountUsd: number,
  currency: CurrencyCode,
  cdfRate: number
): string {
  const displayAmount = convertFromUsd(amountUsd, currency, cdfRate);

  if (currency === 'USD') {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(displayAmount);
  }

  const formatted = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.round(displayAmount));

  return `${formatted} ${currency}`;
}

export function getLoanBalances(loan: {
  principal?: number;
  requestedAmount: number;
  termMonths?: number;
  interestRate?: number;
  totalOwed?: number;
  amountPaid?: number;
  remainingBalance?: number;
  repaid?: boolean;
  repaidAmount?: number;
  status: string;
}) {
  const principal = loan.principal ?? loan.requestedAmount;
  const termMonths = loan.termMonths ?? 6;
  const interestRate = loan.interestRate ?? 0.05;

  let totalOwed = loan.totalOwed;
  if (totalOwed == null && loan.status === 'approved') {
    totalOwed = principal + principal * interestRate * termMonths;
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
    principal,
    termMonths,
    interestRate,
    totalOwed: totalOwed ?? null,
    amountPaid,
    remainingBalance: remainingBalance ?? null,
  };
}
