'use client';

import React from 'react';
import { RoutineItem } from '@/domain/types';
import { Clock, ArrowRight, ShieldCheck, Sun, Moon, Sparkles, TrendingDown } from 'lucide-react';

interface RoutineShifterProps {
  routineShifts: RoutineItem[];
}

export const RoutineShifter: React.FC<RoutineShifterProps> = ({ routineShifts }) => {
  return (
    <section 
      aria-label="Dynamic Routine Shifter Section"
      className="rounded-2xl glass-panel p-6 sm:p-8 border border-zinc-800 bg-[#0c0c0e]/95 space-y-6"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800/80 pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono text-zinc-400 uppercase tracking-wider mb-1">
            <Sparkles className="w-3.5 h-3.5 text-zinc-300" />
            <span>Circadian Atmospheric Inversion Optimizer</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight flex items-center gap-2">
            <span>Dynamic Routine Shifter</span>
          </h2>
          <p className="text-xs text-zinc-400 mt-1 max-w-2xl leading-relaxed">
            Shifts high-ventilation activities out of nocturnal thermal inversion ceilings into solar convective venting windows.
          </p>
        </div>

        <span className="self-start sm:self-auto text-xs px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-700 text-white font-mono font-bold shadow-sm">
          Average Inhaled Dose Cut: ~64%
        </span>
      </div>

      <div className="space-y-4">
        {routineShifts.map((shift, idx) => (
          <div
            key={shift.id || idx}
            className="rounded-xl p-5 bg-zinc-900/60 border border-zinc-800/80 hover:border-zinc-700 transition-all duration-200"
          >
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
              {/* Activity Info */}
              <div className="lg:w-1/3 space-y-1">
                <span className="text-[10px] font-mono uppercase tracking-widest px-2.5 py-0.5 rounded-md bg-zinc-800 text-zinc-300 border border-zinc-700">
                  {shift.intensity.replace('_', ' ')}
                </span>
                <h3 className="text-base font-bold text-white tracking-tight mt-1">{shift.activityName}</h3>
                <span className="text-xs text-zinc-400 font-mono inline-block">
                  {shift.isOutdoor ? 'Outdoor High-Ventilation' : 'Indoor Air Exchange'}
                </span>
              </div>

              {/* Time Shift Comparison Window */}
              <div className="lg:w-7/12 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-zinc-950 p-3.5 rounded-xl border border-zinc-800">
                {/* Baseline Window */}
                <div className="flex items-center gap-3 flex-1">
                  <div className="w-9 h-9 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center shrink-0">
                    <Moon className="w-4 h-4 text-zinc-400" />
                  </div>
                  <div>
                    <div className="text-[10px] uppercase font-mono text-zinc-500">Baseline Inversion</div>
                    <div className="text-xs font-bold text-zinc-300 font-mono">{shift.timeWindow}</div>
                    <div className="text-[11px] text-zinc-500 font-mono">{shift.baselineExposureUg} µg inhaled</div>
                  </div>
                </div>

                <div className="hidden sm:flex items-center justify-center text-zinc-600">
                  <ArrowRight className="w-4 h-4" />
                </div>

                {/* Optimized Solar Window */}
                <div className="flex items-center gap-3 flex-1 sm:pl-3 border-t sm:border-t-0 sm:border-l border-zinc-800 pt-2 sm:pt-0">
                  <div className="w-9 h-9 rounded-lg bg-zinc-900 border border-zinc-700 flex items-center justify-center shrink-0">
                    <Sun className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <div className="text-[10px] uppercase font-mono text-zinc-300 font-semibold">
                      Solar Venting Window
                    </div>
                    <div className="text-xs font-bold text-white font-mono">
                      {shift.optimizedTimeWindow}
                    </div>
                    <div className="text-[11px] text-zinc-400 font-mono font-semibold">
                      {shift.optimizedExposureUg} µg ({shift.reductionPercentage}% avoided)
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Scientific Rationale */}
            <div className="mt-3.5 pt-3 border-t border-zinc-800/80 flex items-center gap-2 text-xs text-zinc-400">
              <ShieldCheck className="w-4 h-4 text-zinc-300 shrink-0" />
              <p className="leading-relaxed">
                <strong>Why this works: </strong>
                {shift.rationale}
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};
