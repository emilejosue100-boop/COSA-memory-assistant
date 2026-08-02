import 'dotenv/config';
import { askClaude } from '../src/services/bedrock.js';
import type {
  MemberLoanDisplay,
  MemberRecordDisplay,
  MemberStatsDisplay,
} from '../src/services/memberContext.js';

const sampleMember: MemberRecordDisplay = {
  name: 'Demo Member',
  savings_balance: 150,
  join_date: '2024-01-15',
  status: 'active',
  savingsBalanceDisplay: 150,
  savingsBalanceCurrency: 'USD',
};

const sampleStats: MemberStatsDisplay = {
  depositCount: 12,
  totalSaved: 480,
  loanCount: 2,
  loansRepaid: 1,
  activeLoans: 1,
  totalSavedDisplay: 480,
  totalSavedCurrency: 'USD',
};

const sampleLoans: MemberLoanDisplay[] = [
  {
    external_id: 'LOAN-1111-001',
    requested_amount: 200,
    principal: 200,
    term_months: 6,
    interest_rate: 0.05,
    total_owed: 210,
    amount_paid: 210,
    remaining_balance: 0,
    currency: 'USD',
    status: 'approved',
    repayment_due_date: '2024-07-01',
    date: '2024-01-20',
    principalDisplay: 200,
    totalOwedDisplay: 210,
    amountPaidDisplay: 210,
    remainingBalanceDisplay: 0,
    displayCurrency: 'USD',
  },
  {
    external_id: 'LOAN-1111-002',
    requested_amount: 100,
    principal: 100,
    term_months: 12,
    interest_rate: 0.05,
    total_owed: 160,
    amount_paid: 40,
    remaining_balance: 120,
    currency: 'CDF',
    status: 'approved',
    repayment_due_date: '2025-01-01',
    date: '2024-06-01',
    principalDisplay: 250000,
    totalOwedDisplay: 400000,
    amountPaidDisplay: 100000,
    remainingBalanceDisplay: 300000,
    displayCurrency: 'USD',
  },
];

const sampleNotes = [
  {
    id: 'NOTE-1111-001',
    text: 'Demo Member repaid $45.00 on schedule last month. No missed installments in the past 6 months.',
    tags: ['#repayment'],
    complianceFlag: false,
  },
  {
    id: 'NOTE-1111-003',
    text: 'One late payment recorded in January (5 days overdue). Member communicated cash-flow delay due to seasonal trade.',
    tags: ['#repayment', '#risk'],
    complianceFlag: true,
    complianceSummary: 'Late repayment within last 90 days',
  },
];

const samplePaymentUpdates = [
  {
    id: 'NOTE-1111-004',
    rawText: 'I will pay the remaining balance by end of next week after my harvest sells.',
    createdAt: '2024-08-15T10:30:00Z',
  },
];

async function main() {
  console.log('--- Loan amount question (missing from notes) ---');
  const loanAnswer = await askClaude(
    'How much did he recently request for the loan?',
    sampleNotes,
    sampleMember,
    sampleStats,
    sampleLoans,
    samplePaymentUpdates,
    [],
    [],
    'USD'
  );
  console.log('Claude responded:', loanAnswer);

  console.log("\n--- Savings balance question (from member record) ---");
  const balanceAnswer = await askClaude(
    "What is this member's current savings balance?",
    sampleNotes,
    sampleMember,
    sampleStats,
    sampleLoans,
    [],
    [],
    [],
    'USD'
  );
  console.log('Claude responded:', balanceAnswer);

  console.log('\n--- CDF loan remaining balance ---');
  const cdfAnswer = await askClaude(
    'What is the remaining balance on the CDF loan?',
    sampleNotes,
    sampleMember,
    sampleStats,
    sampleLoans,
    [],
    [],
    [],
    'USD'
  );
  console.log('Claude responded:', cdfAnswer);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
