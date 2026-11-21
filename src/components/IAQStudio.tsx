'use client';

import React, { useState } from 'react';
import { CorsiRosenthalBoxSpec } from '@/domain/types';
import { calculateCorsiRosenthalBox } from '@/domain/air-math';
import { Box, Wrench, Zap, DollarSign, Timer, CheckCircle2, ShieldCheck, Sparkles } from 'lucide-react';

interface IAQStudioProps {
  spec: CorsiRosenthalBoxSpec;
}

export const IAQStudio: React.FC<IAQStudioProps> = ({ spec: initialSpec }) => {
  const [filterCount, setFilterCount] = useState<4 | 5>(initialSpec.numberOfFilters || 4);
  const activeSpec = calculateCorsiRosenthalBox(initialSpec.roomVolumeM3, filterCount);

  return (
    <section 
      aria-label="Corsi-Rosenthal Box IAQ Studio"
      className="rounded-2xl glass-panel p-6 sm:p-8 border border-zinc-800 bg-[#0c0c0e]/95 space-y-6"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800/80 pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono text-zinc-400 uppercase tracking-wider mb-1">
            <Sparkles className="w-3.5 h-3.5 text-zinc-300" />
            <span>Frugal Engineering &amp; Clean Air Physics</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight flex items-center gap-2">
            <span>Frugal IAQ Studio: DIY Corsi-Rosenthal Air Cleaner</span>
          </h2>
          <p className="text-xs text-zinc-400 mt-1 max-w-2xl leading-relaxed">
            Mates a standard 20-inch box fan with 4 or 5 MERV-13 filters to deliver commercial hospital-grade CADR at 15% of the commercial unit cost.
          </p>
        </div>

        {/* Filter Toggle Switch - High Contrast Duo */}
        <div className="flex items-center gap-1 p-1 rounded-xl bg-zinc-900 border border-zinc-800 self-start sm:self-auto">
          <button
            onClick={() => setFilterCount(4)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              filterCount === 4
                ? 'bg-white text-black shadow-sm'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            4-Filter Cube (490 CFM)
          </button>
          <button
            onClick={() => setFilterCount(5)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              filterCount === 5
                ? 'bg-white text-black shadow-sm'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            5-Filter Comparetto (580 CFM)
          </button>
        </div>
      </div>

      {/* Primary Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Metric 1: ACH */}
        <div className="rounded-xl p-5 bg-zinc-900/60 border border-zinc-800/80">
          <div className="flex items-center justify-between text-zinc-400 text-xs mb-1.5">
            <span className="font-semibold uppercase tracking-wider font-mono text-[11px]">Air Changes / Hour</span>
            <Zap className="w-4 h-4 text-zinc-300" />
          </div>
          <div className="text-3xl sm:text-4xl font-extrabold text-white font-mono tracking-tight tabular-nums">
            {activeSpec.airChangesPerHour} <span className="text-sm font-sans font-normal text-zinc-400">ACH</span>
          </div>
          <p className="text-xs text-zinc-300 mt-2 font-semibold flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5 text-white" />
            <span>
              {activeSpec.airChangesPerHour >= 6
                ? 'Hospital Airborne Infection Isolation Grade'
                : 'Exceeds EPA 4 ACH Baseline Standard'}
            </span>
          </p>
        </div>

        {/* Metric 2: Particle Half-Life Clearance */}
        <div className="rounded-xl p-5 bg-zinc-900/60 border border-zinc-800/80">
          <div className="flex items-center justify-between text-zinc-400 text-xs mb-1.5">
            <span className="font-semibold uppercase tracking-wider font-mono text-[11px]">Room Smog Half-Life</span>
            <Timer className="w-4 h-4 text-zinc-300" />
          </div>
          <div className="text-3xl sm:text-4xl font-extrabold text-white font-mono tracking-tight tabular-nums">
            {activeSpec.clearingHalfLifeMinutes} <span className="text-sm font-sans font-normal text-zinc-400">mins</span>
          </div>
          <p className="text-xs text-zinc-500 mt-2">
            Time required to purge 50% of airborne PM2.5 from a {activeSpec.roomVolumeM3} m³ space.
          </p>
        </div>

        {/* Metric 3: Cost Comparison */}
        <div className="rounded-xl p-5 bg-zinc-900/60 border border-zinc-800/80">
          <div className="flex items-center justify-between text-zinc-400 text-xs mb-1.5">
            <span className="font-semibold uppercase tracking-wider font-mono text-[11px]">Frugal Cost Advantage</span>
            <DollarSign className="w-4 h-4 text-zinc-300" />
          </div>
          <div className="text-3xl sm:text-4xl font-extrabold text-white font-mono tracking-tight tabular-nums">
            ₹{activeSpec.estimatedCostINR} <span className="text-xs font-sans font-normal text-zinc-400">vs ₹18,000 HEPA</span>
          </div>
          <p className="text-xs text-zinc-300 mt-2 font-semibold">
            Delivers 83% financial savings with identical clean air throughput.
          </p>
        </div>
      </div>

      {/* Assembly Blueprint & Bill of Materials */}
      <div className="rounded-xl bg-zinc-950 p-5 border border-zinc-800 space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wider font-mono text-zinc-300 flex items-center gap-2">
          <Wrench className="w-4 h-4 text-zinc-400" />
          <span>Local Sourcing &amp; Assembly Blueprint (Under 20 Minutes)</span>
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs text-zinc-300">
          <div className="p-3 rounded-lg bg-zinc-900 border border-zinc-800">
            <div className="font-bold text-white mb-0.5">1. Box Fan (₹1,400)</div>
            <p className="text-zinc-400 text-[11px]">20-inch 3-speed domestic box fan (Usha/Bajaj/generic).</p>
          </div>
          <div className="p-3 rounded-lg bg-zinc-900 border border-zinc-800">
            <div className="font-bold text-white mb-0.5">2. {filterCount}× MERV-13 Filters (₹1,400)</div>
            <p className="text-zinc-400 text-[11px]">20×20×1 inch HVAC pleated filters (captures 0.3–1.0µm).</p>
          </div>
          <div className="p-3 rounded-lg bg-zinc-900 border border-zinc-800">
            <div className="font-bold text-white mb-0.5">3. Duct Tape &amp; Shroud (₹150)</div>
            <p className="text-zinc-400 text-[11px]">Cardboard shroud circle taped over corners to stop backdraft.</p>
          </div>
          <div className="p-3 rounded-lg bg-zinc-900 border border-zinc-800">
            <div className="font-bold text-white mb-0.5">4. Assembly (15 Mins)</div>
            <p className="text-zinc-400 text-[11px]">Tape filters in cube format, arrows pointing inward toward fan.</p>
          </div>
        </div>
      </div>
    </section>
  );
};
