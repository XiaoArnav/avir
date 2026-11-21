'use client';

import React from 'react';
import { RoutineItem } from '@/domain/types';
import { Clock, ArrowRight, ShieldCheck, TrendingDown, Sun, Moon } from 'lucide-react';

interface RoutineShifterProps {
  routineShifts: RoutineItem[];
}

export const RoutineShifter: React.FC<RoutineShifterProps> = ({ routineShifts }) => {
  return (
    <section className="rounded-2xl bg-[#101623] border border-gray-800 p-6 shadow-lg space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-gray-800 pb-4">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Clock className="w-5 h-5 text-emerald-400" />
            <span>Dynamic Routine Shifter (Diurnal Exposure Optimization)</span>
          </h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Shifts high-inhalation routines out of nocturnal thermal inversions into solar-convection venting windows
          </p>
        </div>

        <span className="self-start sm:self-auto text-xs px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 font-mono font-semibold">
          Avg PM2.5 Reduction: ~64%
        </span>
      </div>

      <div className="space-y-4">
        {routineShifts.map((shift, idx) => (
          <div
            key={shift.id || idx}
            className="rounded-xl bg-gray-900/80 border border-gray-800 p-4 sm:p-5 hover:border-gray-700 transition-all"
          >
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              {/* Activity Name & Category */}
              <div className="md:w-1/3">
                <span className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded bg-gray-800 text-gray-400 border border-gray-700">
                  {shift.intensity.replace('_', ' ')}
                </span>
                <h3 className="text-base font-bold text-white mt-1.5">{shift.activityName}</h3>
                <span className="text-xs text-emerald-400 font-mono mt-0.5 inline-block">
                  {shift.isOutdoor ? 'Outdoor Activity' : 'Indoor Air Exchange'}
                </span>
              </div>

              {/* Time Shift Comparer */}
              <div className="md:w-7/12 flex items-center justify-between gap-3 bg-gray-950/60 p-3 rounded-xl border border-gray-800/80">
                {/* Baseline Window */}
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-rose-500/10 border border-rose-500/30 flex items-center justify-center shrink-0">
                    <Moon className="w-4 h-4 text-rose-400" />
                  </div>
                  <div>
                    <div className="text-[10px] uppercase font-mono text-gray-400">Baseline Inversion</div>
                    <div className="text-xs font-bold text-rose-300 font-mono">{shift.timeWindow}</div>
                    <div className="text-[10px] text-gray-500">{shift.baselineExposureUg} µg inhaled</div>
                  </div>
                </div>

                <ArrowRight className="w-4 h-4 text-gray-500 shrink-0" />

                {/* Optimized Window */}
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center shrink-0">
                    <Sun className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div>
                    <div className="text-[10px] uppercase font-mono text-emerald-400 font-semibold">Avir Shifted</div>
                    <div className="text-xs font-bold text-emerald-300 font-mono">{shift.optimizedTimeWindow}</div>
                    <div className="text-[10px] text-emerald-400 font-semibold">
                      {shift.optimizedExposureUg} µg ({shift.reductionPercentage}% less)
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Scientific Rationale */}
            <div className="mt-3.5 pt-3 border-t border-gray-800/80 flex items-start gap-2 text-xs text-gray-400">
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <p className="leading-relaxed">
                <strong className="text-gray-300">Atmospheric Rationale:</strong> {shift.rationale}
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};
