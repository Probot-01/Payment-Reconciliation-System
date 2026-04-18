// ─── Shared TypeScript types matching backend data models ────────────────────

export interface User {
  id: string;
  email: string;
  name: string;
  role: 'ADMIN' | 'ANALYST' | 'VIEWER';
  lastLogin?: string;
  createdAt: string;
}

export interface Transaction {
  id: string;
  externalId: string;
  source: string;
  amount: number; // paise
  currency: string;
  status: 'SUCCESS' | 'FAILED' | 'PENDING' | 'REFUNDED';
  payerRef: string;
  payeeRef: string;
  timestamp: string;
  rawPayload: string;
  reconciliationStatus: 'UNPROCESSED' | 'MATCHED' | 'FLAGGED' | 'IGNORED';
  createdAt: string;
  reconciliationResult?: ReconciliationResult;
}

export interface SalesOrder {
  id: string;
  orderId: string;
  customerId: string;
  customerName: string;
  amount: number; // paise
  currency: string;
  paymentExpected: string;
  paymentReceivedAt?: string;
  status: 'PAID' | 'UNPAID' | 'PARTIAL' | 'OVERPAID';
  source: string;
  createdAt: string;
  reconciliationResult?: ReconciliationResult;
}

export interface ReconciliationResult {
  id: string;
  transactionId?: string;
  orderId?: string;
  matchType: 'EXACT' | 'FUZZY' | 'PARTIAL' | 'DUPLICATE' | 'UNMATCHED_PAYMENT' | 'UNMATCHED_ORDER' | 'DELAYED';
  confidenceScore: number;
  amountDelta: number; // paise
  timeDelta: number;   // minutes
  resolvedBy?: string;
  resolvedAt?: string;
  notes?: string;
  status: 'AUTO_MATCHED' | 'FLAGGED' | 'MANUALLY_RESOLVED' | 'IGNORED';
  createdAt: string;
  transaction?: Partial<Transaction>;
  order?: Partial<SalesOrder>;
  resolver?: { name: string; email: string };
}

export interface DashboardData {
  kpis: {
    totalVolume: number;
    totalTransactions: number;
    matchRate: number;
    flaggedCount: number;
    pendingOrders: number;
    avgResolutionMins: number;
  };
  statusBreakdown: { matched: number; flagged: number; unmatched: number };
  sourceBreakdown: { source: string; amount: number; count: number }[];
  dailyData: { date: string; matched: number; flagged: number; unmatched: number; volume: number }[];
  matchTypeBreakdown: { type: string; count: number }[];
  recentFlags: ReconciliationResult[];
}

export interface AppSettings {
  amountTolerancePct: number;
  timeWindowHours: number;
  exactMatchWindowMins: number;
  confidenceCutoffAuto: number;
  confidenceCutoffFlag: number;
  staleOrderHours: number;
  emailOnUnmatched: boolean;
  dailyDigest: boolean;
  unMatchedThreshold: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export type DateRange = 'today' | '7d' | '30d' | 'custom';

export interface FilterState {
  page: number;
  limit: number;
  search: string;
  sortBy: string;
  sortDir: 'asc' | 'desc';
  dateFrom?: string;
  dateTo?: string;
  amountMin?: string;
  amountMax?: string;
}

export interface TxFilterState extends FilterState {
  source: string[];
  status: string[];
  matchStatus: string[];
}

export interface ReconFilterState extends FilterState {
  matchType: string[];
  status: string[];
}
