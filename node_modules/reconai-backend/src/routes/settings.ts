import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

const settingsSchema = z.object({
  amountTolerancePct: z.number().min(0).max(20).optional(),
  timeWindowHours: z.number().min(1).max(72).optional(),
  exactMatchWindowMins: z.number().min(1).max(60).optional(),
  confidenceCutoffAuto: z.number().min(50).max(100).optional(),
  confidenceCutoffFlag: z.number().min(0).max(90).optional(),
  staleOrderHours: z.number().min(1).max(168).optional(),
  emailOnUnmatched: z.boolean().optional(),
  dailyDigest: z.boolean().optional(),
  unMatchedThreshold: z.number().min(1).optional(),
});

// ─── Helper: get-or-create singleton settings ────────────────────────────────
async function getSettings() {
  let settings = await prisma.appSettings.findUnique({ where: { id: 'singleton' } });
  if (!settings) {
    settings = await prisma.appSettings.create({ data: { id: 'singleton' } });
  }
  return settings;
}

// ─── GET /api/settings ───────────────────────────────────────────────────────
router.get('/', authenticate, async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const settings = await getSettings();
    res.json(settings);
  } catch (err) {
    console.error('Settings GET error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── PATCH /api/settings ─────────────────────────────────────────────────────
router.patch('/', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data = settingsSchema.parse(req.body);
    await getSettings(); // ensure exists
    const updated = await prisma.appSettings.update({
      where: { id: 'singleton' },
      data,
    });
    res.json(updated);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: err.errors });
      return;
    }
    console.error('Settings PATCH error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── GET /api/settings/thresholds ────────────────────────────────────────────
router.get('/thresholds', authenticate, async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const s = await getSettings();
    res.json({
      amountTolerancePct: s.amountTolerancePct,
      timeWindowHours: s.timeWindowHours,
      exactMatchWindowMins: s.exactMatchWindowMins,
      confidenceCutoffAuto: s.confidenceCutoffAuto,
      confidenceCutoffFlag: s.confidenceCutoffFlag,
      staleOrderHours: s.staleOrderHours,
    });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── PUT /api/settings/thresholds ────────────────────────────────────────────
router.put('/thresholds', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data = settingsSchema.parse(req.body);
    await getSettings();
    const updated = await prisma.appSettings.update({ where: { id: 'singleton' }, data });
    res.json({
      amountTolerancePct: updated.amountTolerancePct,
      timeWindowHours: updated.timeWindowHours,
      exactMatchWindowMins: updated.exactMatchWindowMins,
      confidenceCutoffAuto: updated.confidenceCutoffAuto,
      confidenceCutoffFlag: updated.confidenceCutoffFlag,
      staleOrderHours: updated.staleOrderHours,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: err.errors });
      return;
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── GET /api/settings/sources ───────────────────────────────────────────────
const PAYMENT_SOURCES = [
  { id: 'UPI_GPAY',        name: 'Google Pay',    category: 'UPI',    enabled: true,  fee: 0 },
  { id: 'UPI_PHONEPE',     name: 'PhonePe',       category: 'UPI',    enabled: true,  fee: 0 },
  { id: 'CARD_VISA',       name: 'Visa Card',     category: 'CARD',   enabled: true,  fee: 1.8 },
  { id: 'CARD_MC',         name: 'Mastercard',    category: 'CARD',   enabled: true,  fee: 1.8 },
  { id: 'WALLET_PAYTM',    name: 'Paytm Wallet',  category: 'WALLET', enabled: true,  fee: 0 },
  { id: 'WALLET_AMAZON',   name: 'Amazon Pay',    category: 'WALLET', enabled: true,  fee: 0 },
];

// In-memory source config override
let sourceConfig = [...PAYMENT_SOURCES];

router.get('/sources', authenticate, (_req: AuthRequest, res: Response): void => {
  res.json({ sources: sourceConfig });
});

// ─── PUT /api/settings/sources ───────────────────────────────────────────────
router.put('/sources', authenticate, (req: AuthRequest, res: Response): void => {
  try {
    const { sources } = req.body as { sources?: typeof PAYMENT_SOURCES };
    if (!sources || !Array.isArray(sources)) {
      res.status(400).json({ error: 'sources array is required' });
      return;
    }
    sourceConfig = sources;
    res.json({ sources: sourceConfig });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── GET /api/settings/users — list users (admin only) ───────────────────────
router.get('/users', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (req.userRole !== 'ADMIN') {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }
    const users = await prisma.user.findMany({
      select: { id: true, email: true, name: true, role: true, lastLogin: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });
    res.json(users);
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
