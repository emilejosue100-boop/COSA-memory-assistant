import React, { useMemo, useState } from 'react';
import { GlobalState, Language, LoanTermMonths } from '../types';
import { apiPost } from '../lib/api';
import { formatCurrency, getLoanBalances, convertToUsd } from '../lib/currency';
import { calculateTotalOwed, DEFAULT_INTEREST_RATE } from '../lib/loanCalculations';
import {
  getDaysRemaining,
  getLoanTimelineProgress,
  formatTermMonths,
  getLoanDueDate,
  getLoanStatusLevel,
  getLoanStatusLabel,
  getLoanStatusClasses,
} from '../lib/loanTimeline';
import { getUserMessage } from '../lib/userMessages';
import { useCurrency } from '../hooks/useCurrency';
import CurrencySwitcher from './CurrencySwitcher';
import UserNotice from './UserNotice';
import EmptyState from './EmptyState';
import { ArrowDownRight, ArrowUpRight, Lightbulb, Wallet, Plus, ChevronRight, RefreshCw, X, Sparkles, Check, PiggyBank, MessageSquare } from 'lucide-react';

interface DashboardProps {
  state: GlobalState;
  language: Language;
  onStateChange: (updated: GlobalState) => void;
  onNavigateToTab: (tab: string) => void;
}

export default function Dashboard({ state, language, onStateChange, onNavigateToTab }: DashboardProps) {
  const { currentUser, currentTip, transactions } = state;
  const { currency, setCurrency, options, cdfRate } = useCurrency();
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showLoanModal, setShowLoanModal] = useState(false);
  const [saveAmount, setSaveAmount] = useState('');
  const [loanAmount, setLoanAmount] = useState('');
  const [loanTermMonths, setLoanTermMonths] = useState<LoanTermMonths>(6);
  const [loanReasonEn, setLoanReasonEn] = useState('School Fees');
  const [loanReasonFr, setLoanReasonFr] = useState('Frais scolaires');
  const [aiLoading, setAiLoading] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [loanLoading, setLoanLoading] = useState(false);
  const [repayLoadingId, setRepayLoadingId] = useState<string | null>(null);
  const [repayAmounts, setRepayAmounts] = useState<Record<string, string>>({});
  const [actionError, setActionError] = useState<string | null>(null);
  const [paymentUpdateMessage, setPaymentUpdateMessage] = useState('');
  const [paymentUpdateLoading, setPaymentUpdateLoading] = useState(false);
  const [paymentUpdateSuccess, setPaymentUpdateSuccess] = useState(false);

  const loanEstimatedTotal = useMemo(() => {
    const val = Number(loanAmount);
    if (!loanAmount || isNaN(val) || val <= 0) return null;
    const principalUsd = convertToUsd(val, currency, cdfRate);
    return calculateTotalOwed(principalUsd, DEFAULT_INTEREST_RATE, loanTermMonths);
  }, [loanAmount, currency, loanTermMonths, cdfRate]);

  // Filter approved loans for current user that are not yet repaid
  const userApprovedLoans = state.loanRequests.filter(
    l => l.memberName === currentUser?.name && l.status === 'approved' && !l.repaid
  );

  const handleRepayLoanSubmit = async (loanId: string) => {
    const payAmount = repayAmounts[loanId];
    if (!payAmount || isNaN(Number(payAmount)) || Number(payAmount) <= 0) {
      setActionError(language === 'en' ? 'Enter a valid repayment amount.' : 'Saisissez un montant de remboursement valide.');
      return;
    }

    setRepayLoadingId(loanId);
    setActionError(null);
    try {
      const { ok, data, error } = await apiPost<GlobalState>(
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
        setActionError(error || null);
      }
    } catch {
      setActionError(getUserMessage({ language, code: 'network', context: 'repay' }));
    } finally {
      setRepayLoadingId(null);
    }
  };

  const handlePaymentUpdateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentUpdateMessage.trim()) return;

    setPaymentUpdateLoading(true);
    setPaymentUpdateSuccess(false);
    setActionError(null);
    try {
      const { ok, error } = await apiPost<{ id: string; createdAt: string }>(
        '/api/payment-update',
        { message: paymentUpdateMessage.trim() },
        true,
        language
      );
      if (ok) {
        setPaymentUpdateMessage('');
        setPaymentUpdateSuccess(true);
      } else {
        setActionError(error || null);
      }
    } catch {
      setActionError(getUserMessage({ language, code: 'network' }));
    } finally {
      setPaymentUpdateLoading(false);
    }
  };

  // Filter transactions belonging to this user
  const userTransactions = transactions.filter(t => t.memberName === currentUser?.name);

  const handleSaveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!saveAmount || isNaN(Number(saveAmount)) || Number(saveAmount) <= 0) return;

    setSaveLoading(true);
    setActionError(null);
    try {
      const { ok, data, error } = await apiPost<GlobalState>(
        '/api/save',
        { amount: Number(saveAmount) },
        true,
        language,
        'save'
      );
      if (ok) {
        onStateChange(data);
        setShowSaveModal(false);
        setSaveAmount('');
      } else {
        setActionError(error || null);
      }
    } catch {
      setActionError(getUserMessage({ language, code: 'network', context: 'save' }));
    } finally {
      setSaveLoading(false);
    }
  };

  const handleLoanSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loanAmount || isNaN(Number(loanAmount)) || Number(loanAmount) <= 0) return;

    setLoanLoading(true);
    setActionError(null);
    try {
      const { ok, data, error } = await apiPost<GlobalState>(
        '/api/request-loan',
        {
          amount: Number(loanAmount),
          termMonths: loanTermMonths,
          currency,
          reasonEn: loanReasonEn,
          reasonFr: loanReasonFr,
        },
        true,
        language,
        'loan'
      );
      if (ok) {
        onStateChange(data);
        setShowLoanModal(false);
        setLoanAmount('');
      } else {
        setActionError(error || null);
      }
    } catch {
      setActionError(getUserMessage({ language, code: 'network', context: 'loan' }));
    } finally {
      setLoanLoading(false);
    }
  };

  const refreshTipWithAi = async () => {
    setAiLoading(true);
    try {
      const { ok, data } = await apiPost<GlobalState>('/api/generate-tip');
      if (ok) {
        onStateChange(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setAiLoading(false);
    }
  };

  // Format currency helper (savings still in USD base internally)
  const formatAmount = (val: number) => formatCurrency(val, currency, cdfRate);

  return (
    <div className="space-y-6">
      {actionError && <UserNotice message={actionError} />}
      {/* Welcome Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-oil-black font-display tracking-tight">
            {language === 'en' ? `Hello, ${currentUser?.name.split(' ')[0]}` : `Bonjour, ${currentUser?.name.split(' ')[0]}`}
          </h2>
          <p className="text-sm text-text-secondary font-medium">
            {currentUser?.cooperativeName || 'Kumbuka'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <CurrencySwitcher currency={currency} onChange={setCurrency} options={options} compact />
          <img
            src={currentUser?.profileImage}
            alt={currentUser?.name}
            className="w-10 h-10 rounded-full object-cover border border-border-subtle shadow-subtle"
          />
        </div>
      </div>

      {/* Main Bento Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Card: Savings Balance & Actions */}
        <div className="lg:col-span-8 bg-primary text-white rounded-xl p-6 shadow-subtle relative overflow-hidden flex flex-col justify-between min-h-[240px]">
          {/* Subtle Organic Background Blob */}
          <div className="absolute -right-16 -top-16 w-48 h-48 bg-emerald-700/30 rounded-full blur-2xl pointer-events-none"></div>
          
          <div>
            <div className="flex items-center gap-2 opacity-90 text-sm font-semibold tracking-wide uppercase">
              <Wallet size={18} className="flex-shrink-0" />
              <span>{language === 'en' ? 'Total Savings / Balance' : 'Épargne totale / Solde'}</span>
            </div>
            <div className="text-4xl md:text-5xl font-bold font-display mt-4 tracking-tight">
              {formatAmount(currentUser?.savingsBalance || 0)}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 mt-6">
            <button
              onClick={() => setShowSaveModal(true)}
              className="flex-1 h-14 md:h-12 bg-surface text-primary hover:bg-neutral-50 active:scale-[0.98] font-bold rounded-xl text-xs transition-all flex items-center justify-center gap-2 shadow-pressed cursor-pointer"
            >
              <Plus size={18} className="flex-shrink-0" />
              <span>{language === 'en' ? 'Save / Kizigama' : 'Épargner'}</span>
            </button>
            <button
              onClick={() => setShowLoanModal(true)}
              className="flex-1 h-14 md:h-12 bg-primary-hover border border-white/20 hover:bg-primary-hover/80 active:scale-[0.98] text-white font-bold rounded-xl text-xs transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <ArrowDownRight size={18} className="flex-shrink-0" />
              <span>{language === 'en' ? 'Request Loan' : 'Demander un prêt'}</span>
            </button>
          </div>
        </div>

        {/* Right Card: AI Tip of the Day */}
        <div className="lg:col-span-4 bg-surface border border-border-subtle rounded-xl p-6 shadow-subtle flex flex-col justify-between relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-accent/10 rounded-bl-full pointer-events-none"></div>
          
          <div>
            <div className="flex justify-between items-start mb-4">
              <div className="w-10 h-10 bg-accent/15 text-accent rounded-xl flex items-center justify-center shadow-pressed">
                <Lightbulb size={20} className="fill-accent stroke-[1.5] flex-shrink-0" />
              </div>
              <button
                onClick={refreshTipWithAi}
                disabled={aiLoading}
                className="p-1.5 hover:bg-background rounded-full transition-all text-text-secondary hover:text-primary flex items-center gap-1.5 text-[10px] font-bold tracking-wider uppercase cursor-pointer"
                title={language === 'en' ? 'Regenerate advice using Gemini AI' : 'Régénérer avec Gemini AI'}
              >
                <RefreshCw size={12} className={`flex-shrink-0 ${aiLoading ? 'animate-spin text-primary' : ''}`} />
                <span>{aiLoading ? 'AI...' : 'Gemini AI'}</span>
              </button>
            </div>

            <h3 className="text-base font-bold font-display text-oil-black">
              {language === 'en' ? currentTip.titleEn : currentTip.titleFr}
            </h3>
            <p className="text-sm text-oil-black italic mt-2 leading-relaxed">
              "{language === 'en' ? currentTip.contentEn : currentTip.contentFr}"
            </p>
          </div>

          <div className="mt-4 pt-3 border-t border-border-subtle/60">
            <span className="text-[10px] font-bold text-text-secondary uppercase tracking-wider block mb-1">
              {language === 'en' ? 'Why am I seeing this?' : 'Pourquoi vois-je ceci ?'}
            </span>
            <p className="text-[11px] text-text-secondary leading-normal">
              {language === 'en' ? currentTip.whyEn : currentTip.whyFr}
            </p>
          </div>
        </div>
      </div>

      {/* Active Repayments & Due Flag Tracker */}
      {userApprovedLoans.length > 0 && (
        <div className="bg-surface border border-border-subtle rounded-xl p-6 shadow-subtle space-y-4">
          <div>
            <h3 className="text-base font-bold font-display text-oil-black">
              {language === 'en' ? 'Active Loans & Repayment Status' : 'Prêts actifs et statut de remboursement'}
            </h3>
            <p className="text-xs text-text-secondary">
              {language === 'en' ? 'Track your upcoming repayment deadlines and timeline' : 'Suivez vos échéances et votre calendrier de remboursement'}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {userApprovedLoans.map((loan) => {
              const balances = getLoanBalances(loan);
              const dueDate = getLoanDueDate(loan.date, balances.termMonths, loan.repaymentDueDate);
              const daysLeft = getDaysRemaining(dueDate);
              const statusLevel = getLoanStatusLevel(daysLeft);
              const progressPercent = getLoanTimelineProgress(loan.date, dueDate);

              return (
                <div key={loan.id} className="border border-border-subtle rounded-xl p-4 flex flex-col justify-between space-y-4 bg-background">
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-text-secondary tracking-wider block">
                        {language === 'en' ? 'Remaining Balance' : 'Solde restant'}
                      </span>
                      <span className="text-lg font-bold text-oil-black">
                        {formatAmount(balances.remainingBalance ?? 0)}
                      </span>
                    </div>

                    <div className={`px-2.5 py-1 text-[10px] font-bold uppercase rounded-full border ${getLoanStatusClasses(statusLevel)}`}>
                      {getLoanStatusLabel(statusLevel, language)}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div className="bg-surface border border-border-subtle/50 rounded-xl p-2.5">
                      <span className="text-[9px] font-bold text-text-secondary uppercase block">
                        {language === 'en' ? 'Total Owed' : 'Total dû'}
                      </span>
                      <span className="text-xs font-bold text-oil-black">
                        {formatAmount(balances.totalOwed ?? 0)}
                      </span>
                    </div>
                    <div className="bg-surface border border-border-subtle/50 rounded-xl p-2.5">
                      <span className="text-[9px] font-bold text-text-secondary uppercase block">
                        {language === 'en' ? 'Amount Paid' : 'Montant payé'}
                      </span>
                      <span className="text-xs font-bold text-emerald-700">
                        {formatAmount(balances.amountPaid)}
                      </span>
                    </div>
                    <div className="bg-surface border border-border-subtle/50 rounded-xl p-2.5">
                      <span className="text-[9px] font-bold text-text-secondary uppercase block">
                        {language === 'en' ? 'Term' : 'Durée'}
                      </span>
                      <span className="text-xs font-bold text-oil-black">
                        {formatTermMonths(balances.termMonths as 6 | 12, language)}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex justify-between text-[11px] font-semibold text-text-secondary">
                      <span>{language === 'en' ? `Disbursed: ${loan.date}` : `Versé : ${loan.date}`}</span>
                      <span>{language === 'en' ? `Due: ${dueDate}` : `Échéance : ${dueDate}`}</span>
                    </div>

                    <div className="w-full bg-neutral-100 dark:bg-neutral-800 rounded-full h-2 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500 bg-primary"
                        style={{ width: `${progressPercent}%` }}
                      ></div>
                    </div>

                    <div className="flex justify-between text-[10px] font-bold text-text-secondary">
                      <span>{language === 'en' ? `${progressPercent}% timeline elapsed` : `${progressPercent} % du délai écoulé`}</span>
                      <span className={daysLeft <= 7 ? 'text-error animate-pulse' : ''}>
                        {daysLeft <= 0
                          ? language === 'en'
                            ? 'Overdue'
                            : 'En retard'
                          : language === 'en'
                            ? `${daysLeft} days remaining`
                            : `${daysLeft} jours restants`}
                      </span>
                    </div>
                  </div>

                  <div className="flex gap-2">
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
                      onClick={() => handleRepayLoanSubmit(loan.id)}
                      disabled={repayLoadingId === loan.id}
                      className="h-11 px-4 bg-primary hover:bg-primary-hover text-white font-bold rounded-xl text-xs transition-all flex items-center justify-center gap-2 cursor-pointer shadow-subtle disabled:opacity-50"
                    >
                      <Check size={14} className="flex-shrink-0" />
                      <span>
                        {repayLoadingId === loan.id
                          ? '...'
                          : language === 'en'
                            ? 'Repay'
                            : 'Rembourser'}
                      </span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Payment Update */}
      <div className="bg-surface border border-border-subtle rounded-xl p-6 shadow-subtle space-y-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 bg-accent/15 text-accent rounded-xl flex items-center justify-center shadow-pressed shrink-0">
            <MessageSquare size={20} className="flex-shrink-0" />
          </div>
          <div>
            <h3 className="text-base font-bold font-display text-oil-black">
              {language === 'en' ? 'Send a payment update' : 'Envoyer une mise à jour de paiement'}
            </h3>
            <p className="text-xs text-text-secondary mt-0.5">
              {language === 'en'
                ? 'Let the cooperative know if your repayment plans have changed.'
                : 'Informez la coopérative si vos plans de remboursement ont changé.'}
            </p>
          </div>
        </div>

        <form onSubmit={handlePaymentUpdateSubmit} className="space-y-3">
          <textarea
            value={paymentUpdateMessage}
            onChange={(e) => {
              setPaymentUpdateMessage(e.target.value);
              if (paymentUpdateSuccess) setPaymentUpdateSuccess(false);
            }}
            placeholder={
              language === 'en'
                ? 'Let us know if your repayment plans have changed'
                : 'Dites-nous si vos plans de remboursement ont changé'
            }
            rows={3}
            className="w-full px-4 py-3 bg-background border border-border-subtle rounded-xl text-sm text-oil-black placeholder:text-text-secondary focus:outline-none focus:border-primary resize-none"
          />
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <button
              type="submit"
              disabled={paymentUpdateLoading || !paymentUpdateMessage.trim()}
              className="h-11 px-5 bg-primary hover:bg-primary-hover text-white font-bold rounded-xl text-xs transition-all flex items-center justify-center gap-2 cursor-pointer shadow-subtle disabled:opacity-50"
            >
              {paymentUpdateLoading ? (
                <RefreshCw size={14} className="animate-spin flex-shrink-0" />
              ) : (
                <Check size={14} className="flex-shrink-0" />
              )}
              <span>{language === 'en' ? 'Send' : 'Envoyer'}</span>
            </button>
            {paymentUpdateSuccess && (
              <p className="text-xs font-semibold text-emerald-700 flex items-center gap-1.5">
                <Check size={14} className="flex-shrink-0" />
                {language === 'en'
                  ? 'Payment update sent. The cooperative has been notified.'
                  : 'Mise à jour envoyée. La coopérative a été informée.'}
              </p>
            )}
          </div>
        </form>
      </div>

      {/* Recent Activity Section */}
      <div className="bg-surface border border-border-subtle rounded-xl p-6 shadow-subtle">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h3 className="text-base font-bold font-display text-oil-black">
              {language === 'en' ? 'Recent Activity' : 'Activité récente'}
            </h3>
            <p className="text-xs text-text-secondary">
              {language === 'en' ? 'Your personal savings timeline' : 'Votre historique d\'épargne personnel'}
            </p>
          </div>
          <button
            onClick={() => onNavigateToTab('savings')}
            className="text-xs font-semibold text-primary hover:text-primary-hover flex items-center gap-1 cursor-pointer"
          >
            <span>{language === 'en' ? 'View All' : 'Tout voir'}</span>
            <ChevronRight size={14} className="flex-shrink-0" />
          </button>
        </div>

        {userTransactions.length === 0 ? (
          <EmptyState
            compact
            language={language}
            icon={<PiggyBank size={24} />}
            titleEn="No savings activity yet"
            titleFr="Aucune activité d'épargne"
            descriptionEn="Tap Save on your dashboard to make your first contribution. Your activity will show up here."
            descriptionFr="Appuyez sur Épargner pour effectuer votre première contribution. Votre activité apparaîtra ici."
            action={{
              labelEn: 'Make First Contribution',
              labelFr: 'Première contribution',
              onClick: () => setShowSaveModal(true),
            }}
          />
        ) : (
          <div className="divide-y divide-border-subtle/50">
            {userTransactions.slice(0, 3).map((tx) => (
              <div key={tx.id} className="flex justify-between items-center py-3 first:pt-0 last:pb-0">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                    tx.type === 'saved' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
                  }`}>
                    {tx.type === 'saved' ? <ArrowUpRight size={16} className="flex-shrink-0" /> : <ArrowDownRight size={16} className="flex-shrink-0" />}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-oil-black">
                      {tx.type === 'saved' 
                        ? (language === 'en' ? 'Cooperative Saving' : 'Épargne coopérative')
                        : (tx.type === 'repaid_loan' ? (language === 'en' ? 'Loan Repayment' : 'Remboursement de prêt') : (language === 'en' ? 'Withdrawal' : 'Retrait'))}
                    </p>
                    <p className="text-[11px] text-text-secondary">{tx.date}</p>
                  </div>
                </div>
                <div className="text-right">
                  <span className={`text-sm font-bold ${
                    tx.type === 'saved' ? 'text-emerald-700' : 'text-oil-black'
                  }`}>
                    {tx.type === 'saved' ? '+' : '-'} {formatAmount(tx.amount)}
                  </span>
                  <span className="block text-[10px] text-emerald-600 font-medium">
                    {language === 'en' ? 'Success' : 'Réussi'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Save Modal */}
      {showSaveModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-surface rounded-xl max-w-sm w-full p-6 shadow-subtle border border-border-subtle relative">
            <button
              onClick={() => setShowSaveModal(false)}
              className="absolute right-4 top-4 text-text-secondary hover:text-oil-black cursor-pointer"
            >
              <X size={18} className="flex-shrink-0" />
            </button>
            <h3 className="text-lg font-bold font-display text-oil-black mb-1">
              {language === 'en' ? 'Deposit Contribution' : 'Déposer une contribution'}
            </h3>
            <p className="text-xs text-text-secondary mb-4">
              {language === 'en' 
                ? 'Add funds to your shared cooperative account.' 
                : 'Ajoutez des fonds à votre compte coopératif partagé.'}
            </p>

            <form onSubmit={handleSaveSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-oil-black mb-1">
                  {language === 'en' ? `Amount (${currency})` : `Montant (${currency})`}
                </label>
                <input
                  type="number"
                  placeholder="e.g. 10000"
                  required
                  value={saveAmount}
                  onChange={(e) => setSaveAmount(e.target.value)}
                  className="w-full h-11 px-3 bg-background border border-border-subtle rounded-xl text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary font-sans"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowSaveModal(false)}
                  className="flex-1 h-14 md:h-11 border border-border-subtle text-oil-black font-semibold rounded-xl text-xs hover:bg-background transition-all cursor-pointer"
                >
                  {language === 'en' ? 'Cancel' : 'Annuler'}
                </button>
                <button
                  type="submit"
                  disabled={saveLoading}
                  className="flex-1 h-14 md:h-11 bg-primary text-white font-semibold rounded-xl text-xs hover:bg-primary-hover transition-all flex items-center justify-center cursor-pointer"
                >
                  {saveLoading ? '...' : (language === 'en' ? 'Confirm' : 'Confirmer')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Loan Modal */}
      {showLoanModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-surface rounded-xl max-w-sm w-full p-6 shadow-subtle border border-border-subtle relative">
            <button
              onClick={() => setShowLoanModal(false)}
              className="absolute right-4 top-4 text-text-secondary hover:text-oil-black cursor-pointer"
            >
              <X size={18} className="flex-shrink-0" />
            </button>
            <h3 className="text-lg font-bold font-display text-oil-black mb-1">
              {language === 'en' ? 'Apply for a Micro-Loan' : 'Demander un micro-prêt'}
            </h3>
            <p className="text-xs text-text-secondary mb-4">
              {language === 'en' 
                ? 'Loans are subject to approval by the cooperative committee.' 
                : 'Les prêts sont soumis à l\'approbation du comité coopératif.'}
            </p>

            <form onSubmit={handleLoanSubmit} className="space-y-4">
              <div className="flex justify-end">
                <CurrencySwitcher currency={currency} onChange={setCurrency} options={options} compact />
              </div>
              <div>
                <label className="block text-xs font-semibold text-oil-black mb-1">
                  {language === 'en' ? `Amount Requested (${currency})` : `Montant demandé (${currency})`}
                </label>
                <input
                  type="number"
                  placeholder="e.g. 50000"
                  required
                  value={loanAmount}
                  onChange={(e) => setLoanAmount(e.target.value)}
                  className="w-full h-11 px-3 bg-background border border-border-subtle rounded-xl text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-oil-black mb-1">
                  {language === 'en' ? 'Repayment Period' : 'Période de remboursement'}
                </label>
                <select
                  value={loanTermMonths}
                  onChange={(e) => setLoanTermMonths(Number(e.target.value) as LoanTermMonths)}
                  className="w-full h-11 px-3 bg-background border border-border-subtle rounded-xl text-sm focus:outline-none focus:border-primary"
                >
                  <option value={6}>{formatTermMonths(6, language)}</option>
                  <option value={12}>{formatTermMonths(12, language)}</option>
                </select>
              </div>

              {loanEstimatedTotal != null && (
                <div className="p-3 bg-primary/5 border border-primary/20 rounded-xl">
                  <span className="text-[10px] font-bold text-text-secondary uppercase tracking-wider block">
                    {language === 'en' ? 'Estimated Total Owed' : 'Total estimé dû'}
                  </span>
                  <span className="text-sm font-bold text-primary font-display">
                    {formatAmount(loanEstimatedTotal)}
                  </span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-oil-black mb-1">
                  {language === 'en' ? 'Reason for Loan' : 'Motif du prêt'}
                </label>
                <select
                  value={loanReasonEn}
                  onChange={(e) => {
                    setLoanReasonEn(e.target.value);
                    if (e.target.value === 'School Fees') setLoanReasonFr('Frais scolaires');
                    else if (e.target.value === 'Business Inventory') setLoanReasonFr('Stock commercial');
                    else if (e.target.value === 'Medical Bill') setLoanReasonFr('Frais médicaux');
                    else setLoanReasonFr('Autre urgence');
                  }}
                  className="w-full h-11 px-3 bg-background border border-border-subtle rounded-xl text-sm focus:outline-none focus:border-primary"
                >
                  <option value="School Fees">School Fees / Ishuri ry’umwana</option>
                  <option value="Business Inventory">Business Inventory / Idurika & Kiosk</option>
                  <option value="Medical Bill">Medical Bill / Fagitire y’Ubuvuzi</option>
                  <option value="Emergency Care">Emergency Care / Ingoboka rusange</option>
                </select>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowLoanModal(false)}
                  className="flex-1 h-14 md:h-11 border border-border-subtle text-oil-black font-semibold rounded-xl text-xs hover:bg-background transition-all cursor-pointer"
                >
                  {language === 'en' ? 'Cancel' : 'Annuler'}
                </button>
                <button
                  type="submit"
                  disabled={loanLoading}
                  className="flex-1 h-14 md:h-11 bg-primary text-white font-semibold rounded-xl text-xs hover:bg-primary-hover transition-all flex items-center justify-center cursor-pointer"
                >
                  {loanLoading ? '...' : (language === 'en' ? 'Submit' : 'Envoyer')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
