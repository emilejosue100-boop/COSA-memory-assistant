import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { db } from './db/index.js';
import { cooperatives, exchangeRates, members } from './db/schema.js';
import { COOPERATIVE_NAME, defaultWelcomeTip, demoAccounts } from './seed/seedData.js';
import { getDefaultAvatarUrl } from './utils/avatar.js';

export async function ensureDefaultCooperative(): Promise<void> {
  const existing = await db.query.cooperatives.findFirst();
  if (existing) {
    return;
  }

  await db.insert(cooperatives).values({
    name: COOPERATIVE_NAME,
    groupSavings: 0,
    activeLoansCount: 0,
    activeLoansAmount: 0,
    defaultLanguage: 'en',
    currentTip: defaultWelcomeTip,
  });

  console.log(`Created cooperative: ${COOPERATIVE_NAME}`);
}

function resolveDemoAccounts() {
  const pin = process.env.DEMO_PIN?.trim() || '1234';

  return demoAccounts.map((account) => {
    if (account.role === 'admin') {
      return {
        ...account,
        phone: process.env.DEMO_ADMIN_PHONE?.trim() || account.phone,
        pin,
      };
    }

    return {
      ...account,
      phone: process.env.DEMO_MEMBER_PHONE?.trim() || account.phone,
      pin,
    };
  });
}

export async function ensureDefaultExchangeRate(): Promise<void> {
  const existing = await db.query.exchangeRates.findFirst({
    where: eq(exchangeRates.currency, 'CDF'),
  });
  if (existing) {
    return;
  }

  await db.insert(exchangeRates).values({
    baseCurrency: 'USD',
    currency: 'CDF',
    rate: '2500',
    updatedBy: 'system',
  });

  console.log('Created placeholder exchange rate: 1 USD = 2500 CDF (admin should verify)');
}

export async function ensureDemoAccounts(): Promise<void> {
  const coop = await db.query.cooperatives.findFirst();
  if (!coop) {
    throw new Error('Cooperative must exist before creating demo accounts');
  }

  const accounts = resolveDemoAccounts();
  const joinDate = new Date().toISOString().split('T')[0];

  for (const account of accounts) {
    const existing = await db.query.members.findFirst({
      where: eq(members.phone, account.phone),
    });
    if (existing) {
      continue;
    }

    const pinHash = await bcrypt.hash(account.pin, 10);
    await db.insert(members).values({
      name: account.name,
      phone: account.phone,
      pinHash,
      role: account.role,
      cooperativeId: coop.id,
      cooperativeName: account.role === 'admin' ? `${coop.name} (Committee)` : coop.name,
      savingsBalance: 0,
      profileImage: getDefaultAvatarUrl(account.name),
      status: 'active',
      joinDate,
    });

    console.log(`Created demo ${account.role} account: ${account.phone}`);
  }
}

export function getDemoAccountCredentials() {
  return resolveDemoAccounts().map(({ name, phone, pin, role }) => ({
    name,
    phone,
    pin,
    role,
  }));
}
