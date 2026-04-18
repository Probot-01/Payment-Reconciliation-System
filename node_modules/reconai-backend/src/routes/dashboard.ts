import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

// GET /api/dashboard?range=7d|30d|today
router.get('/', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const range = (req.query.range as string) || '7d';
    const now = new Date();
    let startDate: Date;

    if (range === 'today') {
      startDate = new Date(now);
      startDate.setHours(0, 0, 0, 0);
    } else if (range === '30d') {
      startDate = new Date(now.getTime() - 30 * 86400000);
    } else {
      startDate = new Date(now.getTime() - 7 * 86400000);
    }

    // Total volume (paise)
    const volumeResult = await prisma.transaction.aggregate({
      where: {
        timestamp: { gte: startDate },
        status: 'SUCCESS',
      },
      _sum: { amount: true },
      _count: true,
    });

    // Reconciliation status breakdown
    const statusBreakdown = await prisma.reconciliationResult.groupBy({
      by: ['status'],
      _count: { id: true },
      where: { createdAt: { gte: startDate } },
    });

    const matchedCount = statusBreakdown.find(s => s.status === 'AUTO_MATCHED')?._count.id || 0;
    const flaggedCount = statusBreakdown.find(s => s.status === 'FLAGGED')?._count.id || 0;
    const resolvedCount = statusBreakdown.find(s => s.status === 'MANUALLY_RESOLVED')?._count.id || 0;
    const ignoredCount = statusBreakdown.find(s => s.status === 'IGNORED')?._count.id || 0;
    const totalRecon = matchedCount + flaggedCount + resolvedCount + ignoredCount;
    const matchRate = totalRecon > 0 ? ((matchedCount + resolvedCount) / totalRecon * 100).toFixed(1) : '0.0';

    // Pending orders
    const pendingOrders = await prisma.salesOrder.count({
      where: { status: { in: ['UNPAID', 'PARTIAL'] } },
    });

    // Average resolution time (minutes)
    const resolvedResults = await prisma.reconciliationResult.findMany({
      where: { status: 'MANUALLY_RESOLVED', resolvedAt: { not: null } },
      select: { createdAt: true, resolvedAt: true },
      take: 100,
    });
    const avgResolutionMins = resolvedResults.length > 0
      ? resolvedResults.reduce((acc, r) => {
          const diff = r.resolvedAt!.getTime() - r.createdAt.getTime();
          return acc + diff / 60000;
        }, 0) / resolvedResults.length
      : 0;

    // Payment source breakdown
    const sourceBreakdown = await prisma.transaction.groupBy({
      by: ['source'],
      where: {
        timestamp: { gte: startDate },
        status: 'SUCCESS',
      },
      _sum: { amount: true },
      _count: { id: true },
    });

    // Daily reconciliation data for chart (last 7 or 30 days)
    const days = range === '30d' ? 30 : 7;
    const dailyData: { date: string; matched: number; flagged: number; unmatched: number; volume: number }[] = [];

    for (let i = days - 1; i >= 0; i--) {
      const dayStart = new Date(now);
      dayStart.setDate(dayStart.getDate() - i);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(dayStart);
      dayEnd.setHours(23, 59, 59, 999);

      const dayResults = await prisma.reconciliationResult.groupBy({
        by: ['status'],
        _count: { id: true },
        where: { createdAt: { gte: dayStart, lte: dayEnd } },
      });

      const dayVol = await prisma.transaction.aggregate({
        where: { timestamp: { gte: dayStart, lte: dayEnd }, status: 'SUCCESS' },
        _sum: { amount: true },
      });

      dailyData.push({
        date: dayStart.toISOString().split('T')[0],
        matched: dayResults.find(r => r.status === 'AUTO_MATCHED')?._count.id || 0,
        flagged: dayResults.find(r => r.status === 'FLAGGED')?._count.id || 0,
        unmatched: (dayResults.find(r => r.status === 'MANUALLY_RESOLVED')?._count.id || 0) +
                   (dayResults.find(r => r.status === 'IGNORED')?._count.id || 0),
        volume: dayVol._sum.amount || 0,
      });
    }

    // Match type breakdown for donut
    const matchTypeBreakdown = await prisma.reconciliationResult.groupBy({
      by: ['matchType'],
      _count: { id: true },
      where: { createdAt: { gte: startDate } },
    });

    // Recent flags
    const recentFlags = await prisma.reconciliationResult.findMany({
      where: {
        status: 'FLAGGED',
        createdAt: { gte: startDate },
      },
      include: {
        transaction: { select: { externalId: true, source: true, amount: true, timestamp: true } },
        order: { select: { orderId: true, customerName: true, amount: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    res.json({
      kpis: {
        totalVolume: volumeResult._sum.amount || 0,
        totalTransactions: volumeResult._count,
        matchRate: parseFloat(matchRate),
        flaggedCount,
        pendingOrders,
        avgResolutionMins: Math.round(avgResolutionMins),
      },
      statusBreakdown: {
        matched: matchedCount + resolvedCount,
        flagged: flaggedCount,
        unmatched: ignoredCount,
      },
      sourceBreakdown: sourceBreakdown.map(s => ({
        source: s.source,
        amount: s._sum.amount || 0,
        count: s._count.id,
      })),
      dailyData,
      matchTypeBreakdown: matchTypeBreakdown.map(m => ({
        type: m.matchType,
        count: m._count.id,
      })),
      recentFlags: recentFlags.map(f => ({
        id: f.id,
        matchType: f.matchType,
        confidenceScore: f.confidenceScore,
        amountDelta: f.amountDelta,
        timeDelta: f.timeDelta,
        notes: f.notes,
        createdAt: f.createdAt,
        transaction: f.transaction,
        order: f.order,
      })),
    });
  } catch (err) {
    console.error('Dashboard error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
