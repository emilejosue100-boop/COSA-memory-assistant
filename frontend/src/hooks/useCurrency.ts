import { useState } from 'react';
import type { CurrencyCode } from '../types';
import { CURRENCY_OPTIONS } from '../lib/exchangeRates';
import { useExchangeRate } from '../context/ExchangeRateContext';

const STORAGE_KEY = 'kumbuka_currency';

function readStoredCurrency(): CurrencyCode {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'USD' || stored === 'CDF') {
    return stored;
  }
  if (stored === 'RWF') {
    localStorage.setItem(STORAGE_KEY, 'USD');
  }
  return 'USD';
}

export function useCurrency() {
  const cdfRate = useExchangeRate();
  const [currency, setCurrencyState] = useState<CurrencyCode>(readStoredCurrency);

  const setCurrency = (next: CurrencyCode) => {
    setCurrencyState(next);
    localStorage.setItem(STORAGE_KEY, next);
  };

  return { currency, setCurrency, options: CURRENCY_OPTIONS, cdfRate };
}
