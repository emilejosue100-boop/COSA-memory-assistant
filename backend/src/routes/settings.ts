import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { exchangeRates, members } from '../db/schema.js';
import { requireAdmin, type AuthRequest } from '../middleware/auth.js';
import { invalidateRateCache } from '../services/currency.js';

const router = Router();

router.get('/exchange-rates', requireAdmin, async (_req, res) => {
  try {
    const rows = await db.select().from(exchangeRates);
    res.json(
      rows.map((row) => ({
        id: row.id,
        baseCurrency: row.baseCurrency,
        currency: row.currency,
        rate: Number(row.rate),
        updatedAt: row.updatedAt,
        updatedBy: row.updatedBy,
      }))
    );
  } catch (err) {
    console.error('GET /api/exchange-rates error:', err);
    res.status(500).json({ error: 'Failed to fetch exchange rates' });
  }
});

router.post('/exchange-rates', requireAdmin, async (req: AuthRequest, res) => {
  try {
    const { currency, rate } = req.body as { currency?: string; rate?: number | string };

    const parsedRate = Number(rate);
    if (currency !== 'CDF' || !rate || Number.isNaN(parsedRate) || parsedRate <= 0) {
      res.status(400).json({
        error: 'Only CDF is supported, and rate must be a positive number',
      });
      return;
    }

    const admin = req.userId
      ? await db.query.members.findFirst({ where: eq(members.id, req.userId) })
      : null;
    const updatedBy = admin?.name ?? 'admin';

    await db
      .update(exchangeRates)
      .set({
        rate: String(parsedRate),
        updatedAt: new Date(),
        updatedBy,
      })
      .where(eq(exchangeRates.currency, 'CDF'));

    invalidateRateCache();

    res.json({ success: true });
  } catch (err) {
    console.error('POST /api/exchange-rates error:', err);
    res.status(500).json({ error: 'Failed to update exchange rate' });
  }
});

export default router;
