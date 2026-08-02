import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { desc, eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  cooperatives,
  members,
  transactions,
  loanRequests,
  opportunities,
} from '../db/schema.js';
import {
  optionalAuth,
  requireAuth,
  requireAdmin,
  signToken,
  type AuthRequest,
} from '../middleware/auth.js';
import {
  buildGlobalState,
  countAdmins,
  getDefaultCooperative,
} from '../utils/stateBuilder.js';
import {
  generateFinancialTip,
  refreshOpportunities,
  analyzeOpportunity,
  probeGeminiConnection,
} from '../services/gemini.js';
import { scrapeRwandaFinanceSources } from '../services/firecrawl.js';
import type { Language } from '../types/index.js';
import { getDefaultAvatarUrl } from '../utils/avatar.js';
import { convertToUsd, isValidCurrency } from '../utils/exchangeRates.js';
import {
  addMonthsToDate,
  calculateTotalOwed,
  DEFAULT_INTEREST_RATE,
} from '../utils/loanCalculations.js';

function isBootstrapAdminPhone(phone: string): boolean {
  const adminPhone = process.env.ADMIN_PHONE?.trim();
  return !!adminPhone && phone === adminPhone;
}

async function issueAuthResponse(userId: string, res: import('express').Response) {
  const token = signToken(userId);
  const state = await buildGlobalState(userId);
  res.json({ success: true, token, state });
}

const router = Router();

router.get('/state', optionalAuth, async (req: AuthRequest, res) => {
  try {
    const state = await buildGlobalState(req.userId);
    res.json(state);
  } catch (error) {
    console.error('GET /api/state error:', error);
    res.status(500).json({ error: 'Failed to load application state' });
  }
});

router.post('/language', optionalAuth, async (req: AuthRequest, res) => {
  try {
    const { language } = req.body as { language?: Language };
    const lang: Language = language === 'fr' ? 'fr' : 'en';

    if (req.userId) {
      await db.update(members).set({ language: lang }).where(eq(members.id, req.userId));
    } else {
      const coop = await getDefaultCooperative();
      await db
        .update(cooperatives)
        .set({ defaultLanguage: lang })
        .where(eq(cooperatives.id, coop.id));
    }

    const state = await buildGlobalState(req.userId);
    res.json(state);
  } catch (error) {
    console.error('POST /api/language error:', error);
    res.status(500).json({ error: 'Failed to update language' });
  }
});

router.get('/ai/status', async (_req, res) => {
  try {
    const firecrawlKey = process.env.FIRECRAWL_API_KEY?.trim();
    const gemini = await probeGeminiConnection();

    res.json({
      gemini,
      firecrawl: {
        configured: !!firecrawlKey && firecrawlKey !== 'your-firecrawl-api-key',
        ok: !!firecrawlKey && firecrawlKey !== 'your-firecrawl-api-key',
        message:
          firecrawlKey && firecrawlKey !== 'your-firecrawl-api-key'
            ? 'FIRECRAWL_API_KEY is set'
            : 'FIRECRAWL_API_KEY is not set in backend/.env',
      },
    });
  } catch (error) {
    console.error('GET /api/ai/status error:', error);
    res.status(500).json({ error: 'Failed to check AI service status' });
  }
});

router.get('/auth/status', async (_req, res) => {
  try {
    const adminCount = await countAdmins();
    res.json({ hasAdmin: adminCount > 0 });
  } catch (error) {
    console.error('GET /api/auth/status error:', error);
    res.status(500).json({ error: 'Failed to check auth status' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { phone, pin, name, mode } = req.body as {
      phone?: string;
      pin?: string;
      name?: string;
      mode?: 'login' | 'register';
    };

    if (!phone || !pin) {
      res.status(400).json({ error: 'Phone and PIN are required' });
      return;
    }

    const authMode = mode === 'register' ? 'register' : 'login';
    const coop = await getDefaultCooperative();
    const existing = await db.query.members.findFirst({
      where: eq(members.phone, phone.trim()),
    });

    if (authMode === 'login') {
      if (!existing) {
        res.status(404).json({
          error: 'Account not found — register first or ask your committee / Konti ntabwo ibonetse — iyandikishe cyangwa ubaze komite',
        });
        return;
      }

      const valid = await bcrypt.compare(pin, existing.pinHash);
      if (!valid) {
        res.status(401).json({ error: "Incorrect PIN / Nomero y'ibanga si yo" });
        return;
      }

      await issueAuthResponse(existing.id, res);
      return;
    }

    if (existing) {
      res.status(409).json({
        error: 'Already registered — sign in instead / Wasanzwe wiyandikishije — injira',
      });
      return;
    }

    if (!name?.trim()) {
      res.status(400).json({ error: 'Name is required for registration / Izina rirakenewe' });
      return;
    }

    const adminCount = await countAdmins();
    const role =
      adminCount === 0 && isBootstrapAdminPhone(phone.trim()) ? 'admin' : 'member';
    const memberName = name.trim();
    const pinHash = await bcrypt.hash(pin, 10);

    const [user] = await db
      .insert(members)
      .values({
        name: memberName,
        phone: phone.trim(),
        pinHash,
        role,
        cooperativeId: coop.id,
        cooperativeName: role === 'admin' ? `${coop.name} (Committee)` : coop.name,
        savingsBalance: 0,
        profileImage: getDefaultAvatarUrl(memberName),
        status: 'active',
        joinDate: new Date().toISOString().split('T')[0],
      })
      .returning();

    await issueAuthResponse(user.id, res);
  } catch (error) {
    console.error('POST /api/login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

router.post('/login/admin', async (req, res) => {
  try {
    const { phone, pin } = req.body as { phone?: string; pin?: string };

    if (!phone || !pin) {
      res.status(400).json({ error: 'Phone and PIN are required' });
      return;
    }

    const user = await db.query.members.findFirst({
      where: eq(members.phone, phone.trim()),
    });
    if (!user) {
      res.status(404).json({
        error: 'Committee account not found / Konti ya komite ntabwo ibonetse',
      });
      return;
    }

    if (user.role !== 'admin') {
      res.status(403).json({
        error: 'Not a committee account / Si konti ya komite',
      });
      return;
    }

    const valid = await bcrypt.compare(pin, user.pinHash);
    if (!valid) {
      res.status(401).json({ error: "Incorrect PIN / Nomero y'ibanga si yo" });
      return;
    }

    await issueAuthResponse(user.id, res);
  } catch (error) {
    console.error('POST /api/login/admin error:', error);
    res.status(500).json({ error: 'Committee login failed' });
  }
});

router.post('/add-member', requireAdmin, async (req: AuthRequest, res) => {
  try {
    const { name, phone, pin, role } = req.body as {
      name?: string;
      phone?: string;
      pin?: string;
      role?: 'member' | 'admin';
    };
    if (!name?.trim() || !phone?.trim() || !pin) {
      res.status(400).json({ error: 'Name, phone, and PIN are required' });
      return;
    }

    const memberRole = role === 'admin' ? 'admin' : 'member';

    const existing = await db.query.members.findFirst({
      where: eq(members.phone, phone.trim()),
    });
    if (existing) {
      res.status(409).json({ error: 'Phone number already registered / Telefone isanzwe ifite konti' });
      return;
    }

    const admin = await db.query.members.findFirst({
      where: eq(members.id, req.userId!),
    });
    if (!admin) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const coop = await getDefaultCooperative();
    const pinHash = await bcrypt.hash(pin, 10);
    const memberName = name.trim();

    await db.insert(members).values({
      name: memberName,
      phone: phone.trim(),
      pinHash,
      role: memberRole,
      cooperativeId: coop.id,
      cooperativeName: memberRole === 'admin' ? `${coop.name} (Committee)` : coop.name,
      savingsBalance: 0,
      profileImage: getDefaultAvatarUrl(memberName),
      status: 'active',
      joinDate: new Date().toISOString().split('T')[0],
    });

    const state = await buildGlobalState(req.userId);
    res.json(state);
  } catch (error) {
    console.error('POST /api/add-member error:', error);
    res.status(500).json({ error: 'Failed to register member' });
  }
});

router.post('/update-profile', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { name } = req.body as { name?: string };
    if (!name?.trim()) {
      res.status(400).json({ error: 'Name is required' });
      return;
    }

    const user = await db.query.members.findFirst({
      where: eq(members.id, req.userId!),
    });
    if (!user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    await db
      .update(members)
      .set({ name: name.trim() })
      .where(eq(members.id, req.userId!));

    const state = await buildGlobalState(req.userId);
    res.json(state);
  } catch (error) {
    console.error('POST /api/update-profile error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

router.post('/logout', requireAuth, async (req: AuthRequest, res) => {
  const state = await buildGlobalState();
  state.currentUser = null;
  res.json({ success: true, state });
});

router.post('/save', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { amount } = req.body as { amount?: number | string };
    const val = Number(amount);
    if (isNaN(val) || val <= 0) {
      res.status(400).json({ error: 'Invalid amount / Umubare si wo' });
      return;
    }

    const user = await db.query.members.findFirst({
      where: eq(members.id, req.userId!),
    });
    if (!user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const newBalance = user.savingsBalance + val;
    await db
      .update(members)
      .set({ savingsBalance: newBalance })
      .where(eq(members.id, user.id));

    const coop = await db.query.cooperatives.findFirst({
      where: eq(cooperatives.id, user.cooperativeId),
    });
    if (coop) {
      await db
        .update(cooperatives)
        .set({ groupSavings: coop.groupSavings + val })
        .where(eq(cooperatives.id, coop.id));
    }

    await db.insert(transactions).values({
      externalId: `tx-${Date.now()}`,
      memberId: user.id,
      cooperativeId: user.cooperativeId,
      date: new Date().toISOString().split('T')[0],
      type: 'saved',
      amount: val,
      runningBalance: newBalance,
      memberName: user.name,
      status: 'success',
    });

    const state = await buildGlobalState(req.userId);
    res.json(state);
  } catch (error) {
    console.error('POST /api/save error:', error);
    res.status(500).json({ error: 'Failed to save contribution' });
  }
});

router.post('/request-loan', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { amount, reasonEn, reasonFr, termMonths, currency } = req.body as {
      amount?: number | string;
      reasonEn?: string;
      reasonFr?: string;
      termMonths?: number | string;
      currency?: string;
    };
    const val = Number(amount);
    if (isNaN(val) || val <= 0) {
      res.status(400).json({ error: 'Invalid amount / Umubare si wo' });
      return;
    }

    const term = Number(termMonths);
    if (term !== 6 && term !== 12) {
      res.status(400).json({
        error: 'Repayment period must be 6 or 12 months / Igihe cyo kwishyura kigomba kuba amezi 6 cyangwa 12',
      });
      return;
    }

    const currencyCode = (currency ?? 'USD').toUpperCase();
    if (!isValidCurrency(currencyCode)) {
      res.status(400).json({ error: 'Invalid currency / Ifaranga ritari ryo' });
      return;
    }

    const principalUsd = await convertToUsd(val, currencyCode);
    if (principalUsd <= 0) {
      res.status(400).json({ error: 'Invalid amount / Umubare si wo' });
      return;
    }

    const user = await db.query.members.findFirst({
      where: eq(members.id, req.userId!),
    });
    if (!user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    await db.insert(loanRequests).values({
      externalId: `loan-${Date.now()}`,
      memberId: user.id,
      cooperativeId: user.cooperativeId,
      memberName: user.name,
      memberImage: user.profileImage,
      date: new Date().toISOString().split('T')[0],
      requestedAmount: principalUsd,
      principal: principalUsd,
      termMonths: term,
      interestRate: DEFAULT_INTEREST_RATE,
      currency: currencyCode as 'USD' | 'CDF',
      reasonEn: reasonEn || 'Cooperative support',
      reasonFr: reasonFr || 'Soutien à la coopérative',
      status: 'pending',
    });

    const state = await buildGlobalState(req.userId);
    res.json(state);
  } catch (error) {
    console.error('POST /api/request-loan error:', error);
    res.status(500).json({ error: 'Failed to submit loan request' });
  }
});

router.post('/approve-loan', requireAdmin, async (req: AuthRequest, res) => {
  try {
    const { id } = req.body as { id?: string };
    const loan = await db.query.loanRequests.findFirst({
      where: eq(loanRequests.externalId, id ?? ''),
    });
    if (!loan) {
      res.status(404).json({ error: 'Loan request not found' });
      return;
    }

    if (loan.status !== 'pending') {
      res.status(400).json({ error: 'Loan is not pending approval / Inguzanyo ntiyitegereje kwemezwa' });
      return;
    }

    const principal = loan.principal ?? loan.requestedAmount;
    const termMonths = (loan.termMonths ?? 6) as 6 | 12;
    const interestRate = loan.interestRate ?? DEFAULT_INTEREST_RATE;
    const totalOwed = calculateTotalOwed(principal, interestRate, termMonths);
    const repaymentDueDate = addMonthsToDate(loan.date, termMonths);

    await db
      .update(loanRequests)
      .set({
        status: 'approved',
        principal,
        requestedAmount: principal,
        termMonths,
        interestRate,
        totalOwed,
        amountPaid: 0,
        remainingBalance: totalOwed,
        repaymentDueDate,
        repaid: false,
        repaidAmount: 0,
      })
      .where(eq(loanRequests.id, loan.id));

    const coop = await db.query.cooperatives.findFirst({
      where: eq(cooperatives.id, loan.cooperativeId),
    });
    if (coop) {
      await db
        .update(cooperatives)
        .set({
          groupSavings: coop.groupSavings - principal,
          activeLoansCount: coop.activeLoansCount + 1,
          activeLoansAmount: coop.activeLoansAmount + totalOwed,
        })
        .where(eq(cooperatives.id, coop.id));
    }

    await db.insert(transactions).values({
      externalId: `tx-payout-${Date.now()}`,
      memberId: loan.memberId,
      cooperativeId: loan.cooperativeId,
      date: new Date().toISOString().split('T')[0],
      type: 'withdrew',
      amount: principal,
      runningBalance: 0,
      memberName: loan.memberName,
      status: 'success',
    });

    const state = await buildGlobalState(req.userId);
    res.json(state);
  } catch (error) {
    console.error('POST /api/approve-loan error:', error);
    res.status(500).json({ error: 'Failed to approve loan' });
  }
});

router.post('/decline-loan', requireAdmin, async (req: AuthRequest, res) => {
  try {
    const { id } = req.body as { id?: string };
    const loan = await db.query.loanRequests.findFirst({
      where: eq(loanRequests.externalId, id ?? ''),
    });
    if (!loan) {
      res.status(404).json({ error: 'Loan request not found' });
      return;
    }

    if (loan.status !== 'pending') {
      res.status(400).json({ error: 'Loan is not pending / Inguzanyo ntiyitegereje' });
      return;
    }

    await db
      .update(loanRequests)
      .set({ status: 'declined' })
      .where(eq(loanRequests.id, loan.id));

    const state = await buildGlobalState(req.userId);
    res.json(state);
  } catch (error) {
    console.error('POST /api/decline-loan error:', error);
    res.status(500).json({ error: 'Failed to decline loan' });
  }
});

router.post('/repay-loan', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { id, amount, currency } = req.body as {
      id?: string;
      amount?: number | string;
      currency?: string;
    };
    const loan = await db.query.loanRequests.findFirst({
      where: eq(loanRequests.externalId, id ?? ''),
    });
    if (!loan) {
      res.status(404).json({ error: 'Loan request not found' });
      return;
    }

    if (loan.status !== 'approved') {
      res.status(400).json({ error: 'Loan is not approved / Inguzanyo ntiyemewe' });
      return;
    }

    if (loan.repaid) {
      res.status(400).json({ error: 'Loan already repaid / Inguzanyo yamaze kwishyurwa' });
      return;
    }

    const principal = loan.principal ?? loan.requestedAmount;
    const termMonths = (loan.termMonths ?? 6) as 6 | 12;
    const interestRate = loan.interestRate ?? DEFAULT_INTEREST_RATE;
    const totalOwed =
      loan.totalOwed ?? calculateTotalOwed(principal, interestRate, termMonths);
    const currentPaid = loan.amountPaid ?? loan.repaidAmount ?? 0;
    const remaining =
      loan.remainingBalance ?? Math.max(0, totalOwed - currentPaid);

    if (remaining <= 0) {
      res.status(400).json({ error: 'Loan already repaid / Inguzanyo yamaze kwishyurwa' });
      return;
    }

    const payVal = Number(amount);
    if (isNaN(payVal) || payVal <= 0) {
      res.status(400).json({ error: 'Invalid payment amount / Umubare wo kwishyura si wo' });
      return;
    }

    const currencyCode = (currency ?? loan.currency ?? 'USD').toUpperCase();
    if (!isValidCurrency(currencyCode)) {
      res.status(400).json({ error: 'Invalid currency / Ifaranga ritari ryo' });
      return;
    }

    let paymentUsd = await convertToUsd(payVal, currencyCode);
    if (paymentUsd <= 0) {
      res.status(400).json({ error: 'Invalid payment amount / Umubare wo kwishyura si wo' });
      return;
    }

    if (paymentUsd > remaining) {
      paymentUsd = remaining;
    }

    const newAmountPaid = currentPaid + paymentUsd;
    const newRemaining = Math.max(0, totalOwed - newAmountPaid);
    const fullyRepaid = newRemaining <= 0;

    await db
      .update(loanRequests)
      .set({
        amountPaid: newAmountPaid,
        remainingBalance: newRemaining,
        repaidAmount: newAmountPaid,
        repaid: fullyRepaid,
        totalOwed,
      })
      .where(eq(loanRequests.id, loan.id));

    const coop = await db.query.cooperatives.findFirst({
      where: eq(cooperatives.id, loan.cooperativeId),
    });
    if (coop) {
      await db
        .update(cooperatives)
        .set({
          groupSavings: coop.groupSavings + paymentUsd,
          activeLoansAmount: Math.max(0, coop.activeLoansAmount - paymentUsd),
          activeLoansCount: fullyRepaid
            ? Math.max(0, coop.activeLoansCount - 1)
            : coop.activeLoansCount,
        })
        .where(eq(cooperatives.id, coop.id));
    }

    const user = await db.query.members.findFirst({
      where: eq(members.id, req.userId!),
    });

    await db.insert(transactions).values({
      externalId: `tx-repay-${Date.now()}`,
      memberId: loan.memberId,
      cooperativeId: loan.cooperativeId,
      date: new Date().toISOString().split('T')[0],
      type: 'repaid_loan',
      amount: paymentUsd,
      runningBalance: user?.savingsBalance ?? 0,
      memberName: loan.memberName,
      status: 'success',
    });

    const state = await buildGlobalState(req.userId);
    res.json(state);
  } catch (error) {
    console.error('POST /api/repay-loan error:', error);
    res.status(500).json({ error: 'Failed to repay loan' });
  }
});

router.post('/update-profile-image', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { profileImage } = req.body as { profileImage?: string };
    if (!profileImage) {
      res.status(400).json({ error: 'Profile image is required' });
      return;
    }

    const user = await db.query.members.findFirst({
      where: eq(members.id, req.userId!),
    });
    if (!user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    await db
      .update(members)
      .set({ profileImage })
      .where(eq(members.id, user.id));

    await db
      .update(loanRequests)
      .set({ memberImage: profileImage })
      .where(eq(loanRequests.memberId, user.id));

    const state = await buildGlobalState(req.userId);
    res.json(state);
  } catch (error) {
    console.error('POST /api/update-profile-image error:', error);
    res.status(500).json({ error: 'Failed to update profile image' });
  }
});

router.post('/flag-opportunity', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { id } = req.body as { id?: string };
    const opp = await db.query.opportunities.findFirst({
      where: eq(opportunities.externalId, id ?? ''),
    });
    if (!opp) {
      res.status(404).json({ error: 'Opportunity not found' });
      return;
    }

    await db
      .update(opportunities)
      .set({ isFlagged: !opp.isFlagged })
      .where(eq(opportunities.id, opp.id));

    const state = await buildGlobalState(req.userId);
    res.json(state);
  } catch (error) {
    console.error('POST /api/flag-opportunity error:', error);
    res.status(500).json({ error: 'Failed to flag opportunity' });
  }
});

router.post('/generate-tip', requireAuth, async (req: AuthRequest, res) => {
  try {
    const user = await db.query.members.findFirst({
      where: eq(members.id, req.userId!),
    });
    if (!user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const txs = await db.query.transactions.findMany({
      where: eq(transactions.memberId, user.id),
      orderBy: [desc(transactions.date)],
    });
    const txSummary = txs.map((t) => `${t.date}: ${t.type} ${t.amount} USD`).join('\n');

    const tip = await generateFinancialTip(user.name, user.savingsBalance, txSummary);

    await db
      .update(cooperatives)
      .set({ currentTip: tip })
      .where(eq(cooperatives.id, user.cooperativeId));

    const state = await buildGlobalState(req.userId);
    res.json(state);
  } catch (error) {
    console.error('POST /api/generate-tip error:', error);
    res.status(500).json({ error: 'Failed to generate tip' });
  }
});

router.post('/refresh-opportunities', requireAuth, async (req: AuthRequest, res) => {
  try {
    const user = await db.query.members.findFirst({
      where: eq(members.id, req.userId!),
    });
    if (!user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const coop = await getDefaultCooperative();
    const scrapeResult = await scrapeRwandaFinanceSources();
    const refreshResult = await refreshOpportunities(scrapeResult.context, coop.groupSavings);

    if (!refreshResult.ok) {
      const detail =
        scrapeResult.configured && scrapeResult.sourceCount > 0
          ? ` Firecrawl fetched ${scrapeResult.sourceCount} source(s), but Gemini could not curate them.`
          : scrapeResult.configured
            ? ' Firecrawl is configured but returned no usable content.'
            : ' Firecrawl key is missing, so only Gemini curation was attempted.';

      res.status(refreshResult.status).json({
        error: `${refreshResult.error}${detail}`,
        code: refreshResult.code,
      });
      return;
    }

    const list = refreshResult.opportunities;

    await db.delete(opportunities).where(eq(opportunities.cooperativeId, user.cooperativeId));

    for (const item of list) {
      await db.insert(opportunities).values({
        externalId: item.id || `opp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        cooperativeId: user.cooperativeId,
        titleEn: item.titleEn,
        titleFr: item.titleFr,
        source: item.source,
        sourceUrl: item.sourceUrl || undefined,
        returnRate: item.returnRate,
        summaryEn: item.summaryEn,
        summaryFr: item.summaryFr,
        isFlagged: false,
        foundAgo: item.foundAgo,
        category: item.category,
        image: item.image,
      });
    }

    const state = await buildGlobalState(req.userId);
    res.json(state);
  } catch (error) {
    console.error('POST /api/refresh-opportunities error:', error);
    res.status(500).json({ error: 'Failed to refresh opportunities' });
  }
});

router.post('/analyze-opportunity', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { id } = req.body as { id?: string };
    const opp = await db.query.opportunities.findFirst({
      where: eq(opportunities.externalId, id ?? ''),
    });
    if (!opp) {
      res.status(404).json({ error: 'Opportunity not found' });
      return;
    }

    const coop = await getDefaultCooperative();
    const analysis = await analyzeOpportunity(
      {
        id: opp.externalId,
        titleEn: opp.titleEn,
        titleFr: opp.titleFr,
        source: opp.source,
        returnRate: opp.returnRate,
        summaryEn: opp.summaryEn,
        summaryFr: opp.summaryFr,
        isFlagged: opp.isFlagged,
        foundAgo: opp.foundAgo,
        category: opp.category,
      },
      coop.groupSavings
    );

    await db
      .update(opportunities)
      .set({
        aiAnalysisEn: analysis.aiAnalysisEn,
        aiAnalysisFr: analysis.aiAnalysisFr,
      })
      .where(eq(opportunities.id, opp.id));

    const state = await buildGlobalState(req.userId);
    res.json(state);
  } catch (error) {
    console.error('POST /api/analyze-opportunity error:', error);
    res.status(500).json({ error: 'Failed to analyze opportunity' });
  }
});

export default router;
