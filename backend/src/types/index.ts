export type Language = 'en' | 'fr';
export type UserRole = 'member' | 'admin';
export type CurrencyCode = 'USD' | 'CDF';
export type LoanTermMonths = 6 | 12;
export type LoanFinalOutcome = 'repaid_on_time' | 'repaid_late' | 'defaulted';

export interface User {
  id: string;
  name: string;
  phone: string;
  pin: string;
  role: UserRole;
  cooperativeName: string;
  savingsBalance: number;
  profileImage: string;
  status: 'active' | 'pending';
  joinDate: string;
}

export interface Transaction {
  id: string;
  date: string;
  type: 'saved' | 'withdrew' | 'repaid_loan';
  amount: number;
  runningBalance: number;
  memberName: string;
  status: 'success' | 'pending';
}

export interface LoanRequest {
  id: string;
  memberName: string;
  memberImage: string;
  date: string;
  requestedAmount: number;
  reasonEn: string;
  reasonFr: string;
  status: 'pending' | 'approved' | 'declined';
  repaymentDueDate?: string;
  repaid?: boolean;
  repaidAmount?: number;
  principal?: number;
  termMonths?: LoanTermMonths;
  interestRate?: number;
  totalOwed?: number;
  amountPaid?: number;
  remainingBalance?: number;
  currency?: CurrencyCode;
  finalOutcome?: LoanFinalOutcome;
  outcomeRecordedAt?: string;
}

export interface Opportunity {
  id: string;
  titleEn: string;
  titleFr: string;
  source: string;
  returnRate: string;
  summaryEn: string;
  summaryFr: string;
  aiAnalysisEn?: string;
  aiAnalysisFr?: string;
  isFlagged: boolean;
  foundAgo: string;
  category: string;
  sourceUrl?: string;
  image?: string;
}

export interface FinancialTip {
  id: string;
  titleEn: string;
  titleFr: string;
  contentEn: string;
  contentFr: string;
  whyEn: string;
  whyFr: string;
  category: 'streak' | 'goal' | 'dip';
}

export interface ExchangeRatesState {
  USD: number;
  CDF: number;
  updatedAt?: string;
  updatedBy?: string;
}

export interface GlobalState {
  users: User[];
  currentUser: User | null;
  transactions: Transaction[];
  loanRequests: LoanRequest[];
  opportunities: Opportunity[];
  currentTip: FinancialTip;
  groupSavings: number;
  activeLoansCount: number;
  activeLoansAmount: number;
  language: Language;
  exchangeRates: ExchangeRatesState;
}

export interface JwtPayload {
  userId: string;
}
