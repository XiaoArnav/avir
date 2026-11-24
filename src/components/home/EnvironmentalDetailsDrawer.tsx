'use client';

import React, { useEffect, useRef } from 'react';
import {
  X,
  Wind,
  Layers,
  Activity,
  ShieldAlert,
  ArrowRight,
  ExternalLink,
  Info,
  Clock,
  Compass,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import { AtmosphericMetrics } from '@/domain/types';
import { GeocodedLocation } from '@/services/telemetry-service';
import { AqiStandard } from '@/services/geo/geographic-observation-adapter';
import { TelemetryReadout } from '@/components/ui/futuristic';

export interface EnvironmentalDetailsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  city: GeocodedLocation;
  metrics: AtmosphericMetrics | null;
  standard: AqiStandard;
  onToggleStandard: () => void;
  onOpenDailyPlan?: () => void;
  onOpenMultiSource?: () => void;
  onOpenExplainer?: () => void;
  grapStage?: {
    stage: number | null;
    label: string;
    isJurisdiction: boolean;
  };
  isOfficialGround: boolean;
  isThermalInversion: boolean;
}

export function EnvironmentalDetailsDrawer({
  isOpen,
  onClose,
  city,
  metrics,
  standard,
  onToggleStandard,
  onOpenDailyPlan,
  onOpenMultiSource,
  onOpenExplainer,
  grapStage,
  isOfficialGround,
  isThermalInversion,
}: EnvironmentalDetailsDrawerProps) {
  const drawerRef = useRef<HTMLDivElement>(null);

  // Close on Escape key press
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const pm25 = metrics?.pm25 ?? null;
  const pm10 = metrics?.pm10 ?? null;
  const o3 = metrics?.o3 ?? null;
  const no2 = metrics?.no2 ?? null;
  const so2 = metrics?.so2 ?? null;
  const co = metrics?.co ?? null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Detailed Environmental Intelligence for ${city.name}`}
      className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm transition-opacity animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={drawerRef}
        className="relative w-full max-w-lg h-full overflow-y-auto bg-stone-900/95 dark:bg-[#040814]/95 border-l border-stone-200/20 dark:border-sky-500/25 p-5 sm:p-6 shadow-2xl flex flex-col justify-between text-ink-primary dark:text-white animate-in slide-in-from-right duration-250"
      >
        {/* Top Header */}
        <div>
          <div className="flex items-center justify-between pb-4 border-b border-stone-200/20 dark:border-sky-500/20">
            <div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-sky-400 animate-pulse" />
                <span className="text-[11px] font-bold tracking-wider uppercase text-sky-400 telemetry-mono">
                  ENVIRONMENTAL INSPECTOR
                </span>
              </div>
              <h2 className="text-xl font-black text-white tracking-tight mt-0.5">
                {city.name}
                {city.admin1 && <span className="text-sm font-normal text-slate-400">, {city.admin1}</span>}
              </h2>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              aria-label="Close environmental details drawer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Standard Toggle & Provenance Banner */}
          <div className="flex flex-wrap items-center justify-between gap-2 py-3 border-b border-stone-200/10 dark:border-sky-500/10 text-xs">
            <div className="flex items-center gap-1.5 text-slate-300 telemetry-mono">
              <span className="text-slate-400">Regulatory Standard:</span>
              <button
                type="button"
                onClick={onToggleStandard}
                className="px-2.5 py-1 rounded-md text-[11px] font-bold border border-sky-500/30 bg-sky-950/40 text-sky-200 hover:border-sky-400 transition-all cursor-pointer"
              >
                {standard === 'cpcb' ? 'CPCB NAQI (India)' : 'US EPA (40 CFR)'}
              </button>
            </div>

            <div className="text-[11px] text-slate-400 telemetry-mono">
              {isOfficialGround ? (
                <span className="text-emerald-400 font-semibold flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Physical CAAQMS Ground Station</span>
                </span>
              ) : (
                <span className="text-sky-300 font-semibold flex items-center gap-1">
                  <Activity className="w-3.5 h-3.5" />
                  <span>CAMS Atmospheric Numerical Model</span>
                </span>
              )}
            </div>
          </div>

          {/* 1. Complete Criteria Chemical Pollutants Matrix */}
          <section aria-label="Criteria Atmospheric Pollutants" className="my-5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 telemetry-mono mb-3">
              Criteria Atmospheric Pollutants
            </h3>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              <TelemetryReadout
                label="PM2.5 (FINE)"
                value={pm25}
                unit="µg/m³"
                provenance={isOfficialGround ? 'official' : 'modeled'}
              />
              <TelemetryReadout
                label="PM10 (COARSE)"
                value={pm10}
                unit="µg/m³"
                provenance={isOfficialGround ? 'official' : 'modeled'}
              />
              <TelemetryReadout
                label="O3 (OZONE)"
                value={o3}
                unit="µg/m³"
                provenance="modeled"
              />
              <TelemetryReadout
                label="NO2 (DIOXIDE)"
                value={no2}
                unit="µg/m³"
                provenance="modeled"
              />
              <TelemetryReadout
                label="SO2 (DIOXIDE)"
                value={so2}
                unit="µg/m³"
                provenance="modeled"
              />
              <TelemetryReadout
                label="CO (MONOXIDE)"
                value={co}
                unit="µg/m³"
                provenance="modeled"
              />
            </div>
          </section>

          {/* 2. Atmospheric Dispersion & Boundary Layer */}
          <section aria-label="Atmospheric Physics & Dispersion" className="my-5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 telemetry-mono mb-3">
              Atmospheric Boundary Layer & Dispersion
            </h3>

            <div className="grid grid-cols-2 gap-2.5 mb-2.5">
              <div className="p-3 rounded-xl bg-white/5 border border-white/10 text-xs">
                <span className="text-[10px] text-slate-400 uppercase telemetry-mono block">
                  Mixing Depth (PBL)
                </span>
                <span className="text-lg font-black text-white telemetry-mono">
                  {metrics?.boundaryLayerHeight !== null && metrics?.boundaryLayerHeight !== undefined
                    ? `${Math.round(metrics.boundaryLayerHeight)}m`
                    : 'Modeled'}
                </span>
                <span className="text-[10px] text-slate-400 block mt-0.5">
                  Atmospheric smoke ceiling
                </span>
              </div>

              <div className="p-3 rounded-xl bg-white/5 border border-white/10 text-xs">
                <span className="text-[10px] text-slate-400 uppercase telemetry-mono block">
                  Thermal Inversion
                </span>
                <span
                  className={`text-lg font-black telemetry-mono ${
                    isThermalInversion ? 'text-rose-400' : 'text-emerald-400'
                  }`}
                >
                  {isThermalInversion ? 'ACTIVE TRAP' : 'NORMAL'}
                </span>
                <span className="text-[10px] text-slate-400 block mt-0.5">
                  {isThermalInversion ? 'Stable nocturnal trap' : 'Open vertical venting'}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div className="p-3 rounded-xl bg-white/5 border border-white/10 text-xs">
                <span className="text-[10px] text-slate-400 uppercase telemetry-mono block">
                  Surface Wind
                </span>
                <span className="text-base font-bold text-white telemetry-mono">
                  {metrics?.windSpeed ?? '--'} km/h
                </span>
                <span className="text-[10px] text-slate-400 block mt-0.5">
                  Direction: {metrics?.windDirection ?? '--'}°
                </span>
              </div>

              <div className="p-3 rounded-xl bg-white/5 border border-white/10 text-xs">
                <span className="text-[10px] text-slate-400 uppercase telemetry-mono block">
                  Ambient Weather
                </span>
                <span className="text-base font-bold text-white telemetry-mono">
                  {metrics?.temperature ?? '--'}°C • {metrics?.humidity ?? '--'}% RH
                </span>
                <span className="text-[10px] text-slate-400 block mt-0.5">
                  Relative humidity & temp
                </span>
              </div>
            </div>
          </section>

          {/* 3. Statutory Regulatory Frameworks & CAQM GRAP (NCR Only) */}
          <section aria-label="Statutory Regulatory Status" className="my-5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 telemetry-mono mb-3">
              Statutory Regulatory Compliance
            </h3>

            <div className="p-3.5 rounded-xl bg-white/5 border border-white/10 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Statutory CAQM GRAP:</span>
                <span className="font-bold text-sky-300 telemetry-mono">
                  {grapStage?.isJurisdiction ? grapStage.label : 'Non-NCR Region'}
                </span>
              </div>

              <p className="text-[11px] text-slate-400 leading-relaxed">
                {grapStage?.isJurisdiction
                  ? `Active under the Commission for Air Quality Management (CAQM) statutory mandate for NCR territories.`
                  : `The Graded Response Action Plan (GRAP) is a statutory emergency framework enforced by the CAQM exclusively within Delhi-NCR (CAQM Act 2021). It is not legally applicable in ${city.name}.`}
              </p>
            </div>
          </section>

          {/* 4. WHO 24-Hour Benchmark vs Instantaneous Reading (Part 1.4) */}
          <section aria-label="WHO Health Guidelines Analysis" className="my-5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 telemetry-mono mb-3">
              WHO Benchmark Guidelines Analysis
            </h3>

            <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs space-y-2">
              <div className="flex items-start gap-2">
                <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-bold text-white">Scientific Averaging Condition</h4>
                  <p className="text-[11px] text-slate-300 mt-1 leading-relaxed">
                    The WHO Air Quality Guideline specifies a <strong>24-hour average of 15 µg/m³</strong> for PM2.5.
                    Current instantaneous or single-hour model snapshots (e.g. {pm25 ?? '--'} µg/m³) do not satisfy
                    regulatory 24-hour averaging conditions.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* 5. Actionable Exposure Guidance */}
          <section aria-label="Personalized Exposure Guidance" className="my-5">
            <div className="p-3.5 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-start gap-3 text-xs">
              <ShieldAlert className="w-5 h-5 text-sky-400 shrink-0 mt-0.5" />
              <div className="flex-1">
                <h4 className="font-bold text-white telemetry-mono">Actionable Exposure Guidance</h4>
                <p className="text-[11px] text-slate-300 mt-1 leading-relaxed">
                  {isThermalInversion
                    ? 'Nocturnal thermal inversion is currently trapping particulate smog near the ground. Minimize outdoor aerobic activity until boundary layer dispersion opens.'
                    : 'The atmospheric boundary layer is open with favorable mixing depth. Review hourly exposure windows in your Daily Plan.'}
                </p>

                {onOpenDailyPlan && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenDailyPlan();
                    }}
                    className="inline-flex items-center gap-1.5 mt-2.5 text-xs font-bold text-sky-400 hover:text-sky-300 telemetry-mono cursor-pointer"
                  >
                    <span>Open Daily Plan Workspace</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          </section>
        </div>

        {/* Footer Actions */}
        <div className="pt-4 border-t border-white/10 flex items-center justify-between text-xs telemetry-mono">
          {onOpenMultiSource && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenMultiSource();
              }}
              className="inline-flex items-center gap-1.5 text-slate-400 hover:text-white transition-colors cursor-pointer"
            >
              <Compass className="w-3.5 h-3.5 text-sky-400" />
              <span>Source Inspector</span>
            </button>
          )}

          {onOpenExplainer && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenExplainer();
              }}
              className="inline-flex items-center gap-1.5 text-slate-400 hover:text-white transition-colors cursor-pointer"
            >
              <ExternalLink className="w-3.5 h-3.5 text-sky-400" />
              <span>Scientific Methodology</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
