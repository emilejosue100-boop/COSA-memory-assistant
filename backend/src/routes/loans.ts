import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { loanRequests } from '../db/schema.js';
import { requireAdmin, type AuthRequest } from '../middleware/auth.js';
import { getFlagAccuracyStats } from '../services/outcomeStats.js';
import { buildGlobalState } from '../utils/stateBuilder.js';
import type { LoanFinalOutcome } from '../types/index.js';

const VALID_OUTCOMES: LoanFinalOutcome[] = ['repaid_on_time', 'repaid_late', 'defaulted'];

const router = Router();

router.get('/outcome-stats', requireAdmin, async (_req: AuthRequest, res) => {
  try {
    const stats = await getFlagAccuracyStats();
    res.json(stats);
  } catch (err) {
    console.error('GET /api/outcome-stats error:', err);
    res.status(500).json({ error: 'Failed to fetch outcome stats' });
  }
});

router.post('/loans/:loanId/outcome', requireAdmin, async (req: AuthRequest, res) => {
  try {
    const loanId = req.params.loanId?.trim();
    const { outcome } = req.body as { outcome?: string };

    if (!loanId) {
      res.status(400).json({ error: 'loanId is required' });
      return;
    }

    if (!outcome || !VALID_OUTCOMES.includes(outcome as LoanFinalOutcome)) {
      res.status(400).json({ error: 'Invalid outcome value' });
      return;
    }

    const loan = await db.query.loanRequests.findFirst({
      where: eq(loanRequests.externalId, loanId),
    });

    if (!loan) {
      res.status(404).json({ error: 'Loan request not found' });
      return;
    }

    if (loan.status !== 'approved') {
      res.status(400).json({ error: 'Only approved loans can receive a final outcome' });
      return;
    }

    if (loan.finalOutcome) {
      res.status(409).json({ error: 'Final outcome already recorded for this loan' });
      return;
    }

    await db
      .update(loanRequests)
      .set({
        finalOutcome: outcome as LoanFinalOutcome,
        outcomeRecordedAt: new Date(),
      })
      .where(eq(loanRequests.id, loan.id));

    const state = await buildGlobalState(req.userId);
    res.json(state);
  } catch (err) {
    console.error('POST /api/loans/:loanId/outcome error:', err);
    res.status(500).json({ error: 'Failed to record loan outcome' });
  }
});

export default router;
