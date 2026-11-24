'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { HourlyAtmosphericPoint } from '@/domain/types';
import { analyzeDiurnalRelativeWindows } from '@/services/forecast/hourly-alignment';
import { Clock, Sun, AlertTriangle, TrendingUp, Table, RotateCcw } from 'lucide-react';
import { springs, duration } from '@/lib/motion-tokens';
import { isThermalInversion } from '@/domain/air-math';

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
  const shouldReduceMotion = useReducedMotion();

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

  const selectedHour = activePoint?.hour ?? currentHour;
  const isFutureHour = Boolean(activePoint?.isForecast || (activePoint && activePoint.hour > currentHour));
  const isHourlyInversion = activePoint
    ? isThermalInversion(activePoint.boundaryLayerHeight, activePoint.hour)
    : false;

  const handleSliderChange = (newHour: number) => {
    const match = hourlyForecast.find((p) => p.hour === newHour);
    if (match) {
      const key = match.validAtUtc || match.time || String(match.hour);
      setSelectedKey(key);
    }
  };

  const handleSnapToNow = () => {
    const nowPt = hourlyForecast.find((p) => p.hour === currentHour) || hourlyForecast[0];
    if (nowPt) {
      const key = nowPt.validAtUtc || nowPt.time || String(nowPt.hour);
      setSelectedKey(key);
    }
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
          <div className="flex items-center rounded-xl p-1 bg-stone-100 dark:bg-zinc-800 border border-stone-200 dark:border-zinc-700 text-xs font-semibold relative">
            <button
              type="button"
              onClick={() => setMetricMode('pm25')}
              className={`relative z-10 px-3 py-1 rounded-lg transition-colors cursor-pointer ${
                metricMode === 'pm25'
                  ? 'text-ink dark:text-white font-bold'
                  : 'text-ink-muted dark:text-zinc-400 hover:text-ink'
              }`}
            >
              {metricMode === 'pm25' && (
                <motion.div
                  layoutId={shouldReduceMotion ? undefined : 'forecastMetricModePill'}
                  className="absolute inset-0 bg-white dark:bg-black rounded-lg shadow-xs"
                  transition={springs.snappy}
                />
              )}
              <span className="relative z-10">PM2.5 (µg/m³)</span>
            </button>
            <button
              type="button"
              onClick={() => setMetricMode('usAqi')}
              className={`relative z-10 px-3 py-1 rounded-lg transition-colors cursor-pointer ${
                metricMode === 'usAqi'
                  ? 'text-ink dark:text-white font-bold'
                  : 'text-ink-muted dark:text-zinc-400 hover:text-ink'
              }`}
            >
              {metricMode === 'usAqi' && (
                <motion.div
                  layoutId={shouldReduceMotion ? undefined : 'forecastMetricModePill'}
                  className="absolute inset-0 bg-white dark:bg-black rounded-lg shadow-xs"
                  transition={springs.snappy}
                />
              )}
              <span className="relative z-10">US EPA AQI</span>
            </button>
          </div>

          <motion.button
            type="button"
            onClick={() => setShowDataTable(!showDataTable)}
            whileTap={shouldReduceMotion ? undefined : { scale: 0.92 }}
            whileHover={shouldReduceMotion ? undefined : { scale: 1.05 }}
            transition={springs.snappy}
            className="p-1.5 rounded-xl border border-stone-200 dark:border-zinc-800 text-ink-muted hover:text-ink dark:text-zinc-400 dark:hover:text-white transition-colors cursor-pointer focus-visible-ring"
            title="Toggle Accessible Tabular View"
            aria-label="Toggle accessible tabular data"
          >
            <Table className="w-4 h-4" />
          </motion.button>
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

      {/* Interactive 24-Hour Diurnal Timeline Scrubber Bar */}
      <div className="w-full px-4 py-3 bg-stone-900/95 dark:bg-[#040814]/95 rounded-xl border border-stone-200/80 dark:border-sky-500/20 text-xs shadow-md">
        <div className="flex flex-col md:flex-row items-center justify-between gap-3">
          {/* Scrubber Label & Active Hour */}
          <div className="flex items-center gap-2.5 text-slate-300 telemetry-mono">
            <Sun className="w-4 h-4 text-amber-400 animate-spin-slow" />
            <span className="font-bold text-white uppercase tracking-wider text-[11px]">
              DIURNAL TIMELINE
            </span>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-sky-500/20 text-sky-300 border border-sky-500/30">
              {activePoint?.localDisplayTime || `${selectedHour.toString().padStart(2, '0')}:00`}
            </span>
            {isFutureHour && (
              <span className="text-[10px] uppercase font-bold text-sky-400 telemetry-mono">
                [FORECAST]
              </span>
            )}
            {selectedHour !== currentHour && (
              <button
                type="button"
                onClick={handleSnapToNow}
                className="flex items-center gap-1 px-2.5 py-0.5 rounded text-[11px] font-bold bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 border border-emerald-500/30 transition-colors cursor-pointer"
                title="Snap back to current live observation hour"
              >
                <RotateCcw className="w-3 h-3" />
                <span>NOW</span>
              </button>
            )}
          </div>

          {/* Scrubber Interactive Range Slider */}
          <div className="w-full md:w-[440px] flex items-center gap-3">
            <span className="text-[10px] text-slate-400 telemetry-mono">00:00</span>
            <input
              type="range"
              min={0}
              max={23}
              step={1}
              value={selectedHour}
              onChange={(e) => handleSliderChange(Number(e.target.value))}
              className="w-full h-2 bg-slate-700/80 rounded-lg appearance-none cursor-pointer accent-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/50"
              aria-label="24-hour diurnal sunlight and atmospheric forecast scrubber"
            />
            <span className="text-[10px] text-slate-400 telemetry-mono">23:00</span>
          </div>

          {/* Real-time Planetary Atmospheric Indicators */}
          <div className="flex items-center gap-2 text-[11px] telemetry-mono">
            <span className="text-slate-400">MIXING DEPTH:</span>
            <span className="text-white font-bold">
              {activePoint?.boundaryLayerHeight !== null && activePoint?.boundaryLayerHeight !== undefined
                ? `${Math.round(activePoint.boundaryLayerHeight)}m`
                : 'Modeled'}
            </span>
            <span
              className={`px-2.5 py-0.5 rounded text-[10px] font-bold ${
                activePoint?.isSafeVentingWindow
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  : isHourlyInversion
                  ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                  : 'bg-slate-700/50 text-slate-300'
              }`}
            >
              {activePoint?.isSafeVentingWindow
                ? 'VENTING OPEN'
                : isHourlyInversion
                ? 'INVERSION TRAP'
                : 'EQUILIBRIUM'}
            </span>
          </div>
        </div>
      </div>

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

        {/* Selected Hour Detail Banner */}
        {activePoint && (
          <div className="mt-2 pt-2 border-t border-stone-200 dark:border-zinc-800/80 flex items-center justify-between text-xs font-mono">
            <div className="flex items-center gap-2">
              <span className="font-bold text-ink dark:text-white">
                {activePoint.localDisplayTime || `${activePoint.hour}:00`}
              </span>
              <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                activePoint.isForecast
                  ? 'bg-sky-100 dark:bg-sky-950/60 text-sky-800 dark:text-sky-300 border border-sky-300 dark:border-sky-800'
                  : 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800'
              }`}>
                {activePoint.isForecast ? 'Modeled Forecast' : 'Station Observation'}
              </span>
            </div>
            <div className="flex items-center gap-3 text-ink dark:text-zinc-200">
              <span>PM2.5: <strong>{activePoint.pm25 !== null ? `${activePoint.pm25} µg/m³` : '—'}</strong></span>
              <span>AQI: <strong>{activePoint.usAqi !== null ? activePoint.usAqi : '—'}</strong></span>
              {activePoint.boundaryLayerHeight !== null && (
                <span className="hidden sm:inline">Ceiling: <strong>{activePoint.boundaryLayerHeight}m</strong></span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Screen Reader Accessible Table (UX19) */}
      <AnimatePresence>
        {showDataTable && (
          <motion.div
            initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
            transition={springs.gentle}
            className="overflow-x-auto rounded-xl border border-stone-200 dark:border-zinc-800 text-xs"
          >
            <table className="w-full text-left font-mono">
              <thead className="bg-stone-100 dark:bg-zinc-800/80 text-ink-muted dark:text-zinc-400">
                <tr>
                  <th className="p-2.5">Hour</th>
                  <th className="p-2.5">PM2.5 (µg/m³)</th>
                  <th className="p-2.5">US EPA AQI</th>
                  <th className="p-2.5">Mixing Depth (m)</th>
                  <th className="p-2.5">Type</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-200 dark:divide-zinc-800">
                {hourlyForecast.map((pt, i) => (
                  <tr
                    key={pt.validAtUtc || pt.time || i}
                    className="hover:bg-stone-50 dark:hover:bg-zinc-800/40"
                  >
                    <td className="p-2.5 font-bold">{pt.localDisplayTime || `${pt.hour}:00`}</td>
                    <td className="p-2.5">{pt.pm25 !== null ? `${pt.pm25} µg/m³` : 'Unavailable'}</td>
                    <td className="p-2.5">{pt.usAqi !== null ? pt.usAqi : 'Unavailable'}</td>
                    <td className="p-2.5">{pt.boundaryLayerHeight !== null ? `${pt.boundaryLayerHeight} m` : 'Unavailable'}</td>
                    <td className="p-2.5">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                        pt.isForecast ? 'text-sky-600 dark:text-sky-400 font-medium' : 'text-emerald-600 dark:text-emerald-400 font-medium'
                      }`}>
                        {pt.isForecast ? 'Forecast' : 'Observed'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
