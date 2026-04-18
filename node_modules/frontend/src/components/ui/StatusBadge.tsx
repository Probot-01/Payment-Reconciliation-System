import React from 'react';
import { MATCH_TYPE_CONFIG, RECON_STATUS_CONFIG, TX_STATUS_CONFIG, ORDER_STATUS_CONFIG } from '../../lib/utils';

interface StatusBadgeProps {
  type: 'matchType' | 'reconStatus' | 'txStatus' | 'orderStatus';
  value: string;
  size?: 'sm' | 'md';
}

export function StatusBadge({ type, value, size = 'sm' }: StatusBadgeProps) {
  let config: { label: string; badgeClass: string } | undefined;

  if (type === 'matchType') config = MATCH_TYPE_CONFIG[value];
  else if (type === 'reconStatus') config = RECON_STATUS_CONFIG[value];
  else if (type === 'txStatus') config = TX_STATUS_CONFIG[value];
  else if (type === 'orderStatus') config = ORDER_STATUS_CONFIG[value];

  if (!config) config = { label: value, badgeClass: 'badge-neutral' };

  const sizeClasses = size === 'sm'
    ? 'px-2 py-0.5 text-[11px] font-medium'
    : 'px-3 py-1 text-xs font-semibold';

  return (
    <span className={`inline-flex items-center rounded-full ${sizeClasses} ${config.badgeClass} whitespace-nowrap`}>
      {config.label}
    </span>
  );
}
