'use client';

import React from 'react';
import {
  MapPin,
  RefreshCw,
  SlidersHorizontal,
  ChevronRight,
  ShieldCheck,
  Radio,
} from 'lucide-react';
import { AqiStandard } from '@/services/geo/geographic-observation-adapter';

export interface CompactCityCardProps {
  cityName: string;
  admin1?: string;
  country?: string;
  aqiValue: number | null;
  categoryLabel: string;
  categoryColor: string;
  primaryPollutant: string;
  standard: AqiStandard;
  onToggleStandard: () => void;
  provenanceLabel: string;
  isOfficialGround: boolean;
  freshnessLabel: string;
  onOpenDetails: () => void;
  onRefresh?: () => void;
  isLoading?: boolean;
  className?: string;
}

export function CompactCityCard({
  cityName,
  admin1,
  country = 'India',
  aqiValue,
  categoryLabel,
  categoryColor,
  primaryPollutant,
  standard,
  onToggleStandard,
  provenanceLabel,
  isOfficialGround,
  freshnessLabel,
  onOpenDetails,
  onRefresh,
  isLoading = false,
  className = '',
}: CompactCityCardProps) {
  const displayAqi = aqiValue !== null && aqiValue !== undefined ? Math.round(aqiValue) : '--';

  return (
    <article
      aria-label={`Current air quality observation for ${cityName}`}
      className={`relative w-full max-w-[340px] rounded-2xl bg-white/85 dark:bg-[#060b18]/85 backdrop-blur-2xl border border-stone-200/90 dark:border-sky-500/25 shadow-2xl p-4 transition-all ${className}`}
    >
      {/* 1. Header: Location Title, Provenance Dot, and Refresh */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <MapPin className="w-3.5 h-3.5 text-sky-500 shrink-0" />
          <h2 className="text-sm font-bold text-ink-primary dark:text-white truncate">
            {cityName}
          </h2>
          {admin1 && (
            <span className="text-[11px] text-ink-muted dark:text-slate-400 truncate hidden sm:inline">
              , {admin1}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              disabled={isLoading}
              className="p-1 rounded-lg text-ink-muted dark:text-sky-300 hover:text-ink-primary dark:hover:text-white hover:bg-stone-100 dark:hover:bg-sky-950/50 transition-colors cursor-pointer"
              title="Refresh telemetry"
              aria-label={`Refresh telemetry for ${cityName}`}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          )}
        </div>
      </div>

      {/* 2. Primary AQI Value & Health Category */}
      <div className="flex items-baseline justify-between gap-3 my-2 pt-2 border-t border-stone-200/60 dark:border-sky-500/15">
        <div className="flex items-baseline gap-2">
          <span
            className="text-4xl sm:text-5xl font-black tabular-nums telemetry-mono tracking-tight"
            style={{ color: categoryColor }}
          >
            {displayAqi}
          </span>
          <div className="flex flex-col">
            <span className="text-[10px] font-bold uppercase tracking-wider text-ink-muted dark:text-sky-300/80 telemetry-mono">
              {standard === 'cpcb' ? 'CPCB NAQI' : 'US EPA AQI'}
            </span>
            <span className="text-[10px] text-ink-faint dark:text-slate-400 telemetry-mono">
              Index
            </span>
          </div>
        </div>

        {/* Category Pill */}
        <span
          className="px-2.5 py-1 rounded-full text-xs font-bold text-white shadow-sm shrink-0"
          style={{ backgroundColor: categoryColor }}
        >
          {categoryLabel}
        </span>
      </div>

      {/* 3. Sub-metrics: Primary Pollutant & Truthful Provenance */}
      <div className="space-y-1.5 py-2 text-xs border-t border-stone-200/50 dark:border-sky-500/10">
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-ink-muted dark:text-slate-400">Primary Driver:</span>
          <span className="font-semibold text-ink-primary dark:text-sky-200 telemetry-mono">
            {primaryPollutant}
          </span>
        </div>

        <div className="flex items-center justify-between text-[11px]">
          <span className="text-ink-muted dark:text-slate-400">Provenance:</span>
          <span
            className={`inline-flex items-center gap-1 font-medium telemetry-mono ${
              isOfficialGround
                ? 'text-emerald-600 dark:text-emerald-400 font-bold'
                : 'text-sky-600 dark:text-sky-300'
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                isOfficialGround ? 'bg-emerald-500 animate-pulse' : 'bg-sky-400'
              }`}
            />
            <span>{provenanceLabel}</span>
          </span>
        </div>

        <div className="flex items-center justify-between text-[11px] text-ink-faint dark:text-slate-500">
          <span>Observed:</span>
          <span className="telemetry-mono">{freshnessLabel}</span>
        </div>
      </div>

      {/* 4. Action: Open Detailed Scientific Inspector Drawer */}
      <button
        type="button"
        onClick={onOpenDetails}
        className="w-full mt-2.5 flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold bg-sky-500/10 hover:bg-sky-500/20 text-sky-700 dark:text-sky-300 border border-sky-500/30 transition-all cursor-pointer group"
      >
        <span className="flex items-center gap-1.5 telemetry-mono">
          <SlidersHorizontal className="w-3.5 h-3.5 text-sky-500" />
          <span>View Environmental Details</span>
        </span>
        <ChevronRight className="w-3.5 h-3.5 text-sky-500 transition-transform group-hover:translate-x-0.5" />
      </button>
    </article>
  );
}
