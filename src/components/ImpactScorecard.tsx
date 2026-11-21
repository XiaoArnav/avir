'use client';

import React from 'react';
import { RecommendationPlan } from '@/domain/types';
import { HeartPulse, Cigarette, Leaf, Award, Shield } from 'lucide-react';

interface ImpactScorecardProps {
  plan: RecommendationPlan;
}

export const ImpactScorecard: React.FC<ImpactScorecardProps> = ({ plan }) => {
  const { impactMetrics } = plan;

  return (
    <section className="rounded-2xl bg-[#101623] border border-gray-800 p-6 shadow-lg space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-gray-800 pb-4">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <HeartPulse className="w-5 h-5 text-rose-400" />
            <span>Quantified Respiratory & Environmental Impact Scorecard</span>
          </h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Transparent mathematical calculations translating routine shifts into tangible health protection
          </p>
        </div>

        <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-mono font-semibold bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/20">
          <Award className="w-4 h-4" />
          <span>Safety Score: {impactMetrics.respiratorySafetyScore}/100</span>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1: Cigarettes Avoided */}
        <div className="rounded-xl bg-gray-900/80 border border-gray-800 p-4">
          <div className="flex items-center justify-between text-gray-400 text-xs mb-1.5">
            <span>Cigarettes Avoided</span>
            <Cigarette className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-3xl font-extrabold text-white font-mono">
            {impactMetrics.avoidedCigarettesMonthly}
          </div>
          <p className="text-[11px] text-gray-400 mt-1">
            Monthly Berkeley Earth particulate equivalence avoided
          </p>
        </div>

        {/* Metric 2: Net PM2.5 Avoided */}
        <div className="rounded-xl bg-gray-900/80 border border-gray-800 p-4">
          <div className="flex items-center justify-between text-gray-400 text-xs mb-1.5">
            <span>PM2.5 Blocked</span>
            <Shield className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-3xl font-extrabold text-cyan-300 font-mono">
            {impactMetrics.netAvoidedPM25Ug} <span className="text-xs font-sans text-gray-400">µg/day</span>
          </div>
          <p className="text-[11px] text-gray-400 mt-1">
            Cumulative alveolar particulate reduction
          </p>
        </div>

        {/* Metric 3: Carbon Abated */}
        <div className="rounded-xl bg-gray-900/80 border border-gray-800 p-4">
          <div className="flex items-center justify-between text-gray-400 text-xs mb-1.5">
            <span>Carbon Abated</span>
            <Leaf className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-3xl font-extrabold text-emerald-400 font-mono">
            {impactMetrics.carbonSavedKgWeekly} <span className="text-xs font-sans text-gray-400">kg/wk</span>
          </div>
          <p className="text-[11px] text-gray-400 mt-1">
            CO₂e saved through active modal shifts
          </p>
        </div>

        {/* Metric 4: Respiratory Safety Rating */}
        <div className="rounded-xl bg-gray-900/80 border border-gray-800 p-4">
          <div className="flex items-center justify-between text-gray-400 text-xs mb-1.5">
            <span>Household Defense</span>
            <HeartPulse className="w-4 h-4 text-rose-400" />
          </div>
          <div className="text-3xl font-extrabold text-rose-300 font-mono">
            {impactMetrics.respiratorySafetyScore}%
          </div>
          <p className="text-[11px] text-gray-400 mt-1">
            Clinical pulmonary mitigation rating
          </p>
        </div>
      </div>

      {/* Advisory Text */}
      <div className="rounded-xl bg-gray-950/70 border border-gray-800/80 p-4 text-xs text-gray-300 leading-relaxed">
        <strong className="text-white">GenAI Strategic Summary: </strong>
        {plan.summaryAdvisory}
      </div>
    </section>
  );
};
