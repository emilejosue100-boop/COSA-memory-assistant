import React, { useMemo, useState } from 'react';
import { GlobalState, Language, LoanTermMonths } from '../types';
import { apiPost } from '../lib/api';
import { formatCurrency, getLoanBalances, convertToUsd } from '../lib/currency';
import { calculateTotalOwed, DEFAULT_INTEREST_RATE } from '../lib/loanCalculations';
import { getUserMessage } from '../lib/userMessages';
import { useCurrency } from '../hooks/useCurrency';
import CurrencySwitcher from './CurrencySwitcher';
import EmptyState from './EmptyState';
import UserNotice from './UserNotice';
import { formatTermMonths, getLoanDueDate } from '../lib/loanTimeline';
import { Send, HelpCircle, Landmark } from 'lucide-react';

interface LoanRequestProps {
  state: GlobalState;
  language: Language;
  onStateChange: (updated: GlobalState) => void;
}

export default function LoanRequest({ state, language, onStateChange }: LoanRequestProps) {
  const { currentUser, loanRequests } = state;
  const { currency, setCurrency, options, cdfRate } = useCurrency();
  const [amount, setAmount] = useState('');
  const [termMonths, setTermMonths] = useState<LoanTermMonths>(6);
  const [reasonEn, setReasonEn] = useState('School Fees');
  const [reasonFr, setReasonFr] = useState('Frais scolaires');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [repayAmounts, setRepayAmounts] = useState<Record<string, string>>({});
  const [repayLoadingId, setRepayLoadingId] = useState<string | null>(null);

  const userLoans = loanRequests.filter((l) => l.memberName === currentUser?.name);

  const estimatedTotalOwed = useMemo(() => {
    const val = Number(amount);
    if (!amount || isNaN(val) || val <= 0) return null;
    const principalUsd = convertToUsd(val, currency, cdfRate);
    return calculateTotalOwed(principalUsd, DEFAULT_INTEREST_RATE, termMonths);
  }, [amount, currency, termMonths, cdfRate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      setError(language === 'en' ? 'Please enter a valid amount.' : 'Veuillez saisir un montant valide.');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const { ok, data, error: apiError } = await apiPost<GlobalState>(
        '/api/request-loan',
        {
          amount: Number(amount),
          termMonths,
          currency,
          reasonEn,
          reasonFr,
        },
        true,
        language,
        'loan'
      );

      if (ok) {
        onStateChange(data);
        setSuccess(language === 'en' ? 'Loan request submitted successfully!' : 'Demande de prêt envoyée avec succès !');
        setAmount('');
      } else {
        setError(apiError || null);
      }
    } catch {
      setError(getUserMessage({ language, code: 'network', context: 'loan' }));
    } finally {
      setLoading(false);
    }
  };

  const handleRepay = async (loanId: string) => {
    const payAmount = repayAmounts[loanId];
    if (!payAmount || isNaN(Number(payAmount)) || Number(payAmount) <= 0) {
      setError(language === 'en' ? 'Enter a valid repayment amount.' : 'Saisissez un montant de remboursement valide.');
      return;
    }

    setRepayLoadingId(loanId);
    setError(null);

    try {
      const { ok, data, error: apiError } = await apiPost<GlobalState>(
        '/api/repay-loan',
        { id: loanId, amount: Number(payAmount), currency },
        true,
        language,
        'repay'
      );

      if (ok) {
        onStateChange(data);
        setRepayAmounts((prev) => ({ ...prev, [loanId]: '' }));
      } else {
        setError(apiError || null);
      }
    } catch {
      setError(getUserMessage({ language, code: 'network', context: 'repay' }));
    } finally {
      setRepayLoadingId(null);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold font-display text-oil-black tracking-tight">
            {language === 'en' ? 'Borrowing & Loans' : 'Emprunts et prêts'}
          </h2>
          <p className="text-xs text-text-secondary">
            {language === 'en' ? 'Apply for friendly micro-loans or track past requests' : 'Demandez un micro-prêt ou suivez vos demandes passées'}
          </p>
        </div>
        <CurrencySwitcher currency={currency} onChange={setCurrency} options={options} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        <div className="md:col-span-5 bg-surface border border-border-subtle rounded-xl p-6 shadow-subtle h-fit">
          <h3 className="text-sm font-bold font-display text-oil-black mb-4 flex items-center gap-1.5">
            <Send size={16} className="text-primary flex-shrink-0" />
            <span>{language === 'en' ? 'New Request Form' : 'Nouvelle demande'}</span>
          </h3>

          {error && <UserNotice message={error} />}

          {success && (
            <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold rounded-xl">
              {success}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-oil-black mb-1">
                {language === 'en' ? `Requested Amount (${currency})` : `Montant demandé (${currency})`}
              </label>
              <input
                type="number"
                placeholder="e.g. 50000"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full h-11 px-3 bg-background border border-border-subtle rounded-xl text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary font-sans"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-oil-black mb-1">
                {language === 'en' ? 'Repayment Period' : 'Période de remboursement'}
              </label>
              <select
                value={termMonths}
                onChange={(e) => setTermMonths(Number(e.target.value) as LoanTermMonths)}
                className="w-full h-11 px-3 bg-background border border-border-subtle rounded-xl text-sm focus:outline-none focus:border-primary font-sans"
              >
                <option value={6}>{formatTermMonths(6, language)}</option>
                <option value={12}>{formatTermMonths(12, language)}</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-oil-black mb-1">
                {language === 'en' ? 'Purpose of Loan' : 'Objet du prêt'}
              </label>
              <select
                value={reasonEn}
                onChange={(e) => {
                  setReasonEn(e.target.value);
                  if (e.target.value === 'School Fees') setReasonFr('Frais scolaires');
                  else if (e.target.value === 'Business Inventory') setReasonFr('Stock commercial');
                  else if (e.target.value === 'Medical Bill') setReasonFr('Frais médicaux');
                  else setReasonFr('Autre urgence');
                }}
                className="w-full h-11 px-3 bg-background border border-border-subtle rounded-xl text-sm focus:outline-none focus:border-primary font-sans"
              >
                <option value="School Fees">School Fees / Ishuri ry’umwana</option>
                <option value="Business Inventory">Business Inventory / Ubucuruzi & Igishoro</option>
                <option value="Medical Bill">Medical Bill / Kwivuza & Ubuvuzi</option>
                <option value="Emergency Care">Emergency Care / Ikibazo cy’ingoboka</option>
              </select>
            </div>

            {estimatedTotalOwed != null && (
              <div className="p-3 bg-primary/5 border border-primary/20 rounded-xl">
                <span className="text-[10px] font-bold text-text-secondary uppercase tracking-wider block">
                  {language === 'en' ? 'Estimated Total Owed (if approved)' : 'Total estimé dû (si approuvé)'}
                </span>
                <span className="text-sm font-bold text-primary font-display">
                  {formatCurrency(estimatedTotalOwed, currency, cdfRate)}
                </span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full h-14 md:h-11 bg-primary text-white font-bold rounded-xl text-xs hover:bg-primary-hover active:scale-[0.98] transition-all flex items-center justify-center gap-2 shadow-subtle cursor-pointer"
            >
              <span>{loading ? '...' : (language === 'en' ? 'Submit Application' : 'Envoyer la demande')}</span>
            </button>
          </form>

          <div className="mt-5 p-3.5 bg-background border border-border-subtle rounded-xl flex gap-2.5">
            <HelpCircle size={16} className="text-accent flex-shrink-0 mt-0.5" />
            <p className="text-[11px] text-text-secondary leading-relaxed">
              {language === 'en'
                ? 'Cooperative loans charge 5% of the principal per month for the chosen term (flat rate, not compounding). You may repay any amount at any time until the balance is cleared.'
                : 'Les prêts coopératifs appliquent 5 % du capital par mois pour la durée choisie (taux fixe, sans capitalisation). Vous pouvez rembourser tout montant à tout moment jusqu\'à solde nul.'}
            </p>
          </div>
        </div>

        <div className="md:col-span-7 bg-surface border border-border-subtle rounded-xl p-6 shadow-subtle">
          <h3 className="text-sm font-bold font-display text-oil-black mb-4">
            {language === 'en' ? 'Your Applications' : 'Vos demandes'}
          </h3>

          {userLoans.length === 0 ? (
            <EmptyState
              compact
              language={language}
              icon={<Landmark size={24} />}
              titleEn="No loan requests yet"
              titleFr="Aucune demande de prêt"
              descriptionEn="Use the form to request a loan from your cooperative. The committee will review your application."
              descriptionFr="Utilisez le formulaire pour demander un prêt à votre coopérative. Le comité examinera votre demande."
            />
          ) : (
            <div className="space-y-4">
              {userLoans.map((loan) => {
                const balances = getLoanBalances(loan);
                const dueDate = getLoanDueDate(loan.date, balances.termMonths, loan.repaymentDueDate);

                return (
                  <div key={loan.id} className="border border-border-subtle rounded-xl p-4 hover:bg-background/45 transition-all bg-background">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <span className="text-xs text-text-secondary block font-medium">{loan.date}</span>
                        <span className="text-base font-bold text-oil-black">
                          {formatCurrency(balances.principal, currency, cdfRate)}
                        </span>
                        <span className="text-[10px] text-text-secondary block mt-0.5">
                          {language === 'en'
                            ? `${balances.termMonths}-month term`
                            : formatTermMonths(balances.termMonths as 6 | 12, language)}
                        </span>
                      </div>

                      <div className="flex flex-col items-end gap-1.5">
                        <span
                          className={`text-[10px] font-bold uppercase px-2.5 py-1 rounded-full border ${
                            loan.status === 'approved'
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                              : loan.status === 'declined'
                                ? 'bg-red-50 text-error border-red-200'
                                : 'bg-amber-50 text-warning border-amber-200'
                          }`}
                        >
                          {loan.status === 'approved'
                            ? language === 'en'
                              ? 'Approved'
                              : 'Approuvé'
                            : loan.status === 'declined'
                              ? language === 'en'
                                ? 'Declined'
                                : 'Refusé'
                              : language === 'en'
                                ? 'Pending'
                                : 'En attente'}
                        </span>

                        {loan.status === 'approved' && (
                          <span
                            className={`text-[9px] font-bold px-2 py-0.5 rounded-md border ${
                              loan.repaid
                                ? 'bg-neutral-100 text-neutral-600 border-neutral-200'
                                : 'bg-primary/10 text-primary border-primary/20'
                            }`}
                          >
                            {loan.repaid
                              ? language === 'en'
                                ? 'Fully Repaid'
                                : 'Entièrement remboursé'
                              : language === 'en'
                                ? `Due: ${dueDate}`
                                : `Échéance : ${dueDate}`}
                          </span>
                        )}
                      </div>
                    </div>

                    {loan.status === 'approved' && balances.totalOwed != null && (
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-3">
                        <div className="bg-surface border border-border-subtle/50 rounded-xl p-2.5">
                          <span className="text-[9px] font-bold text-text-secondary uppercase block">
                            {language === 'en' ? 'Total Owed' : 'Total dû'}
                          </span>
                          <span className="text-xs font-bold text-oil-black">
                            {formatCurrency(balances.totalOwed, currency, cdfRate)}
                          </span>
                        </div>
                        <div className="bg-surface border border-border-subtle/50 rounded-xl p-2.5">
                          <span className="text-[9px] font-bold text-text-secondary uppercase block">
                            {language === 'en' ? 'Amount Paid' : 'Montant payé'}
                          </span>
                          <span className="text-xs font-bold text-emerald-700">
                            {formatCurrency(balances.amountPaid, currency, cdfRate)}
                          </span>
                        </div>
                        <div className="bg-surface border border-border-subtle/50 rounded-xl p-2.5">
                          <span className="text-[9px] font-bold text-text-secondary uppercase block">
                            {language === 'en' ? 'Remaining' : 'Restant'}
                          </span>
                          <span className="text-xs font-bold text-primary">
                            {formatCurrency(balances.remainingBalance ?? 0, currency, cdfRate)}
                          </span>
                        </div>
                      </div>
                    )}

                    <div className="bg-surface border border-border-subtle/50 rounded-xl p-3 mt-3">
                      <span className="text-[10px] font-bold text-text-secondary uppercase block mb-0.5">
                        {language === 'en' ? 'Stated Purpose' : 'Motif indiqué'}
                      </span>
                      <p className="text-xs text-oil-black leading-relaxed">
                        {language === 'en' ? loan.reasonEn : loan.reasonFr}
                      </p>
                    </div>

                    {loan.status === 'approved' && !loan.repaid && (
                      <div className="mt-3 flex gap-2">
                        <input
                          type="number"
                          placeholder={language === 'en' ? 'Amount to pay' : 'Montant à payer'}
                          value={repayAmounts[loan.id] ?? ''}
                          onChange={(e) =>
                            setRepayAmounts((prev) => ({ ...prev, [loan.id]: e.target.value }))
                          }
                          className="flex-1 h-11 px-3 bg-background border border-border-subtle rounded-xl text-sm focus:outline-none focus:border-primary"
                        />
                        <button
                          type="button"
                          onClick={() => handleRepay(loan.id)}
                          disabled={repayLoadingId === loan.id}
                          className="h-11 px-4 bg-primary hover:bg-primary-hover text-white font-semibold rounded-xl text-xs shadow-subtle disabled:opacity-50"
                        >
                          {repayLoadingId === loan.id
                            ? '...'
                            : language === 'en'
                              ? 'Repay'
                              : 'Rembourser'}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
