import React from 'react';
import { getConfidenceClass } from '../../lib/utils';

interface ConfidenceBarProps {
  score: number;
  showLabel?: boolean;
  height?: number;
}

export function ConfidenceBar({ score, showLabel = true, height = 4 }: ConfidenceBarProps) {
  const barClass = getConfidenceClass(score);

  return (
    <div className="flex items-center gap-2 min-w-[80px]">
      <div
        className="flex-1 rounded-full overflow-hidden"
        style={{ height, backgroundColor: '#E2E8F0' }}
      >
        <div
          className={`h-full rounded-full ${barClass} transition-all duration-300`}
          style={{ width: `${score}%` }}
        />
      </div>
      {showLabel && (
        <span className="text-[11px] font-medium text-slate-600 w-7 text-right tabular-nums">
          {score}%
        </span>
      )}
    </div>
  );
}
