import type { Language } from '../types';

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function getDaysRemaining(dueDateStr: string): number {
  const due = startOfDay(new Date(dueDateStr));
  const today = startOfDay(new Date());
  const diffMs = due.getTime() - today.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

export function getLoanTimelineProgress(disbursementDate: string, dueDate: string): number {
  const start = startOfDay(new Date(disbursementDate));
  const end = startOfDay(new Date(dueDate));
  const today = startOfDay(new Date());

  const totalMs = end.getTime() - start.getTime();
  if (totalMs <= 0) {
    return 100;
  }

  const elapsedMs = today.getTime() - start.getTime();
  return Math.min(100, Math.max(0, Math.round((elapsedMs / totalMs) * 100)));
}

export function formatTermMonths(months: 6 | 12, language: Language): string {
  if (language === 'fr') {
    return months === 6 ? '6 mois' : '12 mois';
  }
  return months === 6 ? '6 months' : '12 months';
}

export function getLoanDueDate(loanDate: string, termMonths: number, repaymentDueDate?: string): string {
  if (repaymentDueDate) {
    return repaymentDueDate;
  }
  const d = new Date(loanDate);
  d.setMonth(d.getMonth() + termMonths);
  return d.toISOString().split('T')[0];
}

export type LoanStatusLevel = 'onTrack' | 'approaching' | 'urgent' | 'overdue';

export function getLoanStatusLevel(daysLeft: number): LoanStatusLevel {
  if (daysLeft <= 0) return 'overdue';
  if (daysLeft <= 7) return 'urgent';
  if (daysLeft <= 14) return 'approaching';
  return 'onTrack';
}

export function getLoanStatusLabel(level: LoanStatusLevel, language: Language): string {
  const labels = {
    onTrack: { en: 'On track', fr: 'Dans les délais' },
    approaching: { en: 'Due soon', fr: 'Échéance proche' },
    urgent: { en: 'Due now', fr: 'Échéance imminente' },
    overdue: { en: 'Overdue', fr: 'En retard' },
  };
  return language === 'fr' ? labels[level].fr : labels[level].en;
}

export function getLoanStatusClasses(level: LoanStatusLevel): string {
  switch (level) {
    case 'onTrack':
      return 'bg-primary/10 text-primary border-primary/20';
    case 'approaching':
      return 'bg-amber-50 text-warning border-amber-200';
    case 'urgent':
    case 'overdue':
      return 'bg-red-50 text-error border-red-200';
  }
}
