'use client';

import React, { useState } from 'react';
import { CorsiRosenthalBoxSpec } from '@/domain/types';
import { calculateCorsiRosenthalBox } from '@/domain/air-math';
import { Wrench, Zap, DollarSign, Timer, CheckCircle2, Sparkles } from 'lucide-react';

interface IAQStudioProps {
  spec: CorsiRosenthalBoxSpec;
}

export const IAQStudio: React.FC<IAQStudioProps> = ({ spec: initialSpec }) => {
  const [filterCount, setFilterCount] = useState<4 | 5>(initialSpec.numberOfFilters || 4);
  const activeSpec = calculateCorsiRosenthalBox(initialSpec.roomVolumeM3, filterCount);

  return (
    <section 
      aria-label="Corsi-Rosenthal Box IAQ Studio"
      className="rounded-2xl glass-panel p-6 sm:p-8 border border-stone-300 dark:border-zinc-800 bg-white/95 dark:bg-[#0c0c0e]/95 space-y-6 shadow-sm transition-colors"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-stone-200 dark:border-zinc-800/80 pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono text-ink-muted dark:text-zinc-400 uppercase tracking-wider mb-1">
            <Sparkles className="w-3.5 h-3.5 text-sage-600 dark:text-zinc-300" />
            <span>Affordable Clean Home Air</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-extrabold text-ink dark:text-white tracking-tight flex items-center gap-2">
            <span>Build a ₹2,950 Air Cleaner (DIY Box Fan)</span>
          </h2>
          <p className="text-xs text-ink-muted dark:text-zinc-400 mt-1 max-w-2xl leading-relaxed">
            Tape 4 furnace filters to a regular 20-inch box fan. Delivers 490 CFM of clean air—matching an ₹18,000 branded purifier at a fraction of the cost.
          </p>
        </div>

        {/* Filter Toggle Switch - Adaptive Duo */}
        <div className="flex items-center gap-1 p-1 rounded-xl bg-stone-100 dark:bg-zinc-900 border border-stone-300 dark:border-zinc-800 self-start sm:self-auto shadow-xs">
          <button
            onClick={() => setFilterCount(4)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              filterCount === 4
                ? 'bg-ink text-white font-bold dark:bg-white dark:text-black shadow-sm'
                : 'text-ink-muted hover:text-ink dark:text-zinc-400 dark:hover:text-white'
            }`}
          >
            4-Filter Cube (490 CFM Power)
          </button>
          <button
            onClick={() => setFilterCount(5)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              filterCount === 5
                ? 'bg-ink text-white font-bold dark:bg-white dark:text-black shadow-sm'
                : 'text-ink-muted hover:text-ink dark:text-zinc-400 dark:hover:text-white'
            }`}
          >
            5-Filter Cube (580 CFM Extra Power)
          </button>
        </div>
      </div>

      {/* Primary Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Metric 1: ACH */}
        <div className="rounded-xl p-5 bg-stone-50 dark:bg-zinc-900/60 border border-stone-200 dark:border-zinc-800/80">
          <div className="flex items-center justify-between text-ink-muted dark:text-zinc-400 text-xs mb-1.5">
            <span className="font-semibold uppercase tracking-wider font-mono text-[11px]">Room Air Washed</span>
            <Zap className="w-4 h-4 text-sage-600 dark:text-zinc-300" />
          </div>
          <div className="text-3xl sm:text-4xl font-extrabold text-ink dark:text-white font-mono tracking-tight tabular-nums">
            {activeSpec.airChangesPerHour} <span className="text-sm font-sans font-normal text-ink-muted dark:text-zinc-400">times/hr (ACH)</span>
          </div>
          <p className="text-xs text-sage-700 dark:text-zinc-300 mt-2 font-semibold flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5 text-sage-600 dark:text-white" />
            <span>
              {activeSpec.airChangesPerHour >= 6
                ? 'Hospital Isolation Grade Clean Air'
                : 'Exceeds Standard Clean Air Goal (4 ACH)'}
            </span>
          </p>
        </div>

        {/* Metric 2: Particle Half-Life Clearance */}
        <div className="rounded-xl p-5 bg-stone-50 dark:bg-zinc-900/60 border border-stone-200 dark:border-zinc-800/80">
          <div className="flex items-center justify-between text-ink-muted dark:text-zinc-400 text-xs mb-1.5">
            <span className="font-semibold uppercase tracking-wider font-mono text-[11px]">Cuts Smog by Half</span>
            <Timer className="w-4 h-4 text-sage-600 dark:text-zinc-300" />
          </div>
          <div className="text-3xl sm:text-4xl font-extrabold text-ink dark:text-white font-mono tracking-tight tabular-nums">
            {activeSpec.clearingHalfLifeMinutes} <span className="text-sm font-sans font-normal text-ink-muted dark:text-zinc-400">mins</span>
          </div>
          <p className="text-xs text-stone-500 dark:text-zinc-500 mt-2">
            Time needed to clear 50% of airborne dust from your {activeSpec.roomVolumeM3} m³ room.
          </p>
        </div>

        {/* Metric 3: Cost Comparison */}
        <div className="rounded-xl p-5 bg-stone-50 dark:bg-zinc-900/60 border border-stone-200 dark:border-zinc-800/80">
          <div className="flex items-center justify-between text-ink-muted dark:text-zinc-400 text-xs mb-1.5">
            <span className="font-semibold uppercase tracking-wider font-mono text-[11px]">Estimated Total Cost</span>
            <DollarSign className="w-4 h-4 text-sage-600 dark:text-zinc-300" />
          </div>
          <div className="text-3xl sm:text-4xl font-extrabold text-ink dark:text-white font-mono tracking-tight tabular-nums">
            ₹{activeSpec.estimatedCostINR} <span className="text-xs font-sans font-normal text-ink-muted dark:text-zinc-400">vs ₹18,000 Branded</span>
          </div>
          <p className="text-xs text-sage-700 dark:text-zinc-300 mt-2 font-semibold">
            Delivers 83% financial savings with identical clean air output.
          </p>
        </div>
      </div>

      {/* Assembly Blueprint & Bill of Materials */}
      <div className="rounded-xl bg-stone-50 dark:bg-zinc-950 p-5 border border-stone-200 dark:border-zinc-800 space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wider font-mono text-ink dark:text-zinc-300 flex items-center gap-2">
          <Wrench className="w-4 h-4 text-sage-600 dark:text-zinc-400" />
          <span>Materials Needed &amp; Easy 20-Minute Setup</span>
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs text-ink dark:text-zinc-300">
          <div className="p-3 rounded-lg bg-white dark:bg-zinc-900 border border-stone-200 dark:border-zinc-800 shadow-xs">
            <div className="font-bold text-ink dark:text-white mb-0.5">1. Box Fan (₹1,400)</div>
            <p className="text-ink-muted dark:text-zinc-400 text-[11px]">20-inch 3-speed domestic box fan (Usha/Bajaj/generic).</p>
          </div>
          <div className="p-3 rounded-lg bg-white dark:bg-zinc-900 border border-stone-200 dark:border-zinc-800 shadow-xs">
            <div className="font-bold text-ink dark:text-white mb-0.5">2. {filterCount}× MERV-13 Filters (₹1,400)</div>
            <p className="text-ink-muted dark:text-zinc-400 text-[11px]">20×20×1 inch HVAC pleated filters (captures 0.3–1.0µm).</p>
          </div>
          <div className="p-3 rounded-lg bg-white dark:bg-zinc-900 border border-stone-200 dark:border-zinc-800 shadow-xs">
            <div className="font-bold text-ink dark:text-white mb-0.5">3. Duct Tape &amp; Shroud (₹150)</div>
            <p className="text-ink-muted dark:text-zinc-400 text-[11px]">Cardboard shroud circle taped over corners to stop backdraft.</p>
          </div>
          <div className="p-3 rounded-lg bg-white dark:bg-zinc-900 border border-stone-200 dark:border-zinc-800 shadow-xs">
            <div className="font-bold text-ink dark:text-white mb-0.5">4. Assembly (15 Mins)</div>
            <p className="text-ink-muted dark:text-zinc-400 text-[11px]">Tape filters in cube format, arrows pointing inward toward fan.</p>
          </div>
        </div>
      </div>
    </section>
  );
};
