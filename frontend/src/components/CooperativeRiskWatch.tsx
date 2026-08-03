import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, Radar, RefreshCw, ShieldAlert } from 'lucide-react';
import type { Language } from '../types';
import { apiGet, apiPost } from '../lib/api';
import AssistantAnswerText from './AssistantAnswerText';

interface RiskScanRecord {
  id: string;
  scanResult: string;
  createdAt: string;
  reviewed: boolean;
  reviewedBy: string | null;
  reviewedAt: string | null;
}

interface CooperativeRiskWatchProps {
  language: Language;
}

function formatScanDate(iso: string, language: Language): string {
  try {
    return new Date(iso).toLocaleString(language === 'en' ? 'en-US' : 'fr-FR', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return iso;
  }
}

export default function CooperativeRiskWatch({ language }: CooperativeRiskWatchProps) {
  const [latest, setLatest] = useState<RiskScanRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchLatest = useCallback(async () => {
    setError(null);
    const { ok, data, error: fetchError } = await apiGet<RiskScanRecord | null>(
      '/api/risk-scan/latest',
      true,
      language,
      'general'
    );

    if (ok) {
      setLatest(data);
    } else {
      setError(fetchError ?? null);
    }
    setLoading(false);
  }, [language]);

  useEffect(() => {
    fetchLatest();
  }, [fetchLatest]);

  const handleRunScan = async () => {
    setScanning(true);
    setError(null);

    const { ok, data, error: scanError } = await apiPost<{ result: string; id: string }>(
      '/api/risk-scan',
      {},
      true,
      language,
      'general'
    );

    if (ok) {
      setLatest({
        id: data.id,
        scanResult: data.result,
        createdAt: new Date().toISOString(),
        reviewed: false,
        reviewedBy: null,
        reviewedAt: null,
      });
      await fetchLatest();
    } else {
      setError(scanError ?? null);
    }
    setScanning(false);
  };

  const handleMarkReviewed = async () => {
    if (!latest?.id || latest.reviewed) return;

    setReviewing(true);
    setError(null);

    const { ok, error: reviewError } = await apiPost<{ success: boolean }>(
      `/api/risk-scan/${latest.id}/reviewed`,
      {},
      true,
      language,
      'general'
    );

    if (ok) {
      await fetchLatest();
    } else {
      setError(reviewError ?? null);
    }
    setReviewing(false);
  };

  return (
    <div className="bg-background border border-border-subtle rounded-xl p-5 shadow-subtle">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 bg-primary/10 text-primary rounded-xl flex items-center justify-center flex-shrink-0">
            <Radar size={20} className="stroke-[1.5]" />
          </div>
          <div>
            <h3 className="text-sm font-bold font-display text-oil-black">
              {language === 'en' ? 'Cooperative Risk Watch' : 'Veille des risques coopératifs'}
            </h3>
            <p className="text-[11px] text-text-secondary mt-0.5 leading-relaxed max-w-xl">
              {language === 'en'
                ? 'Proactive scan across all members for unresolved compliance flags and repeated broken repayment promises not reviewed in 60 days.'
                : 'Analyse proactive de tous les membres pour les signalements non résolus et les promesses de remboursement non tenues non examinées depuis 60 jours.'}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleRunScan}
          disabled={scanning}
          className="h-10 px-4 bg-primary hover:bg-primary-hover active:scale-[0.98] text-white font-semibold rounded-xl text-xs flex items-center justify-center gap-2 transition-all shadow-subtle disabled:opacity-60 flex-shrink-0"
        >
          {scanning ? (
            <>
              <Loader2 size={14} className="animate-spin" />
              {language === 'en' ? 'Scanning…' : 'Analyse…'}
            </>
          ) : (
            <>
              <RefreshCw size={14} />
              {language === 'en' ? 'Run new scan' : 'Lancer une analyse'}
            </>
          )}
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2">
          <AlertTriangle size={14} className="text-error mt-0.5 flex-shrink-0" />
          <p className="text-xs text-error leading-relaxed">{error}</p>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 size={20} className="animate-spin text-primary" />
        </div>
      ) : !latest ? (
        <div className="bg-surface border border-dashed border-border-subtle rounded-xl p-6 text-center">
          <ShieldAlert size={24} className="mx-auto text-accent mb-2" />
          <p className="text-xs text-text-secondary leading-relaxed">
            {language === 'en'
              ? 'No risk scan has been run yet. Run a scan to surface members who may need officer review.'
              : 'Aucune analyse n\'a encore été effectuée. Lancez une analyse pour identifier les membres à examiner.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-bold text-text-secondary uppercase tracking-wider">
              {language === 'en' ? 'Latest scan' : 'Dernière analyse'}
            </span>
            <span className="text-[10px] text-text-secondary">
              {formatScanDate(latest.createdAt, language)}
            </span>
            {latest.reviewed ? (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                <CheckCircle2 size={10} />
                {language === 'en'
                  ? `Reviewed${latest.reviewedBy ? ` by ${latest.reviewedBy}` : ''}`
                  : `Examiné${latest.reviewedBy ? ` par ${latest.reviewedBy}` : ''}`}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-accent bg-accent/20 px-2 py-0.5 rounded-full">
                <AlertTriangle size={10} />
                {language === 'en' ? 'Awaiting review' : 'En attente d\'examen'}
              </span>
            )}
          </div>

          <div className="bg-surface border border-border-subtle rounded-xl p-4 max-h-64 overflow-y-auto">
            <AssistantAnswerText content={latest.scanResult} className="text-xs" />
          </div>

          {!latest.reviewed && (
            <button
              type="button"
              onClick={handleMarkReviewed}
              disabled={reviewing}
              className="h-10 px-4 border border-accent/40 bg-accent/10 hover:bg-accent/20 active:scale-[0.98] text-oil-black font-semibold rounded-xl text-xs flex items-center justify-center gap-2 transition-all disabled:opacity-60"
            >
              {reviewing ? (
                <>
                  <Loader2 size={14} className="animate-spin text-accent" />
                  {language === 'en' ? 'Saving…' : 'Enregistrement…'}
                </>
              ) : (
                <>
                  <CheckCircle2 size={14} className="text-accent" />
                  {language === 'en' ? 'Mark as reviewed' : 'Marquer comme examiné'}
                </>
              )}
            </button>
          )}
        </div>
      )}

      <p className="text-[10px] text-text-secondary mt-4 leading-relaxed border-t border-border-subtle/50 pt-3">
        {language === 'en'
          ? 'Read-only cooperative scan via MCP tools. Requires ENABLE_MCP_TOOL_USE on the server. Scheduled daily scans can be added as a next step.'
          : 'Analyse coopérative en lecture seule via outils MCP. Nécessite ENABLE_MCP_TOOL_USE sur le serveur. Des analyses planifiées quotidiennes peuvent être ajoutées ultérieurement.'}
      </p>
    </div>
  );
}
