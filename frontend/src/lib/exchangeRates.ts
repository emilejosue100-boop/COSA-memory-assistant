import type { CurrencyCode } from '../types';

export const CURRENCY_OPTIONS: CurrencyCode[] = ['USD', 'CDF'];

export const DEFAULT_CDF_RATE = 2500;

export function buildRateMap(cdfRate: number): Record<CurrencyCode, number> {
  return {
    USD: 1,
    CDF: cdfRate,
  };
}
