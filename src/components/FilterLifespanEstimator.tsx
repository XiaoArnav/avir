'use client';

import React, { useState } from 'react';
import {
  estimateMaskLifespan,
  estimateHepaLifespan,
  MaskStandard,
} from '@/domain/advanced-air-math';
import { Shield, Sparkles, Wind, AlertCircle } from 'lucide-react';

interface FilterLifespanEstimatorProps {
  ambientPm25: number;
}

export const FilterLifespanEstimator: React.FC<FilterLifespanEstimatorProps> = ({
  ambientPm25,
}) => {
  const [maskType, setMaskType] = useState<MaskStandard>('n95');
  const [outdoorHours, setOutdoorHours] = useState<number>(2);
  const [purifierRunningHours, setPurifierRunningHours] = useState<number>(16);

  const maskEstimate = estimateMaskLifespan(ambientPm25, outdoorHours, maskType);
  const hepaEstimate = estimateHepaLifespan(ambientPm25, purifierRunningHours);

  const maskOptions: { id: MaskStandard; label: string }[] = [
    { id: 'n95', label: 'N95 / FFP2' },
    { id: 'kf94', label: 'KF94' },
    { id: 'surgical', label: '3-Ply Surgical' },
    { id: 'cloth', label: 'Cloth' },
  ];

  return (
    <div className="bg-white dark:bg-zinc-900 border border-stone-200 dark:border-zinc-800 rounded-2xl p-5 sm:p-6 shadow-sm space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-purple-500/10 text-purple-500 border border-purple-500/20">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base sm:text-lg font-bold text-ink dark:text-white">
              Mask &amp; HEPA Filter Lifespan Estimator
            </h3>
            <p className="text-xs text-ink-muted dark:text-zinc-400">
              Electrostatic saturation &amp; pre-filter maintenance cycle under {ambientPm25} µg/m³ ambient smog
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Section 1: Respirator Mask Wear & Tear */}
        <div className="p-4 rounded-xl bg-stone-50 dark:bg-zinc-800/50 border border-stone-200 dark:border-zinc-800 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-purple-500" />
              <span className="font-bold text-sm text-ink dark:text-white">
                Respirator Mask Saturation
              </span>
            </div>
            <span
              className={`text-xs font-mono font-bold px-2 py-0.5 rounded-full ${
                maskEstimate.filtrationEfficiencyPercent >= 90
                  ? 'bg-emerald-500/10 text-emerald-500'
                  : 'bg-rose-500/10 text-rose-500'
              }`}
            >
              {maskEstimate.filtrationEfficiencyPercent}% Efficiency
            </span>
          </div>

          {/* Mask Type Selector */}
          <div className="grid grid-cols-4 gap-1.5 bg-stone-200/60 dark:bg-zinc-900/60 p-1 rounded-xl">
            {maskOptions.map((opt) => (
              <button
                key={opt.id}
                onClick={() => setMaskType(opt.id)}
                className={`py-1.5 text-xs font-bold rounded-lg transition-all text-center ${
                  maskType === opt.id
                    ? 'bg-white dark:bg-zinc-800 text-ink dark:text-white shadow-sm'
                    : 'text-ink-muted dark:text-zinc-400 hover:text-ink dark:hover:text-white'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Daily Outdoor Hours Slider */}
          <div>
            <div className="flex justify-between text-xs text-ink-muted dark:text-zinc-400 mb-1.5">
              <span>Daily Outdoor Commute / Use:</span>
              <span className="font-mono font-bold text-ink dark:text-white">
                {outdoorHours} hours/day
              </span>
            </div>
            <input
              type="range"
              min="0.5"
              max="8"
              step="0.5"
              value={outdoorHours}
              onChange={(e) => setOutdoorHours(parseFloat(e.target.value))}
              className="w-full accent-purple-500 cursor-pointer"
            />
          </div>

          {/* Mask Lifespan Result */}
          <div className="p-3 rounded-lg bg-white dark:bg-zinc-900 border border-stone-200 dark:border-zinc-800 flex items-center justify-between">
            <div>
              <div className="text-[10px] text-ink-muted dark:text-zinc-400 uppercase font-mono">
                Usable Lifespan
              </div>
              <div className="text-xl font-mono font-bold text-ink dark:text-white">
                ~{maskEstimate.recommendedUsableDays} days
              </div>
            </div>
            <div className="text-right">
              <div className="text-[10px] text-ink-muted dark:text-zinc-400 uppercase font-mono">
                Cumulative Exposure
              </div>
              <div className="text-xs font-mono font-bold text-purple-500">
                ~{maskEstimate.saturationHours} outdoor hours
              </div>
            </div>
          </div>

          <p className="text-[11px] text-ink-muted dark:text-zinc-400 flex items-start gap-1.5">
            <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
            <span>{maskEstimate.warningNote}</span>
          </p>
        </div>

        {/* Section 2: Home HEPA Purifier Maintenance */}
        <div className="p-4 rounded-xl bg-stone-50 dark:bg-zinc-800/50 border border-stone-200 dark:border-zinc-800 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Wind className="w-4 h-4 text-emerald-500" />
              <span className="font-bold text-sm text-ink dark:text-white">
                Home HEPA Filter Lifecycle
              </span>
            </div>
            <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500">
              {hepaEstimate.estimatedRemainingPercent}% Capacity
            </span>
          </div>

          {/* Purifier Daily Run Duration */}
          <div>
            <div className="flex justify-between text-xs text-ink-muted dark:text-zinc-400 mb-1.5">
              <span>Purifier Operating Schedule:</span>
              <span className="font-mono font-bold text-ink dark:text-white">
                {purifierRunningHours} hours/day
              </span>
            </div>
            <input
              type="range"
              min="4"
              max="24"
              step="2"
              value={purifierRunningHours}
              onChange={(e) => setPurifierRunningHours(parseInt(e.target.value, 10))}
              className="w-full accent-emerald-500 cursor-pointer"
            />
          </div>

          {/* Maintenance Metrics Grid */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-lg bg-white dark:bg-zinc-900 border border-stone-200 dark:border-zinc-800">
              <div className="text-[10px] text-ink-muted dark:text-zinc-400 uppercase font-mono">
                Pre-Filter Vacuum
              </div>
              <div className="mt-1 text-lg font-mono font-bold text-amber-500">
                Every {hepaEstimate.preFilterCleanDays} days
              </div>
              <p className="mt-0.5 text-[10px] text-ink-muted dark:text-zinc-400">
                Vacuum coarse lint &amp; hair
              </p>
            </div>

            <div className="p-3 rounded-lg bg-white dark:bg-zinc-900 border border-stone-200 dark:border-zinc-800">
              <div className="text-[10px] text-ink-muted dark:text-zinc-400 uppercase font-mono">
                HEPA Core Replace
              </div>
              <div className="mt-1 text-lg font-mono font-bold text-emerald-500">
                ~{hepaEstimate.mainHepaReplaceMonths} months
              </div>
              <p className="mt-0.5 text-[10px] text-ink-muted dark:text-zinc-400">
                Replace primary barrel
              </p>
            </div>
          </div>

          <p className="text-[11px] text-ink-muted dark:text-zinc-400">
            {hepaEstimate.summary}
          </p>
        </div>
      </div>
    </div>
  );
};
