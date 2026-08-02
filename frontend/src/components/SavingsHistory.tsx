import React from 'react';
import { GlobalState, Language } from '../types';
import { formatCurrency } from '../lib/currency';
import { useCurrency } from '../hooks/useCurrency';
import EmptyState from './EmptyState';
import { ArrowUpRight, ArrowDownRight, TrendingUp, PiggyBank } from 'lucide-react';
import { buildSavingsTrend, chartPath } from '../lib/chartData';

interface SavingsHistoryProps {
  state: GlobalState;
  language: Language;
}

export default function SavingsHistory({ state, language }: SavingsHistoryProps) {
  const { currentUser, transactions } = state;
  const { currency, cdfRate } = useCurrency();

  const userTransactions = transactions.filter((t) => t.memberName === currentUser?.name);
  const trend = buildSavingsTrend(userTransactions);
  const trendPath = chartPath(trend);
  const trendAreaPath = trendPath ? `${trendPath} L 600 160 L 0 160 Z` : '';

  const formatAmount = (val: number) => formatCurrency(val, currency, cdfRate);

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-xl font-bold font-display text-oil-black tracking-tight">
          {language === 'en' ? 'Savings History' : 'Historique d\'épargne'}
        </h2>
        <p className="text-xs text-text-secondary">
          {language === 'en' ? 'Track your contributions and withdrawals' : 'Suivez vos contributions et retraits'}
        </p>
      </div>

      <div className="bg-white border border-border-subtle rounded-xl p-6 shadow-subtle">
        <h3 className="text-xs font-bold text-text-secondary uppercase tracking-widest mb-4 flex items-center gap-1.5">
          <TrendingUp size={16} className="text-primary" />
          {language === 'en' ? 'Savings Trajectory' : 'Trajectoire d\'épargne'}
        </h3>

        <div className="h-40 w-full relative pt-2">
          {trend.length === 0 ? (
            <EmptyState
              compact
              language={language}
              icon={<TrendingUp size={24} />}
              titleEn="Your savings trend will appear here"
              titleFr="Votre courbe d'épargne apparaîtra ici"
              descriptionEn="Once you start contributing, Kumbuka will chart your progress over time."
              descriptionFr="Une fois que vous commencez à épargner, Kumbuka affichera votre progression dans le temps."
            />
          ) : (
            <>
              <svg className="w-full h-full overflow-visible" preserveAspectRatio="none" viewBox="0 0 600 160">
                <defs>
                  <linearGradient id="growthGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#1F5C3F" stopOpacity="0.25" />
                    <stop offset="100%" stopColor="#1F5C3F" stopOpacity="0.0" />
                  </linearGradient>
                </defs>
                <path d={trendAreaPath} fill="url(#growthGrad)" />
                <path d={trendPath} fill="none" stroke="#1F5C3F" strokeWidth="3.5" strokeLinecap="round" />
              </svg>
              <div className="flex justify-between text-[10px] font-semibold text-text-secondary uppercase tracking-wider mt-4">
                {trend.map((point) => (
                  <span key={point.label}>{point.label}</span>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="bg-white border border-border-subtle rounded-xl p-6 shadow-subtle">
        <h3 className="text-sm font-bold font-display text-oil-black mb-4">
          {language === 'en' ? 'Transaction Ledger' : 'Registre des transactions'}
        </h3>

        {userTransactions.length === 0 ? (
          <EmptyState
            compact
            language={language}
            icon={<PiggyBank size={24} />}
            titleEn="No transactions yet"
            titleFr="Aucune transaction"
            descriptionEn="Your savings contributions and loan repayments will be listed here."
            descriptionFr="Vos contributions d'épargne et remboursements de prêt seront listés ici."
          />
        ) : (
          <div className="divide-y divide-border-subtle/50">
            {userTransactions.map((tx) => (
              <div key={tx.id} className="flex justify-between items-center py-4 first:pt-0 last:pb-0">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-9 h-9 rounded-full flex items-center justify-center ${
                      tx.type === 'saved' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
                    }`}
                  >
                    {tx.type === 'saved' ? <ArrowUpRight size={18} /> : <ArrowDownRight size={18} />}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-oil-black">
                      {tx.type === 'saved'
                        ? language === 'en'
                          ? 'Savings Contribution'
                          : 'Contribution d\'épargne'
                        : tx.type === 'repaid_loan'
                          ? language === 'en'
                            ? 'Loan Repayment'
                            : 'Remboursement de prêt'
                          : language === 'en'
                            ? 'Withdrawal'
                            : 'Retrait'}
                    </p>
                    <p className="text-[11px] text-text-secondary font-medium">
                      {language === 'en' ? 'Reference' : 'Référence'}: {tx.id.toUpperCase()} • {tx.date}
                    </p>
                  </div>
                </div>

                <div className="text-right">
                  <span
                    className={`text-sm font-bold block ${
                      tx.type === 'saved' ? 'text-emerald-700' : 'text-oil-black'
                    }`}
                  >
                    {tx.type === 'saved' ? '+' : '-'} {formatAmount(tx.amount)}
                  </span>
                  <span className="inline-block text-[9px] px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-full font-bold uppercase tracking-wider">
                    {language === 'en' ? 'Success' : 'Confirmé'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
