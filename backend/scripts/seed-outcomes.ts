import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { connectDB } from '../src/config/db.js';
import { db } from '../src/db/index.js';
import { cooperatives, loanRequests, members } from '../src/db/schema.js';
import { saveNote } from '../src/services/notes.js';
import { calculateTotalOwed, DEFAULT_INTEREST_RATE } from '../src/utils/loanCalculations.js';
import { getDefaultAvatarUrl } from '../src/utils/avatar.js';
import type { LoanFinalOutcome } from '../src/types/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

interface SeedCase {
  memberName: string;
  phone: string;
  note: string;
  tags: string[];
  complianceFlag: boolean;
  complianceSummary?: string;
  loanOutcome: LoanFinalOutcome;
}

const SEED_CASES: SeedCase[] = [
  {
    memberName: 'Chantal M.',
    phone: '0788200001',
    note: 'Member said she will pay next Friday, but this is the third time she has said this.',
    tags: ['#repayment', '#broken-promise'],
    complianceFlag: true,
    complianceSummary: 'Repeated broken repayment promises',
    loanOutcome: 'defaulted',
  },
  {
    memberName: 'Baraka T.',
    phone: '0788200002',
    note: 'Missed one payment, cited family emergency, caught up within two weeks.',
    tags: ['#repayment', '#distress'],
    complianceFlag: true,
    complianceSummary: 'Late repayment within last 90 days',
    loanOutcome: 'repaid_late',
  },
  {
    memberName: 'Divin L.',
    phone: '0788200003',
    note: 'Consistently on time for six consecutive months.',
    tags: ['#repayment'],
    complianceFlag: false,
    loanOutcome: 'repaid_on_time',
  },
  {
    memberName: 'Amina K.',
    phone: '0788200004',
    note: 'Repeated late payments, second warning given about repayment reliability.',
    tags: ['#repayment', '#broken-promise'],
    complianceFlag: true,
    complianceSummary: 'Pattern of late repayments',
    loanOutcome: 'defaulted',
  },
  {
    memberName: 'Demo Member',
    phone: '0788111111',
    note: 'Steady saver, no repayment issues on record.',
    tags: ['#repayment'],
    complianceFlag: false,
    loanOutcome: 'repaid_on_time',
  },
];

async function findMemberByName(name: string) {
  return db.query.members.findFirst({
    where: eq(members.name, name),
  });
}

async function ensureMember(
  seedCase: SeedCase,
  cooperativeId: string,
  cooperativeName: string,
  pinHash: string,
  joinDate: string
) {
  const existing = await findMemberByName(seedCase.memberName);
  if (existing) {
    return existing;
  }

  const phoneTaken = await db.query.members.findFirst({
    where: eq(members.phone, seedCase.phone),
  });
  if (phoneTaken) {
    console.log(`Phone ${seedCase.phone} already used — skipping ${seedCase.memberName}`);
    return null;
  }

  const [created] = await db
    .insert(members)
    .values({
      name: seedCase.memberName,
      phone: seedCase.phone,
      pinHash,
      role: 'member',
      cooperativeId,
      cooperativeName,
      savingsBalance: 120,
      profileImage: getDefaultAvatarUrl(seedCase.memberName),
      status: 'active',
      joinDate,
    })
    .returning();

  console.log(`Created member: ${seedCase.memberName}`);
  return created;
}

async function ensureApprovedLoan(
  memberId: string,
  cooperativeId: string,
  memberName: string,
  memberImage: string
) {
  const existing = await db.query.loanRequests.findFirst({
    where: and(eq(loanRequests.memberId, memberId), eq(loanRequests.status, 'approved')),
    orderBy: desc(loanRequests.date),
  });
  if (existing) {
    return existing;
  }

  const principal = 200;
  const termMonths = 6;
  const totalOwed = calculateTotalOwed(principal, DEFAULT_INTEREST_RATE, termMonths);
  const slug = memberName.toLowerCase().replace(/[^a-z0-9]+/g, '-');

  const [created] = await db
    .insert(loanRequests)
    .values({
      externalId: `LOAN-SEED-${slug}`,
      memberId,
      cooperativeId,
      memberName,
      memberImage,
      date: '2024-06-01',
      requestedAmount: principal,
      principal,
      termMonths,
      interestRate: DEFAULT_INTEREST_RATE,
      totalOwed,
      amountPaid: totalOwed,
      remainingBalance: 0,
      repaid: true,
      repaidAmount: totalOwed,
      status: 'approved',
      repaymentDueDate: '2024-12-01',
      reasonEn: 'Seed outcome demo loan',
      reasonFr: 'Prêt de démonstration pour résultats',
      currency: 'USD',
    })
    .returning();

  console.log(`Created approved loan for ${memberName}`);
  return created;
}

async function noteAlreadySeeded(memberId: string, rawText: string): Promise<boolean> {
  const result = await db.execute(sql`
    SELECT id FROM notes
    WHERE member_id = ${memberId}
      AND source = 'officer_seed'
      AND raw_text = ${rawText}
    LIMIT 1
  `);
  return result.rows.length > 0;
}

async function seedCase(
  seed: SeedCase,
  cooperativeId: string,
  cooperativeName: string,
  pinHash: string,
  joinDate: string
) {
  const member = await ensureMember(seed, cooperativeId, cooperativeName, pinHash, joinDate);
  if (!member) {
    console.log(`Skipping ${seed.memberName}, member not available`);
    return;
  }

  const loan = await ensureApprovedLoan(
    member.id,
    cooperativeId,
    member.name,
    member.profileImage
  );

  const hasNote = await noteAlreadySeeded(member.id, seed.note);
  if (hasNote) {
    console.log(`Note already seeded for ${seed.memberName}, skipping insert`);
  } else {
    await saveNote({
      memberId: member.id,
      createdBy: 'officer_seed',
      rawText: seed.note,
      tags: seed.tags,
      source: 'officer_seed',
      complianceFlag: seed.complianceFlag,
      complianceSummary: seed.complianceSummary,
    });
    console.log(`Seeded note for ${seed.memberName}`);
  }

  if (loan.finalOutcome) {
    console.log(`Outcome already set for ${seed.memberName}, skipping update`);
    return;
  }

  await db
    .update(loanRequests)
    .set({
      finalOutcome: seed.loanOutcome,
      outcomeRecordedAt: new Date(),
    })
    .where(and(eq(loanRequests.id, loan.id), isNull(loanRequests.finalOutcome)));

  console.log(`Set outcome ${seed.loanOutcome} for ${seed.memberName}`);
}

async function main() {
  await connectDB();

  const coop = await db.query.cooperatives.findFirst();
  if (!coop) {
    console.error('No cooperative found — run db:setup and seed first.');
    process.exit(1);
  }

  const pinHash = await bcrypt.hash('1234', 10);
  const joinDate = '2024-01-15';

  for (const seed of SEED_CASES) {
    await seedCase(seed, coop.id, coop.name, pinHash, joinDate);
  }

  console.log('\nOutcome seeding complete.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Outcome seed failed:', err);
  process.exit(1);
});
