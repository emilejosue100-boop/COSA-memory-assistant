import React from 'react';
import type { CurrencyCode } from '../types';

interface CurrencySwitcherProps {
  currency: CurrencyCode;
  onChange: (currency: CurrencyCode) => void;
  options: CurrencyCode[];
  compact?: boolean;
}

export default function CurrencySwitcher({
  currency,
  onChange,
  options,
  compact = false,
}: CurrencySwitcherProps) {
  return (
    <div
      className={`flex bg-background border border-border-subtle rounded-full p-0.5 ${
        compact ? 'inline-flex' : ''
      }`}
    >
      {options.map((code) => (
        <button
          key={code}
          type="button"
          onClick={() => onChange(code)}
          className={`px-2.5 py-1 text-[10px] font-bold rounded-full transition-all ${
            currency === code
              ? 'bg-primary text-white shadow-subtle'
              : 'text-text-secondary hover:text-oil-black'
          }`}
        >
          {code}
        </button>
      ))}
    </div>
  );
}
