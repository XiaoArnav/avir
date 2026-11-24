'use client';

import React from 'react';
import { FuturisticBadge } from './FuturisticBadge';

export interface TelemetryReadoutProps {
  label: string;
  value: number | string | null | undefined;
  unit?: string;
  provenance?: 'official' | 'modeled' | 'indicative' | 'stale' | 'unavailable';
  uncertainty?: string | number;
  categoryLabel?: string;
  categoryColor?: 'emerald' | 'amber' | 'rose' | 'purple' | 'cyan' | 'neutral';
  className?: string;
  testId?: string;
}

export function TelemetryReadout({
  label,
  value,
  unit,
  provenance = 'modeled',
  uncertainty,
  categoryLabel,
  categoryColor = 'cyan',
  className = '',
  testId,
}: TelemetryReadoutProps) {
  const isAvailable = value !== null && value !== undefined && value !== 'N/A' && value !== '--';
  const displayVal = isAvailable ? (typeof value === 'number' ? Math.round(value) : value) : '--';

  const provenanceMap: Record<
    string,
    { label: string; variant: 'cyan' | 'emerald' | 'amber' | 'rose' | 'purple' | 'neutral' }
  > = {
    official: { label: 'CPCB GROUND', variant: 'emerald' },
    modeled: { label: 'MODEL FEED', variant: 'cyan' },
    indicative: { label: 'INDICATIVE', variant: 'purple' },
    stale: { label: 'STALE CACHE', variant: 'amber' },
    unavailable: { label: 'NO FEED', variant: 'neutral' },
  };

  const prov = provenanceMap[provenance] || provenanceMap.modeled;

  return (
    <div
      data-testid={testId}
      className={`relative p-3 rounded-xl border border-stone-200/60 dark:border-sky-500/10 bg-white/40 dark:bg-sky-950/20 backdrop-blur-md transition-all hover:border-sky-400/30 ${className}`}
    >
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted dark:text-sky-300/70 telemetry-mono">
          {label}
        </span>
        <FuturisticBadge label={prov.label} variant={prov.variant} />
      </div>

      <div className="flex items-baseline gap-1.5">
        <span className="text-2xl sm:text-3xl font-bold tabular-nums telemetry-mono tracking-tight text-ink-primary dark:text-white">
          {displayVal}
        </span>
        {unit && isAvailable && (
          <span className="text-xs font-medium text-ink-muted dark:text-sky-300/60 telemetry-mono">
            {unit}
          </span>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 mt-2 pt-1.5 border-t border-stone-200/40 dark:border-sky-500/10 text-[11px]">
        {categoryLabel ? (
          <span className="font-medium capitalize text-ink-muted dark:text-slate-300">
            {categoryLabel}
          </span>
        ) : (
          <span className="text-ink-faint dark:text-slate-500">
            {isAvailable ? 'Validated' : 'Sensor Offline'}
          </span>
        )}

        {uncertainty !== undefined && isAvailable && (
          <span className="text-[10px] text-ink-faint dark:text-slate-400 telemetry-mono">
            ±{uncertainty}
          </span>
        )}
      </div>
    </div>
  );
}
