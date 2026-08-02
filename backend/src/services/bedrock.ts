import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from '@aws-sdk/client-bedrock-runtime';
import type {
  MemberLoanDisplay,
  MemberRecordDisplay,
  MemberStatsDisplay,
} from './memberContext.js';
import type { TimelineEvent } from './timeline.js';

export class BedrockError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BedrockError';
  }
}

export interface PaymentUpdateContext {
  id: string;
  rawText: string;
  createdAt: Date | string;
}

export interface ContextNote {
  id: string;
  text: string;
  tags: string[];
  complianceFlag: boolean;
  complianceSummary?: string;
}

export interface PatternSearchLoanOutcome {
  status: string;
  repaid: boolean | null;
  remainingBalance: number | null;
}

export interface PatternSearchCase {
  noteId: string;
  memberId: string;
  memberName: string;
  text: string;
  tags: string[];
  complianceFlag: boolean;
  complianceSummary?: string;
  loanOutcomes: PatternSearchLoanOutcome[];
}

export interface ConversationTurn {
  role: 'user' | 'assistant';
  content: string;
}

const client = new BedrockRuntimeClient({
  region: process.env.AWS_REGION || 'us-east-1',
});

async function invokeClaude(prompt: string, maxTokens = 500): Promise<string> {
  const modelId =
    process.env.BEDROCK_MODEL_ID?.trim() || 'anthropic.claude-opus-4-6-v1';

  try {
    const command = new InvokeModelCommand({
      modelId,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify({
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    const response = await client.send(command);
    if (!response.body) {
      throw new BedrockError('Bedrock returned an empty response body');
    }

    const result = JSON.parse(new TextDecoder().decode(response.body)) as {
      content?: Array<{ text?: string }>;
    };

    const text = result.content?.[0]?.text;
    if (!text) {
      throw new BedrockError('Bedrock returned no answer text');
    }

    return text;
  } catch (err) {
    if (err instanceof BedrockError) {
      throw err;
    }
    const message = err instanceof Error ? err.message : 'Unknown Bedrock error';
    throw new BedrockError(message);
  }
}

function formatLoanLine(loan: MemberLoanDisplay, displayCurrency: string): string {
  const remaining =
    loan.remainingBalanceDisplay == null
      ? 'unknown'
      : `${loan.remainingBalanceDisplay.toFixed(2)} ${displayCurrency}`;
  const outcomeText = loan.final_outcome
    ? `, RESOLVED OUTCOME: ${loan.final_outcome} (recorded ${loan.outcome_recorded_at ?? 'unknown date'})`
    : ', status: still active';

  return `Loan ${loan.external_id}: principal ${loan.principalDisplay.toFixed(2)} ${displayCurrency}, remaining ${remaining}, due: ${loan.repayment_due_date ?? 'not set'}${outcomeText}`;
}

export async function askClaude(
  question: string,
  contextNotes: ContextNote[],
  member: MemberRecordDisplay | null,
  stats: MemberStatsDisplay,
  loans: MemberLoanDisplay[],
  paymentUpdates: PaymentUpdateContext[] = [],
  timelineEvents: TimelineEvent[] = [],
  conversationHistory: ConversationTurn[] = [],
  displayCurrency: string = 'USD'
): Promise<string> {
  const memberBlock = member
    ? `Member account record (authoritative, current):
- Name: ${member.name}
- Current savings balance: ${member.savingsBalanceDisplay.toFixed(2)} ${displayCurrency}
- Member since: ${member.join_date}
- Status: ${member.status}`
    : 'No member account record found.';

  const statsBlock = `Aggregate activity (computed from transaction records):
- Total deposits made: ${stats.depositCount}
- Total amount saved historically: ${stats.totalSavedDisplay.toFixed(2)} ${displayCurrency}
- Loans taken: ${stats.loanCount}, fully repaid: ${stats.loansRepaid}, active: ${stats.activeLoans}`;

  const loansBlock = loans.length
    ? loans.map((loan) => formatLoanLine(loan, displayCurrency)).join('\n')
    : 'No loan records found for this member.';

  const notesBlock = contextNotes.length
    ? contextNotes
        .map(
          (n) =>
            `[${n.id}] (${n.tags.join(', ')}) ${n.text}${
              n.complianceFlag ? ` — FLAGGED: ${n.complianceSummary}` : ''
            }`
        )
        .join('\n')
    : 'No notes on record.';

  const paymentUpdatesBlock = paymentUpdates.length
    ? paymentUpdates
        .map(
          (p) =>
            `[${p.id}, ${p.createdAt}] Member self-reported: "${p.rawText}"`
        )
        .join('\n')
    : 'No payment updates reported by the member.';

  const timelineBlock = timelineEvents.length
    ? [...timelineEvents]
        .sort(
          (a, b) =>
            new Date(b.eventTime).getTime() - new Date(a.eventTime).getTime()
        )
        .map(
          (event) =>
            `[${event.eventTime}] ${event.eventType}: ${event.description}${
              event.complianceFlag ? ' — FLAGGED' : ''
            }`
        )
        .join('\n')
    : 'No activity recorded on the member timeline.';

  const historyBlock = conversationHistory.length
    ? conversationHistory
        .map((turn) =>
          `${turn.role === 'user' ? 'Officer asked' : 'You answered'}: ${turn.content}`
        )
        .join('\n')
    : 'No prior questions in this session.';

  const prompt = `You are a loan officer's memory assistant for a microfinance cooperative. Answer using ONLY the information below, all sections are factual records.

Recent conversation in this session (for context on follow-up questions only, not a data source):
${historyBlock}

Rules for answering:
1. Answer the specific question directly and explicitly first, in the first sentence.
2. For current balance or account status, use the member account record — it is the authoritative current figure. Do not estimate balance from transaction history.
3. For loan terms, interest, amounts owed, or due dates, use the loan records directly.
4. For general assessments ("is this a strong member"), base it on the aggregate stats and cite the actual numbers.
5. For behavioral or qualitative context, use the notes.
6. If something isn't present in any section, say so clearly — never guess or invent.
7. If a note is flagged, mention the risk clearly.
8. Every amount below has already been converted to a single currency, ${displayCurrency}. Report every number using this same currency, do not mix currencies in your answer, and do not perform any conversion yourself.
9. Payment updates are self-reported by the member, not verified. Describe them as what the member said or intends, never as a confirmed fact. Never treat a payment update alone as grounds for a compliance flag.
10. For chronological narrative or "what happened when" questions, use the member activity timeline. For precise figures, still prefer loan records and aggregate stats over timeline descriptions.
11. If a loan has a RESOLVED OUTCOME recorded, treat that as a confirmed fact that overrides any date-based reasoning — a loan marked "defaulted" is a confirmed risk event regardless of its due date; do not reason as if it is still pending.
12. If the current question refers back to something discussed earlier in this session ("that", "before", "the one you mentioned"), use the conversation history above to understand what is being referred to.
13. The conversation history is only for understanding intent and follow-ups — still answer strictly grounded in the notes, records, and stats below; never treat prior answers in the session as a source of new facts about the member.

${memberBlock}

${statsBlock}

Loan records:
${loansBlock}

Notes:
${notesBlock}

Member-reported payment updates (self-reported, not independently verified):
${paymentUpdatesBlock}

Member activity timeline (chronological narrative, unified from notes, deposits, loans, and repayments):
${timelineBlock}

Question: ${question}

Answer:`;

  return invokeClaude(prompt);
}

export interface NamedMemberComparisonProfile {
  memberId: string;
  name: string;
  record: MemberRecordDisplay;
  stats: MemberStatsDisplay;
  loans: MemberLoanDisplay[];
  notes: ContextNote[];
}

function formatNamedMemberBlock(profile: NamedMemberComparisonProfile): string {
  const { record, stats, loans, notes } = profile;
  const currency = record.savingsBalanceCurrency;

  const loansText = loans.length
    ? loans
        .map((loan) => {
          const remaining =
            loan.remainingBalanceDisplay == null
              ? 'unknown'
              : `${loan.remainingBalanceDisplay.toFixed(2)} ${loan.displayCurrency}`;
          const outcome = loan.final_outcome ?? 'active';
          return `${loan.external_id}: principal ${loan.principalDisplay.toFixed(2)} ${loan.displayCurrency}, status ${loan.status}, remaining ${remaining}, outcome: ${outcome}`;
        })
        .join('; ')
    : 'No loan records on file.';

  const notesText = notes.length
    ? notes
        .map(
          (n) =>
            `[${n.id}] ${n.text}${n.complianceFlag ? ' — FLAGGED' : ''}`
        )
        .join('\n')
    : 'No notes on record for this member.';

  return `Member: ${profile.name}
Account: savings balance ${record.savingsBalanceDisplay.toFixed(2)} ${currency}, member since ${record.join_date}, status ${record.status}
Stats: ${stats.depositCount} deposits, ${stats.totalSavedDisplay.toFixed(2)} ${currency} saved historically, ${stats.loanCount} loans (${stats.loansRepaid} repaid, ${stats.activeLoans} active)
Loans: ${loansText}
Notes:
${notesText}`;
}

export async function askClaudeNamedMemberComparison(
  question: string,
  profiles: NamedMemberComparisonProfile[]
): Promise<string> {
  const comparisonBlock = profiles.map(formatNamedMemberBlock).join('\n---\n');

  const prompt = `You are a loan officer's memory assistant for a microfinance cooperative. The officer asked a question that names specific member(s). Compare them using ONLY the full account, loan, and note data provided below.

Rules:
1. If specific members are named in the question, always compare using their full account, loan, and note data provided above. Do not say a member doesn't exist just because they lack notes — only say a member is not found if their member record itself is genuinely absent from the data below.
2. When a member has no notes, say clearly that no qualitative notes exist for them, but still use their account, stats, and loan records in the comparison.
3. Answer the specific question directly first, then provide supporting detail.
4. Reference members by name. When citing a note, include its note ID in brackets.
5. Never invent outcomes, balances, or behavioral details not present below.
6. If a note is flagged, mention the risk clearly.
7. If loan outcome fields show a resolved outcome (e.g. repaid_on_time, defaulted), treat that as confirmed fact.

Member profiles (authoritative records):
${comparisonBlock}

Question: ${question}

Analysis:`;

  return invokeClaude(prompt, 700);
}

export async function askClaudePatternSearch(
  question: string,
  cases: PatternSearchCase[]
): Promise<string> {
  const casesBlock = cases.length
    ? cases
        .map((c) => {
          const outcomeText = c.loanOutcomes.length
            ? c.loanOutcomes
                .map(
                  (o) =>
                    `status: ${o.status}, repaid: ${o.repaid ?? 'unknown'}, remaining: ${o.remainingBalance ?? 'unknown'}`
                )
                .join('; ')
            : 'no loan outcome on record';
          return `Case [${c.memberName}, note ${c.noteId}]: ${c.text}${
            c.complianceFlag ? ` — FLAGGED: ${c.complianceSummary}` : ''
          }\nOutcome: ${outcomeText}`;
        })
        .join('\n\n')
    : 'No similar cases found across the cooperative.';

  const prompt = `You are analyzing patterns across a microfinance cooperative's historical member records, to help a loan officer understand if a current situation resembles past cases and how those cases turned out.

Rules:
1. Compare the cases below to the question asked, identify genuine similarities, don't force a comparison if cases aren't actually similar.
2. Summarize how similar past cases resolved, using only the loan outcome data given.
3. Give a clear, honest read: if outcomes were mixed, say so, don't oversimplify.
4. Never invent outcomes or details not present below.
5. Reference specific cases by member name and note ID when making a claim.

Similar cases found across the cooperative:
${casesBlock}

Question: ${question}

Analysis:`;

  return invokeClaude(prompt, 600);
}
