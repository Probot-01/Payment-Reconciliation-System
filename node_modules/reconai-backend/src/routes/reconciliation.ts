import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { authenticate, AuthRequest } from '../middleware/auth';
import { runReconciliation } from '../engine/reconcile';

const router = Router();
const prisma = new PrismaClient();

// GET /api/reconciliation
router.get('/', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 25;
    const skip = (page - 1) * limit;

    const matchType = req.query.matchType as string;
    const status = req.query.status as string;
    const search = req.query.search as string;
    const dateFrom = req.query.dateFrom as string;
    const dateTo = req.query.dateTo as string;
    const sortBy = (req.query.sortBy as string) || 'createdAt';
    const sortDir = (req.query.sortDir as string) || 'desc';

    const where: Record<string, unknown> = {};
    if (matchType) where.matchType = { in: matchType.split(',') };
    if (status) where.status = { in: status.split(',') };
    if (dateFrom || dateTo) {
      where.createdAt = {
        ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
        ...(dateTo ? { lte: new Date(dateTo) } : {}),
      };
    }
    if (search) {
      where.OR = [
        { transaction: { externalId: { contains: search } } },
        { transaction: { payerRef: { contains: search } } },
        { order: { orderId: { contains: search } } },
        { order: { customerName: { contains: search } } },
      ];
    }

    const validSortFields: Record<string, string> = {
      createdAt: 'createdAt',
      confidenceScore: 'confidenceScore',
      amountDelta: 'amountDelta',
      matchType: 'matchType',
      status: 'status',
    };
    const orderByField = validSortFields[sortBy] || 'createdAt';
    const orderDir = sortDir === 'asc' ? 'asc' : 'desc';

    const [results, total] = await Promise.all([
      prisma.reconciliationResult.findMany({
        where,
        orderBy: { [orderByField]: orderDir },
        skip,
        take: limit,
        include: {
          transaction: {
            select: {
              id: true, externalId: true, source: true, amount: true,
              status: true, payerRef: true, timestamp: true,
            },
          },
          order: {
            select: {
              id: true, orderId: true, customerName: true, amount: true,
              status: true, paymentExpected: true,
            },
          },
          resolver: { select: { name: true, email: true } },
        },
      }),
      prisma.reconciliationResult.count({ where }),
    ]);

    // Flagged count for badge
    const flaggedCount = await prisma.reconciliationResult.count({
      where: { status: 'FLAGGED' },
    });

    res.json({
      data: results,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      flaggedCount,
    });
  } catch (err) {
    console.error('Reconciliation list error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/reconciliation/stats
router.get('/stats', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const range = (req.query.range as string) || '30d';
    const now = new Date();
    let startDate: Date;
    if (range === 'today') {
      startDate = new Date(now); startDate.setHours(0, 0, 0, 0);
    } else if (range === '7d') {
      startDate = new Date(now.getTime() - 7 * 86400000);
    } else {
      startDate = new Date(now.getTime() - 30 * 86400000);
    }

    // Total volume from matched transactions
    const volumeResult = await prisma.transaction.aggregate({
      where: { timestamp: { gte: startDate }, status: 'SUCCESS' },
      _sum: { amount: true },
      _count: true,
    });

    // Status breakdown
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
    const matchRate = totalRecon > 0 ? parseFloat(((matchedCount + resolvedCount) / totalRecon * 100).toFixed(1)) : 0;

    // Pending orders
    const pendingOrders = await prisma.salesOrder.count({
      where: { status: { in: ['UNPAID', 'PARTIAL'] } },
    });

    // Breakdown by matchType
    const matchTypeBreakdown = await prisma.reconciliationResult.groupBy({
      by: ['matchType'],
      _count: { id: true },
      where: { createdAt: { gte: startDate } },
    });

    // Breakdown by source (from transactions)
    const sourceBreakdown = await prisma.transaction.groupBy({
      by: ['source'],
      where: { timestamp: { gte: startDate }, status: 'SUCCESS' },
      _sum: { amount: true },
      _count: true,
    });

    res.json({
      totalVolume: volumeResult._sum.amount || 0,
      totalTransactions: volumeResult._count,
      matchRate,
      flaggedCount,
      pendingOrders,
      breakdownByMatchType: matchTypeBreakdown.map(m => ({ type: m.matchType, count: m._count.id })),
      breakdownBySource: sourceBreakdown.map(s => ({
        source: s.source, amount: s._sum.amount || 0, count: s._count,
      })),
      statusBreakdown: {
        matched: matchedCount + resolvedCount,
        flagged: flaggedCount,
        unmatched: ignoredCount,
      },
    });
  } catch (err) {
    console.error('Reconciliation stats error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/reconciliation/:id
router.get('/:id', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await prisma.reconciliationResult.findUnique({
      where: { id: String(req.params.id) },
      include: {
        transaction: true,
        order: true,
        resolver: { select: { name: true, email: true } },
      },
    });
    if (!result) {
      res.status(404).json({ error: 'Reconciliation result not found' });
      return;
    }
    res.json(result);
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

const resolveSchema = z.object({
  status: z.enum(['AUTO_MATCHED', 'FLAGGED', 'MANUALLY_RESOLVED', 'IGNORED']).optional(),
  action: z.enum(['ACCEPT', 'REJECT', 'EXCEPTION', 'IGNORE']).optional(),
  notes: z.string().optional(),
  orderId: z.string().optional(),
  resolvedBy: z.string().optional(),
}).refine(d => d.status || d.action, { message: 'Either status or action is required' });

// Shared resolve handler
async function handleResolve(req: AuthRequest, res: Response): Promise<void> {
  try {
    const body = resolveSchema.parse(req.body);

    // Map action to status
    let finalStatus: string;
    if (body.action) {
      const actionMap: Record<string, string> = {
        ACCEPT: 'MANUALLY_RESOLVED',
        REJECT: 'FLAGGED',
        EXCEPTION: 'IGNORED',
        IGNORE: 'IGNORED',
      };
      finalStatus = actionMap[body.action];
    } else {
      finalStatus = body.status!;
    }

    const isResolved = finalStatus === 'MANUALLY_RESOLVED' || finalStatus === 'IGNORED';

    // Verify the user exists before using as FK (guards against stale JWT after DB reset)
    let resolvedByUserId: string | null = null;
    if (isResolved && req.userId) {
      const userExists = await prisma.user.findUnique({ where: { id: req.userId }, select: { id: true } });
      resolvedByUserId = userExists ? req.userId : null;
    }

    const updateData: Record<string, unknown> = {
      status: finalStatus,
      notes: body.notes || null,
      resolvedBy: resolvedByUserId,
      resolvedAt: isResolved ? new Date() : null,
    };
    if (body.orderId) updateData.orderId = body.orderId;

    const updated = await prisma.reconciliationResult.update({
      where: { id: String(req.params.id) },
      data: updateData,
      include: { transaction: true, order: true },
    });

    // Update linked transaction's reconciliationStatus
    if (updated.transactionId) {
      const txStatus =
        finalStatus === 'MANUALLY_RESOLVED' ? 'MATCHED' :
        finalStatus === 'IGNORED' ? 'IGNORED' :
        finalStatus === 'FLAGGED' ? 'FLAGGED' : 'MATCHED';
      await prisma.transaction.update({
        where: { id: updated.transactionId },
        data: { reconciliationStatus: txStatus },
      });
    }

    res.json(updated);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: err.errors });
      return;
    }
    console.error('Resolve error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// PATCH /api/reconciliation/:id (original frontend contract)
router.patch('/:id', authenticate, handleResolve);

// POST /api/reconciliation/:id/resolve (spec alias)
router.post('/:id/resolve', authenticate, handleResolve);

// Shared bulk resolve handler
async function handleBulkResolve(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { ids, status, action, notes } = req.body as {
      ids: string[]; status?: string; action?: string; notes?: string;
    };

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({ error: 'ids array is required' });
      return;
    }

    // Map action to status
    let finalStatus = status;
    if (action && !finalStatus) {
      const actionMap: Record<string, string> = {
        ACCEPT: 'MANUALLY_RESOLVED',
        REJECT: 'FLAGGED',
        EXCEPTION: 'IGNORED',
        IGNORE: 'IGNORED',
      };
      finalStatus = actionMap[action];
    }
    if (!finalStatus) {
      res.status(400).json({ error: 'status or action is required' });
      return;
    }

    const isResolved = finalStatus === 'MANUALLY_RESOLVED' || finalStatus === 'IGNORED';
    const result = await prisma.reconciliationResult.updateMany({
      where: { id: { in: ids } },
      data: {
        status: finalStatus,
        notes: notes || null,
        resolvedBy: isResolved ? req.userId : null,
        resolvedAt: isResolved ? new Date() : null,
      },
    });

    res.json({ updated: result.count });
  } catch (err) {
    console.error('Bulk resolve error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// POST /api/reconciliation/bulk (frontend contract)
router.post('/bulk', authenticate, handleBulkResolve);
// POST /api/reconciliation/bulk-resolve (spec alias)
router.post('/bulk-resolve', authenticate, handleBulkResolve);

// POST /api/reconciliation/run — Re-run engine on demand
router.post('/run', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const settings = await prisma.appSettings.findUnique({ where: { id: 'singleton' } });

    // Process all transactions that have not yet been fully matched
    const [transactions, orders] = await Promise.all([
      prisma.transaction.findMany({
        where: { reconciliationStatus: { in: ['UNPROCESSED', 'PENDING'] } },
      }),
      prisma.salesOrder.findMany({ where: { status: { not: 'PAID' } } }),
    ]);

    if (transactions.length === 0 && orders.length === 0) {
      res.json({ message: 'Nothing to reconcile', processed: 0, saved: 0 });
      return;
    }

    const txInputs = transactions.map(t => ({
      id: t.id, externalId: t.externalId, source: t.source,
      amount: t.amount, currency: t.currency, status: t.status,
      payerRef: t.payerRef, payeeRef: t.payeeRef, timestamp: new Date(t.timestamp),
    }));
    const orderInputs = orders.map(o => ({
      id: o.id, orderId: o.orderId, customerId: o.customerId,
      customerName: o.customerName, amount: o.amount, currency: o.currency,
      paymentExpected: new Date(o.paymentExpected),
      paymentReceivedAt: o.paymentReceivedAt ? new Date(o.paymentReceivedAt) : null,
      status: o.status, source: o.source, createdAt: new Date(o.createdAt),
    }));

    const cfg = settings ? {
      amountTolerancePct: settings.amountTolerancePct,
      timeWindowHours: settings.timeWindowHours,
      exactMatchWindowMins: settings.exactMatchWindowMins,
      confidenceCutoffAuto: settings.confidenceCutoffAuto,
      confidenceCutoffFlag: settings.confidenceCutoffFlag,
      staleOrderHours: settings.staleOrderHours,
    } : {};

    const matchResults = runReconciliation(txInputs, orderInputs, cfg);
    let saved = 0;
    for (const result of matchResults) {
      try {
        await prisma.reconciliationResult.create({
          data: {
            transactionId: result.transactionId,
            orderId: result.orderId,
            matchType: result.matchType,
            confidenceScore: result.confidenceScore,
            amountDelta: result.amountDelta,
            timeDelta: result.timeDelta,
            status: result.status,
            notes: result.notes,
          },
        });

        if (result.transactionId) {
          await prisma.transaction.update({
            where: { id: result.transactionId },
            data: { reconciliationStatus: result.status === 'FLAGGED' ? 'FLAGGED' : 'MATCHED' },
          });
        }

        if (result.orderId) {
          const orderStatus =
            result.matchType === 'PARTIAL' ? 'PARTIAL' :
            result.matchType === 'UNMATCHED_ORDER' ? 'UNPAID' :
            result.status === 'AUTO_MATCHED' ? 'PAID' : 'PARTIAL';
          await prisma.salesOrder.update({
            where: { id: result.orderId },
            data: { status: orderStatus },
          });
        }

        saved++;
      } catch {
        // Skip duplicates
      }
    }

    res.json({
      message: 'Reconciliation complete',
      processed: matchResults.length,
      saved,
      breakdown: {
        matched: matchResults.filter(r => r.status === 'AUTO_MATCHED').length,
        flagged: matchResults.filter(r => r.status === 'FLAGGED').length,
      },
    });
  } catch (err) {
    console.error('Run engine error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
