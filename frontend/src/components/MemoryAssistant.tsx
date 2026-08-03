import React, { useCallback, useEffect, useState } from 'react';

import { GlobalState, Language, LoanFinalOutcome } from '../types';

import { formatCurrency } from '../lib/currency';

import { useCurrency } from '../hooks/useCurrency';
import { useVoiceInput, VoiceMicButton } from '../hooks/useVoiceInput';

import { apiGet, apiPost } from '../lib/api';

import AssistantAnswerText from './AssistantAnswerText';
import {
  AddNotePanel,
  ConversationPanel,
  MemberHistoryPanel,
  MemberSidebar,
  type ChatMessage,
  type ConversationTurn,
  type MemberNote,
  type TimelineEvent,
} from './MemoryAssistantPanels';

import {
  AlertTriangle,
  Brain,
  Loader2,
  Search,
  Target,
} from 'lucide-react';

interface MemoryAssistantProps {
  state: GlobalState;
  language: Language;
}

interface AssistantAnswer {
  answer: string;
  flags: string[];
  citations: Array<{ id: string; tags: string[]; text: string }>;
}

interface PatternSearchResult {
  analysis: string;
  casesReferenced: Array<{ noteId: string; memberName: string }>;
}

type AssistantMode = 'member' | 'pattern';

const MAX_CONVERSATION_TURNS = 6;

interface OutcomeStatsSummary {
  flaggedBadRate: number | null;
  unflaggedBadRate: number | null;
  flaggedTotal: number;
  unflaggedTotal: number;
  flaggedBadCount: number;
  unflaggedBadCount: number;
}

interface OutcomeStatsResponse {
  breakdown: Array<{
    flagStatus: 'had_flag' | 'no_flag';
    finalOutcome: LoanFinalOutcome;
    count: number;
  }>;
  summary: OutcomeStatsSummary;
}

function formatPercent(rate: number | null): string {
  if (rate == null) return '—';
  return `${Math.round(rate * 100)}%`;
}

async function fetchMemberNotes(
  memberId: string,
  language: Language
): Promise<MemberNote[]> {
  const { ok, data, error } = await apiGet<MemberNote[]>(
    `/api/notes/${encodeURIComponent(memberId)}`,
    true,
    language
  );
  if (!ok) {
    throw new Error(error ?? 'Failed to load notes');
  }
  return data;
}

async function fetchMemberTimeline(
  memberId: string,
  language: Language
): Promise<TimelineEvent[]> {
  const { ok, data, error } = await apiGet<TimelineEvent[]>(
    `/api/timeline/${encodeURIComponent(memberId)}`,
    true,
    language
  );
  if (!ok) {
    throw new Error(error ?? 'Failed to load timeline');
  }
  return data;
}

async function getAssistantAnswer(
  memberId: string,
  question: string,
  language: Language,
  displayCurrency: string,
  conversationHistory: ConversationTurn[] = []
): Promise<AssistantAnswer> {
  const trimmedMemberId = memberId.trim();
  const trimmedQuestion = question.trim();
  if (!trimmedMemberId || !trimmedQuestion) {
    throw new Error(
      language === 'en'
        ? 'A member and question are required before asking the assistant.'
        : 'Un membre et une question sont requis avant d\'interroger l\'assistant.'
    );
  }

  const { ok, data, error } = await apiPost<AssistantAnswer>(
    '/api/ask-assistant',
    {
      memberId: trimmedMemberId,
      question: trimmedQuestion,
      displayCurrency,
      conversationHistory: conversationHistory.slice(-MAX_CONVERSATION_TURNS),
    },
    true,
    language,
    'general'
  );
  if (!ok) {
    throw new Error(error ?? 'Request failed');
  }
  return data;
}

async function runPatternSearch(
  question: string,
  language: Language,
  excludeMemberId?: string
): Promise<PatternSearchResult> {
  const trimmedQuestion = question.trim();
  if (!trimmedQuestion) {
    throw new Error(
      language === 'en'
        ? 'A question is required for pattern search.'
        : 'Une question est requise pour la recherche de tendances.'
    );
  }

  const body: { question: string; excludeMemberId?: string } = {
    question: trimmedQuestion,
  };
  if (excludeMemberId?.trim()) {
    body.excludeMemberId = excludeMemberId.trim();
  }

  const { ok, data, error } = await apiPost<PatternSearchResult>(
    '/api/pattern-search',
    body,
    true,
    language,
    'general'
  );
  if (!ok) {
    throw new Error(error ?? 'Request failed');
  }
  return data;
}

function mergeMemberIdsByPhone(users: GlobalState['users']): Record<string, string> {
  const map: Record<string, string> = {};
  for (const user of users) {
    const id = user.id?.trim();
    if (id) {
      map[user.phone] = id;
    }
  }
  return map;
}

export default function MemoryAssistant({ state, language }: MemoryAssistantProps) {
  const { users } = state;
  const { currency, cdfRate } = useCurrency();
  const formatAmount = useCallback(
    (val: number) => formatCurrency(val, currency, cdfRate),
    [currency, cdfRate]
  );

  const [selectedMemberPhone, setSelectedMemberPhone] = useState<string | null>(null);
  const [memberIdsByPhone, setMemberIdsByPhone] = useState<Record<string, string>>(() =>
    mergeMemberIdsByPhone(users)
  );
  const [conversationsByMember, setConversationsByMember] = useState<
    Record<string, ChatMessage[]>
  >({});
  const [loading, setLoading] = useState(false);
  const [memberNotes, setMemberNotes] = useState<MemberNote[]>([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [notesError, setNotesError] = useState<string | null>(null);
  const [memberTimeline, setMemberTimeline] = useState<TimelineEvent[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelineError, setTimelineError] = useState<string | null>(null);
  const [assistantMode, setAssistantMode] = useState<AssistantMode>('member');
  const [patternQuestion, setPatternQuestion] = useState('');
  const [excludeSelectedMember, setExcludeSelectedMember] = useState(true);
  const [patternLoading, setPatternLoading] = useState(false);
  const [patternResult, setPatternResult] = useState<PatternSearchResult | null>(null);
  const [patternError, setPatternError] = useState<string | null>(null);
  const [outcomeStats, setOutcomeStats] = useState<OutcomeStatsResponse | null>(null);
  const [outcomeStatsLoading, setOutcomeStatsLoading] = useState(true);
  const [outcomeStatsError, setOutcomeStatsError] = useState<string | null>(null);

  const selectedMember = users.find((u) => u.phone === selectedMemberPhone) ?? null;
  const selectedMemberId = selectedMemberPhone ? memberIdsByPhone[selectedMemberPhone] : undefined;
  const memberUsers = users.filter((u) => u.role === 'member');

  const handlePatternVoiceTranscript = useCallback((text: string) => {
    setPatternQuestion(text);
  }, []);

  const patternVoice = useVoiceInput(handlePatternVoiceTranscript, {
    language,
    disabled: patternLoading,
  });

  const currentMessages = selectedMemberId
    ? conversationsByMember[selectedMemberId] ?? []
    : [];

  const appendMessage = useCallback((memberId: string, message: ChatMessage) => {
    setConversationsByMember((prev) => ({
      ...prev,
      [memberId]: [...(prev[memberId] ?? []), message],
    }));
  }, []);

  useEffect(() => {
    setMemberIdsByPhone((prev) => ({ ...prev, ...mergeMemberIdsByPhone(users) }));
  }, [users]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { ok, data } = await apiGet<GlobalState>('/api/state', true, language);
      if (!cancelled && ok) {
        setMemberIdsByPhone((prev) => ({ ...prev, ...mergeMemberIdsByPhone(data.users) }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [language]);

  useEffect(() => {
    let cancelled = false;
    setOutcomeStatsLoading(true);
    setOutcomeStatsError(null);

    (async () => {
      const { ok, data, error } = await apiGet<OutcomeStatsResponse>(
        '/api/outcome-stats',
        true,
        language
      );
      if (cancelled) return;
      if (ok) {
        setOutcomeStats(data);
      } else {
        setOutcomeStats(null);
        setOutcomeStatsError(error ?? 'Failed to load outcome stats');
      }
      setOutcomeStatsLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [language]);

  useEffect(() => {
    if (selectedMemberPhone || users.length === 0) return;
    const member = users.find((u) => u.role === 'member') ?? users[0];
    if (member) {
      setSelectedMemberPhone(member.phone);
    }
  }, [users, selectedMemberPhone]);

  useEffect(() => {
    if (!selectedMemberId) {
      setMemberNotes([]);
      setNotesError(null);
      setNotesLoading(false);
      setMemberTimeline([]);
      setTimelineError(null);
      setTimelineLoading(false);
      return;
    }

    let cancelled = false;
    setNotesLoading(true);
    setNotesError(null);
    setTimelineLoading(true);
    setTimelineError(null);

    Promise.all([
      fetchMemberNotes(selectedMemberId, language),
      fetchMemberTimeline(selectedMemberId, language),
    ])
      .then(([notes, timeline]) => {
        if (!cancelled) {
          setMemberNotes(notes);
          setMemberTimeline(timeline);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setMemberNotes([]);
          setMemberTimeline([]);
          const message =
            err instanceof Error
              ? err.message
              : language === 'en'
                ? 'Failed to load member history.'
                : 'Impossible de charger l\'historique du membre.';
          setNotesError(message);
          setTimelineError(message);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setNotesLoading(false);
          setTimelineLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedMemberId, language]);

  const refreshMemberHistory = useCallback(async () => {
    if (!selectedMemberId) return;
    setNotesLoading(true);
    setTimelineLoading(true);
    setNotesError(null);
    setTimelineError(null);
    try {
      const [notes, timeline] = await Promise.all([
        fetchMemberNotes(selectedMemberId, language),
        fetchMemberTimeline(selectedMemberId, language),
      ]);
      setMemberNotes(notes);
      setMemberTimeline(timeline);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : language === 'en'
            ? 'Failed to load member history.'
            : 'Impossible de charger l\'historique du membre.';
      setNotesError(message);
      setTimelineError(message);
    } finally {
      setNotesLoading(false);
      setTimelineLoading(false);
    }
  }, [selectedMemberId, language]);

  const handleMemberChange = useCallback((phone: string) => {
    setSelectedMemberPhone(phone);
  }, []);

  const handleConversationSend = useCallback(
    async (question: string, history: ConversationTurn[]) => {
      if (!selectedMemberId) return;

      appendMessage(selectedMemberId, { role: 'user', content: question });
      setLoading(true);

      try {
        const answer = await getAssistantAnswer(
          selectedMemberId,
          question,
          language,
          currency,
          history
        );
        appendMessage(selectedMemberId, {
          role: 'assistant',
          content: answer.answer,
          answer,
        });
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : language === 'en'
              ? 'Failed to get an answer. Please try again.'
              : 'Impossible d\'obtenir une réponse. Veuillez réessayer.';
        appendMessage(selectedMemberId, {
          role: 'assistant',
          content: message,
          isError: true,
        });
      } finally {
        setLoading(false);
      }
    },
    [appendMessage, currency, language, selectedMemberId]
  );

  const handlePatternSearch = async () => {
    const trimmed = patternQuestion.trim();
    if (!trimmed || patternLoading) return;

    setPatternLoading(true);
    setPatternError(null);
    setPatternResult(null);

    try {
      const excludeMemberId =
        excludeSelectedMember && selectedMemberId ? selectedMemberId : undefined;
      const result = await runPatternSearch(trimmed, language, excludeMemberId);
      setPatternResult(result);
    } catch (err) {
      setPatternError(
        err instanceof Error
          ? err.message
          : language === 'en'
            ? 'Failed to run pattern search. Please try again.'
            : 'Impossible d\'effectuer la recherche de tendances. Veuillez réessayer.'
      );
    } finally {
      setPatternLoading(false);
    }
  };

  const handlePatternKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handlePatternSearch();
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-xl font-bold font-display text-oil-black tracking-tight flex items-center gap-2">
          <Brain size={22} className="text-primary stroke-[1.5]" />
          {language === 'en' ? 'Memory Assistant' : 'Assistant mémoire'}
        </h2>
        <p className="text-xs text-text-secondary mt-1">
          {language === 'en'
            ? 'Ask questions about a member using cooperative notes and audit history'
            : 'Posez des questions sur un membre à partir des notes coopératives et de l\'historique d\'audit'}
        </p>
      </div>

      <div className="bg-white border border-border-subtle rounded-xl shadow-subtle p-4 space-y-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-primary/10 text-primary rounded-lg flex items-center justify-center">
            <Target size={16} />
          </div>
          <h3 className="text-sm font-bold font-display text-oil-black">
            {language === 'en' ? 'Compliance flag accuracy' : 'Précision des signalements'}
          </h3>
        </div>
        {outcomeStatsLoading ? (
          <div className="flex justify-center py-4">
            <Loader2 size={18} className="animate-spin text-primary" />
          </div>
        ) : outcomeStatsError ? (
          <p className="text-xs text-red-700 flex items-center gap-2">
            <AlertTriangle size={14} />
            {outcomeStatsError}
          </p>
        ) : !outcomeStats || outcomeStats.summary.flaggedTotal + outcomeStats.summary.unflaggedTotal === 0 ? (
          <p className="text-xs text-text-secondary leading-relaxed">
            {language === 'en'
              ? 'No recorded loan outcomes yet — mark resolved loans to build accuracy stats.'
              : 'Aucun résultat de prêt enregistré — marquez les prêts résolus pour construire les statistiques.'}
          </p>
        ) : (
          <>
            <p className="text-xs text-oil-black leading-relaxed">
              {language === 'en' ? (
                <>
                  Of members who received a compliance flag,{' '}
                  <span className="font-bold text-primary">
                    {formatPercent(outcomeStats.summary.flaggedBadRate)}
                  </span>{' '}
                  had late payments or defaults, versus{' '}
                  <span className="font-bold text-primary">
                    {formatPercent(outcomeStats.summary.unflaggedBadRate)}
                  </span>{' '}
                  among members with no flag.
                </>
              ) : (
                <>
                  Parmi les membres signalés,{' '}
                  <span className="font-bold text-primary">
                    {formatPercent(outcomeStats.summary.flaggedBadRate)}
                  </span>{' '}
                  ont eu des retards ou défauts, contre{' '}
                  <span className="font-bold text-primary">
                    {formatPercent(outcomeStats.summary.unflaggedBadRate)}
                  </span>{' '}
                  sans signalement.
                </>
              )}
            </p>
            <p className="text-[10px] text-text-secondary">
              {language === 'en'
                ? `Flagged loans tracked: ${outcomeStats.summary.flaggedTotal} (${outcomeStats.summary.flaggedBadCount} bad) · Unflagged: ${outcomeStats.summary.unflaggedTotal} (${outcomeStats.summary.unflaggedBadCount} bad)`
                : `Prêts signalés : ${outcomeStats.summary.flaggedTotal} (${outcomeStats.summary.flaggedBadCount} mauvais) · Non signalés : ${outcomeStats.summary.unflaggedTotal} (${outcomeStats.summary.unflaggedBadCount} mauvais)`}
            </p>
          </>
        )}
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setAssistantMode('member')}
          className={`h-10 px-4 rounded-xl text-xs font-bold transition-all ${
            assistantMode === 'member'
              ? 'bg-primary text-white shadow-pressed'
              : 'bg-white border border-border-subtle text-text-secondary hover:text-oil-black'
          }`}
        >
          {language === 'en' ? 'Member Q&A' : 'Q&R membre'}
        </button>
        <button
          type="button"
          onClick={() => setAssistantMode('pattern')}
          className={`h-10 px-4 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
            assistantMode === 'pattern'
              ? 'bg-primary text-white shadow-pressed'
              : 'bg-white border border-border-subtle text-text-secondary hover:text-oil-black'
          }`}
        >
          <Search size={14} />
          {language === 'en' ? 'Compare across cooperative' : 'Comparer la coopérative'}
        </button>
      </div>

      {assistantMode === 'pattern' ? (
        <div className="bg-white border border-border-subtle rounded-xl shadow-subtle flex flex-col">
          <div className="px-4 py-3 border-b border-border-subtle">
            <h3 className="text-sm font-bold font-display text-oil-black">
              {language === 'en' ? 'Pattern Search' : 'Recherche de tendances'}
            </h3>
            <p className="text-[10px] text-text-secondary mt-0.5">
              {language === 'en'
                ? 'Find similar historical cases across all members and see how they resolved'
                : 'Trouvez des cas historiques similaires parmi tous les membres et voyez comment ils se sont résolus'}
            </p>
          </div>

          <div className="p-4 space-y-4">
            <div className="flex gap-2 items-start">
              <textarea
                value={patternQuestion}
                onChange={(e) => {
                  setPatternQuestion(e.target.value);
                  if (patternVoice.error) patternVoice.clearError();
                }}
                onKeyDown={handlePatternKeyDown}
                disabled={patternLoading || patternVoice.isTranscribing}
                rows={3}
                placeholder={
                  language === 'en'
                    ? 'e.g. Members who missed payments due to seasonal trade delays...'
                    : 'ex. Membres ayant manqué des paiements à cause de retards commerciaux saisonniers...'
                }
                className="flex-1 px-3 py-2 bg-background border border-border-subtle rounded-xl text-sm focus:outline-none focus:border-primary disabled:opacity-50 resize-none"
              />
              <VoiceMicButton
                voice={patternVoice}
                language={language}
                disabled={patternLoading}
              />
            </div>

            {patternVoice.error && (
              <p className="text-xs text-red-700 flex items-start gap-2">
                <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                {patternVoice.error}
              </p>
            )}

            {selectedMemberId && (
              <label className="flex items-center gap-2 text-xs text-text-secondary cursor-pointer">
                <input
                  type="checkbox"
                  checked={excludeSelectedMember}
                  onChange={(e) => setExcludeSelectedMember(e.target.checked)}
                  disabled={patternLoading}
                  className="rounded border-border-subtle text-primary focus:ring-primary/20"
                />
                <span>
                  {language === 'en'
                    ? `Exclude ${selectedMember?.name ?? 'selected member'} from matches`
                    : `Exclure ${selectedMember?.name ?? 'le membre sélectionné'} des correspondances`}
                </span>
              </label>
            )}

            {patternError && (
              <p className="text-xs text-red-700 flex items-start gap-2">
                <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                {patternError}
              </p>
            )}

            <button
              type="button"
              onClick={handlePatternSearch}
              disabled={!patternQuestion.trim() || patternLoading || patternVoice.isTranscribing}
              className="h-11 px-4 bg-primary hover:bg-primary-hover active:scale-[0.98] text-white font-semibold rounded-xl text-xs flex items-center justify-center gap-2 shadow-subtle disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {patternLoading ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Search size={16} />
              )}
              {language === 'en' ? 'Search patterns' : 'Rechercher des tendances'}
            </button>

            {patternLoading && (
              <div className="flex items-center gap-2 text-xs text-text-secondary py-4">
                <Loader2 size={16} className="animate-spin text-primary" />
                {language === 'en' ? 'Searching cooperative records...' : 'Recherche dans les dossiers coopératifs...'}
              </div>
            )}

            {patternResult && !patternLoading && (
              <div className="space-y-4 pt-2 border-t border-border-subtle">
                <div className="bg-background border border-border-subtle rounded-xl p-4">
                  <h4 className="text-xs font-bold text-oil-black uppercase tracking-wider mb-2">
                    {language === 'en' ? 'Analysis' : 'Analyse'}
                  </h4>
                  <AssistantAnswerText content={patternResult.analysis} />
                </div>

                {patternResult.casesReferenced.length > 0 && (
                  <div>
                    <h4 className="text-xs font-bold text-oil-black uppercase tracking-wider mb-2">
                      {language === 'en' ? 'Cases referenced' : 'Cas référencés'}
                    </h4>
                    <ul className="space-y-2">
                      {patternResult.casesReferenced.map((c) => (
                        <li
                          key={c.noteId}
                          className="flex items-center justify-between gap-2 bg-background border border-border-subtle rounded-xl px-3 py-2"
                        >
                          <span className="text-xs font-semibold text-oil-black truncate">
                            {c.memberName}
                          </span>
                          <span className="text-[10px] font-bold text-primary bg-primary/10 px-2.5 py-1 rounded-full shrink-0">
                            {c.noteId.slice(0, 8)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      ) : (
      <>
      <div className="lg:hidden">
        <label className="text-[10px] font-bold text-text-secondary uppercase tracking-wider block mb-2">
          {language === 'en' ? 'Select Member' : 'Sélectionner un membre'}
        </label>
        <select
          value={selectedMemberPhone ?? ''}
          onChange={(e) => handleMemberChange(e.target.value)}
          className="w-full h-11 px-3 bg-background border border-border-subtle rounded-xl text-sm focus:outline-none focus:border-primary"
        >
          {users.length === 0 ? (
            <option value="">{language === 'en' ? 'No members' : 'Aucun membre'}</option>
          ) : (
            users.map((member) => (
              <option key={member.phone} value={member.phone}>
                {member.name} ({member.phone})
              </option>
            ))
          )}
        </select>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <MemberSidebar
          users={users}
          selectedMemberPhone={selectedMemberPhone}
          language={language}
          formatAmount={formatAmount}
          onSelectMember={handleMemberChange}
        />

        <div className="lg:col-span-5 flex flex-col">
          <ConversationPanel
            memberId={selectedMemberId}
            memberName={selectedMember?.name ?? null}
            language={language}
            currency={currency}
            messages={currentMessages}
            loading={loading}
            onSend={handleConversationSend}
          />
        </div>

        <div className="lg:col-span-4 flex flex-col gap-4">
          {selectedMemberId && (
            <AddNotePanel
              memberId={selectedMemberId}
              language={language}
              onNoteAdded={refreshMemberHistory}
            />
          )}

          <MemberHistoryPanel
            memberId={selectedMemberId}
            language={language}
            memberUsers={memberUsers}
            selectedMemberPhone={selectedMemberPhone}
            memberIdsByPhone={memberIdsByPhone}
            memberNotes={memberNotes}
            memberTimeline={memberTimeline}
            notesLoading={notesLoading}
            timelineLoading={timelineLoading}
            notesError={notesError}
            timelineError={timelineError}
            onHistoryChanged={refreshMemberHistory}
          />
        </div>
      </div>
      </>
      )}
    </div>
  );
}
