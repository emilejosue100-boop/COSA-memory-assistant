import jwt from 'jsonwebtoken';
import { eq } from 'drizzle-orm';
import type { Request, Response, NextFunction } from 'express';
import { db } from '../db/index.js';
import { members } from '../db/schema.js';
import type { JwtPayload } from '../types/index.js';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

export function signToken(userId: string): string {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '7d' });
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, JWT_SECRET) as JwtPayload;
}

export interface AuthRequest extends Request {
  userId?: string;
}

export function optionalAuth(req: AuthRequest, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    try {
      const payload = verifyToken(header.slice(7));
      req.userId = payload.userId;
    } catch {
      // Invalid token — treat as unauthenticated
    }
  }
  next();
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }

  try {
    const payload = verifyToken(header.slice(7));
    req.userId = payload.userId;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export async function requireMember(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }

  try {
    const payload = verifyToken(header.slice(7));
    req.userId = payload.userId;
    const user = await db.query.members.findFirst({
      where: eq(members.id, req.userId),
    });
    if (!user || user.role !== 'member') {
      res.status(403).json({ error: 'Member access required' });
      return;
    }
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export async function requireAdmin(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }

  try {
    const payload = verifyToken(header.slice(7));
    req.userId = payload.userId;
    const user = await db.query.members.findFirst({
      where: eq(members.id, req.userId),
    });
    if (!user || user.role !== 'admin') {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}
