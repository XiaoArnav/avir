'use client';

import React, { useState } from 'react';
import { calculateCityComparison } from '@/domain/advanced-air-math';
import { WORLD_METROS } from '@/services/world-telemetry-service';
import { Swords, ArrowRightLeft, Cigarette, Flame, CheckCircle2 } from 'lucide-react';

interface CityShootoutProps {
  currentCityName: string;
  currentAqi: number;
  currentPm25: number;
}

export const CityShootout: React.FC<CityShootoutProps> = ({
  currentCityName,
  currentAqi,
  currentPm25,
}) => {
  // Preset comparison targets
  const presets = [
    { name: 'Tokyo', country: 'Japan', aqi: 26, pm25: 7.2 },
    { name: 'Beijing', country: 'China', aqi: 88, pm25: 29.5 },
    { name: 'London', country: 'United Kingdom', aqi: 35, pm25: 9.8 },
    { name: 'New York', country: 'United States', aqi: 42, pm25: 11.0 },
    { name: 'Lahore', country: 'Pakistan', aqi: 310, pm25: 260.0 },
    { name: 'Bangkok', country: 'Thailand', aqi: 125, pm25: 45.0 },
    { name: 'Sydney', country: 'Australia', aqi: 18, pm25: 4.5 },
    { name: 'Paris', country: 'France', aqi: 38, pm25: 10.5 },
  ];

  const [selectedTarget, setSelectedTarget] = useState(presets[0]);
  const [isSwapped, setIsSwapped] = useState(false);

  const cityPrimary = isSwapped
    ? selectedTarget
    : { name: currentCityName, country: 'India', aqi: currentAqi, pm25: currentPm25 };

  const citySecondary = isSwapped
    ? { name: currentCityName, country: 'India', aqi: currentAqi, pm25: currentPm25 }
    : selectedTarget;

  const comparison = calculateCityComparison(cityPrimary, citySecondary);

  return (
    <div className="bg-white dark:bg-zinc-900 border border-stone-200 dark:border-zinc-800 rounded-2xl p-5 sm:p-6 shadow-sm space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-rose-500/10 text-rose-500 border border-rose-500/20">
            <Swords className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base sm:text-lg font-bold text-ink dark:text-white">
              Compare Cities: Smog Shootout
            </h3>
            <p className="text-xs text-ink-muted dark:text-zinc-400">
              See how your city&apos;s air compares to major capitals around the world
            </p>
          </div>
        </div>

        {/* Quick Target Selector */}
        <div className="flex items-center gap-2">
          <label htmlFor="shootout-target" className="text-xs text-ink-muted dark:text-zinc-400 font-medium">
            Compare with:
          </label>
          <select
            id="shootout-target"
            value={selectedTarget.name}
            onChange={(e) => {
              const found = presets.find((p) => p.name === e.target.value);
              if (found) setSelectedTarget(found);
            }}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-stone-100 dark:bg-zinc-800 border border-stone-300 dark:border-zinc-700 text-ink dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            {presets.map((p) => (
              <option key={p.name} value={p.name}>
                {p.name} ({p.country})
              </option>
            ))}
          </select>

          <button
            onClick={() => setIsSwapped(!isSwapped)}
            className="p-1.5 rounded-lg bg-stone-100 dark:bg-zinc-800 hover:bg-stone-200 dark:hover:bg-zinc-700 text-ink dark:text-white transition-colors"
            title="Swap cities"
            aria-label="Swap comparison order"
          >
            <ArrowRightLeft className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Side-by-Side Comparison Arena */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* City A Card */}
        <div
          className={`p-4 rounded-xl border transition-all ${
            cityPrimary.aqi > citySecondary.aqi
              ? 'bg-rose-500/5 dark:bg-rose-950/20 border-rose-500/30'
              : 'bg-emerald-500/5 dark:bg-emerald-950/20 border-emerald-500/30'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono font-bold text-ink-muted dark:text-zinc-400 uppercase">
              Primary City
            </span>
            {cityPrimary.aqi > citySecondary.aqi ? (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-500 border border-rose-500/20 flex items-center gap-1">
                <Flame className="w-3 h-3" /> More Polluted
              </span>
            ) : (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> Cleaner
              </span>
            )}
          </div>

          <h4 className="mt-2 text-xl font-bold text-ink dark:text-white">
            {cityPrimary.name}
          </h4>
          <p className="text-xs text-ink-muted dark:text-zinc-400">{cityPrimary.country}</p>

          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            <div className="p-2 rounded-lg bg-white/60 dark:bg-zinc-900/60 border border-stone-200 dark:border-zinc-800">
              <div className="text-[10px] text-ink-muted dark:text-zinc-400">US AQI</div>
              <div className="text-lg font-mono font-bold text-ink dark:text-white">
                {cityPrimary.aqi}
              </div>
            </div>
            <div className="p-2 rounded-lg bg-white/60 dark:bg-zinc-900/60 border border-stone-200 dark:border-zinc-800">
              <div className="text-[10px] text-ink-muted dark:text-zinc-400">PM2.5</div>
              <div className="text-lg font-mono font-bold text-ink dark:text-white">
                {cityPrimary.pm25}
              </div>
            </div>
            <div className="p-2 rounded-lg bg-white/60 dark:bg-zinc-900/60 border border-stone-200 dark:border-zinc-800">
              <div className="text-[10px] text-ink-muted dark:text-zinc-400">Cigarettes</div>
              <div className="text-lg font-mono font-bold text-rose-500">
                ~{comparison.cityA.cigarettes}
              </div>
            </div>
          </div>
        </div>

        {/* City B Card */}
        <div
          className={`p-4 rounded-xl border transition-all ${
            citySecondary.aqi > cityPrimary.aqi
              ? 'bg-rose-500/5 dark:bg-rose-950/20 border-rose-500/30'
              : 'bg-emerald-500/5 dark:bg-emerald-950/20 border-emerald-500/30'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono font-bold text-ink-muted dark:text-zinc-400 uppercase">
              Benchmark Capital
            </span>
            {citySecondary.aqi > cityPrimary.aqi ? (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-500 border border-rose-500/20 flex items-center gap-1">
                <Flame className="w-3 h-3" /> More Polluted
              </span>
            ) : (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> Cleaner
              </span>
            )}
          </div>

          <h4 className="mt-2 text-xl font-bold text-ink dark:text-white">
            {citySecondary.name}
          </h4>
          <p className="text-xs text-ink-muted dark:text-zinc-400">{citySecondary.country}</p>

          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            <div className="p-2 rounded-lg bg-white/60 dark:bg-zinc-900/60 border border-stone-200 dark:border-zinc-800">
              <div className="text-[10px] text-ink-muted dark:text-zinc-400">US AQI</div>
              <div className="text-lg font-mono font-bold text-ink dark:text-white">
                {citySecondary.aqi}
              </div>
            </div>
            <div className="p-2 rounded-lg bg-white/60 dark:bg-zinc-900/60 border border-stone-200 dark:border-zinc-800">
              <div className="text-[10px] text-ink-muted dark:text-zinc-400">PM2.5</div>
              <div className="text-lg font-mono font-bold text-ink dark:text-white">
                {citySecondary.pm25}
              </div>
            </div>
            <div className="p-2 rounded-lg bg-white/60 dark:bg-zinc-900/60 border border-stone-200 dark:border-zinc-800">
              <div className="text-[10px] text-ink-muted dark:text-zinc-400">Cigarettes</div>
              <div className="text-lg font-mono font-bold text-emerald-500">
                ~{comparison.cityB.cigarettes}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Analytical Verdict & Differential Gauge */}
      <div className="p-4 rounded-xl bg-stone-50 dark:bg-zinc-800/60 border border-stone-200 dark:border-zinc-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="font-bold text-sm text-ink dark:text-white">
              Comparison Summary
            </span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-500 font-bold">
              {comparison.toxicityMultiplier}× Difference
            </span>
          </div>
          <p className="text-xs text-ink-muted dark:text-zinc-400">
            {comparison.verdict}
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0 p-2.5 rounded-lg bg-white dark:bg-zinc-900 border border-stone-200 dark:border-zinc-800 text-xs">
          <Cigarette className="w-4 h-4 text-rose-500 shrink-0" />
          <div>
            <div className="text-[10px] text-ink-muted dark:text-zinc-400">Smoking Difference</div>
            <div className="font-mono font-bold text-ink dark:text-white">
              +{comparison.cigaretteDifferential} cigs/day
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
