'use client';

import React from 'react';
import { EnsembleConsensusAnalysis } from '@/domain/types';
import { Layers, X, ShieldCheck, AlertCircle, BarChart3, Database, CheckCircle2 } from 'lucide-react';

interface MultiSourceInspectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  cityName: string;
  ensemble?: EnsembleConsensusAnalysis;
}

export const MultiSourceInspectorModal: React.FC<MultiSourceInspectorModalProps> = ({
  isOpen,
  onClose,
  cityName,
  ensemble,
}) => {
  if (!isOpen || !ensemble) return null;

  const {
    consensusAqi,
    consensusPm25,
    aqiMin,
    aqiMax,
    pm25Min,
    pm25Max,
    confidenceScorePercent,
    agreementLevel,
    deviationSpread,
    feeds,
    summaryNote,
  } = ensemble;

  const getAqiColor = (aqi: number) => {
    if (aqi <= 50) return 'text-emerald-500 bg-emerald-500/10 border-emerald-500/30';
    if (aqi <= 100) return 'text-yellow-500 bg-yellow-500/10 border-yellow-500/30';
    if (aqi <= 150) return 'text-orange-500 bg-orange-500/10 border-orange-500/30';
    if (aqi <= 200) return 'text-rose-500 bg-rose-500/10 border-rose-500/30';
    if (aqi <= 300) return 'text-purple-500 bg-purple-500/10 border-purple-500/30';
    return 'text-red-500 bg-red-500/10 border-red-500/30';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white dark:bg-zinc-900 border border-stone-200 dark:border-zinc-800 rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-stone-200 dark:border-zinc-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-ink dark:text-white">
                Compare 5 Open Data Sources
              </h3>
              <p className="text-xs text-ink-muted dark:text-zinc-400">
                Air quality readings from 5 independent global and local feeds for {cityName}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-ink-muted hover:text-ink dark:text-zinc-400 dark:hover:text-white transition-colors"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Consensus Banner & Range Meter */}
        <div className="p-4 rounded-xl bg-stone-50 dark:bg-zinc-800/60 border border-stone-200 dark:border-zinc-800 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <div className="text-[10px] font-mono uppercase font-bold text-ink-muted dark:text-zinc-400">
                5-Source Average
              </div>
              <div className="flex items-baseline gap-2 mt-0.5">
                <span className="text-3xl font-mono font-black text-ink dark:text-white">
                  {consensusAqi}
                </span>
                <span className="text-sm font-mono font-semibold text-ink-muted dark:text-zinc-400">
                  US AQI
                </span>
                <span className="text-xs font-mono text-ink-muted dark:text-zinc-400">
                  (~{consensusPm25} µg/m³ PM2.5)
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5" />
                {confidenceScorePercent}% Agreement
              </span>
              <span className="text-xs font-mono font-bold px-2 py-1 rounded-full bg-stone-200 dark:bg-zinc-700 text-ink dark:text-white">
                {agreementLevel}
              </span>
            </div>
          </div>

          {/* Uncertainty Range Bar */}
          <div className="pt-2 space-y-1.5">
            <div className="flex justify-between text-xs font-mono text-ink-muted dark:text-zinc-400">
              <span>Observed AQI Range:</span>
              <span className="font-bold text-ink dark:text-white">
                {aqiMin} – {aqiMax} AQI (±{deviationSpread} spread)
              </span>
            </div>
            <div className="w-full h-3 rounded-full bg-stone-200 dark:bg-zinc-700 overflow-hidden relative">
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-500 via-amber-500 to-rose-500 transition-all duration-500"
                style={{ width: '100%' }}
              />
            </div>
            <div className="flex justify-between text-[10px] font-mono text-ink-muted dark:text-zinc-400">
              <span>Lowest: {aqiMin} AQI ({pm25Min} µg/m³)</span>
              <span>Average: {consensusAqi} AQI</span>
              <span>Highest: {aqiMax} AQI ({pm25Max} µg/m³)</span>
            </div>
          </div>

          <p className="text-xs text-ink-muted dark:text-zinc-300 pt-1 leading-relaxed">
            {summaryNote}
          </p>
        </div>

        {/* 5 Open-Source Feeds Breakdown */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-mono font-bold uppercase text-ink-muted dark:text-zinc-400 flex items-center gap-1.5">
              <Database className="w-3.5 h-3.5 text-sage-600 dark:text-emerald-400" />
              <span>Data Sources ({feeds.length})</span>
            </h4>
          </div>

          <div className="space-y-2">
            {feeds.map((feed) => {
              const delta = feed.aqi - consensusAqi;
              const deltaStr = delta > 0 ? `+${delta}` : `${delta}`;

              return (
                <div
                  key={feed.id}
                  className="p-3.5 rounded-xl bg-stone-50 dark:bg-zinc-800/40 border border-stone-200 dark:border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors hover:border-stone-300 dark:hover:border-zinc-700"
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-ink dark:text-white">
                        {feed.sourceName}
                      </span>
                      <span className="text-[10px] font-mono px-2 py-0.2 rounded bg-stone-200 dark:bg-zinc-700 text-ink dark:text-zinc-300">
                        {feed.standard}
                      </span>
                      <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-500 font-bold">
                        {feed.confidence}
                      </span>
                    </div>
                    <p className="text-[11px] text-ink-muted dark:text-zinc-400">
                      {feed.provider} &bull; {feed.description}
                    </p>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right">
                      <div className="text-xs font-mono text-ink-muted dark:text-zinc-400">
                        {feed.pm25} µg/m³
                      </div>
                      <div className="text-[10px] font-mono text-ink-muted dark:text-zinc-400">
                        {delta === 0 ? 'Exact Match' : `${deltaStr} from average`}
                      </div>
                    </div>

                    <div
                      className={`px-3 py-1.5 rounded-lg border font-mono font-bold text-xs ${getAqiColor(
                        feed.aqi
                      )}`}
                    >
                      {feed.aqi} AQI
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Scientific Methodology Note */}
        <div className="p-3.5 rounded-xl bg-emerald-500/5 dark:bg-emerald-950/20 border border-emerald-500/20 text-xs text-ink-muted dark:text-zinc-300 space-y-1">
          <div className="font-bold text-ink dark:text-white flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            <span>Why Multi-Source Consensus Averaging?</span>
          </div>
          <p className="leading-relaxed">
            Single ground sensors often suffer from localized dust spikes or sensor maintenance lag, while satellite column reanalysis can underestimate ground-level smog trapped during thermal inversions. Avir cross-validates reanalysis physics with surface sensor data to present a mathematically grounded, noise-filtered exposure truth.
          </p>
        </div>
      </div>
    </div>
  );
};
