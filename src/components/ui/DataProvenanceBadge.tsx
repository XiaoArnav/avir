import React from 'react';
import { DisplaySourceKind, DisplayDataState } from '@/domain/presentation-contract';
import { ShieldCheck, Cpu, Calculator, Clock } from 'lucide-react';

export interface DataProvenanceBadgeProps {
  sourceKind: DisplaySourceKind;
  state?: DisplayDataState;
  sourceName?: string | null;
  timeAgo?: string | null;
  className?: string;
}

export const DataProvenanceBadge: React.FC<DataProvenanceBadgeProps> = ({
  sourceKind,
  state,
  sourceName,
  timeAgo,
  className = '',
}) => {
  if (state === 'stale') {
    return (
      <span
        title={`Stale telemetry${timeAgo ? ` (${timeAgo})` : ''} - not verified real-time`}
        className={`inline-flex items-center gap-1 text-[10px] font-mono font-semibold px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-800 dark:text-amber-400 border border-amber-500/20 ${className}`}
      >
        <Clock className="w-3 h-3 text-amber-500" />
        <span>Stale Data{timeAgo ? ` • ${timeAgo}` : ''}</span>
      </span>
    );
  }

  if (sourceKind === 'observation') {
    return (
      <span
        title="Physical reference ground observation"
        className={`inline-flex items-center gap-1 text-[10px] font-mono font-semibold px-2 py-0.5 rounded-md bg-teal-500/10 text-teal-800 dark:text-teal-400 border border-teal-500/20 ${className}`}
      >
        <ShieldCheck className="w-3 h-3 text-teal-500" />
        <span>Official Ground Observation{sourceName ? ` (${sourceName})` : ''}</span>
      </span>
    );
  }

  if (sourceKind === 'model') {
    return (
      <span
        title="High-resolution atmospheric chemistry model"
        className={`inline-flex items-center gap-1 text-[10px] font-mono font-semibold px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-800 dark:text-blue-400 border border-blue-500/20 ${className}`}
      >
        <Cpu className="w-3 h-3 text-blue-500" />
        <span>Atmospheric Model</span>
      </span>
    );
  }

  if (sourceKind === 'derived') {
    return (
      <span
        title="Scientifically derived breakpoint calculation"
        className={`inline-flex items-center gap-1 text-[10px] font-mono font-semibold px-2 py-0.5 rounded-md bg-purple-500/10 text-purple-800 dark:text-purple-400 border border-purple-500/20 ${className}`}
      >
        <Calculator className="w-3 h-3 text-purple-500" />
        <span>Derived Calculation</span>
      </span>
    );
  }

  if (sourceKind === 'user_scenario') {
    return (
      <span
        title="User scenario parameter simulation"
        className={`inline-flex items-center gap-1 text-[10px] font-mono font-semibold px-2 py-0.5 rounded-md bg-stone-500/10 text-stone-700 dark:text-stone-300 border border-stone-500/20 ${className}`}
      >
        <span>User Scenario</span>
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] font-mono font-semibold px-2 py-0.5 rounded-md bg-stone-500/10 text-stone-700 dark:text-zinc-400 border border-stone-500/20 ${className}`}
    >
      <span>Unverified Provenance</span>
    </span>
  );
};
