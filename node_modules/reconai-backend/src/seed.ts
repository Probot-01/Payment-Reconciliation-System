import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { runReconciliation } from './engine/reconcile';

const prisma = new PrismaClient();

// ─── Helpers ────────────────────────────────────────────────────────────────
function daysAgo(d: number): Date {
  const dt = new Date();
  dt.setDate(dt.getDate() - d);
  return dt;
}
function hoursAgo(h: number): Date {
  return new Date(Date.now() - h * 3600000);
}
function rand(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
function toINR(rupees: number): number {
  return Math.round(rupees * 100);
}
function generateUTR(): string {
  return `UTR${Date.now()}${rand(1000, 9999)}`;
}

const SOURCES = ['UPI_GPAY', 'UPI_PHONEPE', 'CARD_VISA', 'CARD_MC', 'WALLET_PAYTM', 'WALLET_AMAZON'];
const CUSTOMER_NAMES = [
  'Aarav Shah', 'Priya Nair', 'Rohit Sharma', 'Ananya Patel', 'Vikas Kumar',
  'Sneha Reddy', 'Arjun Mehta', 'Kavya Iyer', 'Rahul Verma', 'Pooja Gupta',
  'Siddharth Joshi', 'Meera Pillai', 'Karan Malhotra', 'Divya Saxena', 'Aditya Singh',
  'Neha Agarwal', 'Rajesh Bhat', 'Sunita Rao', 'Ashish Chandra', 'Shreya Menon',
];

async function main() {
  console.log('🌱 Starting seed...');

  // Clean existing data
  await prisma.reconciliationResult.deleteMany();
  await prisma.transaction.deleteMany();
  await prisma.salesOrder.deleteMany();
  await prisma.user.deleteMany();
  await prisma.appSettings.deleteMany();

  // ─── Users ────────────────────────────────────────────────────────────────
  console.log('  Creating users...');
  const adminHash = await bcrypt.hash('admin123', 10);
  const analystHash = await bcrypt.hash('analyst123', 10);

  const admin = await prisma.user.create({
    data: {
      email: 'admin@reconai.com',
      name: 'Admin User',
      role: 'ADMIN',
      passwordHash: adminHash,
      lastLogin: new Date(),
    },
  });
  await prisma.user.create({
    data: {
      email: 'analyst@reconai.com',
      name: 'Priya Nair',
      role: 'ANALYST',
      passwordHash: analystHash,
      lastLogin: daysAgo(1),
    },
  });
  await prisma.user.create({
    data: {
      email: 'viewer@reconai.com',
      name: 'Rohit Sharma',
      role: 'VIEWER',
      passwordHash: analystHash,
      lastLogin: daysAgo(3),
    },
  });

  // ─── Settings ─────────────────────────────────────────────────────────────
  await prisma.appSettings.create({
    data: { id: 'singleton' },
  });

  // ─── Generate Sales Orders (480) ──────────────────────────────────────────
  console.log('  Creating 480 sales orders...');
  type OrderSpec = {
    orderId: string;
    customerId: string;
    customerName: string;
    amount: number;
    source: string;
    daysAgoExpected: number;
    status: string;
    isStale?: boolean; // 5 stale orders for 48h+ unmatched
  };

  const orderSpecs: OrderSpec[] = [];

  // 12 exact-match targets (days 1–5)
  for (let i = 0; i < 12; i++) {
    const name = pick(CUSTOMER_NAMES);
    const custId = `CUST${rand(1000, 9999)}`;
    orderSpecs.push({
      orderId: `ORD-EXACT-${String(i + 1).padStart(4, '0')}`,
      customerId: custId,
      customerName: name,
      amount: toINR(rand(500, 50000)),
      source: pick(SOURCES),
      daysAgoExpected: rand(1, 5),
      status: 'UNPAID',
    });
  }

  // 3 partial payment targets
  for (let i = 0; i < 3; i++) {
    const name = pick(CUSTOMER_NAMES);
    orderSpecs.push({
      orderId: `ORD-PART-${String(i + 1).padStart(4, '0')}`,
      customerId: `CUST${rand(1000, 9999)}`,
      customerName: name,
      amount: toINR(rand(2000, 20000)),
      source: pick(SOURCES),
      daysAgoExpected: rand(1, 3),
      status: 'UNPAID',
    });
  }

  // 5 stale unmatched orders (>48h, no payment)
  for (let i = 0; i < 5; i++) {
    const name = pick(CUSTOMER_NAMES);
    orderSpecs.push({
      orderId: `ORD-STALE-${String(i + 1).padStart(4, '0')}`,
      customerId: `CUST${rand(1000, 9999)}`,
      customerName: name,
      amount: toINR(rand(1000, 30000)),
      source: pick(SOURCES),
      daysAgoExpected: rand(3, 15),
      status: 'UNPAID',
      isStale: true,
    });
  }

  // 1 duplicate UPI order
  orderSpecs.push({
    orderId: 'ORD-DUP-0001',
    customerId: 'CUST5001',
    customerName: 'Vikas Kumar',
    amount: toINR(4999),
    source: 'UPI_GPAY',
    daysAgoExpected: 2,
    status: 'UNPAID',
  });

  // Rest: normal orders (mix of paid/unpaid)
  const remaining = 480 - orderSpecs.length;
  for (let i = 0; i < remaining; i++) {
    const name = pick(CUSTOMER_NAMES);
    const isPaid = Math.random() < 0.85;
    orderSpecs.push({
      orderId: `ORD-${String(i + 1).padStart(5, '0')}`,
      customerId: `CUST${rand(1000, 9999)}`,
      customerName: name,
      amount: toINR(rand(100, 100000)),
      source: pick(SOURCES),
      daysAgoExpected: rand(0, 30),
      status: isPaid ? 'PAID' : (Math.random() < 0.3 ? 'PARTIAL' : 'UNPAID'),
    });
  }

  const createdOrders = await Promise.all(
    orderSpecs.map(spec => {
      const expectedDate = daysAgo(spec.daysAgoExpected);
      return prisma.salesOrder.create({
        data: {
          orderId: spec.orderId,
          customerId: spec.customerId,
          customerName: spec.customerName,
          amount: spec.amount,
          currency: 'INR',
          paymentExpected: expectedDate,
          paymentReceivedAt: spec.status === 'PAID' ? new Date(expectedDate.getTime() + rand(0, 3600000)) : null,
          status: spec.status as string,
          source: spec.source,
          createdAt: new Date(expectedDate.getTime() - rand(3600000, 86400000)),
        },
      });
    })
  );

  // Build a quick lookup by orderId
  const orderMap = new Map(createdOrders.map(o => [o.orderId, o]));

  // ─── Generate Transactions (500) ──────────────────────────────────────────
  console.log('  Creating 500 transactions...');
  type TxSpec = {
    externalId: string;
    source: string;
    amount: number;
    status: string;
    payerRef: string;
    payeeRef: string;
    timestampOffset: number; // ms offset from order's paymentExpected
  };

  const txSpecs: { spec: TxSpec; linkedOrderId: string | null }[] = [];

  // 12 exact matches → link to ORD-EXACT-* orders
  for (let i = 0; i < 12; i++) {
    const orderId = `ORD-EXACT-${String(i + 1).padStart(4, '0')}`;
    const order = orderMap.get(orderId)!;
    txSpecs.push({
      spec: {
        externalId: orderId, // exact match on externalId == orderId
        source: order.source,
        amount: order.amount + rand(-50, 50), // within ₹1 = 100 paise
        status: 'SUCCESS',
        payerRef: `PAYER_${rand(10000, 99999)}`,
        payeeRef: 'PAYEE_MERCHANT_001',
        timestampOffset: rand(-600000, 600000), // within 10min
      },
      linkedOrderId: orderId,
    });
  }

  // 3 partial payments → link to ORD-PART-* orders
  for (let i = 0; i < 3; i++) {
    const orderId = `ORD-PART-${String(i + 1).padStart(4, '0')}`;
    const order = orderMap.get(orderId)!;
    txSpecs.push({
      spec: {
        externalId: orderId,
        source: order.source,
        amount: Math.floor(order.amount * (0.5 + Math.random() * 0.3)), // 50-80% of order
        status: 'SUCCESS',
        payerRef: `PAYER_${rand(10000, 99999)}`,
        payeeRef: 'PAYEE_MERCHANT_001',
        timestampOffset: rand(0, 1800000),
      },
      linkedOrderId: orderId,
    });
  }

  // 1 duplicate UPI payment
  const dupPayer = `PAYER_DUP_${rand(10000, 99999)}`;
  const dupOrder = orderMap.get('ORD-DUP-0001')!;
  txSpecs.push({
    spec: {
      externalId: 'ORD-DUP-0001',
      source: 'UPI_GPAY',
      amount: dupOrder.amount,
      status: 'SUCCESS',
      payerRef: dupPayer,
      payeeRef: 'PAYEE_MERCHANT_001',
      timestampOffset: -60000,
    },
    linkedOrderId: 'ORD-DUP-0001',
  });
  txSpecs.push({
    spec: {
      externalId: `EXT-DUP-${rand(100000, 999999)}`,
      source: 'UPI_GPAY',
      amount: dupOrder.amount,
      status: 'SUCCESS',
      payerRef: dupPayer,
      payeeRef: 'PAYEE_MERCHANT_001',
      timestampOffset: 120000, // 2 min later — duplicate
    },
    linkedOrderId: null,
  });

  // 5 unmatched payments (no order)
  for (let i = 0; i < 5; i++) {
    txSpecs.push({
      spec: {
        externalId: `EXT-NOMATCH-${rand(100000, 999999)}`,
        source: pick(SOURCES),
        amount: toINR(rand(200, 15000)),
        status: 'SUCCESS',
        payerRef: `PAYER_${rand(10000, 99999)}`,
        payeeRef: 'PAYEE_MERCHANT_001',
        timestampOffset: 0,
      },
      linkedOrderId: null,
    });
  }

  // Fill remaining transactions (~479 more) against existing PAID orders or random
  const paidOrders = createdOrders.filter(o => o.status === 'PAID').slice(0, 200);
  let paidOrderIdx = 0;
  const totalSoFar = txSpecs.length;
  const remaining500 = 500 - totalSoFar;

  for (let i = 0; i < remaining500; i++) {
    const usePaidOrder = paidOrderIdx < paidOrders.length && Math.random() < 0.85;
    if (usePaidOrder) {
      const order = paidOrders[paidOrderIdx++];
      const isDelayed = Math.random() < 0.05;
      txSpecs.push({
        spec: {
          externalId: order.orderId,
          source: order.source,
          amount: order.amount + rand(-80, 80),
          status: 'SUCCESS',
          payerRef: `PAYER_${rand(10000, 99999)}`,
          payeeRef: 'PAYEE_MERCHANT_001',
          timestampOffset: isDelayed ? rand(86400000, 259200000) : rand(-3600000, 3600000),
        },
        linkedOrderId: order.orderId,
      });
    } else {
      const statusRoll = Math.random();
      txSpecs.push({
        spec: {
          externalId: `EXT-${String(i).padStart(6, '0')}`,
          source: pick(SOURCES),
          amount: toINR(rand(100, 100000)),
          status: statusRoll < 0.85 ? 'SUCCESS' : statusRoll < 0.92 ? 'FAILED' : statusRoll < 0.96 ? 'PENDING' : 'REFUNDED',
          payerRef: `PAYER_${rand(10000, 99999)}`,
          payeeRef: 'PAYEE_MERCHANT_001',
          timestampOffset: 0,
        },
        linkedOrderId: null,
      });
    }
  }

  // Create transactions in DB
  const createdTxs = await Promise.all(
    txSpecs.map(({ spec, linkedOrderId }) => {
      let timestamp: Date;
      if (linkedOrderId) {
        const order = orderMap.get(linkedOrderId);
        if (order) {
          timestamp = new Date(order.paymentExpected.getTime() + spec.timestampOffset);
        } else {
          timestamp = hoursAgo(rand(1, 720));
        }
      } else {
        timestamp = hoursAgo(rand(1, 720));
      }

      const rawPayload = JSON.stringify({
        gateway: spec.source,
        utr: generateUTR(),
        payerVpa: spec.payerRef.includes('PAYER') ? `user${rand(100, 999)}@upi` : spec.payerRef,
        amount: spec.amount / 100,
        currency: 'INR',
        status: spec.status,
        timestamp: timestamp.toISOString(),
        merchantId: 'MERCH_001',
        terminalId: `TERM_${rand(1, 10)}`,
      });

      return prisma.transaction.create({
        data: {
          externalId: spec.externalId,
          source: spec.source,
          amount: spec.amount,
          currency: 'INR',
          status: spec.status,
          payerRef: spec.payerRef,
          payeeRef: spec.payeeRef,
          timestamp,
          rawPayload,
          reconciliationStatus: 'UNPROCESSED',
        },
      });
    })
  );

  console.log(`  ✓ Created ${createdTxs.length} transactions`);

  // ─── Run Reconciliation Engine ────────────────────────────────────────────
  console.log('  Running reconciliation engine...');

  const txInputs = createdTxs.map(t => ({
    id: t.id,
    externalId: t.externalId,
    source: t.source,
    amount: t.amount,
    currency: t.currency,
    status: t.status,
    payerRef: t.payerRef,
    payeeRef: t.payeeRef,
    timestamp: new Date(t.timestamp),
  }));

  const orderInputs = createdOrders.map(o => ({
    id: o.id,
    orderId: o.orderId,
    customerId: o.customerId,
    customerName: o.customerName,
    amount: o.amount,
    currency: o.currency,
    paymentExpected: new Date(o.paymentExpected),
    paymentReceivedAt: o.paymentReceivedAt ? new Date(o.paymentReceivedAt) : null,
    status: o.status,
    source: o.source,
    createdAt: new Date(o.createdAt),
  }));

  const matchResults = runReconciliation(txInputs, orderInputs);
  console.log(`  ✓ Engine produced ${matchResults.length} results`);

  // Persist results
  const txIdMap = new Map(createdTxs.map(t => [t.id, t]));
  const orderIdMap = new Map(createdOrders.map(o => [o.id, o]));

  let reconciled = 0;
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

      // Update transaction reconciliationStatus
      if (result.transactionId && txIdMap.has(result.transactionId)) {
        await prisma.transaction.update({
          where: { id: result.transactionId },
          data: {
            reconciliationStatus: result.status === 'FLAGGED' ? 'FLAGGED' : 'MATCHED',
          },
        });
      }

      // Update order status if matched
      if (result.orderId && orderIdMap.has(result.orderId)) {
        const orderStatus =
          result.matchType === 'PARTIAL' ? 'PARTIAL' :
          result.matchType === 'UNMATCHED_ORDER' ? 'UNPAID' :
          result.status === 'AUTO_MATCHED' ? 'PAID' : 'PARTIAL';

        await prisma.salesOrder.update({
          where: { id: result.orderId },
          data: { status: orderStatus },
        });
      }
      reconciled++;
    } catch {
      // Ignore unique constraint violations from duplicate results
    }
  }

  console.log(`  ✓ Persisted ${reconciled} reconciliation results`);
  console.log(`\n🎉 Seed complete! Seeded 500 transactions, 480 orders`);
  console.log('  Login: admin@reconai.com / admin123');
}

main()
  .catch(e => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
