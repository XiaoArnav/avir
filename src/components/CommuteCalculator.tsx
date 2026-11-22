'use client';

import React, { useState } from 'react';
import {
  calculateCommuteExposure,
  CommuteTransitMode,
} from '@/domain/advanced-air-math';
import { Navigation, Train, Car, Bus, Bike, ShieldCheck, Cigarette, AlertTriangle } from 'lucide-react';

interface CommuteCalculatorProps {
  ambientPm25: number | null;
}

export const CommuteCalculator: React.FC<CommuteCalculatorProps> = ({ ambientPm25 }) => {
  const [duration, setDuration] = useState<number>(45);
  const [mode, setMode] = useState<CommuteTransitMode>('metro');

  // Strict check: 0 is valid clean air, null/undefined/NaN/<0 is unavailable
  const isAvailable = typeof ambientPm25 === 'number' && Number.isFinite(ambientPm25) && ambientPm25 >= 0;

  if (!isAvailable) {
    return (
      <div className="bg-white dark:bg-zinc-900 border border-stone-200 dark:border-zinc-800 rounded-2xl p-5 sm:p-6 shadow-sm space-y-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-blue-500/10 text-blue-500 border border-blue-500/20">
            <Navigation className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base sm:text-lg font-bold text-ink dark:text-white">
              Commute Smog Calculator
            </h3>
            <p className="text-xs text-ink-muted dark:text-zinc-400">
              Awaiting live particulate readings to calculate commute inhalation dose across transit modes. Zero synthetic data is substituted.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const validPm25 = ambientPm25!;
  const estimate = calculateCommuteExposure(validPm25, duration, mode);

  const transitOptions: { id: CommuteTransitMode; label: string; icon: React.ReactNode }[] = [
    { id: 'metro', label: 'Metro / Subway', icon: <Train className="w-4 h-4" /> },
    { id: 'ac_car_recirc', label: 'AC Car (Recirc ON)', icon: <Car className="w-4 h-4" /> },
    { id: 'ac_bus', label: 'AC City Bus', icon: <Bus className="w-4 h-4" /> },
    { id: 'regular_bus', label: 'Open Bus', icon: <Bus className="w-4 h-4" /> },
    { id: 'two_wheeler_walk', label: 'Two-Wheeler / Walk', icon: <Bike className="w-4 h-4" /> },
  ];

  return (
    <div className="bg-white dark:bg-zinc-900 border border-stone-200 dark:border-zinc-800 rounded-2xl p-5 sm:p-6 shadow-sm space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-blue-500/10 text-blue-500 border border-blue-500/20">
            <Navigation className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base sm:text-lg font-bold text-ink dark:text-white">
              Commute Smog Calculator
            </h3>
            <p className="text-xs text-ink-muted dark:text-zinc-400">
              Inhalation dose model across transit modes in {validPm25} µg/m³ ambient air
            </p>
          </div>
        </div>

        {/* Duration Pills */}
        <div className="flex items-center gap-1.5 bg-stone-100 dark:bg-zinc-800 p-1 rounded-xl">
          {[15, 30, 45, 60, 90].map((mins) => (
            <button
              key={mins}
              onClick={() => setDuration(mins)}
              className={`px-2.5 py-1 rounded-lg text-xs font-mono font-semibold transition-all ${
                duration === mins
                  ? 'bg-white dark:bg-zinc-900 text-ink dark:text-white shadow-sm'
                  : 'text-ink-muted dark:text-zinc-400 hover:text-ink dark:hover:text-white'
              }`}
            >
              {mins}m
            </button>
          ))}
        </div>
      </div>

      {/* Transit Mode Selector Buttons */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {transitOptions.map((opt) => (
          <button
            key={opt.id}
            onClick={() => setMode(opt.id)}
            className={`flex flex-col items-center justify-center p-3 rounded-xl border text-center transition-all ${
              mode === opt.id
                ? 'bg-stone-900 dark:bg-white text-white dark:text-black border-transparent shadow-md'
                : 'bg-stone-50 dark:bg-zinc-800/60 border-stone-200 dark:border-zinc-800 hover:bg-stone-100 dark:hover:bg-zinc-800 text-ink dark:text-zinc-300'
            }`}
          >
            <div className="mb-1.5">{opt.icon}</div>
            <span className="text-xs font-bold leading-tight">{opt.label}</span>
          </button>
        ))}
      </div>

      {/* Inhaled Dose Results Bar */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Total Inhaled Particulate */}
        <div className="p-4 rounded-xl bg-stone-50 dark:bg-zinc-800/60 border border-stone-200 dark:border-zinc-800">
          <div className="text-xs text-ink-muted dark:text-zinc-400">Smog Inhaled on Trip</div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-2xl font-mono font-bold text-ink dark:text-white">
              {estimate.inhaledMicrograms}
            </span>
            <span className="text-xs font-mono text-ink-muted dark:text-zinc-400">µg PM2.5</span>
          </div>
          <p className="mt-1 text-[11px] text-ink-muted dark:text-zinc-400">
            Inhaled air volume over {duration} mins (~{Math.round(0.012 * duration * 100) / 100} m³)
          </p>
        </div>

        {/* Protection Efficiency */}
        <div className="p-4 rounded-xl bg-stone-50 dark:bg-zinc-800/60 border border-stone-200 dark:border-zinc-800">
          <div className="text-xs text-ink-muted dark:text-zinc-400">Relative Attenuation</div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-2xl font-mono font-bold text-emerald-500">
              -{estimate.reductionPercentage}%
            </span>
            <span className="text-xs font-mono text-ink-muted dark:text-zinc-400">vs open air</span>
          </div>
          <p className="mt-1 text-[11px] text-ink-muted dark:text-zinc-400">
            {estimate.reductionPercentage >= 70
              ? 'Enclosed cabin / filtration active'
              : 'Direct open air exposure risk'}
          </p>
        </div>

        {/* Cigarette Fraction Equivalent */}
        <div className="p-4 rounded-xl bg-stone-50 dark:bg-zinc-800/60 border border-stone-200 dark:border-zinc-800">
          <div className="text-xs text-ink-muted dark:text-zinc-400">Inhaled Cigarette Equivalent</div>
          <div className="mt-1 flex items-center gap-2">
            <Cigarette className="w-5 h-5 text-rose-500 shrink-0" />
            <span className="text-2xl font-mono font-bold text-rose-500">
              ~{estimate.cigaretteFraction}
            </span>
            <span className="text-xs font-mono text-ink-muted dark:text-zinc-400">cigs</span>
          </div>
          <p className="mt-1 text-[11px] text-ink-muted dark:text-zinc-400">
            Calculated at Berkeley Earth 22 µg/day = 1 cigarette
          </p>
        </div>
      </div>

      {/* Recommended Protocol & Scientific Disclaimer */}
      <div className="p-4 rounded-xl bg-blue-500/5 dark:bg-blue-950/20 border border-blue-500/20 flex items-start gap-3">
        <ShieldCheck className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
        <div className="text-xs space-y-1">
          <div className="font-bold text-ink dark:text-white">
            Commute Exposure Note ({estimate.modeLabel})
          </div>
          <p className="text-ink-muted dark:text-zinc-300">
            {estimate.protocolRecommendation}
          </p>
          <p className="text-[10px] text-stone-500 dark:text-zinc-500 pt-1">
            * Modeled estimate based on standard adult minute-ventilation (~12 L/min). Real personal exposure varies with respirator fit and cabin airtightness.
          </p>
        </div>
      </div>
    </div>
  );
};
