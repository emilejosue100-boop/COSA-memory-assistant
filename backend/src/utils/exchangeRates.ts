import { convertAmount, getExchangeRate } from '../services/currency.js';
import type { CurrencyCode } from '../types/index.js';

export type { CurrencyCode };

export function isValidCurrency(code: string): code is CurrencyCode {
  return code === 'USD' || code === 'CDF';
}

export async function convertToUsd(
  amount: number,
  fromCurrency: CurrencyCode
): Promise<number> {
  const rate = await getExchangeRate(fromCurrency);
  return amount / rate;
}

export async function convertFromUsd(
  amountUsd: number,
  toCurrency: CurrencyCode
): Promise<number> {
  return convertAmount(amountUsd, toCurrency);
}
