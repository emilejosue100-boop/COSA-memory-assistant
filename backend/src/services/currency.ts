import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { exchangeRates } from '../db/schema.js';
import type { CurrencyCode } from '../types/index.js';

const DEFAULT_CDF_RATE = 2500;

let cachedCdfRate: number | null = null;

function parseRate(value: string | number | null | undefined): number {
  if (value == null) return DEFAULT_CDF_RATE;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_CDF_RATE;
}

export function invalidateRateCache(): void {
  cachedCdfRate = null;
}

export async function getExchangeRate(currency: CurrencyCode): Promise<number> {
  if (currency === 'USD') {
    return 1;
  }

  if (cachedCdfRate != null) {
    return cachedCdfRate;
  }

  const row = await db.query.exchangeRates.findFirst({
    where: eq(exchangeRates.currency, 'CDF'),
  });

  cachedCdfRate = parseRate(row?.rate);
  return cachedCdfRate;
}

export async function convertAmount(
  amountUsd: number,
  targetCurrency: string
): Promise<number> {
  if (targetCurrency === 'USD') {
    return amountUsd;
  }

  if (targetCurrency === 'CDF') {
    const rate = await getExchangeRate('CDF');
    return amountUsd * rate;
  }

  return amountUsd;
}

export async function getExchangeRatesForState(): Promise<{
  USD: number;
  CDF: number;
  updatedAt?: string;
  updatedBy?: string;
}> {
  const row = await db.query.exchangeRates.findFirst({
    where: eq(exchangeRates.currency, 'CDF'),
  });

  const cdfRate = parseRate(row?.rate);
  cachedCdfRate = cdfRate;

  return {
    USD: 1,
    CDF: cdfRate,
    updatedAt: row?.updatedAt?.toISOString(),
    updatedBy: row?.updatedBy ?? undefined,
  };
}
