'use client';

import React, { useState } from 'react';
import { HourlyAtmosphericPoint } from '@/domain/types';
import { analyzeDiurnalWindows } from '@/domain/advanced-air-math';
import { Clock, Sun, AlertTriangle, CloudFog, ShieldCheck } from 'lucide-react';

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
  const analysis = analyzeDiurnalWindows(hourlyForecast);
  const [selectedHour, setSelectedHour] = useState<number>(currentHour);

  const activePoint =
    hourlyForecast.find((p) => p.hour === selectedHour) ||
    hourlyForecast[0] || {
      time: `${selectedHour}:00`,
      hour: selectedHour,
      pm25: 140,
      usAqi: 195,
      boundaryLayerHeight: 350,
      isSafeVentingWindow: false,
      isThermalInversionTrap: true,
    };

  const getAqiColor = (aqi: number) => {
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
              24-Hour Diurnal &ldquo;Safe Hours&rdquo; Forecast
            </h3>
            <p className="text-xs text-ink-muted dark:text-zinc-400">
              Hour-by-hour boundary layer mixing ceiling &amp; safe solar ventilation windows for {cityName}
            </p>
          </div>
        </div>

        {/* Live Window Badges */}
        <div className="flex items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 font-medium">
            <Sun className="w-3.5 h-3.5" />
            Venting: {analysis.bestVentingWindow.startHour}:00 - {analysis.bestVentingWindow.endHour}:00
          </span>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 font-medium">
            <AlertTriangle className="w-3.5 h-3.5" />
            Inversion Lid: {analysis.worstInversionWindow.startHour}:00 - {analysis.worstInversionWindow.endHour}:00
          </span>
        </div>
      </div>

      {/* 24-Hour Interactive Timeline Rail */}
      <div className="relative">
        <div className="flex gap-2 overflow-x-auto pb-3 pt-1 scrollbar-thin scrollbar-thumb-stone-300 dark:scrollbar-thumb-zinc-700">
          {hourlyForecast.map((point) => {
            const isSelected = point.hour === selectedHour;
            const isCurrent = point.hour === currentHour;

            return (
              <button
                key={point.hour}
                onClick={() => setSelectedHour(point.hour)}
                className={`flex-shrink-0 flex flex-col items-center p-2.5 rounded-xl border text-center transition-all min-w-[70px] ${
                  isSelected
                    ? 'bg-stone-900 dark:bg-white text-white dark:text-black border-transparent shadow-md scale-105'
                    : 'bg-stone-50 dark:bg-zinc-800/60 border-stone-200 dark:border-zinc-800 hover:bg-stone-100 dark:hover:bg-zinc-800 text-ink dark:text-zinc-300'
                }`}
              >
                <div className="flex items-center gap-1 text-[10px] font-mono">
                  <span>{point.hour < 10 ? `0${point.hour}` : point.hour}:00</span>
                  {isCurrent && (
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  )}
                </div>

                <div
                  className={`mt-1.5 text-xs font-mono font-bold px-1.5 py-0.5 rounded border ${
                    isSelected ? 'bg-white/20 text-white dark:text-black' : getAqiColor(point.usAqi)
                  }`}
                >
                  {point.usAqi}
                </div>

                <div className="mt-1 text-[10px] font-mono opacity-80">
                  {point.pm25} µg
                </div>

                <div className="mt-1 text-[9px] font-mono opacity-60">
                  {point.boundaryLayerHeight}m
                </div>

                {point.isSafeVentingWindow && (
                  <span className="mt-1 text-[9px] text-emerald-500 font-bold">Safe</span>
                )}
                {point.isThermalInversionTrap && !point.isSafeVentingWindow && (
                  <span className="mt-1 text-[9px] text-rose-500 font-bold">Trap</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected Hour Atmospheric Diagnostics Banner */}
      <div className="p-4 rounded-xl bg-stone-50 dark:bg-zinc-800/50 border border-stone-200 dark:border-zinc-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="font-bold text-sm text-ink dark:text-white">
              {activePoint.hour}:00 Forecast Focus
            </span>
            {activePoint.hour === currentHour && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 font-bold">
                Current Hour
              </span>
            )}
            {activePoint.isSafeVentingWindow ? (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 font-bold flex items-center gap-1">
                <ShieldCheck className="w-3 h-3" /> Safe Solar Window
              </span>
            ) : (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-500 font-bold flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> Thermal Inversion Risk
              </span>
            )}
          </div>
          <p className="text-xs text-ink-muted dark:text-zinc-400">
            {activePoint.isSafeVentingWindow
              ? analysis.bestVentingWindow.recommendation
              : analysis.worstInversionWindow.warning}
          </p>
        </div>

        <div className="flex items-center gap-4 text-xs font-mono shrink-0">
          <div>
            <div className="text-[10px] text-ink-muted dark:text-zinc-400">US AQI</div>
            <div className="font-bold text-ink dark:text-white text-base">
              {activePoint.usAqi}
            </div>
          </div>
          <div>
            <div className="text-[10px] text-ink-muted dark:text-zinc-400">PM2.5</div>
            <div className="font-bold text-ink dark:text-white text-base">
              {activePoint.pm25} <span className="text-[10px]">µg/m³</span>
            </div>
          </div>
          <div>
            <div className="text-[10px] text-ink-muted dark:text-zinc-400">Ceiling</div>
            <div className="font-bold text-ink dark:text-white text-base">
              {activePoint.boundaryLayerHeight} <span className="text-[10px]">m</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
