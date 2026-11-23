'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { HourlyAtmosphericPoint } from '@/domain/types';
import { analyzeDiurnalRelativeWindows } from '@/services/forecast/hourly-alignment';
import { Clock, Sun, AlertTriangle, ShieldCheck, TrendingUp, Table } from 'lucide-react';

interface DiurnalForecastTimelineProps {
  hourlyForecast?: HourlyAtmosphericPoint[];
  currentHour?: number;
  cityName: string;
}

export type ForecastMetricMode = 'pm25' | 'usAqi';

export const DiurnalForecastTimeline: React.FC<DiurnalForecastTimelineProps> = ({
  hourlyForecast = [],
  currentHour = new Date().getHours(),
  cityName,
}) => {
  // Use unique timestamp key (validAtUtc or time) for stable cross-date identity
  const [selectedKey, setSelectedKey] = useState<string>('');
  const [metricMode, setMetricMode] = useState<ForecastMetricMode>('pm25');
  const [showDataTable, setShowDataTable] = useState(false);

  // SVG Chart Dimensions & Computations
  const chartHeight = 120;
  const chartWidth = 720;
  const paddingX = 24;
  const paddingY = 18;

  // Compute points and SVG segments unconditionally at top level to obey React Rules of Hooks
  const validPoints = useMemo(() => {
    if (!hourlyForecast || hourlyForecast.length === 0) return [];
    return hourlyForecast.map((p, idx) => {
      const val = metricMode === 'pm25' ? p.pm25 : p.usAqi;
      const isValid = typeof val === 'number' && Number.isFinite(val) && val >= 0;
      return {
        point: p,
        index: idx,
        val: isValid ? (val as number) : null,
      };
    });
  }, [hourlyForecast, metricMode]);

  const { minVal, maxVal } = useMemo(() => {
    const numbers = validPoints.map((v) => v.val).filter((v): v is number => v !== null);
    if (numbers.length === 0) return { minVal: 0, maxVal: 100 };
    const min = Math.min(...numbers);
    const max = Math.max(...numbers);
    return {
      minVal: Math.max(0, Math.floor(min * 0.85)),
      maxVal: Math.max(min + 10, Math.ceil(max * 1.15)),
    };
  }, [validPoints]);

  const range = maxVal - minVal || 1;

  // Build segmented SVG paths to preserve missing-data gaps honestly without interpolation
  const segments = useMemo(() => {
    if (!validPoints || validPoints.length === 0) return [];
    const result: Array<{
      path: string;
      isForecast: boolean;
      points: Array<{ x: number; y: number; point: HourlyAtmosphericPoint; key: string; val: number }>;
    }> = [];

    let currentSegment: Array<{ x: number; y: number; point: HourlyAtmosphericPoint; key: string; val: number; isForecast: boolean }> = [];

    const total = validPoints.length;
    const stepX = (chartWidth - paddingX * 2) / Math.max(1, total - 1);

    validPoints.forEach(({ point, index, val }) => {
      if (val === null) {
        // Break current segment upon missing data gap
        if (currentSegment.length > 0) {
          const path = currentSegment
            .map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`)
            .join(' ');
          result.push({
            path,
            isForecast: currentSegment[0].isForecast,
            points: currentSegment,
          });
          currentSegment = [];
        }
        return;
      }

      const x = paddingX + index * stepX;
      const normalizedY = (val - minVal) / range;
      const y = chartHeight - paddingY - normalizedY * (chartHeight - paddingY * 2);

      const key = point.validAtUtc || point.time || `${point.hour}-${index}`;
      const isForecast = Boolean(point.isForecast);

      // Check if forecast status changed from previous point to split line style
      if (currentSegment.length > 0 && currentSegment[currentSegment.length - 1].isForecast !== isForecast) {
        const path = currentSegment
          .map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`)
          .join(' ');
        result.push({
          path,
          isForecast: currentSegment[0].isForecast,
          points: currentSegment,
        });
        currentSegment = [{ x, y, point, key, val, isForecast }];
      } else {
        currentSegment.push({ x, y, point, key, val, isForecast });
      }
    });

    if (currentSegment.length > 0) {
      const path = currentSegment
        .map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`)
        .join(' ');
      result.push({
        path,
        isForecast: currentSegment[0].isForecast,
        points: currentSegment,
      });
    }

    return result;
  }, [validPoints, minVal, range, chartWidth, chartHeight, paddingX, paddingY]);

  // Keep selected point in sync when forecast or city changes
  useEffect(() => {
    if (hourlyForecast && hourlyForecast.length > 0) {
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
              24-Hour Atmospheric Trajectory &amp; Diurnal Cycle
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
      {/* Header with Metric Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-stone-100 dark:border-zinc-800">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-amber-500/10 text-amber-500 border border-amber-500/20">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base sm:text-lg font-bold text-ink dark:text-white">
              24-Hour Diurnal Trend &amp; Smog Forecast
            </h3>
            <p className="text-xs text-ink-muted dark:text-zinc-400">
              Diurnal atmospheric dispersion patterns for {cityName}
            </p>
          </div>
        </div>

        {/* View Mode Toggle: PM2.5 Mass vs US AQI Index */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <div className="flex items-center rounded-xl p-1 bg-stone-100 dark:bg-zinc-800 border border-stone-200 dark:border-zinc-700 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setMetricMode('pm25')}
              className={`px-3 py-1 rounded-lg transition-all ${
                metricMode === 'pm25'
                  ? 'bg-white text-ink shadow-xs dark:bg-black dark:text-white'
                  : 'text-ink-muted dark:text-zinc-400 hover:text-ink'
              }`}
            >
              PM2.5 (µg/m³)
            </button>
            <button
              type="button"
              onClick={() => setMetricMode('usAqi')}
              className={`px-3 py-1 rounded-lg transition-all ${
                metricMode === 'usAqi'
                  ? 'bg-white text-ink shadow-xs dark:bg-black dark:text-white'
                  : 'text-ink-muted dark:text-zinc-400 hover:text-ink'
              }`}
            >
              US EPA AQI
            </button>
          </div>

          <button
            type="button"
            onClick={() => setShowDataTable(!showDataTable)}
            className="p-1.5 rounded-xl border border-stone-200 dark:border-zinc-800 text-ink-muted hover:text-ink dark:text-zinc-400 dark:hover:text-white transition-colors"
            title="Toggle Accessible Tabular View"
            aria-label="Toggle accessible tabular data"
          >
            <Table className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Relative Windows Summary Badges */}
      {analysis.hasValidData && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 font-medium">
            <Sun className="w-3.5 h-3.5" />
            Lower Smog: {analysis.lowestSmogWindow.startDisplayTime} – {analysis.lowestSmogWindow.endDisplayTime}
          </span>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-500/20 font-medium">
            <AlertTriangle className="w-3.5 h-3.5" />
            Peak Inversion: {analysis.highestSmogWindow.startDisplayTime} – {analysis.highestSmogWindow.endDisplayTime}
          </span>
          <span className="text-[11px] font-mono text-ink-muted dark:text-zinc-500 ml-auto hidden md:inline">
            *Observed: Solid Green • Forecast: Dashed Sky Blue
          </span>
        </div>
      )}

      {/* Continuous Scaled SVG Diurnal Trajectory Chart */}
      <div className="relative w-full overflow-hidden bg-stone-50/70 dark:bg-zinc-950/70 rounded-xl border border-stone-200 dark:border-zinc-800/80 p-3">
        <div className="flex items-center justify-between text-[11px] font-mono text-ink-muted dark:text-zinc-400 pb-1 px-1">
          <span className="flex items-center gap-1.5">
            <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
            <span>
              {metricMode === 'pm25' ? 'Fine Particulate Mass Curve (µg/m³)' : 'Air Quality Index Scale (EPA)'}
            </span>
          </span>
          <span>Max: {maxVal} {metricMode === 'pm25' ? 'µg/m³' : ''}</span>
        </div>

        <svg
          viewBox={`0 0 ${chartWidth} ${chartHeight}`}
          className="w-full h-28 sm:h-32 select-none overflow-visible"
          role="img"
          aria-label={`24-hour diurnal trend chart of ${metricMode === 'pm25' ? 'PM2.5 concentration' : 'US AQI'} for ${cityName}`}
        >
          <defs>
            <linearGradient id="observedGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10b981" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
            </linearGradient>
            <linearGradient id="forecastGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0284c7" stopOpacity="0.2" />
              <stop offset="100%" stopColor="#0284c7" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Grid lines */}
          <line
            x1={paddingX}
            y1={paddingY}
            x2={chartWidth - paddingX}
            y2={paddingY}
            stroke="currentColor"
            strokeDasharray="2 3"
            className="text-stone-200 dark:text-zinc-800"
          />
          <line
            x1={paddingX}
            y1={chartHeight / 2}
            x2={chartWidth - paddingX}
            y2={chartHeight / 2}
            stroke="currentColor"
            strokeDasharray="2 3"
            className="text-stone-200 dark:text-zinc-800"
          />
          <line
            x1={paddingX}
            y1={chartHeight - paddingY}
            x2={chartWidth - paddingX}
            y2={chartHeight - paddingY}
            stroke="currentColor"
            className="text-stone-300 dark:text-zinc-700"
          />

          {/* Render Segmented Paths */}
          {segments.map((seg, sIdx) => (
            <g key={`seg-${sIdx}`} data-testid={`trajectory-segment-${sIdx}`}>
              <path
                d={seg.path}
                fill="none"
                stroke={seg.isForecast ? '#0284c7' : '#10b981'}
                strokeWidth={2.4}
                strokeDasharray={seg.isForecast ? '4 3' : 'none'}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {/* Interactive Point Dots */}
              {seg.points.map((pt) => {
                const isSelected = pt.key === selectedKey;
                return (
                  <circle
                    key={pt.key}
                    cx={pt.x}
                    cy={pt.y}
                    r={isSelected ? 5.5 : 3}
                    fill={isSelected ? (seg.isForecast ? '#0284c7' : '#10b981') : '#ffffff'}
                    stroke={seg.isForecast ? '#0284c7' : '#10b981'}
                    strokeWidth={isSelected ? 2.5 : 1.5}
                    className="cursor-pointer transition-all hover:scale-125"
                    onClick={() => setSelectedKey(pt.key)}
                  >
                    <title>
                      {`${pt.point.localDisplayTime || `${pt.point.hour}:00`}: ${pt.val} ${metricMode === 'pm25' ? 'µg/m³' : 'AQI'} (${seg.isForecast ? 'Forecast' : 'Observation'})`}
                    </title>
                  </circle>
                );
              })}
            </g>
          ))}
        </svg>
      </div>

      {/* Screen Reader Accessible Table (UX19) */}
      {showDataTable && (
        <div className="overflow-x-auto rounded-xl border border-stone-200 dark:border-zinc-800 text-xs">
          <table className="w-full text-left font-mono">
            <thead className="bg-stone-100 dark:bg-zinc-800/80 text-ink-muted dark:text-zinc-400">
              <tr>
                <th className="p-2">Time</th>
                <th className="p-2">Date</th>
                <th className="p-2">PM2.5 (µg/m³)</th>
                <th className="p-2">US AQI</th>
                <th className="p-2">Mixing Ceiling</th>
                <th className="p-2">Source</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-200 dark:divide-zinc-800 text-ink dark:text-zinc-200">
              {hourlyForecast.map((p, idx) => (
                <tr
                  key={p.validAtUtc || idx}
                  className={p.hour === currentHour ? 'bg-emerald-500/10 font-bold' : ''}
                >
                  <td className="p-2">{p.localDisplayTime || `${p.hour}:00`}</td>
                  <td className="p-2">{p.localDisplayDate || 'Today'}</td>
                  <td className="p-2">{p.pm25 !== null ? `${p.pm25} µg/m³` : '—'}</td>
                  <td className="p-2">{p.usAqi ?? '—'}</td>
                  <td className="p-2">{p.boundaryLayerHeight !== null ? `${p.boundaryLayerHeight}m` : '—'}</td>
                  <td className="p-2 uppercase text-[10px]">{p.isForecast ? 'Forecast' : 'Observed'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 24-Hour Interactive Timeline Rail */}
      <div className="relative">
        <div 
          role="tablist"
          aria-label="24-Hour Atmospheric Timeline"
          className="flex gap-2 overflow-x-auto pb-3 pt-1 scrollbar-thin scrollbar-thumb-stone-300 dark:scrollbar-thumb-zinc-700"
        >
          {hourlyForecast.map((point, idx) => {
            const pointKey = point.validAtUtc || point.time || `${point.hour}-${idx}`;
            const isSelected = pointKey === selectedKey;
            const isCurrent = point.hour === currentHour && !point.isForecast;
            const displayTime = point.localDisplayTime || `${point.hour < 10 ? `0${point.hour}` : point.hour}:00`;

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
                  role="tab"
                  aria-selected={isSelected}
                  onClick={() => setSelectedKey(pointKey)}
                  className={`flex-shrink-0 flex flex-col items-center p-2.5 rounded-xl border text-center transition-all min-w-[70px] select-none touch-target focus-visible-ring ${
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
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold">
                Current Hour
              </span>
            )}
            {activePoint.usAqi !== null && activePoint.usAqi <= 150 ? (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1">
                <ShieldCheck className="w-3 h-3" /> Relatively Lower Smog
              </span>
            ) : (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400 font-bold flex items-center gap-1">
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
          <div>US EPA AQI: {activePoint.usAqi ?? 'N/A'}</div>
          <div className="text-[10px] text-stone-500 dark:text-zinc-500 mt-0.5">
            {activePoint.isForecast ? 'Numerical Weather & Chemistry Forecast' : 'Modeled Atmospheric Telemetry'}
          </div>
        </div>
      </div>
    </div>
  );
};
