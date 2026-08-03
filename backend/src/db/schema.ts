import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  doublePrecision,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  vector,
} from 'drizzle-orm/pg-core';
import type { FinancialTip } from '../types/index.js';

export const languageEnum = pgEnum('language', ['en', 'fr']);
export const userRoleEnum = pgEnum('user_role', ['member', 'admin']);
export const userStatusEnum = pgEnum('user_status', ['active', 'pending']);
export const transactionTypeEnum = pgEnum('transaction_type', [
  'saved',
  'withdrew',
  'repaid_loan',
]);
export const transactionStatusEnum = pgEnum('transaction_status', ['success', 'pending']);
export const loanStatusEnum = pgEnum('loan_status', ['pending', 'approved', 'declined']);
export const currencyEnum = pgEnum('currency_code', ['USD', 'CDF']);

export const cooperatives = pgTable('cooperatives', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull().unique(),
  groupSavings: doublePrecision('group_savings').notNull().default(0),
  activeLoansCount: doublePrecision('active_loans_count').notNull().default(0),
  activeLoansAmount: doublePrecision('active_loans_amount').notNull().default(0),
  defaultLanguage: languageEnum('default_language').notNull().default('en'),
  currentTip: jsonb('current_tip').$type<FinancialTip>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const members = pgTable('members', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  phone: text('phone').notNull().unique(),
  pinHash: text('pin_hash').notNull(),
  role: userRoleEnum('role').notNull().default('member'),
  cooperativeId: uuid('cooperative_id')
    .notNull()
    .references(() => cooperatives.id),
  cooperativeName: text('cooperative_name').notNull(),
  savingsBalance: doublePrecision('savings_balance').notNull().default(0),
  profileImage: text('profile_image').notNull(),
  status: userStatusEnum('status').notNull().default('active'),
  joinDate: text('join_date').notNull(),
  language: languageEnum('language'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const transactions = pgTable('transactions', {
  id: uuid('id').primaryKey().defaultRandom(),
  externalId: text('external_id').notNull().unique(),
  memberId: uuid('member_id')
    .notNull()
    .references(() => members.id),
  cooperativeId: uuid('cooperative_id')
    .notNull()
    .references(() => cooperatives.id),
  date: text('date').notNull(),
  type: transactionTypeEnum('type').notNull(),
  amount: doublePrecision('amount').notNull(),
  runningBalance: doublePrecision('running_balance').notNull(),
  memberName: text('member_name').notNull(),
  status: transactionStatusEnum('status').notNull().default('success'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const loanRequests = pgTable('loan_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  externalId: text('external_id').notNull().unique(),
  memberId: uuid('member_id')
    .notNull()
    .references(() => members.id),
  cooperativeId: uuid('cooperative_id')
    .notNull()
    .references(() => cooperatives.id),
  memberName: text('member_name').notNull(),
  memberImage: text('member_image').notNull(),
  date: text('date').notNull(),
  requestedAmount: doublePrecision('requested_amount').notNull(),
  reasonEn: text('reason_en').notNull(),
  reasonFr: text('reason_fr').notNull(),
  status: loanStatusEnum('status').notNull().default('pending'),
  repaymentDueDate: text('repayment_due_date'),
  repaid: boolean('repaid').default(false),
  repaidAmount: doublePrecision('repaid_amount'),
  principal: doublePrecision('principal'),
  termMonths: doublePrecision('term_months'),
  interestRate: doublePrecision('interest_rate').default(0.05),
  totalOwed: doublePrecision('total_owed'),
  amountPaid: doublePrecision('amount_paid').default(0),
  remainingBalance: doublePrecision('remaining_balance'),
  currency: currencyEnum('currency').default('USD'),
  finalOutcome: text('final_outcome'),
  outcomeRecordedAt: timestamp('outcome_recorded_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const opportunities = pgTable('opportunities', {
  id: uuid('id').primaryKey().defaultRandom(),
  externalId: text('external_id').notNull().unique(),
  cooperativeId: uuid('cooperative_id')
    .notNull()
    .references(() => cooperatives.id),
  titleEn: text('title_en').notNull(),
  titleFr: text('title_fr').notNull(),
  source: text('source').notNull(),
  returnRate: text('return_rate').notNull(),
  summaryEn: text('summary_en').notNull(),
  summaryFr: text('summary_fr').notNull(),
  aiAnalysisEn: text('ai_analysis_en'),
  aiAnalysisFr: text('ai_analysis_fr'),
  isFlagged: boolean('is_flagged').notNull().default(false),
  foundAgo: text('found_ago').notNull(),
  category: text('category').notNull(),
  sourceUrl: text('source_url'),
  image: text('image'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const notes = pgTable('notes', {
  id: uuid('id').primaryKey().defaultRandom(),
  memberId: uuid('member_id')
    .notNull()
    .references(() => members.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy: text('created_by').notNull(),
  source: text('source').notNull(),
  rawText: text('raw_text').notNull(),
  structuredText: text('structured_text').notNull(),
  tags: text('tags')
    .array()
    .notNull()
    .default(sql`'{}'::text[]`),
  complianceFlag: boolean('compliance_flag').notNull().default(false),
  complianceSummary: text('compliance_summary'),
  embedding: vector('embedding', { dimensions: 768 }),
  voided: boolean('voided').notNull().default(false),
  voidReason: text('void_reason'),
  voidedBy: text('voided_by'),
  voidedAt: timestamp('voided_at', { withTimezone: true }),
  correctedNoteId: uuid('corrected_note_id'),
});

export const exchangeRates = pgTable('exchange_rates', {
  id: uuid('id').primaryKey().defaultRandom(),
  baseCurrency: text('base_currency').notNull().default('USD'),
  currency: text('currency').notNull(),
  rate: numeric('rate', { precision: 18, scale: 6 }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  updatedBy: text('updated_by'),
});

export const auditLog = pgTable('audit_log', {
  id: uuid('id').defaultRandom().primaryKey(),
  memberId: text('member_id').notNull(),
  question: text('question').notNull(),
  answer: text('answer').notNull(),
  notesUsed: text('notes_used').array(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const riskScanLog = pgTable('risk_scan_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  scanResult: text('scan_result').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  reviewed: boolean('reviewed').notNull().default(false),
  reviewedBy: text('reviewed_by'),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
});

export const cooperativesRelations = relations(cooperatives, ({ many }) => ({
  members: many(members),
  transactions: many(transactions),
  loanRequests: many(loanRequests),
  opportunities: many(opportunities),
}));

export const membersRelations = relations(members, ({ one, many }) => ({
  cooperative: one(cooperatives, {
    fields: [members.cooperativeId],
    references: [cooperatives.id],
  }),
  transactions: many(transactions),
  loanRequests: many(loanRequests),
  notes: many(notes),
}));

export const transactionsRelations = relations(transactions, ({ one }) => ({
  member: one(members, {
    fields: [transactions.memberId],
    references: [members.id],
  }),
  cooperative: one(cooperatives, {
    fields: [transactions.cooperativeId],
    references: [cooperatives.id],
  }),
}));

export const loanRequestsRelations = relations(loanRequests, ({ one }) => ({
  member: one(members, {
    fields: [loanRequests.memberId],
    references: [members.id],
  }),
  cooperative: one(cooperatives, {
    fields: [loanRequests.cooperativeId],
    references: [cooperatives.id],
  }),
}));

export const opportunitiesRelations = relations(opportunities, ({ one }) => ({
  cooperative: one(cooperatives, {
    fields: [opportunities.cooperativeId],
    references: [cooperatives.id],
  }),
}));

export const notesRelations = relations(notes, ({ one }) => ({
  member: one(members, {
    fields: [notes.memberId],
    references: [members.id],
  }),
}));

export type Cooperative = typeof cooperatives.$inferSelect;
export type Member = typeof members.$inferSelect;
export type TransactionRow = typeof transactions.$inferSelect;
export type LoanRequestRow = typeof loanRequests.$inferSelect;
export type OpportunityRow = typeof opportunities.$inferSelect;
export type NoteRow = typeof notes.$inferSelect;
export type AuditLogRow = typeof auditLog.$inferSelect;
export type RiskScanLogRow = typeof riskScanLog.$inferSelect;
