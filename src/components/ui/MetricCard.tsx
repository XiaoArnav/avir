import React from 'react';
import { DisplayMeasurement } from '@/domain/presentation-contract';
import { DataProvenanceBadge } from './DataProvenanceBadge';

export interface MetricCardProps {
  label: string;
  measurement: DisplayMeasurement;
  secondaryInfo?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}

export const MetricCard: React.FC<MetricCardProps> = ({
  label,
  measurement,
  secondaryInfo,
  icon,
  className = '',
}) => {
  return (
    <div
      className={`rounded-2xl p-4 sm:p-5 bg-white dark:bg-zinc-900 border border-stone-200 dark:border-zinc-800 shadow-xs space-y-3 transition-colors ${className}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-ink-muted dark:text-zinc-400 font-mono">
          {label}
        </span>
        {icon && (
          <div className="text-ink-muted dark:text-zinc-500">
            {icon}
          </div>
        )}
      </div>

      <div className="flex items-baseline gap-2">
        <span className="text-2xl sm:text-3xl font-extrabold text-ink dark:text-white tabular-nums tracking-tight">
          {measurement.formattedValue}
        </span>
        <span className="text-xs font-medium text-ink-muted dark:text-zinc-400">
          {measurement.unit}
        </span>
      </div>

      <div className="flex items-center justify-between gap-2 pt-1 border-t border-stone-100 dark:border-zinc-800/80 text-[11px]">
        <DataProvenanceBadge
          sourceKind={measurement.sourceKind}
          state={measurement.state}
          sourceName={measurement.sourceName}
          timeAgo={measurement.formattedTimeAgo}
        />
        {secondaryInfo && (
          <div className="text-ink-muted dark:text-zinc-400 font-mono">
            {secondaryInfo}
          </div>
        )}
      </div>
    </div>
  );
};
