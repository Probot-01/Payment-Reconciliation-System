import { format, parseISO } from 'date-fns';

// ─── Currency Formatting ─────────────────────────────────────────────────────

/**
 * Format paise (integer) to Indian ₹ currency string
 * e.g. 12345600 → ₹1,23,456.00
 */
export function formatINR(paise: number): string {
  const rupees = paise / 100;
  // Indian number system (lakhs, crores)
  const formatted = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(rupees);
  return formatted;
}

export function formatINRCompact(paise: number): string {
  const rupees = paise / 100;
  if (rupees >= 1_00_00_000) return `₹${(rupees / 1_00_00_000).toFixed(2)}Cr`;
  if (rupees >= 1_00_000) return `₹${(rupees / 1_00_000).toFixed(2)}L`;
  if (rupees >= 1_000) return `₹${(rupees / 1_000).toFixed(1)}K`;
  return formatINR(paise);
}

export function formatAmountDelta(paise: number): string {
  const sign = paise >= 0 ? '+' : '';
  return `${sign}${formatINR(Math.abs(paise))}`;
}

// ─── Date Formatting ─────────────────────────────────────────────────────────

export function formatDateTime(dateStr: string | Date): string {
  try {
    const date = typeof dateStr === 'string' ? parseISO(dateStr) : dateStr;
    return format(date, 'dd MMM yyyy, hh:mm a');
  } catch {
    return 'Invalid date';
  }
}

export function formatDate(dateStr: string | Date): string {
  try {
    const date = typeof dateStr === 'string' ? parseISO(dateStr) : dateStr;
    return format(date, 'dd MMM yyyy');
  } catch {
    return 'Invalid date';
  }
}

export function formatTime(dateStr: string | Date): string {
  try {
    const date = typeof dateStr === 'string' ? parseISO(dateStr) : dateStr;
    return format(date, 'hh:mm a');
  } catch {
    return 'Invalid time';
  }
}

export function formatRelativeTime(dateStr: string | Date): string {
  try {
    const date = typeof dateStr === 'string' ? parseISO(dateStr) : dateStr;
    const diff = Date.now() - date.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  } catch {
    return '';
  }
}

// ─── Source Labels ────────────────────────────────────────────────────────────

export const SOURCE_LABELS: Record<string, string> = {
  UPI_GPAY: 'Google Pay',
  UPI_PHONEPE: 'PhonePe',
  CARD_VISA: 'Visa Card',
  CARD_MC: 'Mastercard',
  WALLET_PAYTM: 'Paytm',
  WALLET_AMAZON: 'Amazon Pay',
};

export const SOURCE_COLORS: Record<string, string> = {
  UPI_GPAY: '#4285F4',
  UPI_PHONEPE: '#5F259F',
  CARD_VISA: '#1A1F71',
  CARD_MC: '#EB001B',
  WALLET_PAYTM: '#00BAF2',
  WALLET_AMAZON: '#FF9900',
};

// ─── Status Config ────────────────────────────────────────────────────────────

export const MATCH_TYPE_CONFIG: Record<string, { label: string; badgeClass: string; severity: 'success' | 'warning' | 'danger' | 'info' | 'neutral' }> = {
  EXACT: { label: 'Exact Match', badgeClass: 'badge-success', severity: 'success' },
  FUZZY: { label: 'Fuzzy Match', badgeClass: 'badge-info', severity: 'info' },
  PARTIAL: { label: 'Partial', badgeClass: 'badge-warning', severity: 'warning' },
  DUPLICATE: { label: 'Duplicate', badgeClass: 'badge-danger', severity: 'danger' },
  DELAYED: { label: 'Delayed', badgeClass: 'badge-warning', severity: 'warning' },
  UNMATCHED_PAYMENT: { label: 'Unmatched Payment', badgeClass: 'badge-danger', severity: 'danger' },
  UNMATCHED_ORDER: { label: 'Unmatched Order', badgeClass: 'badge-danger', severity: 'danger' },
};

export const RECON_STATUS_CONFIG: Record<string, { label: string; badgeClass: string }> = {
  AUTO_MATCHED: { label: 'Auto Matched', badgeClass: 'badge-success' },
  FLAGGED: { label: 'Flagged', badgeClass: 'badge-danger' },
  MANUALLY_RESOLVED: { label: 'Resolved', badgeClass: 'badge-info' },
  IGNORED: { label: 'Ignored', badgeClass: 'badge-neutral' },
};

export const TX_STATUS_CONFIG: Record<string, { label: string; badgeClass: string }> = {
  SUCCESS: { label: 'Success', badgeClass: 'badge-success' },
  FAILED: { label: 'Failed', badgeClass: 'badge-danger' },
  PENDING: { label: 'Pending', badgeClass: 'badge-warning' },
  REFUNDED: { label: 'Refunded', badgeClass: 'badge-neutral' },
};

export const ORDER_STATUS_CONFIG: Record<string, { label: string; badgeClass: string }> = {
  PAID: { label: 'Paid', badgeClass: 'badge-success' },
  UNPAID: { label: 'Unpaid', badgeClass: 'badge-danger' },
  PARTIAL: { label: 'Partial', badgeClass: 'badge-warning' },
  OVERPAID: { label: 'Overpaid', badgeClass: 'badge-info' },
};

// ─── Confidence Bar ───────────────────────────────────────────────────────────

export function getConfidenceClass(score: number): string {
  if (score >= 90) return 'confidence-bar-high';
  if (score >= 60) return 'confidence-bar-medium';
  return 'confidence-bar-low';
}

// ─── Time Delta ───────────────────────────────────────────────────────────────

export function formatTimeDelta(minutes: number): string {
  const abs = Math.abs(minutes);
  if (abs < 60) return `${abs}m`;
  const hrs = Math.floor(abs / 60);
  if (hrs < 24) return `${hrs}h ${abs % 60}m`;
  const days = Math.floor(hrs / 24);
  return `${days}d ${hrs % 24}h`;
}
