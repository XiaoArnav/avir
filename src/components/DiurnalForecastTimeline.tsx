'use client';

import React, { useState, useEffect } from 'react';
import { HourlyAtmosphericPoint } from '@/domain/types';
import { analyzeDiurnalRelativeWindows } from '@/services/forecast/hourly-alignment';
import { Clock, Sun, AlertTriangle, ShieldCheck } from 'lucide-react';

interface DiurnalForecastTimelineProps {
  hourlyForecast?: HourlyAtmosphericPoint[];
  currentHour?: number;
  cityName: string;
}

export const DiurnalForecastTimeline: React.FC<DiurnalForecastTimelineProps> = ({
  hourlyForecast = [],
  currentHour = new Date().getHours(),
  cityName,
}) => {
  // Use unique timestamp key (validAtUtc or time) for stable cross-date identity
  const [selectedKey, setSelectedKey] = useState<string>('');

  // Keep selected point in sync when forecast or city changes
  useEffect(() => {
    if (hourlyForecast.length > 0) {
      // Find point matching current hour or first point
      const defaultPt = hourlyForecast.find((p) => p.hour === currentHour) || hourlyForecast[0];
      const key = defaultPt.validAtUtc || defaultPt.time || String(defaultPt.hour);
      setSelectedKey(key);
    } else {
      setSelectedKey('');
    }
  }, [hourlyForecast, currentHour, cityName]);

  if (!hourlyForecast || hourlyForecast.length === 0) {
    return (
      <div className="bg-white dark:bg-zinc-900 border border-stone-200 dark:border-zinc-800 rounded-2xl p-5 sm:p-6 shadow-sm space-y-4">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-amber-500/10 text-amber-500 border border-amber-500/20">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base sm:text-lg font-bold text-ink dark:text-white">
              24-Hour Smog Forecast &amp; Diurnal Dispersion
            </h3>
            <p className="text-xs text-ink-muted dark:text-zinc-400">
              Atmospheric dispersion and diurnal cycle for {cityName}
            </p>
          </div>
        </div>
        <div className="py-8 text-center text-xs font-mono text-ink-muted dark:text-zinc-400">
          Hourly atmospheric forecast telemetry is currently unavailable for this station.
        </div>
      </div>
    );
  }

  const analysis = analyzeDiurnalRelativeWindows(hourlyForecast);

  const activePoint =
    hourlyForecast.find((p) => (p.validAtUtc || p.time || String(p.hour)) === selectedKey) ||
    hourlyForecast[0];

  const getAqiColor = (aqi: number | null | undefined) => {
    if (aqi === null || aqi === undefined) return 'text-stone-400 bg-stone-100 dark:bg-zinc-800 border-stone-200 dark:border-zinc-700';
    if (aqi <= 50) return 'text-emerald-500 bg-emerald-500/10 border-emerald-500/30';
    if (aqi <= 100) return 'text-yellow-500 bg-yellow-500/10 border-yellow-500/30';
    if (aqi <= 150) return 'text-orange-500 bg-orange-500/10 border-orange-500/30';
    if (aqi <= 200) return 'text-rose-500 bg-rose-500/10 border-rose-500/30';
    if (aqi <= 300) return 'text-purple-500 bg-purple-500/10 border-purple-500/30';
    return 'text-red-500 bg-red-500/10 border-red-500/30';
  };

  return (
    <div className="bg-white dark:bg-zinc-900 border border-stone-200 dark:border-zinc-800 rounded-2xl p-5 sm:p-6 shadow-sm space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-amber-500/10 text-amber-500 border border-amber-500/20">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base sm:text-lg font-bold text-ink dark:text-white">
              24-Hour Smog Forecast &amp; Diurnal Cycle
            </h3>
            <p className="text-xs text-ink-muted dark:text-zinc-400">
              Diurnal atmospheric dispersion patterns for {cityName}
            </p>
          </div>
        </div>

        {/* Live Window Badges */}
        {analysis.hasValidData && (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 font-medium">
              <Sun className="w-3.5 h-3.5" />
              Lower Smog: {analysis.lowestSmogWindow.startDisplayTime} - {analysis.lowestSmogWindow.endDisplayTime}
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 font-medium">
              <AlertTriangle className="w-3.5 h-3.5" />
              Peak Smog: {analysis.highestSmogWindow.startDisplayTime} - {analysis.highestSmogWindow.endDisplayTime}
            </span>
          </div>
        )}
      </div>

      {/* 24-Hour Interactive Timeline Rail */}
      <div className="relative">
        <div className="flex gap-2 overflow-x-auto pb-3 pt-1 scrollbar-thin scrollbar-thumb-stone-300 dark:scrollbar-thumb-zinc-700">
          {hourlyForecast.map((point, idx) => {
            const pointKey = point.validAtUtc || point.time || `${point.hour}-${idx}`;
            const isSelected = pointKey === selectedKey;
            const isCurrent = point.hour === currentHour && !point.isForecast;
            const displayTime = point.localDisplayTime || `${point.hour < 10 ? `0${point.hour}` : point.hour}:00`;

            // Check if this point crosses into a new day (e.g. hour 0 or date string changed)
            const prevPoint = idx > 0 ? hourlyForecast[idx - 1] : null;
            const isNewDay = prevPoint && point.localDisplayDate && prevPoint.localDisplayDate !== point.localDisplayDate;

            return (
              <React.Fragment key={pointKey}>
                {isNewDay && (
                  <div className="flex-shrink-0 flex items-center px-1">
                    <span className="px-1.5 py-0.5 rounded bg-stone-200 dark:bg-zinc-800 text-[9px] font-mono font-semibold text-ink dark:text-zinc-300 whitespace-nowrap">
                      {point.localDisplayDate}
                    </span>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => setSelectedKey(pointKey)}
                  className={`flex-shrink-0 flex flex-col items-center p-2.5 rounded-xl border text-center transition-all min-w-[70px] ${
                    isSelected
                      ? 'bg-stone-900 dark:bg-white text-white dark:text-black border-transparent shadow-md scale-105'
                      : 'bg-stone-50 dark:bg-zinc-800/60 border-stone-200 dark:border-zinc-800 hover:bg-stone-100 dark:hover:bg-zinc-800 text-ink dark:text-zinc-300'
                  }`}
                >
                  <div className="flex items-center gap-1 text-[10px] font-mono">
                    <span>{displayTime}</span>
                    {isCurrent && (
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" title="Current Hour" />
                    )}
                  </div>

                  <div
                    className={`mt-1.5 text-xs font-mono font-bold px-1.5 py-0.5 rounded border ${
                      isSelected ? 'bg-white/20 text-white dark:text-black' : getAqiColor(point.usAqi)
                    }`}
                  >
                    {point.usAqi ?? '--'}
                  </div>

                  <div className="mt-1 text-[10px] font-mono opacity-80">
                    {point.pm25 !== null ? `${point.pm25} µg` : '--'}
                  </div>

                  <div className="mt-1 text-[9px] font-mono opacity-60">
                    {point.boundaryLayerHeight !== null ? `${point.boundaryLayerHeight}m` : '--'}
                  </div>

                  {/* Scientific Source Classification: Model vs Observation */}
                  {point.isForecast ? (
                    <span className="mt-1 text-[8px] font-mono text-sky-500 font-bold uppercase">Fcst</span>
                  ) : point.isModel === false ? (
                    <span className="mt-1 text-[8px] font-mono text-emerald-500 font-bold uppercase">Obs</span>
                  ) : (
                    <span className="mt-1 text-[8px] font-mono text-stone-400 font-bold uppercase">Model</span>
                  )}
                </button>
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* Selected Hour Atmospheric Diagnostics Banner */}
      <div className="p-4 rounded-xl bg-stone-50 dark:bg-zinc-800/50 border border-stone-200 dark:border-zinc-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-bold text-sm text-ink dark:text-white">
              {activePoint.localDisplayTime || `${activePoint.hour}:00`} Focus ({activePoint.localDisplayDate || 'Today'})
            </span>
            {activePoint.hour === currentHour && !activePoint.isForecast && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 font-bold">
                Current Hour
              </span>
            )}
            {activePoint.usAqi !== null && activePoint.usAqi <= 150 ? (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 font-bold flex items-center gap-1">
                <ShieldCheck className="w-3 h-3" /> Relatively Lower Smog
              </span>
            ) : (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-500 font-bold flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> Elevated Smog Window
              </span>
            )}
          </div>
          <p className="text-xs text-ink-muted dark:text-zinc-400 max-w-xl">
            {activePoint.boundaryLayerHeight !== null
              ? `Modeled planetary boundary layer height is ~${activePoint.boundaryLayerHeight}m. ${
                  activePoint.boundaryLayerHeight < 300
                    ? 'Thermal surface cooling inhibits vertical mixing, confining particulates near ground level.'
                    : 'Solar convection facilitates atmospheric dispersion.'
                }`
              : 'Boundary layer mixing depth is unavailable for this hour.'}
          </p>
        </div>

        <div className="text-left sm:text-right text-xs font-mono text-ink-muted dark:text-zinc-400 shrink-0">
          <div>PM2.5: {activePoint.pm25 !== null ? `${activePoint.pm25} µg/m³` : 'N/A'}</div>
          <div>US AQI: {activePoint.usAqi ?? 'N/A'}</div>
          <div className="text-[10px] text-stone-500 dark:text-zinc-500 mt-0.5">
            {activePoint.isForecast ? 'Numerical Weather & Chemistry Forecast' : 'Modeled Atmospheric Telemetry'}
          </div>
        </div>
      </div>
    </div>
  );
};
