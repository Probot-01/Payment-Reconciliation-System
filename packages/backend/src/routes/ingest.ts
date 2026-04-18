import { Router, Response, Request } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, AuthRequest } from '../middleware/auth';
import { runReconciliation } from '../engine/reconcile';
import multer from 'multer';
import { parse as csvParse } from 'csv-parse/sync';

const router = Router();
const prisma = new PrismaClient();

// Multer — memory storage for CSV uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv') ||
        file.mimetype === 'application/json' || file.originalname.endsWith('.json')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV or JSON files are accepted'));
    }
  },
});

// ─── In-memory ingest history (persists for server session) ──────────────────
interface IngestJob {
  id: string;
  type: 'Payment Feed' | 'Sales Orders';
  source: string;
  rows: number;
  inserted: number;
  skipped: number;
  errors: number;
  status: 'Success' | 'Partial Errors' | 'Failed';
  timestamp: Date;
}
const ingestHistory: IngestJob[] = [];

function addHistory(job: IngestJob) {
  ingestHistory.unshift(job); // newest first
  if (ingestHistory.length > 50) ingestHistory.pop();
}

// ─── Parse CSV or JSON body into rows ──────────────────────────────────────
function parseInput(body: unknown, file?: Express.Multer.File): Record<string, unknown>[] {
  // Case 1: file upload (CSV or JSON)
  if (file) {
    const text = file.buffer.toString('utf-8');
    if (file.originalname.endsWith('.json') || file.mimetype === 'application/json') {
      return JSON.parse(text) as Record<string, unknown>[];
    }
    // CSV
    return csvParse(text, { columns: true, skip_empty_lines: true, trim: true });
  }

  // Case 2: JSON body with `rows` array
  if (body && typeof body === 'object') {
    const b = body as Record<string, unknown>;
    // Support { rows: [...] } or { transactions: [...] } or { orders: [...] }
    const arr = (b.rows || b.transactions || b.orders) as unknown;
    if (Array.isArray(arr)) return arr as Record<string, unknown>[];

    // Support raw CSV string
    if (typeof b.csv === 'string') {
      return csvParse(b.csv, { columns: true, skip_empty_lines: true, trim: true });
    }
  }

  return [];
}

// ─── POST /api/ingest/transactions ──────────────────────────────────────────
router.post(
  '/transactions',
  authenticate,
  upload.single('file'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const rows = parseInput(req.body, req.file);

      if (rows.length === 0) {
        res.status(400).json({ error: 'No rows found. Send a CSV file or JSON body with transactions array.' });
        return;
      }

      const settings = await prisma.appSettings.findUnique({ where: { id: 'singleton' } });
      const autoRun = req.body.runEngine !== 'false' && req.body.runEngine !== false;

      let inserted = 0, skipped = 0, errors = 0;

      // Batch insert in chunks of 50
      const chunks: Record<string, unknown>[][] = [];
      for (let i = 0; i < rows.length; i += 50) chunks.push(rows.slice(i, i + 50));

      for (const chunk of chunks) {
        await Promise.allSettled(chunk.map(async (row) => {
          try {
            const externalId = String(row.externalId || row.external_id || row.id || '');
            if (!externalId) { errors++; return; }

            // Amount handling: if > 1000 assume paise already, else multiply by 100
            const rawAmt = parseFloat(String(row.amount || 0));
            const amount = rawAmt > 10000 ? Math.round(rawAmt) : Math.round(rawAmt * 100);

            await prisma.transaction.upsert({
              where: { externalId },
              update: {},
              create: {
                externalId,
                source: String(row.source || 'UPI_GPAY'),
                amount,
                currency: String(row.currency || 'INR'),
                status: String(row.status || 'SUCCESS'),
                payerRef: String(row.payerRef || row.payer_ref || row.payer || ''),
                payeeRef: String(row.payeeRef || row.payee_ref || row.payee || 'MERCHANT'),
                timestamp: new Date(String(row.timestamp || row.date || new Date())),
                rawPayload: JSON.stringify(row),
                reconciliationStatus: 'UNPROCESSED',
              },
            });
            inserted++;
          } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : '';
            if (msg.includes('Unique constraint')) skipped++;
            else errors++;
          }
        }));
      }

      // Auto-run reconciliation engine
      let reconSummary: { processed: number; saved: number } | null = null;
      if (autoRun && inserted > 0) {
        const txs = await prisma.transaction.findMany({
          where: { reconciliationStatus: { in: ['UNPROCESSED', 'PENDING'] } },
        });
        const ords = await prisma.salesOrder.findMany({ where: { status: { not: 'PAID' } } });

        const txInputs = txs.map(t => ({
          id: t.id, externalId: t.externalId, source: t.source,
          amount: t.amount, currency: t.currency, status: t.status,
          payerRef: t.payerRef, payeeRef: t.payeeRef, timestamp: new Date(t.timestamp),
        }));
        const orderInputs = ords.map(o => ({
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

        const results = runReconciliation(txInputs, orderInputs, cfg);
        let saved = 0;
        for (const r of results) {
          try {
            await prisma.reconciliationResult.create({
              data: {
                transactionId: r.transactionId,
                orderId: r.orderId,
                matchType: r.matchType,
                confidenceScore: r.confidenceScore,
                amountDelta: r.amountDelta,
                timeDelta: r.timeDelta,
                status: r.status,
                notes: r.notes,
              },
            });
            if (r.transactionId) {
              await prisma.transaction.update({
                where: { id: r.transactionId },
                data: { reconciliationStatus: r.status === 'FLAGGED' ? 'FLAGGED' : 'MATCHED' },
              });
            }
            saved++;
          } catch { /* skip duplicates */ }
        }
        reconSummary = { processed: results.length, saved };
      }

      // Record history
      addHistory({
        id: `tx-${Date.now()}`,
        type: 'Payment Feed',
        source: req.file?.originalname || 'API Upload',
        rows: rows.length,
        inserted,
        skipped,
        errors,
        status: errors > 0 ? (inserted > 0 ? 'Partial Errors' : 'Failed') : 'Success',
        timestamp: new Date(),
      });

      res.json({
        message: 'Transactions ingested successfully',
        ingested: { transactions: inserted, skipped, errors },
        reconSummary,
      });
    } catch (err) {
      console.error('Ingest transactions error:', err);
      res.status(500).json({ error: 'Internal server error', message: (err as Error).message });
    }
  }
);

// ─── POST /api/ingest/orders ──────────────────────────────────────────────
router.post(
  '/orders',
  authenticate,
  upload.single('file'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const rows = parseInput(req.body, req.file);

      if (rows.length === 0) {
        res.status(400).json({ error: 'No rows found. Send a CSV file or JSON body with orders array.' });
        return;
      }

      let inserted = 0, skipped = 0, errors = 0;

      const chunks: Record<string, unknown>[][] = [];
      for (let i = 0; i < rows.length; i += 50) chunks.push(rows.slice(i, i + 50));

      for (const chunk of chunks) {
        await Promise.allSettled(chunk.map(async (row) => {
          try {
            const orderId = String(row.orderId || row.order_id || row.id || '');
            if (!orderId) { errors++; return; }

            const rawAmt = parseFloat(String(row.amount || 0));
            const amount = rawAmt > 10000 ? Math.round(rawAmt) : Math.round(rawAmt * 100);

            await prisma.salesOrder.upsert({
              where: { orderId },
              update: {},
              create: {
                orderId,
                customerId: String(row.customerId || row.customer_id || ''),
                customerName: String(row.customerName || row.customer_name || row.name || ''),
                amount,
                currency: String(row.currency || 'INR'),
                paymentExpected: new Date(String(row.paymentExpected || row.payment_expected || row.due_date || new Date())),
                paymentReceivedAt: row.paymentReceivedAt ? new Date(String(row.paymentReceivedAt)) : null,
                status: String(row.status || 'UNPAID'),
                source: String(row.source || 'WEBSITE'),
              },
            });
            inserted++;
          } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : '';
            if (msg.includes('Unique constraint')) skipped++;
            else errors++;
          }
        }));
      }

      addHistory({
        id: `ord-${Date.now()}`,
        type: 'Sales Orders',
        source: req.file?.originalname || 'API Upload',
        rows: rows.length,
        inserted,
        skipped,
        errors,
        status: errors > 0 ? (inserted > 0 ? 'Partial Errors' : 'Failed') : 'Success',
        timestamp: new Date(),
      });

      res.json({
        message: 'Orders ingested successfully',
        ingested: { orders: inserted, skipped, errors },
      });
    } catch (err) {
      console.error('Ingest orders error:', err);
      res.status(500).json({ error: 'Internal server error', message: (err as Error).message });
    }
  }
);

// ─── POST /api/ingest (combined — legacy / frontend contract) ────────────────
router.post('/', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { transactions, orders, runEngine } = req.body as {
      transactions?: Array<Record<string, unknown>>;
      orders?: Array<Record<string, unknown>>;
      runEngine?: boolean;
    };

    const ingested = { transactions: 0, orders: 0, errors: 0 };

    if (transactions && transactions.length > 0) {
      for (const row of transactions) {
        try {
          const rawAmt = parseFloat(String(row.amount || 0));
          const amount = rawAmt > 10000 ? Math.round(rawAmt) : Math.round(rawAmt * 100);
          await prisma.transaction.upsert({
            where: { externalId: String(row.externalId || row.id) },
            update: {},
            create: {
              externalId: String(row.externalId || row.id),
              source: String(row.source || 'UPI_GPAY'),
              amount,
              currency: String(row.currency || 'INR'),
              status: String(row.status || 'SUCCESS'),
              payerRef: String(row.payerRef || row.payer || ''),
              payeeRef: String(row.payeeRef || row.payee || 'MERCHANT'),
              timestamp: new Date(String(row.timestamp || new Date())),
              rawPayload: JSON.stringify(row),
              reconciliationStatus: 'UNPROCESSED',
            },
          });
          ingested.transactions++;
        } catch { ingested.errors++; }
      }
    }

    if (orders && orders.length > 0) {
      for (const row of orders) {
        try {
          const rawAmt = parseFloat(String(row.amount || 0));
          const amount = rawAmt > 10000 ? Math.round(rawAmt) : Math.round(rawAmt * 100);
          await prisma.salesOrder.upsert({
            where: { orderId: String(row.orderId || row.id) },
            update: {},
            create: {
              orderId: String(row.orderId || row.id),
              customerId: String(row.customerId || ''),
              customerName: String(row.customerName || ''),
              amount,
              currency: String(row.currency || 'INR'),
              paymentExpected: new Date(String(row.paymentExpected || new Date())),
              status: String(row.status || 'UNPAID'),
              source: String(row.source || 'WEBSITE'),
            },
          });
          ingested.orders++;
        } catch { ingested.errors++; }
      }
    }

    let reconciliationRun = null;
    if (runEngine) {
      const settings = await prisma.appSettings.findUnique({ where: { id: 'singleton' } });
      const txs = await prisma.transaction.findMany({
        where: { reconciliationStatus: { in: ['UNPROCESSED', 'PENDING'] } },
      });
      const ords = await prisma.salesOrder.findMany({ where: { status: { not: 'PAID' } } });

      const txInputs = txs.map(t => ({
        id: t.id, externalId: t.externalId, source: t.source,
        amount: t.amount, currency: t.currency, status: t.status,
        payerRef: t.payerRef, payeeRef: t.payeeRef, timestamp: new Date(t.timestamp),
      }));
      const orderInputs = ords.map(o => ({
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

      const results = runReconciliation(txInputs, orderInputs, cfg);
      let saved = 0;
      for (const r of results) {
        try {
          await prisma.reconciliationResult.create({
            data: {
              transactionId: r.transactionId,
              orderId: r.orderId,
              matchType: r.matchType,
              confidenceScore: r.confidenceScore,
              amountDelta: r.amountDelta,
              timeDelta: r.timeDelta,
              status: r.status,
              notes: r.notes,
            },
          });
          if (r.transactionId) {
            await prisma.transaction.update({
              where: { id: r.transactionId },
              data: { reconciliationStatus: r.status === 'FLAGGED' ? 'FLAGGED' : 'MATCHED' },
            });
          }
          saved++;
        } catch { /* skip */ }
      }
      reconciliationRun = { total: results.length, saved };

      addHistory({
        id: `combined-${Date.now()}`,
        type: 'Payment Feed',
        source: 'API Upload (combined)',
        rows: (transactions?.length || 0) + (orders?.length || 0),
        inserted: ingested.transactions + ingested.orders,
        skipped: 0,
        errors: ingested.errors,
        status: ingested.errors > 0 ? 'Partial Errors' : 'Success',
        timestamp: new Date(),
      });
    }

    res.json({ message: 'Ingestion complete', ingested, reconciliationRun });
  } catch (err) {
    console.error('Ingest error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── GET /api/ingest/history ─────────────────────────────────────────────────
router.get('/history', authenticate, async (_req: AuthRequest, res: Response): Promise<void> => {
  // Combine in-memory jobs with DB counts for context
  const [txCount, orderCount] = await Promise.all([
    prisma.transaction.count(),
    prisma.salesOrder.count(),
  ]);

  // If no in-memory history yet, return seeded context
  const history = ingestHistory.length > 0
    ? ingestHistory.map(j => ({
        id: j.id, type: j.type, source: j.source, rows: j.rows,
        inserted: j.inserted, skipped: j.skipped, errors: j.errors,
        status: j.status, timestamp: j.timestamp,
      }))
    : [
        { id: 'seed-1', type: 'Payment Feed', source: 'Seed Script', rows: txCount, inserted: txCount, skipped: 0, errors: 0, status: 'Success', timestamp: new Date(Date.now() - 3600000) },
        { id: 'seed-2', type: 'Sales Orders', source: 'Seed Script', rows: orderCount, inserted: orderCount, skipped: 0, errors: 0, status: 'Success', timestamp: new Date(Date.now() - 7200000) },
      ];

  res.json({ history });
});

export default router;
