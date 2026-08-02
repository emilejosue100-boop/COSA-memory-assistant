import { createContext, useContext } from 'react';
import { DEFAULT_CDF_RATE } from '../lib/exchangeRates';

const ExchangeRateContext = createContext<number>(DEFAULT_CDF_RATE);

export function ExchangeRateProvider({
  cdfRate,
  children,
}: {
  cdfRate: number;
  children: React.ReactNode;
}) {
  return (
    <ExchangeRateContext.Provider value={cdfRate}>{children}</ExchangeRateContext.Provider>
  );
}

export function useExchangeRate(): number {
  return useContext(ExchangeRateContext);
}
