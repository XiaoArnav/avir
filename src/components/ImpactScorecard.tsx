'use client';

import React from 'react';
import { RecommendationPlan } from '@/domain/types';
import { TrendingDown, ShieldAlert, HeartPulse, Sparkles, Cigarette, CheckCircle2 } from 'lucide-react';

interface ImpactScorecardProps {
  plan: RecommendationPlan;
}

export const ImpactScorecard: React.FC<ImpactScorecardProps> = ({ plan }) => {
  const { impactMetrics } = plan;

  const reductionPercentage =
    impactMetrics.totalInhaledBaselineUg !== null &&
    impactMetrics.totalInhaledOptimizedUg !== null &&
    impactMetrics.totalInhaledBaselineUg > 0
      ? Math.round(
          ((impactMetrics.totalInhaledBaselineUg - impactMetrics.totalInhaledOptimizedUg) /
            impactMetrics.totalInhaledBaselineUg) *
            100
        )
      : null;

  return (
    <section 
      aria-label="Quantified Health Impact Scorecard"
      className="rounded-2xl glass-panel p-6 sm:p-8 border border-stone-300 dark:border-zinc-800 bg-white/95 dark:bg-[#0c0c0e]/95 space-y-6 shadow-sm transition-colors"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-stone-200 dark:border-zinc-800/80 pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono text-ink-muted dark:text-zinc-400 uppercase tracking-wider mb-1">
            <Sparkles className="w-3.5 h-3.5 text-sage-600 dark:text-zinc-300" />
            <span>Your Health Protection</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-extrabold text-ink dark:text-white tracking-tight flex items-center gap-2">
            <span>Pollution Cut From Your Routine</span>
          </h2>
          <p className="text-xs text-ink-muted dark:text-zinc-400 mt-1 max-w-2xl leading-relaxed">
            Shows how much less toxic particulate dust enters your lungs when you follow this schedule.
          </p>
        </div>

        {reductionPercentage !== null && (
          <span className="self-start sm:self-auto text-xs px-3 py-1.5 rounded-lg bg-stone-100 dark:bg-zinc-900 border border-stone-300 dark:border-zinc-700 text-ink dark:text-white font-mono font-bold shadow-xs">
            Inhaled Dose Reduced: ~{reductionPercentage}%
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1: Inhaled Mass Avoided */}
        <div className="rounded-xl p-5 bg-stone-50 dark:bg-zinc-900/60 border border-stone-200 dark:border-zinc-800/80 hover:border-stone-300 dark:hover:border-zinc-700 transition-colors">
          <div className="flex items-center justify-between text-ink-muted dark:text-zinc-400 text-xs mb-2 font-mono uppercase tracking-wider text-[11px]">
            <span>Toxic Dust Kept Out</span>
            <TrendingDown className="w-4 h-4 text-sage-600 dark:text-zinc-300" />
          </div>
          <div className="text-3xl font-extrabold text-ink dark:text-white font-mono tracking-tight tabular-nums">
            {typeof impactMetrics.netAvoidedPM25Ug === 'number' && Number.isFinite(impactMetrics.netAvoidedPM25Ug)
              ? impactMetrics.netAvoidedPM25Ug
              : '—'}{' '}
            <span className="text-xs font-sans font-normal text-ink-muted dark:text-zinc-400">µg / day</span>
          </div>
          <div className="text-xs text-stone-500 dark:text-zinc-500 mt-2">
            Fine particles blocked from entering your lungs and blood today.
          </div>
        </div>

        {/* Metric 2: Monthly Cigarettes Avoided */}
        <div className="rounded-xl p-5 bg-stone-50 dark:bg-zinc-900/60 border border-stone-200 dark:border-zinc-800/80 hover:border-stone-300 dark:hover:border-zinc-700 transition-colors">
          <div className="flex items-center justify-between text-ink-muted dark:text-zinc-400 text-xs mb-2 font-mono uppercase tracking-wider text-[11px]">
            <span>Cigarettes Avoided</span>
            <Cigarette className="w-4 h-4 text-terracotta-600 dark:text-zinc-300" />
          </div>
          <div className="text-3xl font-extrabold text-ink dark:text-white font-mono tracking-tight tabular-nums">
            {typeof impactMetrics.avoidedCigarettesMonthly === 'number' &&
            Number.isFinite(impactMetrics.avoidedCigarettesMonthly)
              ? impactMetrics.avoidedCigarettesMonthly
              : '—'}{' '}
            <span className="text-xs font-sans font-normal text-ink-muted dark:text-zinc-400">cigs / mo</span>
          </div>
          <div className="text-xs text-stone-500 dark:text-zinc-500 mt-2">
            Smoke exposure saved over a month by following this plan.
          </div>
        </div>

        {/* Metric 3: Clinical Risk Normalization */}
        <div className="rounded-xl p-5 bg-stone-50 dark:bg-zinc-900/60 border border-stone-200 dark:border-zinc-800/80 hover:border-stone-300 dark:hover:border-zinc-700 transition-colors">
          <div className="flex items-center justify-between text-ink-muted dark:text-zinc-400 text-xs mb-2 font-mono uppercase tracking-wider text-[11px]">
            <span>Total Smog Reduction</span>
            <ShieldAlert className="w-4 h-4 text-amber-500 dark:text-zinc-300" />
          </div>
          <div className="text-3xl font-extrabold text-ink dark:text-white font-mono tracking-tight tabular-nums">
            {reductionPercentage !== null ? `${reductionPercentage}%` : '—'}
          </div>
          <div className="text-xs text-stone-500 dark:text-zinc-500 mt-2">
            Less pollution inhaled compared to unoptimized routine.
          </div>
        </div>

        {/* Metric 4: Vulnerability Protection Status */}
        <div className="rounded-xl p-5 bg-stone-50 dark:bg-zinc-900/60 border border-stone-200 dark:border-zinc-800/80 hover:border-stone-300 dark:hover:border-zinc-700 transition-colors">
          <div className="flex items-center justify-between text-ink-muted dark:text-zinc-400 text-xs mb-2 font-mono uppercase tracking-wider text-[11px]">
            <span>Protection Status</span>
            <HeartPulse className="w-4 h-4 text-sage-600 dark:text-zinc-300" />
          </div>
          <div className="text-lg font-bold text-ink dark:text-white tracking-tight flex items-center gap-1.5 mt-1">
            <CheckCircle2 className="w-4 h-4 text-sage-600 dark:text-white" />
            <span>
              {reductionPercentage !== null && reductionPercentage >= 50
                ? 'High Protection'
                : reductionPercentage !== null && reductionPercentage > 0
                ? 'Moderate Protection'
                : 'Awaiting PM2.5 Telemetry'}
            </span>
          </div>
          <div className="text-xs text-stone-500 dark:text-zinc-500 mt-2">
            {reductionPercentage !== null && reductionPercentage >= 50
              ? 'Multi-barrier defense: Safe timing + home cleaner + N95 mask.'
              : 'Exposure shift and indoor Corsi-Rosenthal / HEPA filtration.'}
          </div>
        </div>
      </div>
    </section>
  );
};
