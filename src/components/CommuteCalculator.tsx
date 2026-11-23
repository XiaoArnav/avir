'use client';

import React, { useState } from 'react';
import {
  evaluateCommuteScenarios,
  calculateCommuteModeExposure,
} from '@/services/commute/commute-service';
import {
  CommuteTransitMode,
  COMMUTE_MODE_PROFILES,
} from '@/domain/exposure-types';
import { Navigation, Train, Car, Bus, Bike, Footprints, ShieldCheck, Settings2 } from 'lucide-react';

interface CommuteCalculatorProps {
  ambientPm25: number | null;
}

export const CommuteCalculator: React.FC<CommuteCalculatorProps> = ({ ambientPm25 }) => {
  const [duration, setDuration] = useState<number>(45);
  const [mode, setMode] = useState<CommuteTransitMode>('metro');
  const [customRatio, setCustomRatio] = useState<number | undefined>(undefined);
  const [showSettings, setShowSettings] = useState<boolean>(false);

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
              Commute Exposure Calculator
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
  const currentScenario = calculateCommuteModeExposure(mode, validPm25, duration, customRatio);
  const comparisonReport = evaluateCommuteScenarios({
    ambientPM25: validPm25,
    durationMinutes: duration,
    customRatios: customRatio !== undefined ? { [mode]: customRatio } : undefined,
  });

  const transitOptions: { id: CommuteTransitMode; label: string; icon: React.ReactNode }[] = [
    { id: 'metro', label: 'Metro Transit', icon: <Train className="w-4 h-4" /> },
    { id: 'car_recirc_on', label: 'Car (AC / Recirc)', icon: <Car className="w-4 h-4" /> },
    { id: 'bus_ac', label: 'AC City Bus', icon: <Bus className="w-4 h-4" /> },
    { id: 'bus_standard', label: 'Open Bus', icon: <Bus className="w-4 h-4" /> },
    { id: 'walking', label: 'Walking', icon: <Footprints className="w-4 h-4" /> },
    { id: 'cycling', label: 'Cycling', icon: <Bike className="w-4 h-4" /> },
  ];

  const profile = COMMUTE_MODE_PROFILES[mode];

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
              Commute Exposure Calculator
            </h3>
            <p className="text-xs text-ink-muted dark:text-zinc-400">
              Inhalation dose model across transit modes in {validPm25} µg/m³ ambient air
            </p>
          </div>
        </div>

        {/* Duration Pills & Settings Toggle */}
        <div className="flex items-center gap-2">
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
          <button
            onClick={() => setShowSettings(!showSettings)}
            aria-label="Toggle microenvironment settings"
            className={`p-2 rounded-xl border transition-all ${
              showSettings
                ? 'bg-blue-500/10 border-blue-500/30 text-blue-500'
                : 'bg-stone-50 dark:bg-zinc-800/60 border-stone-200 dark:border-zinc-800 text-ink-muted dark:text-zinc-400'
            }`}
          >
            <Settings2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Optional Microenvironment Ratio Override */}
      {showSettings && (
        <div className="p-3.5 bg-stone-50 dark:bg-zinc-800/60 rounded-xl border border-stone-200 dark:border-zinc-800 text-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-ink dark:text-white">
              Microenvironment Penetration Ratio ({profile.displayName})
            </span>
            <span className="font-mono text-ink-muted dark:text-zinc-400">
              {Math.round(currentScenario.microenvironmentRatio * 100)}%
            </span>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min="0.05"
              max="1.50"
              step="0.05"
              value={currentScenario.microenvironmentRatio}
              onChange={(e) => setCustomRatio(parseFloat(e.target.value))}
              className="w-full accent-blue-600"
            />
            <button
              onClick={() => setCustomRatio(undefined)}
              className="text-[11px] text-blue-500 hover:underline shrink-0"
            >
              Reset Default
            </button>
          </div>
          <p className="text-[11px] text-ink-muted dark:text-zinc-400">
            Default ratio: {Math.round(profile.defaultRatio * 100)}%. Adjust if your vehicle has a certified HEPA cabin filter or open window conditions.
          </p>
        </div>
      )}

      {/* Transit Mode Selector Buttons */}
      <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
        {transitOptions.map((opt) => (
          <button
            key={opt.id}
            onClick={() => {
              setMode(opt.id);
              setCustomRatio(undefined);
            }}
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
          <div className="text-xs text-ink-muted dark:text-zinc-400">Total Inhaled PM2.5</div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-2xl font-mono font-bold text-ink dark:text-white">
              {currentScenario.inhaledMassUg}
            </span>
            <span className="text-xs font-mono text-ink-muted dark:text-zinc-400">µg</span>
          </div>
          <p className="mt-1 text-[11px] text-ink-muted dark:text-zinc-400">
            Inhaled volume: {Math.round(currentScenario.ventilationRateM3Min * duration * 100) / 100} m³ air ({Math.round(currentScenario.ventilationRateM3Min * 1000)} L/min)
          </p>
        </div>

        {/* Effective Microenvironment Concentration */}
        <div className="p-4 rounded-xl bg-stone-50 dark:bg-zinc-800/60 border border-stone-200 dark:border-zinc-800">
          <div className="text-xs text-ink-muted dark:text-zinc-400">In-Cabin Concentration</div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-2xl font-mono font-bold text-ink dark:text-white">
              {currentScenario.effectivePM25}
            </span>
            <span className="text-xs font-mono text-ink-muted dark:text-zinc-400">µg/m³</span>
          </div>
          <p className="mt-1 text-[11px] text-ink-muted dark:text-zinc-400">
            {Math.round(currentScenario.microenvironmentRatio * 100)}% of ambient roadway level ({validPm25} µg/m³)
          </p>
        </div>

        {/* Relative Comparison vs Highest Exposure Mode */}
        <div className="p-4 rounded-xl bg-stone-50 dark:bg-zinc-800/60 border border-stone-200 dark:border-zinc-800">
          <div className="text-xs text-ink-muted dark:text-zinc-400">Exposure vs Cycling</div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-2xl font-mono font-bold text-emerald-500">
              -{comparisonReport.scenarios.find(s => s.mode === mode)?.relativeSavingsVsHighestPercent ?? 0}%
            </span>
            <span className="text-xs font-mono text-ink-muted dark:text-zinc-400">lower mass</span>
          </div>
          <p className="mt-1 text-[11px] text-ink-muted dark:text-zinc-400">
            Lowest mode: {COMMUTE_MODE_PROFILES[comparisonReport.lowestExposureMode]?.displayName}
          </p>
        </div>
      </div>

      {/* Recommended Protocol & Scientific Disclaimer */}
      <div className="p-4 rounded-xl bg-blue-500/5 dark:bg-blue-950/20 border border-blue-500/20 flex items-start gap-3">
        <ShieldCheck className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
        <div className="text-xs space-y-1">
          <div className="font-bold text-ink dark:text-white">
            Commute Microenvironment Note ({profile.displayName})
          </div>
          <p className="text-ink-muted dark:text-zinc-300">
            {profile.description}
          </p>
          <p className="text-[10px] text-stone-500 dark:text-zinc-500 pt-1">
            * Modeled estimate based on standard adult minute-ventilation (~12 L/min) and transparent microenvironment ratios. Arbitrary smoking equivalences have been completely eliminated. Real personal exposure varies with respirator fit and cabin airtightness.
          </p>
        </div>
      </div>
    </div>
  );
};
