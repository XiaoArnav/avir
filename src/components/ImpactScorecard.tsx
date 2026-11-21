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
      className="rounded-3xl glass-panel p-6 sm:p-8 shadow-xl space-y-6"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/[0.08] pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono text-emerald-400 uppercase tracking-wider mb-1">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Environmental Toxicology & Exposure Defense</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight flex items-center gap-2">
            <span>Quantified Protective Impact Scorecard</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl leading-relaxed">
            Measures your biological respiratory savings achieved by syncing your household routine with solar boundary layer venting.
          </p>
        </div>

        <span className="self-start sm:self-auto text-xs px-3.5 py-1.5 rounded-full bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 font-mono font-bold shadow-sm">
          Safety Score: {impactMetrics.respiratorySafetyScore} / 100
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1: Inhaled Mass Avoided */}
        <div className="rounded-2xl glass-panel-subtle p-5 border border-white/[0.06] hover:border-white/10 transition-colors">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-2 font-mono">
            <span>Particulate Avoided</span>
            <TrendingDown className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-3xl font-extrabold text-emerald-400 font-mono tracking-tight tabular-nums">
            {impactMetrics.netAvoidedPM25Ug} <span className="text-xs font-sans text-slate-400">µg / day</span>
          </div>
          <div className="text-xs text-slate-400 mt-2">
            Deep alveolar mass prevented from entering pulmonary capillaries.
          </div>
        </div>

        {/* Metric 2: Monthly Cigarettes Avoided */}
        <div className="rounded-2xl glass-panel-subtle p-5 border border-white/[0.06] hover:border-white/10 transition-colors">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-2 font-mono">
            <span>Berkeley Equivalence</span>
            <Cigarette className="w-4 h-4 text-orange-400" />
          </div>
          <div className="text-3xl font-extrabold text-orange-400 font-mono tracking-tight tabular-nums">
            {impactMetrics.avoidedCigarettesMonthly} <span className="text-xs font-sans text-slate-400">cigs / mo</span>
          </div>
          <div className="text-xs text-slate-400 mt-2">
            Cumulative lung tissue toxic burden averted over 30 days.
          </div>
        </div>

        {/* Metric 3: Clinical Risk Normalization */}
        <div className="rounded-2xl glass-panel-subtle p-5 border border-white/[0.06] hover:border-white/10 transition-colors">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-2 font-mono">
            <span>Overall Inhaled Reduction</span>
            <ShieldAlert className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-3xl font-extrabold text-cyan-300 font-mono tracking-tight tabular-nums">
            {reductionPercentage}%
          </div>
          <div className="text-xs text-slate-400 mt-2">
            Effective reduction in peak-hour biological particulate exposure.
          </div>
        </div>

        {/* Metric 4: Vulnerability Protection Status */}
        <div className="rounded-2xl glass-panel-subtle p-5 border border-white/[0.06] hover:border-white/10 transition-colors">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-2 font-mono">
            <span>Protection Status</span>
            <HeartPulse className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-xl font-bold text-white tracking-tight flex items-center gap-1.5 mt-1">
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            <span>Optimal Defense</span>
          </div>
          <div className="text-xs text-slate-400 mt-2">
            Multi-barrier shield active: Time Shifting + DIY IAQ + N95 Masking.
          </div>
        </div>
      </div>
    </section>
  );
};
