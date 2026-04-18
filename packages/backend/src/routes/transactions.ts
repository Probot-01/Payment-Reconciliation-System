import { Router, Response, Request } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

// GET /api/transactions?page=1&limit=25&source=&status=&matchStatus=&search=&dateFrom=&dateTo=&amountMin=&amountMax=
router.get('/', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 25;
    const skip = (page - 1) * limit;

    const source = req.query.source as string;
    const status = req.query.status as string;
    const matchStatus = req.query.matchStatus as string;
    const search = req.query.search as string;
    const dateFrom = req.query.dateFrom as string;
    const dateTo = req.query.dateTo as string;
    const amountMin = req.query.amountMin as string;
    const amountMax = req.query.amountMax as string;
    const sortBy = (req.query.sortBy as string) || 'timestamp';
    const sortDir = (req.query.sortDir as string) || 'desc';

    const where: Record<string, unknown> = {};

    if (source) where.source = { in: source.split(',') };
    if (status) where.status = { in: status.split(',') };
    if (matchStatus) where.reconciliationStatus = { in: matchStatus.split(',') };
    if (search) {
      where.OR = [
        { externalId: { contains: search } },
        { payerRef: { contains: search } },
        { payeeRef: { contains: search } },
      ];
    }
    if (dateFrom || dateTo) {
      where.timestamp = {
        ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
        ...(dateTo ? { lte: new Date(dateTo) } : {}),
      };
    }
    if (amountMin || amountMax) {
      where.amount = {
        ...(amountMin ? { gte: parseInt(amountMin) } : {}),
        ...(amountMax ? { lte: parseInt(amountMax) } : {}),
      };
    }

    const validSortFields: Record<string, string> = {
      timestamp: 'timestamp',
      amount: 'amount',
      status: 'status',
      source: 'source',
      externalId: 'externalId',
    };
    const orderByField = validSortFields[sortBy] || 'timestamp';
    const orderDir = sortDir === 'asc' ? 'asc' : 'desc';

    const [transactions, total] = await Promise.all([
      prisma.transaction.findMany({
        where,
        orderBy: { [orderByField]: orderDir },
        skip,
        take: limit,
        include: {
          reconciliationResult: {
            select: {
              id: true,
              matchType: true,
              confidenceScore: true,
              status: true,
              amountDelta: true,
              orderId: true,
              order: { select: { orderId: true, customerName: true } },
            },
          },
        },
      }),
      prisma.transaction.count({ where }),
    ]);

    res.json({
      data: transactions,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error('Transactions error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/transactions/:id
router.get('/:id', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const tx = await prisma.transaction.findUnique({
      where: { id: String(req.params.id) },
      include: {
        reconciliationResult: {
          include: {
            order: true,
          },
        },
      },
    });

    if (!tx) {
      res.status(404).json({ error: 'Transaction not found' });
      return;
    }

    res.json(tx);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});


// POST /api/transactions/export — CSV download
router.post('/export', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { source, status, matchStatus, search, dateFrom, dateTo, amountMin, amountMax } = req.body as Record<string, string>;

    const where: Record<string, unknown> = {};
    if (source) where.source = { in: source.split(',') };
    if (status) where.status = { in: status.split(',') };
    if (matchStatus) where.reconciliationStatus = { in: matchStatus.split(',') };
    if (search) {
      where.OR = [
        { externalId: { contains: search } },
        { payerRef: { contains: search } },
        { payeeRef: { contains: search } },
      ];
    }
    if (dateFrom || dateTo) {
      where.timestamp = {
        ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
        ...(dateTo ? { lte: new Date(dateTo) } : {}),
      };
    }
    if (amountMin || amountMax) {
      where.amount = {
        ...(amountMin ? { gte: parseInt(amountMin) } : {}),
        ...(amountMax ? { lte: parseInt(amountMax) } : {}),
      };
    }

    const transactions = await prisma.transaction.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      take: 10000, // safety cap
      include: {
        reconciliationResult: {
          select: { matchType: true, confidenceScore: true, status: true },
        },
      },
    });

    // Build CSV
    const headers = ['externalId', 'source', 'amount_inr', 'status', 'reconciliationStatus', 'matchType', 'confidence', 'payerRef', 'payeeRef', 'timestamp'];
    const rows = transactions.map(t => [
      t.externalId,
      t.source,
      (t.amount / 100).toFixed(2),
      t.status,
      t.reconciliationStatus,
      t.reconciliationResult?.matchType || '',
      t.reconciliationResult?.confidenceScore ?? '',
      t.payerRef,
      t.payeeRef,
      t.timestamp.toISOString(),
    ].join(','));

    const csv = [headers.join(','), ...rows].join('\n');
    const filename = `transactions-export-${new Date().toISOString().split('T')[0]}.csv`;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (err) {
    console.error('Export error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
