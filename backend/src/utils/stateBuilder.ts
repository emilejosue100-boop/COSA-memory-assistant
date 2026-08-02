import { asc, count, desc, eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  cooperatives,
  members,
  transactions,
  loanRequests,
  opportunities,
} from '../db/schema.js';
import type { GlobalState, Transaction, LoanRequest, Opportunity } from '../types/index.js';
import { getExchangeRatesForState } from '../services/currency.js';
import { mapLoanRequest } from './mapLoanRequest.js';
import { toPublicUser } from './memberMapper.js';

export async function getDefaultCooperative() {
  const coop = await db.query.cooperatives.findFirst();
  if (!coop) {
    throw new Error('No cooperative found. Run npm run seed first.');
  }
  return coop;
}

export async function buildGlobalState(currentUserId?: string): Promise<GlobalState> {
  const coop = await getDefaultCooperative();

  const [memberRows, transactionRows, loanRows, opportunityRows, exchangeRateInfo] =
    await Promise.all([
    db.query.members.findMany({
      where: eq(members.cooperativeId, coop.id),
      orderBy: asc(members.joinDate),
    }),
    db.query.transactions.findMany({
      where: eq(transactions.cooperativeId, coop.id),
      orderBy: [desc(transactions.date), desc(transactions.createdAt)],
    }),
    db.query.loanRequests.findMany({
      where: eq(loanRequests.cooperativeId, coop.id),
      orderBy: [desc(loanRequests.date), desc(loanRequests.createdAt)],
    }),
    db.query.opportunities.findMany({
      where: eq(opportunities.cooperativeId, coop.id),
      orderBy: desc(opportunities.createdAt),
    }),
    getExchangeRatesForState(),
  ]);

  let currentUser = null;
  if (currentUserId) {
    const userDoc = memberRows.find((u) => u.id === currentUserId);
    if (userDoc) {
      currentUser = toPublicUser(userDoc);
    }
  }

  const language =
    (currentUserId
      ? memberRows.find((u) => u.id === currentUserId)?.language
      : undefined) ?? coop.defaultLanguage;

  const mappedTransactions: Transaction[] = transactionRows.map((tx) => ({
    id: tx.externalId,
    date: tx.date,
    type: tx.type,
    amount: tx.amount,
    runningBalance: tx.runningBalance,
    memberName: tx.memberName,
    status: tx.status,
  }));

  const mappedLoans: LoanRequest[] = loanRows.map(mapLoanRequest);

  const mappedOpportunities: Opportunity[] = opportunityRows.map((opp) => ({
    id: opp.externalId,
    titleEn: opp.titleEn,
    titleFr: opp.titleFr,
    source: opp.source,
    returnRate: opp.returnRate,
    summaryEn: opp.summaryEn,
    summaryFr: opp.summaryFr,
    aiAnalysisEn: opp.aiAnalysisEn ?? undefined,
    aiAnalysisFr: opp.aiAnalysisFr ?? undefined,
    isFlagged: opp.isFlagged,
    foundAgo: opp.foundAgo,
    category: opp.category,
    sourceUrl: opp.sourceUrl ?? undefined,
    image: opp.image ?? undefined,
  }));

  return {
    users: memberRows.map(toPublicUser),
    currentUser,
    transactions: mappedTransactions,
    loanRequests: mappedLoans,
    opportunities: mappedOpportunities,
    currentTip: coop.currentTip,
    groupSavings: coop.groupSavings,
    activeLoansCount: coop.activeLoansCount,
    activeLoansAmount: coop.activeLoansAmount,
    language,
    exchangeRates: exchangeRateInfo,
  };
}

export async function countAdmins(): Promise<number> {
  const [result] = await db
    .select({ count: count() })
    .from(members)
    .where(eq(members.role, 'admin'));
  return result?.count ?? 0;
}
