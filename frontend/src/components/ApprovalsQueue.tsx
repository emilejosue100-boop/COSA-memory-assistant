import React, { useState } from 'react';
import { GlobalState, Language, LoanFinalOutcome } from '../types';
import { apiPost } from '../lib/api';
import { formatCurrency, getLoanBalances } from '../lib/currency';
import { calculateTotalOwed } from '../lib/loanCalculations';
import { useCurrency } from '../hooks/useCurrency';
import CurrencySwitcher from './CurrencySwitcher';
import EmptyState from './EmptyState';
import UserNotice from './UserNotice';
import { formatTermMonths } from '../lib/loanTimeline';
import { CheckCircle2, XCircle, Clock, AlertTriangle, Hourglass } from 'lucide-react';

function formatOutcomeLabel(outcome: LoanFinalOutcome, language: Language): string {
  if (language === 'en') {
    switch (outcome) {
      case 'repaid_on_time':
        return 'Repaid on time';
      case 'repaid_late':
        return 'Repaid late';
      case 'defaulted':
        return 'Defaulted';
    }
  }
  switch (outcome) {
    case 'repaid_on_time':
      return 'Remboursé à temps';
    case 'repaid_late':
      return 'Remboursé en retard';
    case 'defaulted':
      return 'Défaut de paiement';
  }
}

function getOutcomeBadgeClasses(outcome: LoanFinalOutcome): string {
  switch (outcome) {
    case 'repaid_on_time':
      return 'bg-emerald-50 text-emerald-800 border border-emerald-100';
    case 'repaid_late':
      return 'bg-amber-50 text-amber-800 border border-amber-100';
    case 'defaulted':
      return 'bg-red-50 text-error border border-red-100';
  }
}

interface ApprovalsQueueProps {
  state: GlobalState;
  language: Language;
  onStateChange: (updated: GlobalState) => void;
}

export default function ApprovalsQueue({ state, language, onStateChange }: ApprovalsQueueProps) {
  const { loanRequests } = state;
  const { currency, setCurrency, options, cdfRate } = useCurrency();
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [outcomeLoading, setOutcomeLoading] = useState<string | null>(null);
  const [outcomeSuccessId, setOutcomeSuccessId] = useState<string | null>(null);

  const [actionError, setActionError] = useState<string | null>(null);

  const handleAction = async (id: string, approve: boolean) => {
    setActionLoading(id);
    setActionError(null);
    try {
      const endpoint = approve ? '/api/approve-loan' : '/api/decline-loan';
      const { ok, data, error } = await apiPost<GlobalState>(endpoint, { id }, true, language, 'approve');

      if (ok) {
        onStateChange(data);
      } else {
        setActionError(error || null);
      }
    } catch {
      setActionError(null);
    } finally {
      setActionLoading(null);
    }
  };

  const handleRecordOutcome = async (loanId: string, outcome: LoanFinalOutcome) => {
    setOutcomeLoading(loanId);
    setActionError(null);
    setOutcomeSuccessId(null);
    try {
      const { ok, data, error } = await apiPost<GlobalState>(
        `/api/loans/${encodeURIComponent(loanId)}/outcome`,
        { outcome },
        true,
        language,
        'general'
      );
      if (ok) {
        onStateChange(data);
        setOutcomeSuccessId(loanId);
      } else {
        setActionError(error || null);
      }
    } catch {
      setActionError(null);
    } finally {
      setOutcomeLoading(null);
    }
  };

  const pendingList = loanRequests.filter(l => l.status === 'pending');
  const pastList = loanRequests.filter(l => l.status !== 'pending');

  const formatAmount = (val: number) => formatCurrency(val, currency, cdfRate);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold font-display text-oil-black tracking-tight">
            {language === 'en' ? 'Loan Approvals Queue' : 'File d\'approbation des prêts'}
          </h2>
          <p className="text-xs text-text-secondary">
            {language === 'en' ? 'Review, approve, or deny outstanding cooperative borrowing requests' : 'Examinez, approuvez ou refusez les demandes de prêt en cours'}
          </p>
        </div>
        <CurrencySwitcher currency={currency} onChange={setCurrency} options={options} />
      </div>

      {/* Warning Rule Guard Box */}
      <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-4 flex gap-3">
        <AlertTriangle className="text-warning flex-shrink-0 mt-0.5" size={18} />
        <div>
          <h4 className="text-xs font-bold text-oil-black uppercase tracking-wider">
            {language === 'en' ? 'Committee Mandate Rules' : 'Règles du mandat du comité'}
          </h4>
          <p className="text-[11px] text-text-secondary leading-relaxed mt-0.5">
            {language === 'en'
              ? 'Requests require verification of the borrower’s regular contributions. Ensure total collective outstanding credit does not exceed 35% of total cooperative fund reserves.'
              : "Les demandes exigent une vérification des contributions régulières de l'emprunteur. Le crédit collectif en cours ne doit pas dépasser 35 % des réserves du fonds coopératif."}
          </p>
        </div>
      </div>

      {actionError && <UserNotice message={actionError} />}

      {/* Pending Queue Section */}
      <div className="space-y-3">
        <h3 className="text-xs font-bold text-text-secondary uppercase tracking-widest flex items-center gap-1.5">
          <Clock size={15} />
          {language === 'en' ? `Pending Requests (${pendingList.length})` : `Demandes en attente (${pendingList.length})`}
        </h3>

        {pendingList.length === 0 ? (
          <EmptyState
            compact
            language={language}
            icon={<Hourglass size={24} />}
            titleEn="No pending loan requests"
            titleFr="Aucune demande de prêt en attente"
            descriptionEn="When members apply for loans, they will appear here for committee review."
            descriptionFr="Lorsque les membres demandent un prêt, leurs demandes apparaîtront ici pour examen par le comité."
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {pendingList.map((loan) => {
              const balances = getLoanBalances(loan);
              const estimatedTotal = calculateTotalOwed(
                balances.principal,
                balances.interestRate,
                balances.termMonths
              );

              return (
              <div 
                key={loan.id} 
                className="bg-white border border-border-subtle rounded-xl p-5 shadow-subtle flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center gap-3 pb-3 border-b border-border-subtle/50 mb-3">
                    <img
                      src={loan.memberImage}
                      alt={loan.memberName}
                      className="w-9 h-9 rounded-full object-cover"
                    />
                    <div>
                      <h4 className="text-sm font-bold text-oil-black">{loan.memberName}</h4>
                      <span className="text-[10px] text-text-secondary block font-semibold">{loan.date}</span>
                    </div>
                  </div>

                  <div className="mb-4 grid grid-cols-2 gap-3">
                    <div>
                      <span className="text-[10px] text-text-secondary font-bold uppercase tracking-wider block">
                        {language === 'en' ? 'Principal' : 'Capital'}
                      </span>
                      <span className="text-lg font-bold text-oil-black block mt-0.5">
                        {formatAmount(balances.principal)}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-text-secondary font-bold uppercase tracking-wider block">
                        {language === 'en' ? 'Term' : 'Durée'}
                      </span>
                      <span className="text-lg font-bold text-oil-black block mt-0.5">
                        {formatTermMonths(balances.termMonths as 6 | 12, language)}
                      </span>
                    </div>
                  </div>

                  <div className="mb-4 p-3 bg-primary/5 border border-primary/20 rounded-xl">
                    <span className="text-[10px] text-text-secondary font-bold uppercase tracking-wider block">
                      {language === 'en' ? 'Total Owed if Approved' : 'Total dû si approuvé'}
                    </span>
                    <span className="text-sm font-bold text-primary font-display">
                      {formatAmount(estimatedTotal)}
                    </span>
                  </div>

                  <div className="bg-background border border-border-subtle/50 rounded-xl p-3 mb-5">
                    <span className="text-[10px] text-text-secondary font-bold uppercase tracking-wider block mb-0.5">
                      {language === 'en' ? 'Stated Purpose' : 'Motif indiqué'}
                    </span>
                    <p className="text-xs text-oil-black leading-relaxed">
                      {language === 'en' ? loan.reasonEn : loan.reasonFr}
                    </p>
                  </div>
                </div>

                {/* Quick Action Decision buttons */}
                <div className="flex gap-2.5">
                  <button
                    onClick={() => handleAction(loan.id, false)}
                    disabled={actionLoading === loan.id}
                    className="flex-1 h-10 border border-red-200 text-error hover:bg-red-50 font-bold rounded-xl text-xs flex items-center justify-center gap-1 transition-all"
                  >
                    <XCircle size={15} />
                    {language === 'en' ? 'Decline' : 'Refuser'}
                  </button>
                  <button
                    onClick={() => handleAction(loan.id, true)}
                    disabled={actionLoading === loan.id}
                    className="flex-1 h-10 bg-primary hover:bg-primary-hover text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1 transition-all shadow-subtle"
                  >
                    <CheckCircle2 size={15} />
                    {language === 'en' ? 'Approve' : 'Approuver'}
                  </button>
                </div>
              </div>
            );
            })}
          </div>
        )}
      </div>

      {/* Past Decisions Log Section */}
      <div className="bg-white border border-border-subtle rounded-xl p-6 shadow-subtle">
        <h3 className="text-sm font-bold font-display text-oil-black mb-4">
          {language === 'en' ? 'Recent Decisions Log' : 'Journal des décisions récentes'}
        </h3>

        {pastList.length === 0 ? (
          <EmptyState
            compact
            language={language}
            icon={<CheckCircle2 size={24} />}
            titleEn="No decisions recorded yet"
            titleFr="Aucune décision enregistrée"
            descriptionEn="Approved and declined loans will be logged here for the committee's records."
            descriptionFr="Les prêts approuvés et refusés seront consignés ici pour les archives du comité."
          />
        ) : (
          <div className="divide-y divide-border-subtle/50">
            {pastList.map((loan) => {
              const balances = getLoanBalances(loan);
              const showOutcomeActions = loan.status === 'approved' && !loan.finalOutcome;
              return (
              <div key={loan.id} className="py-3.5 first:pt-0 last:pb-0 space-y-2">
                <div className="flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <img
                    src={loan.memberImage}
                    alt={loan.memberName}
                    className="w-8 h-8 rounded-full object-cover border border-border-subtle"
                  />
                  <div>
                    <h4 className="text-xs font-bold text-oil-black">{loan.memberName}</h4>
                    <span className="text-[10px] text-text-secondary block font-semibold">
                      {loan.date} · {formatTermMonths(balances.termMonths as 6 | 12, language)}
                    </span>
                  </div>
                </div>

                <div className="text-right flex items-center gap-4">
                  <div>
                    <span className="text-xs font-bold text-oil-black block">{formatAmount(balances.principal)}</span>
                    {loan.status === 'approved' && balances.remainingBalance != null && !loan.repaid && (
                      <span className="text-[10px] text-primary font-semibold block">
                        {language === 'en' ? 'Remaining:' : 'Restant :'} {formatAmount(balances.remainingBalance)}
                      </span>
                    )}
                    <p className="text-[10px] text-text-secondary font-medium truncate max-w-[120px]">
                      {language === 'en' ? loan.reasonEn : loan.reasonFr}
                    </p>
                  </div>

                  <div className="flex flex-col items-end gap-1">
                    <span className={`text-[10px] font-bold uppercase px-2.5 py-0.5 rounded-full ${
                      loan.status === 'approved' 
                        ? 'bg-emerald-50 text-emerald-800 border border-emerald-100' 
                        : 'bg-red-50 text-error border border-red-100'
                    }`}>
                      {loan.status === 'approved' 
                        ? (loan.repaid ? (language === 'en' ? 'Repaid' : 'Remboursé') : (language === 'en' ? 'Approved' : 'Approuvé'))
                        : (language === 'en' ? 'Declined' : 'Refusé')}
                    </span>
                    {loan.finalOutcome && (
                      <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${getOutcomeBadgeClasses(loan.finalOutcome)}`}>
                        {language === 'en' ? 'Outcome:' : 'Résultat :'} {formatOutcomeLabel(loan.finalOutcome, language)}
                      </span>
                    )}
                  </div>
                </div>
                </div>

                {showOutcomeActions && (
                  <div className="pl-11 flex flex-wrap items-center gap-2">
                    <span className="text-[10px] font-bold text-text-secondary uppercase tracking-wider">
                      {language === 'en' ? 'Mark outcome' : 'Marquer le résultat'}
                    </span>
                    {(['repaid_on_time', 'repaid_late', 'defaulted'] as LoanFinalOutcome[]).map((outcome) => (
                      <button
                        key={outcome}
                        type="button"
                        onClick={() => handleRecordOutcome(loan.id, outcome)}
                        disabled={outcomeLoading === loan.id}
                        className={`text-[10px] font-bold px-2.5 py-1 rounded-full border transition-all disabled:opacity-50 ${getOutcomeBadgeClasses(outcome)}`}
                      >
                        {formatOutcomeLabel(outcome, language)}
                      </button>
                    ))}
                    {outcomeSuccessId === loan.id && (
                      <span className="text-[10px] font-semibold text-emerald-700">
                        {language === 'en' ? 'Outcome recorded.' : 'Résultat enregistré.'}
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
