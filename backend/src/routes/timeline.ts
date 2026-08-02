import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { members } from '../db/schema.js';
import { requireAdmin, type AuthRequest } from '../middleware/auth.js';
import { getMemberTimeline } from '../services/timeline.js';

const router = Router();

router.get('/timeline/:memberId', requireAdmin, async (req: AuthRequest, res) => {
  try {
    const memberId = req.params.memberId?.trim();
    if (!memberId) {
      res.status(400).json({ error: 'memberId is required' });
      return;
    }

    const member = await db.query.members.findFirst({
      where: eq(members.id, memberId),
    });
    if (!member) {
      res.status(404).json({ error: 'Member not found' });
      return;
    }

    const events = await getMemberTimeline(memberId);

    res.json(
      events.map((event) => ({
        id: event.id,
        memberId: event.memberId,
        eventType: event.eventType,
        eventTime: event.eventTime,
        description: event.description,
        tags: event.tags ?? [],
        complianceFlag: event.complianceFlag,
      }))
    );
  } catch (err) {
    console.error('GET /api/timeline/:memberId error:', err);
    res.status(500).json({ error: 'Failed to fetch member timeline' });
  }
});

export default router;
