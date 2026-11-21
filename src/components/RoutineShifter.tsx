'use client';

import React from 'react';
import { RoutineItem } from '@/domain/types';
import { ArrowRight, ShieldCheck, Sun, Moon, Sparkles } from 'lucide-react';

interface RoutineShifterProps {
  routineShifts: RoutineItem[];
}

export const RoutineShifter: React.FC<RoutineShifterProps> = ({ routineShifts }) => {
  return (
    <section 
      aria-label="Dynamic Routine Shifter Section"
      className="rounded-2xl glass-panel p-6 sm:p-8 border border-stone-300 dark:border-zinc-800 bg-white/95 dark:bg-[#0c0c0e]/95 space-y-6 shadow-sm transition-colors"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-stone-200 dark:border-zinc-800/80 pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono text-ink-muted dark:text-zinc-400 uppercase tracking-wider mb-1">
            <Sparkles className="w-3.5 h-3.5 text-sage-600 dark:text-zinc-300" />
            <span>Smart Day Schedule</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-extrabold text-ink dark:text-white tracking-tight flex items-center gap-2">
            <span>Smart Daily Schedule: Avoid Peak Smog</span>
          </h2>
          <p className="text-xs text-ink-muted dark:text-zinc-400 mt-1 max-w-2xl leading-relaxed">
            Move workouts, walks, and opening windows away from chilly morning/night smog peaks to cleaner afternoon hours.
          </p>
        </div>

        <span className="self-start sm:self-auto text-xs px-3 py-1.5 rounded-lg bg-stone-100 dark:bg-zinc-900 border border-stone-300 dark:border-zinc-700 text-ink dark:text-white font-mono font-bold shadow-xs">
          Breathe ~64% Less Smog Today
        </span>
      </div>

      <div className="space-y-4">
        {routineShifts.map((shift, idx) => (
          <div
            key={shift.id || idx}
            className="rounded-xl p-5 bg-stone-50 dark:bg-zinc-900/60 border border-stone-200 dark:border-zinc-800/80 hover:border-stone-300 dark:hover:border-zinc-700 transition-all duration-200"
          >
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
              {/* Activity Info */}
              <div className="lg:w-1/3 space-y-1">
                <span className="text-[10px] font-mono uppercase tracking-widest px-2.5 py-0.5 rounded-md bg-stone-200 dark:bg-zinc-800 text-ink dark:text-zinc-300 border border-stone-300 dark:border-zinc-700">
                  {shift.intensity.replace('_', ' ')}
                </span>
                <h3 className="text-base font-bold text-ink dark:text-white tracking-tight mt-1">{shift.activityName}</h3>
                <span className="text-xs text-ink-muted dark:text-zinc-400 font-mono inline-block">
                  {shift.isOutdoor ? 'Outdoor Activity' : 'Indoor Activity'}
                </span>
              </div>

              {/* Time Shift Comparison Window */}
              <div className="lg:w-7/12 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white dark:bg-zinc-950 p-3.5 rounded-xl border border-stone-200 dark:border-zinc-800 shadow-xs">
                {/* Baseline Window */}
                <div className="flex items-center gap-3 flex-1">
                  <div className="w-9 h-9 rounded-lg bg-stone-100 dark:bg-zinc-900 border border-stone-200 dark:border-zinc-800 flex items-center justify-center shrink-0">
                    <Moon className="w-4 h-4 text-terracotta-600 dark:text-zinc-400" />
                  </div>
                  <div>
                    <div className="text-[10px] uppercase font-mono text-stone-500 dark:text-zinc-500">Normal Time (Heavy Smog)</div>
                    <div className="text-xs font-bold text-ink dark:text-zinc-300 font-mono">{shift.timeWindow}</div>
                    <div className="text-[11px] text-terracotta-700 dark:text-zinc-500 font-mono">{shift.baselineExposureUg} µg inhaled</div>
                  </div>
                </div>

                <div className="hidden sm:flex items-center justify-center text-stone-400 dark:text-zinc-600">
                  <ArrowRight className="w-4 h-4" />
                </div>

                {/* Optimized Solar Window */}
                <div className="flex items-center gap-3 flex-1 sm:pl-3 border-t sm:border-t-0 sm:border-l border-stone-200 dark:border-zinc-800 pt-2 sm:pt-0">
                  <div className="w-9 h-9 rounded-lg bg-sage-50 dark:bg-zinc-900 border border-sage-200 dark:border-zinc-700 flex items-center justify-center shrink-0">
                    <Sun className="w-4 h-4 text-sage-600 dark:text-white" />
                  </div>
                  <div>
                    <div className="text-[10px] uppercase font-mono text-sage-700 dark:text-zinc-300 font-semibold">
                      Clean Air Window
                    </div>
                    <div className="text-xs font-bold text-ink dark:text-white font-mono">
                      {shift.optimizedTimeWindow}
                    </div>
                    <div className="text-[11px] text-sage-600 dark:text-zinc-400 font-mono font-semibold">
                      {shift.optimizedExposureUg} µg ({shift.reductionPercentage}% less smog)
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Scientific Rationale */}
            <div className="mt-3.5 pt-3 border-t border-stone-200 dark:border-zinc-800/80 flex items-center gap-2 text-xs text-ink-muted dark:text-zinc-400">
              <ShieldCheck className="w-4 h-4 text-sage-600 dark:text-zinc-300 shrink-0" />
              <p className="leading-relaxed">
                <strong className="text-ink dark:text-white">Why this works: </strong>
                {shift.rationale}
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};
