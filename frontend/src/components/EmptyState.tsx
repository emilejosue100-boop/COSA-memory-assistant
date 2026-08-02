import React from 'react';
import type { Language } from '../types';

interface EmptyStateAction {
  labelEn: string;
  labelFr: string;
  onClick: () => void;
}

interface EmptyStateProps {
  icon: React.ReactNode;
  titleEn: string;
  titleFr: string;
  descriptionEn: string;
  descriptionFr: string;
  language: Language;
  action?: EmptyStateAction;
  compact?: boolean;
}

export default function EmptyState({
  icon,
  titleEn,
  titleFr,
  descriptionEn,
  descriptionFr,
  language,
  action,
  compact = false,
}: EmptyStateProps) {
  return (
    <div
      className={`bg-surface border border-border-subtle rounded-xl text-center ${
        compact ? 'p-6' : 'p-10'
      } shadow-subtle`}
    >
      <div
        className={`mx-auto mb-4 rounded-2xl bg-primary/10 text-primary flex items-center justify-center ${
          compact ? 'w-12 h-12' : 'w-16 h-16'
        }`}
      >
        {icon}
      </div>
      <h3 className={`font-bold font-display text-oil-black ${compact ? 'text-sm' : 'text-base'}`}>
        {language === 'en' ? titleEn : titleFr}
      </h3>
      <p className={`text-text-secondary mt-2 max-w-sm mx-auto leading-relaxed ${compact ? 'text-xs' : 'text-sm'}`}>
        {language === 'en' ? descriptionEn : descriptionFr}
      </p>
      {action && (
        <button
          onClick={action.onClick}
          className="mt-5 h-11 px-5 bg-primary hover:bg-primary-hover text-white text-xs font-semibold rounded-xl shadow-subtle transition-all"
        >
          {language === 'en' ? action.labelEn : action.labelFr}
        </button>
      )}
    </div>
  );
}
