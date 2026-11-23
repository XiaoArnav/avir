'use client';

import React from 'react';
import { X, Navigation, CheckCircle2 } from 'lucide-react';
import { GeographicObservationPoint } from '@/services/geo/geographic-observation-adapter';
import { FuturisticBadge } from '@/components/ui/futuristic';

export interface GlobeCityCardProps {
  point: GeographicObservationPoint;
  isActiveCity: boolean;
  onSelectAsActiveCity: (point: GeographicObservationPoint) => void;
  onClose: () => void;
  className?: string;
}

export function GlobeCityCard({
  point,
  isActiveCity,
  onSelectAsActiveCity,
  onClose,
  className = '',
}: GlobeCityCardProps) {
  const aqiDisplay = point.aqi !== null ? Math.round(point.aqi) : '--';
  const latFormatted = `${Math.abs(point.latitude).toFixed(2)}° ${point.latitude >= 0 ? 'N' : 'S'}`;
  const lonFormatted = `${Math.abs(point.longitude).toFixed(2)}° ${point.longitude >= 0 ? 'E' : 'W'}`;

  return (
    <div
      role="dialog"
      aria-label={`City observation: ${point.name}`}
      className={`relative w-80 rounded-2xl p-4 bg-white/90 dark:bg-[#060b18]/90 backdrop-blur-2xl border border-stone-200/90 dark:border-sky-500/30 shadow-2xl dark:shadow-[0_16px_50px_rgba(0,0,0,0.85)] hud-corner-brackets ${className}`}
    >
      {/* Header with Title and Close Button */}
      <div className="flex items-start justify-between gap-2 mb-2 pb-2 border-b border-stone-200/60 dark:border-sky-500/15">
        <div>
          <div className="flex items-center gap-1.5">
            <h4 className="text-base font-bold text-ink-primary dark:text-white tracking-tight">
              {point.name}
            </h4>
            <span className="text-xs text-ink-muted dark:text-slate-400">
              {point.countryCode}
            </span>
          </div>
          <p className="text-[11px] text-ink-faint dark:text-sky-300/60 telemetry-mono">
            {latFormatted}, {lonFormatted}
          </p>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded-lg text-ink-muted dark:text-slate-400 hover:text-ink-primary dark:hover:text-white hover:bg-stone-100 dark:hover:bg-sky-950/40 transition-colors"
          aria-label="Close inspector panel"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Main AQI Readout */}
      <div className="flex items-center justify-between gap-3 my-3 p-3 rounded-xl bg-stone-50 dark:bg-sky-950/20 border border-stone-200/60 dark:border-sky-500/10">
        <div>
          <span className="text-[10px] uppercase tracking-wider font-semibold text-ink-muted dark:text-sky-300/60 telemetry-mono">
            INDEX LEVEL
          </span>
          <div className="flex items-baseline gap-1.5">
            <span
              className="text-3xl font-extrabold tabular-nums telemetry-mono"
              style={{ color: point.categoryColor }}
            >
              {aqiDisplay}
            </span>
            <span className="text-xs font-semibold text-ink-muted dark:text-slate-400">
              AQI
            </span>
          </div>
        </div>

        <div className="text-right">
          <span
            className="inline-block px-2 py-0.5 rounded-full text-xs font-bold text-white mb-1 shadow-sm"
            style={{ backgroundColor: point.categoryColor }}
          >
            {point.categoryLabel}
          </span>
          <p className="text-[10px] text-ink-faint dark:text-slate-400 telemetry-mono">
            Primary: {point.primaryPollutant}
          </p>
        </div>
      </div>

      {/* Pollutant Measurements */}
      <div className="grid grid-cols-2 gap-2 mb-3 text-xs">
        <div className="p-2 rounded-lg bg-stone-100/70 dark:bg-black/30 border border-stone-200/40 dark:border-sky-500/10">
          <span className="text-[10px] font-medium text-ink-muted dark:text-slate-400 telemetry-mono">PM2.5</span>
          <p className="text-sm font-bold tabular-nums text-ink-primary dark:text-white telemetry-mono">
            {point.pm25 !== null ? `${Math.round(point.pm25)} µg/m³` : '--'}
          </p>
        </div>
        <div className="p-2 rounded-lg bg-stone-100/70 dark:bg-black/30 border border-stone-200/40 dark:border-sky-500/10">
          <span className="text-[10px] font-medium text-ink-muted dark:text-slate-400 telemetry-mono">PM10</span>
          <p className="text-sm font-bold tabular-nums text-ink-primary dark:text-white telemetry-mono">
            {point.pm10 !== null ? `${Math.round(point.pm10)} µg/m³` : '--'}
          </p>
        </div>
      </div>

      {/* Provenance and Data Source */}
      <div className="flex items-center justify-between text-[11px] mb-3 text-ink-muted dark:text-slate-400">
        <span className="truncate max-w-[170px]" title={point.source}>{point.source}</span>
        <FuturisticBadge
          label={
            point.provenance === 'observed'
              ? 'OBSERVED'
              : point.provenance === 'modeled_forecast' || point.provenance === 'derived_calculation'
              ? 'MODEL'
              : 'UNVERIFIED'
          }
          variant={
            point.provenance === 'observed'
              ? 'emerald'
              : point.provenance === 'modeled_forecast' || point.provenance === 'derived_calculation'
              ? 'cyan'
              : 'neutral'
          }
        />
      </div>

      {/* Synchronization Action */}
      <button
        type="button"
        disabled={isActiveCity}
        onClick={() => onSelectAsActiveCity(point)}
        className={`w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${
          isActiveCity
            ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 cursor-default'
            : 'bg-sky-500 hover:bg-sky-400 text-white dark:bg-sky-500/90 dark:hover:bg-sky-400 shadow-md hover:shadow-sky-500/25'
        }`}
      >
        {isActiveCity ? (
          <>
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Currently Active in Dashboard</span>
          </>
        ) : (
          <>
            <Navigation className="w-3.5 h-3.5" />
            <span>Set Active City in Dashboard</span>
          </>
        )}
      </button>
    </div>
  );
}
