import React, { useEffect, useRef, useState } from 'react';

import { GlobalState, Language, LoanFinalOutcome } from '../types';

import { formatCurrency } from '../lib/currency';

import { useCurrency } from '../hooks/useCurrency';
import { useVoiceInput, VoiceMicButton } from '../hooks/useVoiceInput';

import { apiGet, apiPost } from '../lib/api';

import EmptyState from './EmptyState';
import AssistantAnswerText from './AssistantAnswerText';

import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Ban,
  Brain,
  Check,
  FileText,
  Loader2,
  Lock,
  Search,
  Send,
  Target,
  Users,
} from 'lucide-react';

interface MemoryAssistantProps {
  state: GlobalState;
  language: Language;
}

interface AssistantCitation {
  id: string;
  tags: string[];
  text: string;
}

interface AssistantAnswer {
  answer: string;
  flags: string[];
  citations: AssistantCitation[];
}

interface PatternSearchResult {
  analysis: string;
  casesReferenced: Array<{ noteId: string; memberName: string }>;
}

type AssistantMode = 'member' | 'pattern';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  answer?: AssistantAnswer;
  isError?: boolean;
}

interface ConversationTurn {
  role: 'user' | 'assistant';
  content: string;
}

const MAX_CONVERSATION_TURNS = 6;

function buildConversationHistory(messages: ChatMessage[]): ConversationTurn[] {
  return messages
    .filter((message) => !message.isError && message.content.trim())
    .slice(-MAX_CONVERSATION_TURNS)
    .map((message) => ({
      role: message.role,
      content: message.content.trim(),
    }));
}

interface MemberNote {
  id: string;
  createdAt: string;
  createdBy: string;
  source: string;
  rawText: string;
  tags: string[];
  complianceFlag: boolean;
  complianceSummary: string | null;
  voided: boolean;
  voidReason: string | null;
  voidedBy: string | null;
  voidedAt: string | null;
  correctedNoteId: string | null;
}

type TimelineEventType = 'note' | 'deposit' | 'loan_requested' | 'loan_repaid';

interface TimelineEvent {
  id: string;
  memberId: string;
  eventType: TimelineEventType;
  eventTime: string;
  description: string;
  tags: string[];
  complianceFlag: boolean;
}

type HistoryPanel = 'notes' | 'timeline';

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

function formatNoteTimestamp(iso: string, language: Language): string {
  const date = new Date(iso);
  return date.toLocaleString(language === 'en' ? 'en-US' : 'fr-FR', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function isMemberReportedNote(note: MemberNote): boolean {
  return (
    note.source === 'member_report' ||
    note.source === 'member_payment_update' ||
    note.tags.some((tag) => tag.toLowerCase() === '#member-reported')
  );
}

function isPaymentUpdateNote(note: MemberNote): boolean {
  return note.source === 'member_payment_update';
}

function parseNoteTags(input: string): string[] {
  return input
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean)
    .map((tag) => (tag.startsWith('#') ? tag : `#${tag}`));
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

function formatTimelineTimestamp(iso: string, language: Language): string {
  const date = new Date(iso);
  return date.toLocaleString(language === 'en' ? 'en-US' : 'fr-FR', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getTimelineEventMeta(
  eventType: TimelineEventType,
  language: Language
): { label: string; icon: React.ReactNode; badgeClass: string; borderClass: string } {
  switch (eventType) {
    case 'deposit':
      return {
        label: language === 'en' ? 'Deposit' : 'Dépôt',
        icon: <ArrowUpRight size={14} className="flex-shrink-0" />,
        badgeClass: 'text-primary bg-primary/10',
        borderClass: 'border-l-primary',
      };
    case 'loan_requested':
      return {
        label: language === 'en' ? 'Loan requested' : 'Prêt demandé',
        icon: <ArrowDownRight size={14} className="flex-shrink-0" />,
        badgeClass: 'text-amber-800 bg-amber-100',
        borderClass: 'border-l-amber-500',
      };
    case 'loan_repaid':
      return {
        label: language === 'en' ? 'Loan repaid' : 'Prêt remboursé',
        icon: <Check size={14} className="flex-shrink-0" />,
        badgeClass: 'text-emerald-700 bg-emerald-100',
        borderClass: 'border-l-emerald-600',
      };
    case 'note':
    default:
      return {
        label: language === 'en' ? 'Note' : 'Note',
        icon: <FileText size={14} className="flex-shrink-0" />,
        badgeClass: 'text-accent bg-accent/15',
        borderClass: 'border-l-accent',
      };
  }
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
  const formatAmount = (val: number) => formatCurrency(val, currency, cdfRate);

  const [selectedMemberPhone, setSelectedMemberPhone] = useState<string | null>(null);
  const [memberIdsByPhone, setMemberIdsByPhone] = useState<Record<string, string>>(() =>
    mergeMemberIdsByPhone(users)
  );
  const [conversationsByMember, setConversationsByMember] = useState<
    Record<string, ChatMessage[]>
  >({});
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [memberNotes, setMemberNotes] = useState<MemberNote[]>([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [notesError, setNotesError] = useState<string | null>(null);
  const [memberTimeline, setMemberTimeline] = useState<TimelineEvent[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelineError, setTimelineError] = useState<string | null>(null);
  const [historyPanel, setHistoryPanel] = useState<HistoryPanel>('notes');
  const [noteText, setNoteText] = useState('');
  const [noteTagsInput, setNoteTagsInput] = useState('');
  const [addingNote, setAddingNote] = useState(false);
  const [addNoteSuccess, setAddNoteSuccess] = useState(false);
  const [addNoteError, setAddNoteError] = useState<string | null>(null);
  const [voidingNoteId, setVoidingNoteId] = useState<string | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [voidCreateCorrection, setVoidCreateCorrection] = useState(false);
  const [voidCorrectMemberPhone, setVoidCorrectMemberPhone] = useState<string | null>(null);
  const [voidCorrectText, setVoidCorrectText] = useState('');
  const [voidCorrectTagsInput, setVoidCorrectTagsInput] = useState('');
  const [voidingNote, setVoidingNote] = useState(false);
  const [voidError, setVoidError] = useState<string | null>(null);
  const [assistantMode, setAssistantMode] = useState<AssistantMode>('member');
  const [patternQuestion, setPatternQuestion] = useState('');
  const [excludeSelectedMember, setExcludeSelectedMember] = useState(true);
  const [patternLoading, setPatternLoading] = useState(false);
  const [patternResult, setPatternResult] = useState<PatternSearchResult | null>(null);
  const [patternError, setPatternError] = useState<string | null>(null);
  const [outcomeStats, setOutcomeStats] = useState<OutcomeStatsResponse | null>(null);
  const [outcomeStatsLoading, setOutcomeStatsLoading] = useState(true);
  const [outcomeStatsError, setOutcomeStatsError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const selectedMember = users.find((u) => u.phone === selectedMemberPhone) ?? null;
  const selectedMemberId = selectedMemberPhone ? memberIdsByPhone[selectedMemberPhone] : undefined;
  const memberUsers = users.filter((u) => u.role === 'member');

  const memberVoice = useVoiceInput((text) => setInputValue(text), {
    language,
    disabled: !selectedMemberId || loading,
  });

  const patternVoice = useVoiceInput((text) => setPatternQuestion(text), {
    language,
    disabled: patternLoading,
  });

  const currentMessages = selectedMemberId
    ? conversationsByMember[selectedMemberId] ?? []
    : [];
  const canAsk = Boolean(selectedMemberId && inputValue.trim() && !loading);

  const appendMessage = (memberId: string, message: ChatMessage) => {
    setConversationsByMember((prev) => ({
      ...prev,
      [memberId]: [...(prev[memberId] ?? []), message],
    }));
  };

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
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [currentMessages, loading, selectedMemberId]);

  useEffect(() => {
    if (!addNoteSuccess) return;
    const timer = window.setTimeout(() => setAddNoteSuccess(false), 3000);
    return () => window.clearTimeout(timer);
  }, [addNoteSuccess]);

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

  const refreshMemberHistory = async () => {
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
  };

  const refreshMemberNotes = async () => {
    await refreshMemberHistory();
  };

  const handleMemberChange = (phone: string) => {
    setSelectedMemberPhone(phone);
    setInputValue('');
    setNoteText('');
    setNoteTagsInput('');
    setAddNoteError(null);
    setAddNoteSuccess(false);
    resetVoidForm();
  };

  const handleAddNote = async () => {
    const trimmedText = noteText.trim();
    if (!selectedMemberId || !trimmedText || addingNote) return;

    setAddingNote(true);
    setAddNoteError(null);
    setAddNoteSuccess(false);

    try {
      const tags = parseNoteTags(noteTagsInput);
      const { ok, error } = await apiPost(
        '/api/add-note',
        {
          memberId: selectedMemberId,
          rawText: trimmedText,
          tags,
          source: 'manual',
        },
        true,
        language
      );
      if (!ok) {
        throw new Error(error ?? 'Failed to add note');
      }
      setNoteText('');
      setNoteTagsInput('');
      setAddNoteSuccess(true);
      await refreshMemberNotes();
    } catch (err) {
      setAddNoteError(
        err instanceof Error
          ? err.message
          : language === 'en'
            ? 'Failed to add note. Please try again.'
            : 'Impossible d\'ajouter la note. Veuillez réessayer.'
      );
    } finally {
      setAddingNote(false);
    }
  };

  const resetVoidForm = () => {
    setVoidingNoteId(null);
    setVoidReason('');
    setVoidCreateCorrection(false);
    setVoidCorrectMemberPhone(null);
    setVoidCorrectText('');
    setVoidCorrectTagsInput('');
    setVoidError(null);
  };

  const openVoidForm = (note: MemberNote) => {
    setVoidingNoteId(note.id);
    setVoidReason('');
    setVoidCreateCorrection(false);
    setVoidCorrectMemberPhone(selectedMemberPhone);
    setVoidCorrectText(note.rawText);
    setVoidCorrectTagsInput(note.tags.join(', '));
    setVoidError(null);
  };

  const scrollToNote = (noteId: string) => {
    const el = document.getElementById(`note-${noteId}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };

  const handleVoidNote = async () => {
    if (!voidingNoteId || !voidReason.trim() || voidingNote) return;

    setVoidingNote(true);
    setVoidError(null);

    try {
      const correctMemberId =
        voidCreateCorrection && voidCorrectMemberPhone
          ? memberIdsByPhone[voidCorrectMemberPhone]
          : undefined;

      const payload: Record<string, unknown> = {
        reason: voidReason.trim(),
      };

      if (voidCreateCorrection) {
        const trimmedText = voidCorrectText.trim();
        if (!correctMemberId || !trimmedText) {
          throw new Error(
            language === 'en'
              ? 'Select a member and enter correction text to create a corrected note.'
              : 'Sélectionnez un membre et saisissez le texte corrigé.'
          );
        }
        payload.correctMemberId = correctMemberId;
        payload.correctText = trimmedText;
        payload.correctTags = parseNoteTags(voidCorrectTagsInput);
      }

      const { ok, error } = await apiPost(
        `/api/notes/${encodeURIComponent(voidingNoteId)}/void-and-correct`,
        payload,
        true,
        language
      );
      if (!ok) {
        throw new Error(error ?? 'Failed to void note');
      }

      resetVoidForm();
      await refreshMemberHistory();
    } catch (err) {
      setVoidError(
        err instanceof Error
          ? err.message
          : language === 'en'
            ? 'Failed to void note. Please try again.'
            : 'Impossible d\'annuler la note. Veuillez réessayer.'
      );
    } finally {
      setVoidingNote(false);
    }
  };

  const handleSend = async () => {
    const trimmed = inputValue.trim();
    if (!trimmed || !selectedMember || !selectedMemberId || loading) return;

    setInputValue('');
    const recentHistory = buildConversationHistory(
      conversationsByMember[selectedMemberId] ?? []
    );
    appendMessage(selectedMemberId, { role: 'user', content: trimmed });
    setLoading(true);

    try {
      const answer = await getAssistantAnswer(
        selectedMemberId,
        trimmed,
        language,
        currency,
        recentHistory
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
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

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
        <div className="hidden lg:flex lg:col-span-3 flex-col">
          <div className="bg-white border border-border-subtle rounded-xl shadow-subtle flex flex-col max-h-[calc(100vh-12rem)]">
            <div className="px-4 py-3 border-b border-border-subtle">
              <h3 className="text-sm font-bold font-display text-oil-black">
                {language === 'en' ? 'Members' : 'Membres'}
              </h3>
            </div>
            <div className="overflow-y-auto flex-1 divide-y divide-border-subtle/50">
              {users.length === 0 ? (
                <div className="p-4">
                  <EmptyState
                    compact
                    language={language}
                    icon={<Users size={24} />}
                    titleEn="No members registered"
                    titleFr="Aucun membre inscrit"
                    descriptionEn="Register members from the Admin Dashboard to use the Memory Assistant."
                    descriptionFr="Inscrivez des membres depuis le tableau de bord admin pour utiliser l'assistant mémoire."
                  />
                </div>
              ) : (
                users.map((member) => {
                  const isSelected = member.phone === selectedMemberPhone;
                  return (
                    <button
                      key={member.phone}
                      type="button"
                      onClick={() => handleMemberChange(member.phone)}
                      className={`w-full text-left px-4 py-3 transition-all flex items-center gap-3 ${
                        isSelected
                          ? 'bg-primary/5 border-l-2 border-l-primary'
                          : 'hover:bg-background/40 border-l-2 border-l-transparent'
                      }`}
                    >
                      <img
                        src={member.profileImage}
                        alt={member.name}
                        className="w-9 h-9 rounded-full object-cover border border-border-subtle shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <h4 className="text-sm font-bold text-oil-black truncate">{member.name}</h4>
                        <p className="text-[10px] text-text-secondary truncate">{member.phone}</p>
                        <p className="text-[10px] font-semibold text-emerald-700 mt-0.5">
                          {formatAmount(member.savingsBalance)}
                        </p>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>

        <div className="lg:col-span-5 flex flex-col">
          <div className="bg-white border border-border-subtle rounded-xl shadow-subtle flex flex-col min-h-[420px]">
            <div className="px-4 py-3 border-b border-border-subtle">
              <h3 className="text-sm font-bold font-display text-oil-black">
                {language === 'en' ? 'Conversation' : 'Conversation'}
              </h3>
              {selectedMember && (
                <p className="text-[10px] text-text-secondary mt-0.5">
                  {language === 'en' ? 'Context:' : 'Contexte :'} {selectedMember.name}
                  {!selectedMemberId && (
                    <span className="block text-amber-700 mt-1">
                      {language === 'en'
                        ? 'Member profile is still loading. Please wait or re-select the member.'
                        : 'Le profil du membre se charge encore. Veuillez patienter ou resélectionner le membre.'}
                    </span>
                  )}
                </p>
              )}
            </div>

            <div className="flex-1 min-h-[300px] max-h-[50vh] overflow-y-auto p-4 space-y-4">
              {currentMessages.length === 0 && !loading && (
                <p className="text-xs text-text-secondary text-center py-8 px-4">
                  {language === 'en'
                    ? "Ask about this member's loan history, repayment behavior, or collateral..."
                    : 'Interrogez l\'historique de prêt, le comportement de remboursement ou les garanties de ce membre...'}
                </p>
              )}

              {currentMessages.map((msg, idx) => (
                <div
                  key={`${selectedMemberId ?? 'none'}-${idx}`}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  {msg.role === 'user' ? (
                    <div className="bg-primary text-white rounded-xl px-4 py-2 text-sm max-w-[85%]">
                      {msg.content}
                    </div>
                  ) : (
                    <div className="max-w-[95%] space-y-2">
                      {msg.isError ? (
                        <div className="p-3 border border-red-200 bg-red-50 text-red-900 text-xs rounded-xl font-medium flex items-start gap-2">
                          <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                          <span>{msg.content}</span>
                        </div>
                      ) : (
                        <>
                          {msg.answer && msg.answer.flags.length > 0 && (
                            <div className="p-3 border border-amber-200 bg-amber-50 text-amber-900 text-xs rounded-xl font-medium flex items-start gap-2">
                              <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                              <div className="space-y-1">
                                {msg.answer.flags.map((flag, flagIdx) => (
                                  <p key={flagIdx}>{flag}</p>
                                ))}
                              </div>
                            </div>
                          )}
                          <div className="bg-background border border-border-subtle rounded-xl p-4">
                            <AssistantAnswerText content={msg.content} />
                            {msg.answer && msg.answer.citations.length > 0 && (
                              <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-border-subtle/50">
                                {msg.answer.citations.map((cite) => (
                                  <span
                                    key={cite.id}
                                    className="text-[10px] font-bold text-primary bg-primary/10 px-2.5 py-1 rounded-full"
                                  >
                                    {cite.id}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              ))}

              {loading && (
                <div className="flex justify-start">
                  <div className="bg-background border border-border-subtle rounded-xl px-4 py-3 flex items-center gap-2 text-xs text-text-secondary">
                    <Loader2 size={16} className="animate-spin text-primary" />
                    {language === 'en' ? 'Thinking...' : 'Réflexion en cours...'}
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            <div className="p-4 border-t border-border-subtle flex gap-2">
              <input
                type="text"
                value={inputValue}
                onChange={(e) => {
                  setInputValue(e.target.value);
                  if (memberVoice.error) memberVoice.clearError();
                }}
                onKeyDown={handleKeyDown}
                disabled={!selectedMemberId || loading || memberVoice.isTranscribing}
                placeholder={
                  language === 'en' ? 'Type your question...' : 'Saisissez votre question...'
                }
                className="flex-1 h-11 px-3 bg-background border border-border-subtle rounded-xl text-sm focus:outline-none focus:border-primary disabled:opacity-50"
              />
              <VoiceMicButton
                voice={memberVoice}
                language={language}
                disabled={!selectedMemberId || loading}
              />
              <button
                type="button"
                onClick={handleSend}
                disabled={!canAsk || memberVoice.isTranscribing}
                className="h-11 px-4 bg-primary hover:bg-primary-hover active:scale-[0.98] text-white font-semibold rounded-xl text-xs flex items-center justify-center gap-2 shadow-subtle disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Send size={16} />
                )}
                {language === 'en' ? 'Send' : 'Envoyer'}
              </button>
            </div>
            {memberVoice.error && (
              <p className="px-4 pb-4 -mt-2 text-xs text-red-700 flex items-start gap-2">
                <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                {memberVoice.error}
              </p>
            )}
          </div>
        </div>

        <div className="lg:col-span-4 flex flex-col gap-4">
          {selectedMemberId && (
            <div className="bg-white border border-border-subtle rounded-xl shadow-subtle flex flex-col">
              <div className="px-4 py-3 border-b border-border-subtle">
                <h3 className="text-sm font-bold font-display text-oil-black">
                  {language === 'en' ? 'Add a Note' : 'Ajouter une note'}
                </h3>
              </div>
              <div className="p-4 space-y-3">
                <textarea
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  disabled={addingNote}
                  rows={3}
                  placeholder={
                    language === 'en'
                      ? 'Enter note text for this member...'
                      : 'Saisissez une note pour ce membre...'
                  }
                  className="w-full px-3 py-2 bg-background border border-border-subtle rounded-xl text-sm focus:outline-none focus:border-primary disabled:opacity-50 resize-none"
                />
                <input
                  type="text"
                  value={noteTagsInput}
                  onChange={(e) => setNoteTagsInput(e.target.value)}
                  disabled={addingNote}
                  placeholder={
                    language === 'en'
                      ? 'Tags: #repayment, #collateral'
                      : 'Tags : #remboursement, #garantie'
                  }
                  className="w-full h-11 px-3 bg-background border border-border-subtle rounded-xl text-sm focus:outline-none focus:border-primary disabled:opacity-50"
                />
                {addNoteError && (
                  <p className="text-xs text-red-700 flex items-start gap-2">
                    <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                    {addNoteError}
                  </p>
                )}
                {addNoteSuccess && (
                  <p className="text-xs text-emerald-700 font-medium">
                    {language === 'en' ? 'Note added successfully.' : 'Note ajoutée avec succès.'}
                  </p>
                )}
                <button
                  type="button"
                  onClick={handleAddNote}
                  disabled={!noteText.trim() || addingNote}
                  className="h-11 px-4 bg-primary hover:bg-primary-hover active:scale-[0.98] text-white font-semibold rounded-xl text-xs flex items-center justify-center gap-2 shadow-subtle disabled:opacity-50 disabled:cursor-not-allowed w-full"
                >
                  {addingNote ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : null}
                  {language === 'en' ? 'Add Note' : 'Ajouter la note'}
                </button>
              </div>
            </div>
          )}

          <div className="bg-white border border-border-subtle rounded-xl shadow-subtle flex flex-col min-h-[420px] flex-1">
            <div className="px-4 py-3 border-b border-border-subtle space-y-3">
              <div>
                <h3 className="text-sm font-bold font-display text-oil-black">
                  {historyPanel === 'notes'
                    ? language === 'en'
                      ? 'Notes History'
                      : 'Historique des notes'
                    : language === 'en'
                      ? 'Member Timeline'
                      : 'Chronologie du membre'}
                </h3>
                <p className="text-[10px] text-text-secondary mt-0.5">
                  {historyPanel === 'notes'
                    ? language === 'en'
                      ? 'Officer notes for selected member'
                      : 'Notes d\'agent pour le membre sélectionné'
                    : language === 'en'
                      ? 'Unified chronological activity for selected member'
                      : 'Activité chronologique unifiée du membre sélectionné'}
                </p>
              </div>
              <div className="flex gap-1 p-1 bg-background border border-border-subtle rounded-xl">
                <button
                  type="button"
                  onClick={() => setHistoryPanel('notes')}
                  className={`flex-1 h-9 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${
                    historyPanel === 'notes'
                      ? 'bg-primary text-white shadow-subtle'
                      : 'text-text-secondary hover:text-oil-black'
                  }`}
                >
                  {language === 'en' ? 'Notes' : 'Notes'}
                </button>
                <button
                  type="button"
                  onClick={() => setHistoryPanel('timeline')}
                  className={`flex-1 h-9 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${
                    historyPanel === 'timeline'
                      ? 'bg-primary text-white shadow-subtle'
                      : 'text-text-secondary hover:text-oil-black'
                  }`}
                >
                  {language === 'en' ? 'Timeline' : 'Chronologie'}
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4 max-h-[50vh] lg:max-h-none">
              {!selectedMemberId ? (
                <p className="text-xs text-text-secondary text-center py-8">
                  {language === 'en'
                    ? historyPanel === 'notes'
                      ? 'Select a member to view their notes.'
                      : 'Select a member to view their timeline.'
                    : historyPanel === 'notes'
                      ? 'Sélectionnez un membre pour voir ses notes.'
                      : 'Sélectionnez un membre pour voir sa chronologie.'}
                </p>
              ) : historyPanel === 'notes' ? (
                notesLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 size={20} className="animate-spin text-primary" />
                  </div>
                ) : notesError ? (
                  <p className="text-xs text-red-700 text-center py-8 flex items-center justify-center gap-2">
                    <AlertTriangle size={14} />
                    {notesError}
                  </p>
                ) : memberNotes.length === 0 ? (
                  <p className="text-xs text-text-secondary text-center py-8">
                    {language === 'en'
                      ? 'No notes recorded for this member yet.'
                      : 'Aucune note enregistrée pour ce membre.'}
                  </p>
                ) : (
                  memberNotes.map((note) => {
                    const memberReported = isMemberReportedNote(note);
                    const paymentUpdate = isPaymentUpdateNote(note);
                    const isVoidFormOpen = voidingNoteId === note.id;
                    const correctedNoteInList =
                      note.correctedNoteId &&
                      memberNotes.some((n) => n.id === note.correctedNoteId);
                    return (
                      <div
                        key={note.id}
                        id={`note-${note.id}`}
                        className={`bg-background border border-border-subtle rounded-xl p-3 space-y-2 ${
                          note.voided
                            ? 'opacity-70 bg-gray-50 border-dashed'
                            : memberReported
                              ? 'border-l-2 border-l-accent bg-accent/5'
                              : ''
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-[10px] text-text-secondary font-medium">
                            {formatNoteTimestamp(note.createdAt, language)}
                          </span>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {note.voided && (
                              <span className="text-[10px] font-bold text-gray-600 bg-gray-200 px-2 py-0.5 rounded-full">
                                {language === 'en' ? 'Voided' : 'Annulée'}
                              </span>
                            )}
                            <span className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                              {note.id.slice(0, 8)}
                            </span>
                            {!note.voided && (
                              <button
                                type="button"
                                onClick={() => openVoidForm(note)}
                                title={language === 'en' ? 'Void this note' : 'Annuler cette note'}
                                className="p-1 rounded-lg text-text-secondary hover:text-red-700 hover:bg-red-50 transition-colors"
                              >
                                <Ban size={14} />
                              </button>
                            )}
                          </div>
                        </div>
                        {note.voided && (
                          <div className="text-[10px] text-gray-600 bg-gray-100 border border-gray-200 rounded-lg px-2.5 py-2 space-y-1">
                            <p>
                              <span className="font-bold">
                                {language === 'en' ? 'Reason:' : 'Motif :'}
                              </span>{' '}
                              {note.voidReason}
                            </p>
                            <p>
                              {language === 'en' ? 'Voided by' : 'Annulée par'}{' '}
                              {note.voidedBy ?? '—'}
                              {note.voidedAt
                                ? ` · ${formatNoteTimestamp(note.voidedAt, language)}`
                                : ''}
                            </p>
                            {note.correctedNoteId && (
                              <p>
                                {language === 'en' ? 'Corrected note:' : 'Note corrigée :'}{' '}
                                {correctedNoteInList ? (
                                  <button
                                    type="button"
                                    onClick={() => scrollToNote(note.correctedNoteId!)}
                                    className="font-bold text-primary hover:underline"
                                  >
                                    {note.correctedNoteId.slice(0, 8)}
                                  </button>
                                ) : (
                                  <span className="font-bold">{note.correctedNoteId.slice(0, 8)}</span>
                                )}
                              </p>
                            )}
                          </div>
                        )}
                        <div className="flex flex-wrap items-center gap-1.5">
                          {memberReported ? (
                            <>
                              <span className="text-[10px] font-bold text-accent bg-accent/15 px-2 py-0.5 rounded-full">
                                {language === 'en' ? 'Reported by member' : 'Signalé par le membre'}
                              </span>
                              {paymentUpdate && (
                                <span className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                                  {language === 'en' ? 'Payment update' : 'Mise à jour de paiement'}
                                </span>
                              )}
                            </>
                          ) : (
                            <span className="text-[10px] text-text-secondary">
                              {language === 'en' ? 'Officer:' : 'Agent :'} {note.createdBy}
                            </span>
                          )}
                        </div>
                        {note.complianceFlag && (
                          <div className="flex items-start gap-1.5 text-[10px] text-amber-800">
                            <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                            <span>{note.complianceSummary ?? (language === 'en' ? 'Flagged note' : 'Note signalée')}</span>
                          </div>
                        )}
                        {note.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {note.tags.map((tag) => (
                              <span
                                key={tag}
                                className="text-[10px] font-bold text-accent bg-accent/10 px-2 py-0.5 rounded-full"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                        <p className={`text-xs leading-relaxed ${note.voided ? 'text-gray-500 line-through' : 'text-oil-black'}`}>
                          {note.rawText}
                        </p>
                        {isVoidFormOpen && (
                          <div className="mt-2 pt-3 border-t border-border-subtle space-y-3">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-oil-black">
                              {language === 'en' ? 'Void this note' : 'Annuler cette note'}
                            </p>
                            <textarea
                              value={voidReason}
                              onChange={(e) => setVoidReason(e.target.value)}
                              disabled={voidingNote}
                              rows={2}
                              placeholder={
                                language === 'en'
                                  ? 'Reason for voiding (required)...'
                                  : 'Motif de l\'annulation (obligatoire)...'
                              }
                              className="w-full px-3 py-2 bg-background border border-border-subtle rounded-xl text-sm focus:outline-none focus:border-primary disabled:opacity-50 resize-none"
                            />
                            <label className="flex items-center gap-2 text-xs text-oil-black cursor-pointer">
                              <input
                                type="checkbox"
                                checked={voidCreateCorrection}
                                onChange={(e) => setVoidCreateCorrection(e.target.checked)}
                                disabled={voidingNote}
                                className="rounded border-border-subtle"
                              />
                              {language === 'en'
                                ? 'Create corrected note under the right member'
                                : 'Créer une note corrigée pour le bon membre'}
                            </label>
                            {voidCreateCorrection && (
                              <div className="space-y-2 pl-1 border-l-2 border-primary/30">
                                <select
                                  value={voidCorrectMemberPhone ?? ''}
                                  onChange={(e) => setVoidCorrectMemberPhone(e.target.value || null)}
                                  disabled={voidingNote}
                                  className="w-full h-10 px-3 bg-background border border-border-subtle rounded-xl text-sm focus:outline-none focus:border-primary disabled:opacity-50"
                                >
                                  <option value="">
                                    {language === 'en' ? 'Select member...' : 'Choisir un membre...'}
                                  </option>
                                  {memberUsers.map((member) => (
                                    <option key={member.phone} value={member.phone}>
                                      {member.name}
                                    </option>
                                  ))}
                                </select>
                                <textarea
                                  value={voidCorrectText}
                                  onChange={(e) => setVoidCorrectText(e.target.value)}
                                  disabled={voidingNote}
                                  rows={3}
                                  placeholder={
                                    language === 'en'
                                      ? 'Corrected note text...'
                                      : 'Texte de la note corrigée...'
                                  }
                                  className="w-full px-3 py-2 bg-background border border-border-subtle rounded-xl text-sm focus:outline-none focus:border-primary disabled:opacity-50 resize-none"
                                />
                                <input
                                  type="text"
                                  value={voidCorrectTagsInput}
                                  onChange={(e) => setVoidCorrectTagsInput(e.target.value)}
                                  disabled={voidingNote}
                                  placeholder={
                                    language === 'en'
                                      ? 'Tags: #repayment, #collateral'
                                      : 'Tags : #remboursement, #garantie'
                                  }
                                  className="w-full h-10 px-3 bg-background border border-border-subtle rounded-xl text-sm focus:outline-none focus:border-primary disabled:opacity-50"
                                />
                              </div>
                            )}
                            {voidError && (
                              <p className="text-xs text-red-700 flex items-start gap-2">
                                <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                                {voidError}
                              </p>
                            )}
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={resetVoidForm}
                                disabled={voidingNote}
                                className="flex-1 h-10 px-3 border border-border-subtle rounded-xl text-xs font-semibold text-text-secondary hover:text-oil-black disabled:opacity-50"
                              >
                                {language === 'en' ? 'Cancel' : 'Annuler'}
                              </button>
                              <button
                                type="button"
                                onClick={handleVoidNote}
                                disabled={!voidReason.trim() || voidingNote}
                                className="flex-1 h-10 px-3 bg-red-700 hover:bg-red-800 text-white font-semibold rounded-xl text-xs flex items-center justify-center gap-2 disabled:opacity-50"
                              >
                                {voidingNote ? (
                                  <Loader2 size={14} className="animate-spin" />
                                ) : (
                                  <Ban size={14} />
                                )}
                                {language === 'en' ? 'Confirm void' : 'Confirmer l\'annulation'}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
                )
              ) : timelineLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 size={20} className="animate-spin text-primary" />
                </div>
              ) : timelineError ? (
                <p className="text-xs text-red-700 text-center py-8 flex items-center justify-center gap-2">
                  <AlertTriangle size={14} />
                  {timelineError}
                </p>
              ) : memberTimeline.length === 0 ? (
                <p className="text-xs text-text-secondary text-center py-8">
                  {language === 'en'
                    ? 'No activity recorded for this member yet.'
                    : 'Aucune activité enregistrée pour ce membre.'}
                </p>
              ) : (
                memberTimeline.map((event) => {
                  const meta = getTimelineEventMeta(event.eventType, language);
                  return (
                    <div
                      key={`${event.eventType}-${event.id}`}
                      className={`bg-background border border-border-subtle rounded-xl p-3 space-y-2 border-l-2 ${meta.borderClass}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-[10px] text-text-secondary font-medium">
                          {formatTimelineTimestamp(event.eventTime, language)}
                        </span>
                        <span className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full shrink-0">
                          {event.id.slice(0, 8)}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1 ${meta.badgeClass}`}
                        >
                          {meta.icon}
                          {meta.label}
                        </span>
                        {event.complianceFlag && (
                          <span className="text-[10px] font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                            <AlertTriangle size={12} className="shrink-0" />
                            {language === 'en' ? 'Flagged' : 'Signalé'}
                          </span>
                        )}
                      </div>
                      {event.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {event.tags.map((tag) => (
                            <span
                              key={tag}
                              className="text-[10px] font-bold text-accent bg-accent/10 px-2 py-0.5 rounded-full"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                      <p className="text-xs text-oil-black leading-relaxed">{event.description}</p>
                    </div>
                  );
                })
              )}
            </div>

            <div className="px-4 py-3 border-t border-border-subtle flex items-center gap-2 text-[10px] text-text-secondary">
              <Lock size={12} className="shrink-0" />
              <span>
                {language === 'en'
                  ? 'Audit trail preserved — notes may be voided with a recorded reason, never deleted.'
                  : 'Piste d\'audit conservée — les notes peuvent être annulées avec un motif enregistré, jamais supprimées.'}
              </span>
            </div>
          </div>
        </div>
      </div>
      </>
      )}
    </div>
  );
}
