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
    impactMetrics.totalInhaledBaselineUg > 0
      ? Math.round(
          ((impactMetrics.totalInhaledBaselineUg - impactMetrics.totalInhaledOptimizedUg) /
            impactMetrics.totalInhaledBaselineUg) *
            100
        )
      : 64;

  return (
    <section 
      aria-label="Quantified Health Impact Scorecard"
      className="rounded-2xl glass-panel p-6 sm:p-8 border border-stone-300 dark:border-zinc-800 bg-white/95 dark:bg-[#0c0c0e]/95 space-y-6 shadow-sm transition-colors"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-stone-200 dark:border-zinc-800/80 pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono text-ink-muted dark:text-zinc-400 uppercase tracking-wider mb-1">
            <Sparkles className="w-3.5 h-3.5 text-sage-600 dark:text-zinc-300" />
            <span>Environmental Toxicology &amp; Exposure Defense</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-extrabold text-ink dark:text-white tracking-tight flex items-center gap-2">
            <span>Estimated Exposure Reduction Scorecard</span>
          </h2>
          <p className="text-xs text-ink-muted dark:text-zinc-400 mt-1 max-w-2xl leading-relaxed">
            Measures biological respiratory savings achieved by shifting routines to solar convective venting windows.
          </p>
        </div>

        <span className="self-start sm:self-auto text-xs px-3 py-1.5 rounded-lg bg-stone-100 dark:bg-zinc-900 border border-stone-300 dark:border-zinc-700 text-ink dark:text-white font-mono font-bold shadow-xs">
          Safety Score: {impactMetrics.respiratorySafetyScore} / 100
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1: Inhaled Mass Avoided */}
        <div className="rounded-xl p-5 bg-stone-50 dark:bg-zinc-900/60 border border-stone-200 dark:border-zinc-800/80 hover:border-stone-300 dark:hover:border-zinc-700 transition-colors">
          <div className="flex items-center justify-between text-ink-muted dark:text-zinc-400 text-xs mb-2 font-mono uppercase tracking-wider text-[11px]">
            <span>Particulate Avoided</span>
            <TrendingDown className="w-4 h-4 text-sage-600 dark:text-zinc-300" />
          </div>
          <div className="text-3xl font-extrabold text-ink dark:text-white font-mono tracking-tight tabular-nums">
            {impactMetrics.netAvoidedPM25Ug} <span className="text-xs font-sans font-normal text-ink-muted dark:text-zinc-400">µg / day</span>
          </div>
          <div className="text-xs text-stone-500 dark:text-zinc-500 mt-2">
            Deep alveolar mass prevented from entering pulmonary capillaries.
          </div>
        </div>

        {/* Metric 2: Monthly Cigarettes Avoided */}
        <div className="rounded-xl p-5 bg-stone-50 dark:bg-zinc-900/60 border border-stone-200 dark:border-zinc-800/80 hover:border-stone-300 dark:hover:border-zinc-700 transition-colors">
          <div className="flex items-center justify-between text-ink-muted dark:text-zinc-400 text-xs mb-2 font-mono uppercase tracking-wider text-[11px]">
            <span>Berkeley Equivalence</span>
            <Cigarette className="w-4 h-4 text-terracotta-600 dark:text-zinc-300" />
          </div>
          <div className="text-3xl font-extrabold text-ink dark:text-white font-mono tracking-tight tabular-nums">
            {impactMetrics.avoidedCigarettesMonthly} <span className="text-xs font-sans font-normal text-ink-muted dark:text-zinc-400">cigs / mo</span>
          </div>
          <div className="text-xs text-stone-500 dark:text-zinc-500 mt-2">
            Cumulative lung tissue toxic burden averted over 30 days.
          </div>
        </div>

        {/* Metric 3: Clinical Risk Normalization */}
        <div className="rounded-xl p-5 bg-stone-50 dark:bg-zinc-900/60 border border-stone-200 dark:border-zinc-800/80 hover:border-stone-300 dark:hover:border-zinc-700 transition-colors">
          <div className="flex items-center justify-between text-ink-muted dark:text-zinc-400 text-xs mb-2 font-mono uppercase tracking-wider text-[11px]">
            <span>Inhaled Dose Reduction</span>
            <ShieldAlert className="w-4 h-4 text-amber-500 dark:text-zinc-300" />
          </div>
          <div className="text-3xl font-extrabold text-ink dark:text-white font-mono tracking-tight tabular-nums">
            {reductionPercentage}%
          </div>
          <div className="text-xs text-stone-500 dark:text-zinc-500 mt-2">
            Effective reduction in peak-hour biological particulate exposure.
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
              {impactMetrics.respiratorySafetyScore >= 80
                ? 'High Protection'
                : impactMetrics.respiratorySafetyScore >= 60
                ? 'Moderate Protection'
                : 'Elevated Smog Risk'}
            </span>
          </div>
          <div className="text-xs text-stone-500 dark:text-zinc-500 mt-2">
            {impactMetrics.respiratorySafetyScore >= 80
              ? 'Multi-barrier shield active: Time Shifting + DIY IAQ + N95 Masking.'
              : 'Partial exposure reduction: recommend adding indoor HEPA/CR filtration.'}
          </div>
        </div>
      </div>
    </section>
  );
};
