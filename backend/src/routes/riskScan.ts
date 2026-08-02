import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { desc } from 'drizzle-orm';
import { db } from '../db/index.js';
import { members, riskScanLog } from '../db/schema.js';
import { requireAdmin, type AuthRequest } from '../middleware/auth.js';
import { isMcpToolUseEnabled } from '../services/bedrockMcp.js';
import { RiskScanError, runCooperativeRiskScan } from '../services/riskScan.js';

const router = Router();

router.post('/risk-scan', requireAdmin, async (_req: AuthRequest, res) => {
  try {
    if (!isMcpToolUseEnabled()) {
      res.status(503).json({
        error: 'Risk scan requires MCP tool use (set ENABLE_MCP_TOOL_USE=true)',
      });
      return;
    }

    const { result, id } = await runCooperativeRiskScan();
    res.json({ result, id });
  } catch (err) {
    if (err instanceof RiskScanError) {
      console.error('risk-scan error:', err);
      res.status(503).json({ error: err.message });
      return;
    }
    console.error('risk-scan error:', err);
    res.status(500).json({ error: 'Risk scan failed' });
  }
});

router.get('/risk-scan/latest', requireAdmin, async (_req: AuthRequest, res) => {
  try {
    const latest = await db.query.riskScanLog.findFirst({
      orderBy: desc(riskScanLog.createdAt),
    });

    if (!latest) {
      res.json(null);
      return;
    }

    res.json({
      id: String(latest.id),
      scanResult: latest.scanResult,
      createdAt: latest.createdAt,
      reviewed: latest.reviewed,
      reviewedBy: latest.reviewedBy,
      reviewedAt: latest.reviewedAt,
    });
  } catch (err) {
    console.error('GET /api/risk-scan/latest error:', err);
    res.status(500).json({ error: 'Failed to fetch latest risk scan' });
  }
});

router.post('/risk-scan/:id/reviewed', requireAdmin, async (req: AuthRequest, res) => {
  try {
    const scanId = req.params.id?.trim();
    if (!scanId) {
      res.status(400).json({ error: 'Scan id is required' });
      return;
    }

    const admin = req.userId
      ? await db.query.members.findFirst({ where: eq(members.id, req.userId) })
      : null;
    const reviewedBy = admin?.name ?? 'admin';

    const updated = await db
      .update(riskScanLog)
      .set({
        reviewed: true,
        reviewedBy,
        reviewedAt: new Date(),
      })
      .where(eq(riskScanLog.id, scanId))
      .returning({ id: riskScanLog.id });

    if (!updated.length) {
      res.status(404).json({ error: 'Risk scan not found' });
      return;
    }

    res.json({ success: true });
  } catch (err) {
    console.error('POST /api/risk-scan/:id/reviewed error:', err);
    res.status(500).json({ error: 'Failed to mark scan as reviewed' });
  }
});

export default router;
