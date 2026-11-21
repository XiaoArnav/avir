'use client';

import React from 'react';
import { CorsiRosenthalBoxSpec } from '@/domain/types';
import { Box, Wrench, Zap, DollarSign, Timer, CheckCircle2 } from 'lucide-react';

interface IAQStudioProps {
  spec: CorsiRosenthalBoxSpec;
}

export const IAQStudio: React.FC<IAQStudioProps> = ({ spec }) => {
  return (
    <section className="rounded-2xl bg-[#101623] border border-gray-800 p-6 shadow-lg space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-gray-800 pb-4">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Wrench className="w-5 h-5 text-emerald-400" />
            <span>Frugal IAQ Studio: DIY Corsi-Rosenthal Air Cleaner</span>
          </h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Field-tested, low-cost particulate defense delivering commercial HEPA-grade clean air delivery rate (CADR)
          </p>
        </div>

        <span className="self-start sm:self-auto text-xs px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 font-mono font-semibold">
          CADR: {spec.estimatedCADR_CFM} CFM ({spec.estimatedCADR_M3H} m³/hr)
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Metric 1: ACH */}
        <div className="rounded-xl bg-gray-900/80 border border-gray-800 p-4">
          <div className="flex items-center justify-between text-gray-400 text-xs mb-1.5">
            <span>Air Changes / Hour</span>
            <Zap className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-white font-mono">
            {spec.airChangesPerHour} <span className="text-sm font-sans text-gray-400">ACH</span>
          </div>
          <p className="text-[11px] text-emerald-400 mt-1 font-semibold">
            {spec.airChangesPerHour >= 6 ? '✓ Hospital-Grade Clearance' : '✓ Exceeds EPA Baseline (4 ACH)'}
          </p>
        </div>

        {/* Metric 2: Clearance Half-Life */}
        <div className="rounded-xl bg-gray-900/80 border border-gray-800 p-4">
          <div className="flex items-center justify-between text-gray-400 text-xs mb-1.5">
            <span>Smog Half-Life Clearance</span>
            <Timer className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-cyan-300 font-mono">
            {spec.clearingHalfLifeMinutes} <span className="text-sm font-sans text-gray-400">mins</span>
          </div>
          <p className="text-[11px] text-gray-400 mt-1">
            Time required to reduce room particulate by 50%
          </p>
        </div>

        {/* Metric 3: Cost Comparison */}
        <div className="rounded-xl bg-gray-900/80 border border-gray-800 p-4">
          <div className="flex items-center justify-between text-gray-400 text-xs mb-1.5">
            <span>DIY Build Cost</span>
            <DollarSign className="w-4 h-4 text-yellow-400" />
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-yellow-300 font-mono">
            ₹{spec.estimatedCostINR}
          </div>
          <p className="text-[11px] text-gray-400 mt-1">
            vs ₹22,000+ for equivalent commercial purifiers
          </p>
        </div>
      </div>

      {/* Assembly Guide Checklist */}
      <div className="rounded-xl bg-gray-950/70 border border-gray-800/80 p-5 space-y-3">
        <h3 className="text-xs font-bold text-gray-300 uppercase tracking-wider flex items-center gap-2">
          <Box className="w-4 h-4 text-emerald-400" />
          <span>Frugal Assembly Blueprint ({spec.numberOfFilters}-Filter Cube Configuration)</span>
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-gray-300">
          <div className="flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <span>1x 20-inch Box Fan placed blowing upward as the exhaust ceiling.</span>
          </div>
          <div className="flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <span>{spec.numberOfFilters}x MERV-13 (20x20x2) high-surface furnace filters forming walls.</span>
          </div>
          <div className="flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <span>Heavy-duty duct tape hermetically sealing all frame seams.</span>
          </div>
          <div className="flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <span>Circular cardboard fan shroud installed to eliminate blade edge vortex leakage.</span>
          </div>
        </div>
      </div>
    </section>
  );
};
