import React, { useState } from 'react';
import { GlobalState, Language } from '../types';
import { apiPost } from '../lib/api';
import EmptyState from './EmptyState';
import UserNotice from './UserNotice';
import { Sparkles, Flag, RefreshCw, Layers, Search } from 'lucide-react';

interface OpportunityFeedProps {
  state: GlobalState;
  language: Language;
  onStateChange: (updated: GlobalState) => void;
}

export default function OpportunityFeed({ state, language, onStateChange }: OpportunityFeedProps) {
  const { opportunities } = state;
  const [refreshing, setRefreshing] = useState(false);
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  const handleRefreshFeed = async () => {
    setRefreshing(true);
    setRefreshError(null);
    try {
      const { ok, data, error } = await apiPost<GlobalState & { error?: string; code?: string }>(
        '/api/refresh-opportunities',
        undefined,
        true,
        language,
        'opportunity'
      );
      if (ok) {
        onStateChange(data);
      } else {
        setRefreshError(error || null);
      }
    } catch {
      setRefreshError(null);
    } finally {
      setRefreshing(false);
    }
  };

  const handleFlagForVote = async (id: string) => {
    try {
      const { ok, data } = await apiPost<GlobalState>('/api/flag-opportunity', { id });
      if (ok) {
        onStateChange(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleAskAiToAnalyze = async (id: string) => {
    setAnalyzingId(id);
    try {
      const { ok, data } = await apiPost<GlobalState>('/api/analyze-opportunity', { id });
      if (ok) {
        onStateChange(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setAnalyzingId(null);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold font-display text-oil-black tracking-tight flex items-center gap-2">
            <Layers className="text-primary stroke-[1.5]" size={22} />
            {language === 'en' ? 'Smart Opportunity Feed' : 'Flux d\'opportunités intelligent'}
          </h2>
          <p className="text-xs text-text-secondary">
            {language === 'en'
              ? 'Live data from regional finance sources, curated by Gemini AI for your cooperative'
              : 'Données en direct de sources financières régionales, sélectionnées par Gemini AI pour votre coopérative'}
          </p>
        </div>

        <button
          onClick={handleRefreshFeed}
          disabled={refreshing}
          className="h-11 bg-primary hover:bg-primary-hover disabled:bg-primary/75 text-white text-xs font-semibold px-5 rounded-xl shadow-subtle flex items-center justify-center gap-2 active:scale-[0.98] transition-all self-start sm:self-center"
        >
          <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
          {refreshing
            ? language === 'en'
              ? 'Fetching live data from regional finance sources…'
              : 'Récupération des données financières en cours…'
            : language === 'en'
              ? 'Scan Regional Sources'
              : 'Analyser les sources régionales'}
        </button>
      </div>

      {refreshError && <UserNotice message={refreshError} />}

      {opportunities.length === 0 ? (
        <EmptyState
          language={language}
          icon={<Search size={28} />}
          titleEn="Looking for new opportunities..."
          titleFr="Recherche de nouvelles opportunités..."
          descriptionEn="Your opportunity feed is empty. Refresh to discover savings and investment options curated for your cooperative."
          descriptionFr="Votre flux d'opportunités est vide. Actualisez pour découvrir des options d'épargne et d'investissement adaptées à votre coopérative."
          action={{
            labelEn: 'Refresh Opportunities',
            labelFr: 'Actualiser les opportunités',
            onClick: handleRefreshFeed,
          }}
        />
      ) : (
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {opportunities.map((opp) => (
          <div 
            key={opp.id} 
            className="bg-surface border border-border-subtle rounded-xl shadow-subtle flex flex-col justify-between overflow-hidden relative"
          >
            <div className="bg-primary/5 border-b border-border-subtle/50 px-5 py-4 flex justify-between items-center">
              <span className="text-[10px] font-bold text-primary uppercase bg-primary/10 px-2.5 py-1 rounded-full">
                {opp.category}
              </span>
              <div className="text-right">
                <span className="text-[10px] font-bold text-text-secondary uppercase tracking-wider block">
                  {language === 'en' ? 'Target Return' : 'Rendement cible'}
                </span>
                <span className="text-sm font-bold text-emerald-700 block mt-0.5">
                  {opp.returnRate}
                </span>
              </div>
            </div>

            <div className="p-5 flex-1 flex flex-col justify-between">
              <div>
                <div className="flex justify-between items-start mb-2">
                  <h3 className="text-base font-bold font-display text-oil-black">
                    {language === 'en' ? opp.titleEn : opp.titleFr}
                  </h3>
                  <span className="text-[10px] text-text-secondary font-medium">
                    {opp.foundAgo}
                  </span>
                </div>

                <div className="flex items-center gap-1 text-[10px] text-text-secondary font-bold uppercase tracking-wider mb-4">
                  <span>{language === 'en' ? 'Source' : 'Source'}:</span>
                  {opp.sourceUrl ? (
                    <a
                      href={opp.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline"
                    >
                      {opp.source}
                    </a>
                  ) : (
                    <span className="text-primary">{opp.source}</span>
                  )}
                </div>

                <p className="text-xs text-text-secondary leading-relaxed mb-4">
                  {language === 'en' ? opp.summaryEn : opp.summaryFr}
                </p>

                {opp.aiAnalysisEn ? (
                  <div className="bg-emerald-50/55 border border-emerald-100 rounded-xl p-4 mb-4 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-12 h-12 bg-emerald-500/5 rounded-bl-full pointer-events-none"></div>
                    <div className="flex items-center gap-1.5 text-emerald-800 font-bold text-[10px] uppercase tracking-wider mb-1.5">
                      <Sparkles size={13} className="fill-emerald-500 stroke-[1.5]" />
                      <span>{language === 'en' ? 'Gemini AI Suitability Analysis' : 'Analyse de pertinence Gemini AI'}</span>
                    </div>
                    <p className="text-xs text-emerald-900 leading-relaxed font-medium">
                      {language === 'en' ? opp.aiAnalysisEn : opp.aiAnalysisFr}
                    </p>
                  </div>
                ) : (
                  <button
                    onClick={() => handleAskAiToAnalyze(opp.id)}
                    disabled={analyzingId === opp.id}
                    className="w-full py-2.5 px-4 mb-4 border border-dashed border-primary/40 hover:border-primary bg-primary/5 hover:bg-primary/10 text-primary hover:text-primary-hover font-bold text-[11px] uppercase tracking-wider rounded-xl transition-all flex items-center justify-center gap-1.5"
                  >
                    <Sparkles size={12} className={analyzingId === opp.id ? 'animate-spin' : ''} />
                    {analyzingId === opp.id 
                      ? (language === 'en' ? 'Analyzing risk...' : 'Analyse des risques...') 
                      : (language === 'en' ? 'Ask Gemini AI to Analyze Risk' : 'Demander une analyse des risques à Gemini AI')}
                  </button>
                )}
              </div>

              <div className="border-t border-border-subtle/50 pt-4 flex gap-2">
                <button
                  onClick={() => handleFlagForVote(opp.id)}
                  className={`flex-1 h-10 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                    opp.isFlagged 
                      ? 'bg-accent/15 text-accent border border-accent/30' 
                      : 'border border-border-subtle hover:bg-background text-text-secondary hover:text-oil-black'
                  }`}
                >
                  <Flag size={14} className={opp.isFlagged ? 'fill-accent' : ''} />
                  <span>
                    {opp.isFlagged 
                      ? (language === 'en' ? 'Flagged for Vote' : 'Soumis au vote') 
                      : (language === 'en' ? 'Flag for Vote' : 'Proposer au vote')}
                  </span>
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
      )}
    </div>
  );
}
