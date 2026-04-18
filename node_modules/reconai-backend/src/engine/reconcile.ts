// Reconciliation Engine — Core Business Logic
// Implements 7-rule deterministic matching algorithm with O(N) Map lookups

export type TransactionInput = {
  id: string;
  externalId: string;
  source: string;
  amount: number; // paise
  currency: string;
  status: string;
  payerRef: string;
  payeeRef: string;
  timestamp: Date;
};

export type OrderInput = {
  id: string;
  orderId: string;
  customerId: string;
  customerName: string;
  amount: number; // paise
  currency: string;
  paymentExpected: Date;
  paymentReceivedAt?: Date | null;
  status: string;
  source: string;
  createdAt: Date;
};

export type MatchResult = {
  transactionId: string | null;
  orderId: string | null;
  matchType: string;
  confidenceScore: number;
  amountDelta: number; // paise
  timeDelta: number;   // minutes
  status: string;
  notes: string;
};

export type ReconciliationSettings = {
  amountTolerancePct: number;
  timeWindowHours: number;
  exactMatchWindowMins: number;
  confidenceCutoffAuto: number;
  confidenceCutoffFlag: number;
  staleOrderHours: number;
};

const DEFAULT_SETTINGS: ReconciliationSettings = {
  amountTolerancePct: 2.0,
  timeWindowHours: 2,
  exactMatchWindowMins: 15,
  confidenceCutoffAuto: 90,
  confidenceCutoffFlag: 60,
  staleOrderHours: 48,
};

// Levenshtein distance for fuzzy ref matching
function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[m][n];
}

function minutesDiff(a: Date, b: Date): number {
  return Math.abs(a.getTime() - b.getTime()) / 60000;
}

function isWithinPct(a: number, b: number, pct: number): boolean {
  if (b === 0) return a === 0;
  return Math.abs(a - b) / b <= pct / 100;
}

export function runReconciliation(
  transactions: TransactionInput[],
  orders: OrderInput[],
  settings: Partial<ReconciliationSettings> = {}
): MatchResult[] {
  const cfg = { ...DEFAULT_SETTINGS, ...settings };
  const results: MatchResult[] = [];

  // Track which have been matched to avoid double-matching
  const matchedTxIds = new Set<string>();
  const matchedOrderIds = new Set<string>();

  // Build lookup structures
  // externalId → transaction
  const txByExternalId = new Map<string, TransactionInput>();
  // orderId → order
  const orderByOrderId = new Map<string, OrderInput>();
  // payerRef+amount bucket → transactions (for duplicate detection)
  const txByPayerAmount = new Map<string, TransactionInput[]>();

  for (const tx of transactions) {
    if (tx.status === 'FAILED') continue; // Skip failed transactions
    txByExternalId.set(tx.externalId, tx);
    const key = `${tx.payerRef}::${tx.amount}`;
    if (!txByPayerAmount.has(key)) txByPayerAmount.set(key, []);
    txByPayerAmount.get(key)!.push(tx);
  }

  for (const order of orders) {
    orderByOrderId.set(order.orderId, order);
  }

  // ─── PASS 1: Duplicate Detection ─────────────────────────────────────────
  const duplicateTxIds = new Set<string>();
  for (const [, txList] of txByPayerAmount) {
    if (txList.length < 2) continue;
    // Sort by timestamp
    txList.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    for (let i = 1; i < txList.length; i++) {
      const prev = txList[i - 1];
      const curr = txList[i];
      const minDiff = minutesDiff(curr.timestamp, prev.timestamp);
      if (minDiff <= 5) {
        // Mark later one as duplicate
        if (!duplicateTxIds.has(prev.id)) {
          duplicateTxIds.add(curr.id);
          results.push({
            transactionId: curr.id,
            orderId: null,
            matchType: 'DUPLICATE',
            confidenceScore: 95,
            amountDelta: 0,
            timeDelta: Math.round(minDiff),
            status: 'FLAGGED',
            notes: `Duplicate of transaction ${prev.externalId} — same payer, amount, within ${Math.round(minDiff)} min`,
          });
          matchedTxIds.add(curr.id);
        }
      }
    }
  }
  // Also flag same externalId appearing twice (shouldn't happen but handle it)
  const seenExternalIds = new Map<string, TransactionInput>();
  for (const tx of transactions) {
    if (seenExternalIds.has(tx.externalId)) {
      if (!duplicateTxIds.has(tx.id)) {
        duplicateTxIds.add(tx.id);
        results.push({
          transactionId: tx.id,
          orderId: null,
          matchType: 'DUPLICATE',
          confidenceScore: 99,
          amountDelta: 0,
          timeDelta: 0,
          status: 'FLAGGED',
          notes: `Exact externalId duplicate: ${tx.externalId}`,
        });
        matchedTxIds.add(tx.id);
      }
    } else {
      seenExternalIds.set(tx.externalId, tx);
    }
  }

  // ─── PASS 2: Exact Match ──────────────────────────────────────────────────
  for (const order of orders) {
    if (matchedOrderIds.has(order.id)) continue;
    const tx = txByExternalId.get(order.orderId);
    if (!tx || matchedTxIds.has(tx.id)) continue;

    const amtDelta = tx.amount - order.amount;
    const timeDeltaMins = minutesDiff(tx.timestamp, order.paymentExpected);
    const exactAmtMatch = Math.abs(amtDelta) <= 100; // ±₹1 = 100 paise
    const exactTimeMatch = timeDeltaMins <= cfg.exactMatchWindowMins;

    if (exactAmtMatch && exactTimeMatch) {
      results.push({
        transactionId: tx.id,
        orderId: order.id,
        matchType: 'EXACT',
        confidenceScore: 99,
        amountDelta: amtDelta,
        timeDelta: Math.round(timeDeltaMins),
        status: 'AUTO_MATCHED',
        notes: `Exact match on externalId=${tx.externalId}, amount within ₹1, time within ${Math.round(timeDeltaMins)} min`,
      });
      matchedTxIds.add(tx.id);
      matchedOrderIds.add(order.id);
    }
  }

  // ─── PASS 3: Partial Payment ──────────────────────────────────────────────
  for (const order of orders) {
    if (matchedOrderIds.has(order.id)) continue;
    const tx = txByExternalId.get(order.orderId);
    if (!tx || matchedTxIds.has(tx.id)) continue;

    const amtDelta = tx.amount - order.amount;
    if (amtDelta < -100) {
      // Payment is less than order amount by more than ₹1
      results.push({
        transactionId: tx.id,
        orderId: order.id,
        matchType: 'PARTIAL',
        confidenceScore: 85,
        amountDelta: amtDelta,
        timeDelta: Math.round(minutesDiff(tx.timestamp, order.paymentExpected)),
        status: 'FLAGGED',
        notes: `Partial payment: received ₹${(tx.amount / 100).toFixed(2)}, expected ₹${(order.amount / 100).toFixed(2)}. Shortfall: ₹${(Math.abs(amtDelta) / 100).toFixed(2)}`,
      });
      matchedTxIds.add(tx.id);
      matchedOrderIds.add(order.id);
    }
  }

  // ─── PASS 4: Delayed Settlement ───────────────────────────────────────────
  for (const order of orders) {
    if (matchedOrderIds.has(order.id)) continue;
    const tx = txByExternalId.get(order.orderId);
    if (!tx || matchedTxIds.has(tx.id)) continue;

    const hoursDiff = (tx.timestamp.getTime() - order.paymentExpected.getTime()) / 3600000;
    if (hoursDiff > 24) {
      const amtDelta = tx.amount - order.amount;
      const withinAmt = Math.abs(amtDelta) <= 100;
      results.push({
        transactionId: tx.id,
        orderId: order.id,
        matchType: 'DELAYED',
        confidenceScore: withinAmt ? 88 : 70,
        amountDelta: amtDelta,
        timeDelta: Math.round(hoursDiff * 60),
        status: withinAmt ? 'AUTO_MATCHED' : 'FLAGGED',
        notes: `Delayed settlement: ${Math.round(hoursDiff)}h after expected. Amount ${withinAmt ? 'matches' : 'differs by ₹' + (Math.abs(amtDelta) / 100).toFixed(2)}`,
      });
      matchedTxIds.add(tx.id);
      matchedOrderIds.add(order.id);
    }
  }

  // ─── PASS 5: Fuzzy Match ──────────────────────────────────────────────────
  // Build indexed list of unmatched orders for efficient lookup
  const unmatchedOrders = orders.filter(o => !matchedOrderIds.has(o.id));
  const unmatchedTxs = transactions.filter(t =>
    !matchedTxIds.has(t.id) && t.status !== 'FAILED'
  );

  for (const tx of unmatchedTxs) {
    let bestMatch: { order: OrderInput; confidence: number; amtDelta: number } | null = null;

    for (const order of unmatchedOrders) {
      if (matchedOrderIds.has(order.id)) continue;

      const amtDelta = tx.amount - order.amount;
      const timeDeltaMins = minutesDiff(tx.timestamp, order.paymentExpected);
      const withinAmtPct = isWithinPct(tx.amount, order.amount, cfg.amountTolerancePct);
      const withinTime = timeDeltaMins <= cfg.timeWindowHours * 60;
      const sameSource = tx.source.split('_')[0] === order.source.split('_')[0];

      if (withinAmtPct && withinTime) {
        // Calculate confidence based on closeness
        const amtCloseness = 1 - Math.abs(amtDelta) / order.amount;
        const timeCloseness = 1 - timeDeltaMins / (cfg.timeWindowHours * 60);
        const sourceBonus = sameSource ? 5 : 0;
        const confidence = Math.min(90, Math.round(75 + amtCloseness * 10 + timeCloseness * 5 + sourceBonus));

        if (!bestMatch || confidence > bestMatch.confidence) {
          bestMatch = { order, confidence, amtDelta };
        }
      }
    }

    if (bestMatch) {
      const { order, confidence, amtDelta } = bestMatch;
      results.push({
        transactionId: tx.id,
        orderId: order.id,
        matchType: 'FUZZY',
        confidenceScore: confidence,
        amountDelta: amtDelta,
        timeDelta: Math.round(minutesDiff(tx.timestamp, order.paymentExpected)),
        status: confidence >= cfg.confidenceCutoffAuto ? 'AUTO_MATCHED' : 'FLAGGED',
        notes: `Fuzzy match: amount within ${cfg.amountTolerancePct}%, time within ${cfg.timeWindowHours}h. Confidence: ${confidence}%`,
      });
      matchedTxIds.add(tx.id);
      matchedOrderIds.add(order.id);
      // Remove from unmatchedOrders to avoid double-matching
      const idx = unmatchedOrders.findIndex(o => o.id === order.id);
      if (idx !== -1) unmatchedOrders.splice(idx, 1);
    }
  }

  // ─── PASS 6: Unmatched Orders (48h+) ──────────────────────────────────────
  const now = new Date();
  for (const order of orders) {
    if (matchedOrderIds.has(order.id)) continue;
    if (order.status === 'PAID') continue;

    const hoursOld = (now.getTime() - order.paymentExpected.getTime()) / 3600000;
    if (hoursOld >= cfg.staleOrderHours) {
      results.push({
        transactionId: null,
        orderId: order.id,
        matchType: 'UNMATCHED_ORDER',
        confidenceScore: 0,
        amountDelta: -order.amount,
        timeDelta: Math.round(hoursOld * 60),
        status: 'FLAGGED',
        notes: `No payment found for order after ${Math.round(hoursOld)}h. Expected: ₹${(order.amount / 100).toFixed(2)}`,
      });
      matchedOrderIds.add(order.id);
    }
  }

  // ─── PASS 7: Unmatched Payments ───────────────────────────────────────────
  for (const tx of transactions) {
    if (matchedTxIds.has(tx.id)) continue;
    if (tx.status === 'FAILED') continue;

    results.push({
      transactionId: tx.id,
      orderId: null,
      matchType: 'UNMATCHED_PAYMENT',
      confidenceScore: 0,
      amountDelta: tx.amount,
      timeDelta: 0,
      status: 'FLAGGED',
      notes: `Payment ${tx.externalId} (₹${(tx.amount / 100).toFixed(2)}) has no matching order`,
    });
    matchedTxIds.add(tx.id);
  }

  return results;
}
