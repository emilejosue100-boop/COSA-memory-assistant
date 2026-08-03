import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Ban,
  Check,
  FileText,
  Loader2,
  Lock,
  Send,
} from 'lucide-react';
import type { GlobalState, Language } from '../types';
import { apiPost } from '../lib/api';
import { useVoiceInput, VoiceMicButton } from '../hooks/useVoiceInput';
import AssistantAnswerText from './AssistantAnswerText';

export interface MemberNote {
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

export interface TimelineEvent {
  id: string;
  memberId: string;
  eventType: TimelineEventType;
  eventTime: string;
  description: string;
  tags: string[];
  complianceFlag: boolean;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  answer?: {
    answer: string;
    flags: string[];
    citations: Array<{ id: string; tags: string[]; text: string }>;
  };
  isError?: boolean;
}

export interface ConversationTurn {
  role: 'user' | 'assistant';
  content: string;
}

type HistoryPanel = 'notes' | 'timeline';

const MAX_CONVERSATION_TURNS = 6;

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

function formatTimelineTimestamp(iso: string, language: Language): string {
  return formatNoteTimestamp(iso, language);
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

export function buildConversationHistory(messages: ChatMessage[]): ConversationTurn[] {
  return messages
    .filter((message) => !message.isError && message.content.trim())
    .slice(-MAX_CONVERSATION_TURNS)
    .map((message) => ({
      role: message.role,
      content: message.content.trim(),
    }));
}

interface AddNotePanelProps {
  memberId: string;
  language: Language;
  onNoteAdded: () => void;
}

export const AddNotePanel = memo(function AddNotePanel({
  memberId,
  language,
  onNoteAdded,
}: AddNotePanelProps) {
  const [noteText, setNoteText] = useState('');
  const [noteTagsInput, setNoteTagsInput] = useState('');
  const [addingNote, setAddingNote] = useState(false);
  const [addNoteError, setAddNoteError] = useState<string | null>(null);
  const [addNoteSuccess, setAddNoteSuccess] = useState(false);

  useEffect(() => {
    setNoteText('');
    setNoteTagsInput('');
    setAddNoteError(null);
    setAddNoteSuccess(false);
  }, [memberId]);

  useEffect(() => {
    if (!addNoteSuccess) return;
    const timer = window.setTimeout(() => setAddNoteSuccess(false), 3000);
    return () => window.clearTimeout(timer);
  }, [addNoteSuccess]);

  const handleAddNote = async () => {
    const trimmedText = noteText.trim();
    if (!trimmedText || addingNote) return;

    setAddingNote(true);
    setAddNoteError(null);
    setAddNoteSuccess(false);

    try {
      const tags = parseNoteTags(noteTagsInput);
      const { ok, error } = await apiPost(
        '/api/add-note',
        {
          memberId,
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
      onNoteAdded();
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

  return (
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
          {addingNote ? <Loader2 size={16} className="animate-spin" /> : null}
          {language === 'en' ? 'Add Note' : 'Ajouter la note'}
        </button>
      </div>
    </div>
  );
});

interface ConversationPanelProps {
  memberId: string | undefined;
  memberName: string | null;
  language: Language;
  currency: string;
  messages: ChatMessage[];
  loading: boolean;
  onSend: (question: string, history: ConversationTurn[]) => Promise<void>;
}

export const ConversationPanel = memo(function ConversationPanel({
  memberId,
  memberName,
  language,
  currency: _currency,
  messages,
  loading,
  onSend,
}: ConversationPanelProps) {
  const [inputValue, setInputValue] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setInputValue('');
  }, [memberId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading, memberId]);

  const handleVoiceTranscript = useCallback((text: string) => {
    setInputValue(text);
  }, []);

  const memberVoice = useVoiceInput(handleVoiceTranscript, {
    language,
    disabled: !memberId || loading,
  });

  const canAsk = Boolean(memberId && inputValue.trim() && !loading);

  const handleSend = async () => {
    const trimmed = inputValue.trim();
    if (!trimmed || !memberId || loading) return;

    const history = buildConversationHistory(messages);
    setInputValue('');
    await onSend(trimmed, history);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  return (
    <div className="bg-white border border-border-subtle rounded-xl shadow-subtle flex flex-col min-h-[420px]">
      <div className="px-4 py-3 border-b border-border-subtle">
        <h3 className="text-sm font-bold font-display text-oil-black">
          {language === 'en' ? 'Conversation' : 'Conversation'}
        </h3>
        {memberName && (
          <p className="text-[10px] text-text-secondary mt-0.5">
            {language === 'en' ? 'Context:' : 'Contexte :'} {memberName}
            {!memberId && (
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
        {messages.length === 0 && !loading && (
          <p className="text-xs text-text-secondary text-center py-8 px-4">
            {language === 'en'
              ? "Ask about this member's loan history, repayment behavior, or collateral..."
              : 'Interrogez l\'historique de prêt, le comportement de remboursement ou les garanties de ce membre...'}
          </p>
        )}

        {messages.map((msg, idx) => (
          <div
            key={`${memberId ?? 'none'}-${idx}`}
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
          disabled={!memberId || loading || memberVoice.isTranscribing}
          placeholder={
            language === 'en' ? 'Type your question...' : 'Saisissez votre question...'
          }
          className="flex-1 h-11 px-3 bg-background border border-border-subtle rounded-xl text-sm focus:outline-none focus:border-primary disabled:opacity-50"
        />
        <VoiceMicButton
          voice={memberVoice}
          language={language}
          disabled={!memberId || loading}
        />
        <button
          type="button"
          onClick={() => void handleSend()}
          disabled={!canAsk || memberVoice.isTranscribing}
          className="h-11 px-4 bg-primary hover:bg-primary-hover active:scale-[0.98] text-white font-semibold rounded-xl text-xs flex items-center justify-center gap-2 shadow-subtle disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
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
  );
});

interface MemberHistoryPanelProps {
  memberId: string | undefined;
  language: Language;
  memberUsers: GlobalState['users'];
  selectedMemberPhone: string | null;
  memberIdsByPhone: Record<string, string>;
  memberNotes: MemberNote[];
  memberTimeline: TimelineEvent[];
  notesLoading: boolean;
  timelineLoading: boolean;
  notesError: string | null;
  timelineError: string | null;
  onHistoryChanged: () => void;
}

export const MemberHistoryPanel = memo(function MemberHistoryPanel({
  memberId,
  language,
  memberUsers,
  selectedMemberPhone,
  memberIdsByPhone,
  memberNotes,
  memberTimeline,
  notesLoading,
  timelineLoading,
  notesError,
  timelineError,
  onHistoryChanged,
}: MemberHistoryPanelProps) {
  const [historyPanel, setHistoryPanel] = useState<HistoryPanel>('notes');
  const [voidingNoteId, setVoidingNoteId] = useState<string | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [voidCreateCorrection, setVoidCreateCorrection] = useState(false);
  const [voidCorrectMemberPhone, setVoidCorrectMemberPhone] = useState<string | null>(null);
  const [voidCorrectText, setVoidCorrectText] = useState('');
  const [voidCorrectTagsInput, setVoidCorrectTagsInput] = useState('');
  const [voidingNote, setVoidingNote] = useState(false);
  const [voidError, setVoidError] = useState<string | null>(null);

  useEffect(() => {
    setVoidingNoteId(null);
    setVoidReason('');
    setVoidCreateCorrection(false);
    setVoidCorrectMemberPhone(null);
    setVoidCorrectText('');
    setVoidCorrectTagsInput('');
    setVoidError(null);
  }, [memberId]);

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
    document.getElementById(`note-${noteId}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
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

      const payload: Record<string, unknown> = { reason: voidReason.trim() };

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
      onHistoryChanged();
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

  return (
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
        {!memberId ? (
          <p className="text-xs text-text-secondary text-center py-8">
            {historyPanel === 'notes'
              ? language === 'en'
                ? 'Select a member to view their notes.'
                : 'Sélectionnez un membre pour voir ses notes.'
              : language === 'en'
                ? 'Select a member to view their timeline.'
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
                        {language === 'en' ? 'Voided by' : 'Annulée par'} {note.voidedBy ?? '—'}
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
                      <span>
                        {note.complianceSummary ??
                          (language === 'en' ? 'Flagged note' : 'Note signalée')}
                      </span>
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
                  <p
                    className={`text-xs leading-relaxed ${
                      note.voided ? 'text-gray-500 line-through' : 'text-oil-black'
                    }`}
                  >
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
                            onChange={(e) =>
                              setVoidCorrectMemberPhone(e.target.value || null)
                            }
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
                          onClick={() => void handleVoidNote()}
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
  );
});

interface MemberSidebarProps {
  users: GlobalState['users'];
  selectedMemberPhone: string | null;
  language: Language;
  formatAmount: (val: number) => string;
  onSelectMember: (phone: string) => void;
}

export const MemberSidebar = memo(function MemberSidebar({
  users,
  selectedMemberPhone,
  language,
  formatAmount,
  onSelectMember,
}: MemberSidebarProps) {
  return (
    <div className="hidden lg:flex lg:col-span-3 flex-col">
      <div className="bg-white border border-border-subtle rounded-xl shadow-subtle flex flex-col max-h-[calc(100vh-12rem)]">
        <div className="px-4 py-3 border-b border-border-subtle">
          <h3 className="text-sm font-bold font-display text-oil-black">
            {language === 'en' ? 'Members' : 'Membres'}
          </h3>
        </div>
        <div className="overflow-y-auto flex-1 divide-y divide-border-subtle/50">
          {users.length === 0 ? (
            <div className="p-4 text-xs text-text-secondary">No members</div>
          ) : (
            users.map((member) => {
              const isSelected = member.phone === selectedMemberPhone;
              return (
                <button
                  key={member.phone}
                  type="button"
                  onClick={() => onSelectMember(member.phone)}
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
  );
});
