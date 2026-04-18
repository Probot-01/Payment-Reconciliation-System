import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

// GET /api/orders
router.get('/', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 25;
    const skip = (page - 1) * limit;

    const status = req.query.status as string;
    const search = req.query.search as string;
    const dateFrom = req.query.dateFrom as string;
    const dateTo = req.query.dateTo as string;
    const amountMin = req.query.amountMin as string;
    const amountMax = req.query.amountMax as string;
    const overdue = req.query.overdue as string;
    const sortBy = (req.query.sortBy as string) || 'createdAt';
    const sortDir = (req.query.sortDir as string) || 'desc';

    const where: Record<string, unknown> = {};
    if (status) where.status = { in: status.split(',') };
    if (search) {
      where.OR = [
        { orderId: { contains: search } },
        { customerName: { contains: search } },
        { customerId: { contains: search } },
      ];
    }
    if (dateFrom || dateTo) {
      where.paymentExpected = {
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
    if (overdue === 'true') {
      where.status = { in: ['UNPAID', 'PARTIAL'] };
      where.paymentExpected = { lt: new Date() };
    }

    const validSortFields: Record<string, string> = {
      createdAt: 'createdAt',
      amount: 'amount',
      status: 'status',
      paymentExpected: 'paymentExpected',
      orderId: 'orderId',
      customerName: 'customerName',
    };
    const orderByField = validSortFields[sortBy] || 'createdAt';
    const orderDir = sortDir === 'asc' ? 'asc' : 'desc';

    const [orders, total] = await Promise.all([
      prisma.salesOrder.findMany({
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
              transactionId: true,
              transaction: { select: { externalId: true, source: true } },
            },
          },
        },
      }),
      prisma.salesOrder.count({ where }),
    ]);

    res.json({
      data: orders,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error('Orders error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/orders/:id
router.get('/:id', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const order = await prisma.salesOrder.findUnique({
      where: { id: String(req.params.id) },
      include: {
        reconciliationResult: {
          include: { transaction: true },
        },
      },
    });

    if (!order) {
      res.status(404).json({ error: 'Order not found' });
      return;
    }

    res.json(order);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
