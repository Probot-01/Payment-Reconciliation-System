import React from 'react';
import { SOURCE_LABELS, SOURCE_COLORS } from '../../lib/utils';

interface SourceBadgeProps {
  source: string;
  showIcon?: boolean;
}

// Simple icon map using colored circles with initials
export function SourceBadge({ source, showIcon = true }: SourceBadgeProps) {
  const label = SOURCE_LABELS[source] || source;
  const color = SOURCE_COLORS[source] || '#6B7280';

  // First letters of each word
  const initials = label.split(' ').map(w => w[0]).slice(0, 2).join('');

  return (
    <div className="flex items-center gap-2">
      {showIcon && (
        <div
          className="flex items-center justify-center w-5 h-5 rounded text-white text-[9px] font-bold flex-shrink-0"
          style={{ backgroundColor: color }}
        >
          {initials}
        </div>
      )}
      <span className="text-xs text-slate-700 font-medium">{label}</span>
    </div>
  );
}

// For chart labels
export function sourceShortLabel(source: string): string {
  const map: Record<string, string> = {
    UPI_GPAY: 'GPay',
    UPI_PHONEPE: 'PhonePe',
    CARD_VISA: 'Visa',
    CARD_MC: 'MC',
    WALLET_PAYTM: 'Paytm',
    WALLET_AMAZON: 'Amazon',
  };
  return map[source] || source;
}
