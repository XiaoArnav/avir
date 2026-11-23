'use client';

import React from 'react';
import {
  EnsembleConsensusAnalysis,
  EnvironmentalSourceRecord,
  SourceComparison,
  AtmosphericMetrics,
} from '@/domain/types';
import {
  getActivePhysicalSources,
  getStalePhysicalSources,
  getRegistryOnlyStations,
  getAtmosphericModels,
  getUnconfiguredProviders,
  evaluateMeasurementEligibility,
  MeasurementEligibility,
} from '@/config/environmental-sources';
import { hardwareDeviceService } from '@/services/device-telemetry-service';
import {
  Layers,
  X,
  ShieldCheck,
  AlertCircle,
  Radio,
  CheckCircle2,
  Clock,
  Info,
  Scale,
  Cpu,
} from 'lucide-react';

interface MultiSourceInspectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  cityName: string;
  ensemble?: EnsembleConsensusAnalysis;
  environmentalSources?: EnvironmentalSourceRecord[];
  sourceComparison?: SourceComparison | null;
  metrics?: AtmosphericMetrics | null;
  personalHardwareSource?: EnvironmentalSourceRecord | null;
}

export const MultiSourceInspectorModal: React.FC<MultiSourceInspectorModalProps> = ({
  isOpen,
  onClose,
  cityName,
  environmentalSources = [],
  sourceComparison,
  metrics,
  personalHardwareSource: propPersonalSource,
}) => {
  if (!isOpen) return null;

  // Retrieve client-side connected personal hardware monitor if active
  const personalHardwareSource =
    propPersonalSource !== undefined
      ? propPersonalSource
      : (typeof window !== 'undefined' ? hardwareDeviceService.getAsEnvironmentalSource() : null);

  // Zero-fabrication: Never invent fake fresh atmospheric records, synthetic 150 values, or artificial timestamps.
  const effectiveSources: EnvironmentalSourceRecord[] = environmentalSources || [];

  // Pure selectors for honest source category separation
  const activePhysicalSources = getActivePhysicalSources(effectiveSources, 'pm25');
  const stalePhysicalSources = getStalePhysicalSources(effectiveSources, 'pm25');
  const registryStations = getRegistryOnlyStations(effectiveSources);
  const atmosphericModels = getAtmosphericModels(effectiveSources);
  const unconfiguredProviders = getUnconfiguredProviders(effectiveSources);

  const primaryModel = atmosphericModels[0] || effectiveSources.find((s) => s.sourceKind === 'atmospheric_model');
  const modelPm25 =
    primaryModel?.measurements?.find((m) => m.pollutant === 'pm25')?.value ??
    (metrics?.pm25 !== null && metrics?.pm25 !== undefined ? metrics.pm25 : null);

  // Strictly use validated sourceComparison. Never infer Mode C from legacy feed counts.
  const comparisonMode = sourceComparison?.mode || 'mode_a_single_source';

  const getSourceKindBadge = (kind: string) => {
    switch (kind) {
      case 'atmospheric_model':
        return { label: 'Atmospheric Model', color: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20' };
      case 'official_ground_station':
        return { label: 'Regulatory Reference Monitor', color: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20' };
      case 'physical_observation':
        return { label: 'Physical Ground Monitor', color: 'bg-stone-500/10 text-stone-600 dark:text-stone-400 border-stone-500/20' };
      case 'community_optical':
        return { label: 'Citizen Science Optical', color: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20' };
      case 'user_hardware':
        return { label: 'Local Hardware Monitor', color: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20' };
      default:
        return { label: 'Environmental Feed', color: 'bg-stone-500/10 text-stone-600 dark:text-stone-400 border-stone-500/20' };
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'fresh':
      case 'active':
        return { label: 'Active & Fresh', color: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10' };
      case 'stale':
        return { label: 'Stale (>24h)', color: 'text-amber-600 dark:text-amber-400 bg-amber-500/10' };
      case 'registry_only':
        return { label: 'Registry Verified', color: 'text-stone-500 dark:text-zinc-400 bg-stone-200 dark:bg-zinc-800' };
      case 'not_configured':
        return { label: 'API Key Unconfigured', color: 'text-stone-400 dark:text-zinc-500 bg-stone-100 dark:bg-zinc-800' };
      case 'unreachable':
      case 'unavailable':
      default:
        return { label: 'Readings Unavailable', color: 'text-stone-400 dark:text-zinc-500 bg-stone-100 dark:bg-zinc-800' };
    }
  };

  const getPhysicalStatusBadge = (sourceStatus: string, eligibility?: MeasurementEligibility) => {
    if (sourceStatus === 'not_configured') {
      return { label: 'API Key Unconfigured', color: 'text-stone-400 dark:text-zinc-500 bg-stone-100 dark:bg-zinc-800' };
    }
    if (sourceStatus === 'registry_only') {
      return { label: 'Registry Verified', color: 'text-stone-500 dark:text-zinc-400 bg-stone-200 dark:bg-zinc-800' };
    }
    if (sourceStatus === 'unavailable' || sourceStatus === 'unreachable' || sourceStatus === 'rejected' || sourceStatus === 'error') {
      return { label: 'Readings Unavailable', color: 'text-stone-400 dark:text-zinc-500 bg-stone-100 dark:bg-zinc-800' };
    }

    if (eligibility) {
      if (eligibility.eligible) {
        return { label: 'Active & Fresh', color: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10' };
      }
      if (eligibility.reason === 'stale') {
        return { label: 'Stale (>24h)', color: 'text-amber-600 dark:text-amber-400 bg-amber-500/10' };
      }
      if (eligibility.reason === 'missing_timestamp') {
        return { label: 'Timestamp Unavailable', color: 'text-stone-400 dark:text-zinc-500 bg-stone-100 dark:bg-zinc-800' };
      }
      if (eligibility.reason === 'future_timestamp') {
        return { label: 'Suspicious Timing', color: 'text-rose-600 dark:text-rose-400 bg-rose-500/10' };
      }
      if (eligibility.reason === 'invalid_value') {
        return { label: 'Invalid Reading', color: 'text-rose-600 dark:text-rose-400 bg-rose-500/10' };
      }
      if (eligibility.reason === 'missing_measurement') {
        return { label: 'PM2.5 Unavailable', color: 'text-stone-400 dark:text-zinc-500 bg-stone-100 dark:bg-zinc-800' };
      }
    }

    return getStatusBadge(sourceStatus);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-sources-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div className="bg-white dark:bg-zinc-900 border border-stone-200 dark:border-zinc-800 rounded-2xl max-w-3xl w-full p-6 shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-stone-200 dark:border-zinc-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h3 id="modal-sources-title" className="text-lg font-bold text-ink dark:text-white">
                Data Sources, Provenance &amp; Quality
              </h3>
              <p className="text-xs text-ink-muted dark:text-zinc-400">
                Independent atmospheric models, ground observation networks, and regulatory standards for {cityName}
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

        {/* SECTION A: DATA OVERVIEW */}
        <div className="p-4 rounded-xl bg-stone-50 dark:bg-zinc-800/60 border border-stone-200 dark:border-zinc-800 space-y-3">
          <div className="text-[10px] font-mono uppercase font-bold text-ink-muted dark:text-zinc-400 flex items-center justify-between">
            <span>Section A &bull; Telemetry Overview</span>
            <span className="font-semibold text-stone-500 dark:text-zinc-400">
              {metrics?.timestamp
                ? `Model Valid Time: ${new Date(metrics.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                : 'Measurement time unavailable'}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
            <div className="p-3 rounded-lg bg-white dark:bg-zinc-900 border border-stone-200 dark:border-zinc-800">
              <div className="text-[10px] font-mono text-ink-muted dark:text-zinc-400">Primary Atmospheric Model</div>
              <div className="text-sm font-bold text-ink dark:text-white mt-0.5 truncate">
                Open-Meteo Atmospheric Chemistry
              </div>
              <div className="text-xs font-mono text-emerald-600 dark:text-emerald-400 mt-0.5">
                {modelPm25 !== null ? `${modelPm25} µg/m³ PM2.5` : 'PM2.5 concentration unavailable.'}
              </div>
            </div>

            <div className="p-3 rounded-lg bg-white dark:bg-zinc-900 border border-stone-200 dark:border-zinc-800">
              <div className="text-[10px] font-mono text-ink-muted dark:text-zinc-400">Active Ground Monitors</div>
              <div className="text-sm font-bold text-ink dark:text-white mt-0.5">
                {activePhysicalSources.length === 1
                  ? '1 reporting station'
                  : `${activePhysicalSources.length} reporting stations`}
              </div>
              <div className="text-xs font-mono text-ink-muted dark:text-zinc-400 mt-0.5">
                {activePhysicalSources.length === 0
                  ? '0 currently available ground observations'
                  : registryStations.length > 0
                  ? `${registryStations.length} registry station${registryStations.length > 1 ? 's' : ''} verified`
                  : stalePhysicalSources.length > 0
                  ? `${stalePhysicalSources.length} station${stalePhysicalSources.length > 1 ? 's' : ''} stale (>24h)`
                  : unconfiguredProviders.length > 0
                  ? 'OpenAQ API key not configured'
                  : activePhysicalSources.length > 0
                  ? 'Surface breathing height'
                  : 'Awaiting live feeds'}
              </div>
            </div>

            <div className="p-3 rounded-lg bg-white dark:bg-zinc-900 border border-stone-200 dark:border-zinc-800">
              <div className="text-[10px] font-mono text-ink-muted dark:text-zinc-400">Inter-Source Comparison</div>
              <div className="text-sm font-bold text-ink dark:text-white mt-0.5 truncate">
                {comparisonMode === 'mode_c_comparable'
                  ? 'Comparable (Mode C)'
                  : comparisonMode === 'mode_b_incompatible'
                  ? 'Incompatible (Mode B)'
                  : 'Single Primary Provider'}
              </div>
              <div className="text-xs font-mono text-ink-muted dark:text-zinc-400 mt-0.5">
                {sourceComparison?.absoluteDifferenceUgM3 !== null && sourceComparison?.absoluteDifferenceUgM3 !== undefined
                  ? `Δ ${sourceComparison.absoluteDifferenceUgM3} µg/m³ difference`
                  : 'Zero fabricated consensus'}
              </div>
            </div>
          </div>
        </div>

        {/* SECTION B: ENVIRONMENTAL SOURCE CARDS */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-mono font-bold uppercase text-ink-muted dark:text-zinc-400 flex items-center gap-1.5">
              <Radio className="w-3.5 h-3.5 text-sage-600 dark:text-emerald-400" />
              <span>Section B &bull; Independent Environmental Sources ({effectiveSources.length})</span>
            </h4>
          </div>

          {/* Official Government Ground Monitoring Subsection */}
          {(() => {
            const officialSources = effectiveSources.filter((s) => s.sourceKind === 'official_ground_station');
            return (
              <div className="p-3.5 rounded-xl bg-stone-100/80 dark:bg-zinc-800/60 border border-stone-200 dark:border-zinc-800 space-y-2.5">
                <div className="text-[10px] font-mono uppercase font-bold text-ink-muted dark:text-zinc-400 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-amber-500" />
                    <span>Official Government Ground Monitoring (CPCB / CAAQMS / State PCBs)</span>
                  </span>
                  <span className="font-semibold text-stone-500 dark:text-zinc-400">
                    {officialSources.length > 0
                      ? `${officialSources.length} Reference Station${officialSources.length > 1 ? 's' : ''}`
                      : 'No Station in Range'}
                  </span>
                </div>

                {officialSources.length > 0 ? (
                  <div className="space-y-2">
                    {officialSources.map((st) => {
                      const stPm25 = st.measurements?.find((m) => m.pollutant === 'pm25');
                      const stPm10 = st.measurements?.find((m) => m.pollutant === 'pm10');
                      const isReporting = stPm25 && stPm25.value !== null;
                      return (
                        <div
                          key={`cpcb-summary-${st.id}`}
                          className="p-3 rounded-lg bg-white dark:bg-zinc-900 border border-stone-200 dark:border-zinc-800 text-xs space-y-1.5"
                        >
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                            <div>
                              <span className="font-bold text-ink dark:text-white">{st.sourceName || st.name}</span>
                              <div className="text-[11px] text-ink-muted dark:text-zinc-400">
                                Agency: <strong>{st.provenance?.network || st.providerName || 'CPCB / State PCB'}</strong>
                                {st.distanceKm !== null && st.distanceKm !== undefined && (
                                  <span> &bull; Distance: <strong>{st.distanceKm} km</strong></span>
                                )}
                              </div>
                            </div>
                            <div className="text-right">
                              {isReporting ? (
                                <div className="font-mono font-bold text-ink dark:text-white">
                                  {stPm25.value} µg/m³ PM2.5
                                  {stPm10 && stPm10.value !== null && (
                                    <span className="text-ink-muted dark:text-zinc-400 ml-2">| {stPm10.value} µg/m³ PM10</span>
                                  )}
                                </div>
                              ) : (
                                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-stone-100 dark:bg-zinc-800 text-stone-500 dark:text-zinc-400">
                                  Registry Verified &bull; Awaiting Continuous Stream
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="p-3 rounded-lg bg-white dark:bg-zinc-900 border border-stone-200 dark:border-zinc-800 text-xs text-ink-muted dark:text-zinc-400 flex items-center gap-2">
                    <Info className="w-4 h-4 text-stone-400 shrink-0" />
                    <span>
                      No official CPCB / CAAQMS reference monitors located within 35 km of {cityName}.
                    </span>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Personal Hardware Monitoring Subsection (BYOD / USB / Wi-Fi) */}
          <div className="p-3.5 rounded-xl bg-cyan-50/50 dark:bg-cyan-950/20 border border-cyan-200 dark:border-cyan-800/60 space-y-2.5">
            <div className="text-[10px] font-mono uppercase font-bold text-cyan-800 dark:text-cyan-300 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Cpu className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
                <span>Personal Hardware Monitor (BYOD USB / Local Wi-Fi)</span>
              </span>
              <span className="font-semibold text-cyan-700 dark:text-cyan-400">
                {personalHardwareSource ? '1 Connected Device' : '0 Connected Devices'}
              </span>
            </div>

            {personalHardwareSource ? (
              <div className="p-3 rounded-lg bg-white dark:bg-zinc-900 border border-cyan-200 dark:border-cyan-800/80 text-xs space-y-1.5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                  <div>
                    <span className="font-bold text-ink dark:text-white">
                      {personalHardwareSource.sourceName}
                    </span>
                    <div className="text-[11px] text-ink-muted dark:text-zinc-400">
                      Provider: <strong>{personalHardwareSource.providerName}</strong> &bull; Location: <strong>Unconfigured (Indoor / BYOD)</strong>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono font-bold text-cyan-800 dark:text-cyan-300">
                      {personalHardwareSource.measurements.find(m => m.pollutant === 'pm25')?.value ?? '--'} µg/m³ PM2.5
                      {personalHardwareSource.measurements.find(m => m.pollutant === 'pm10') && (
                        <span className="text-ink-muted dark:text-zinc-400 ml-2">
                          | {personalHardwareSource.measurements.find(m => m.pollutant === 'pm10')?.value} µg/m³ PM10
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] font-mono text-cyan-700 dark:text-cyan-400">
                      {personalHardwareSource.status === 'stale' ? 'Stale Reading (>30s)' : 'Live Hardware Stream'}
                    </span>
                  </div>
                </div>
                <div className="text-[10.5px] text-ink-muted dark:text-zinc-400 pt-1 border-t border-stone-200/50 dark:border-zinc-800/50 flex flex-wrap justify-between gap-1">
                  <span>Client-Side Private Telemetry &bull; Isolated from Outdoor Regional Model</span>
                  {personalHardwareSource.measurements.find(m => m.pollutant === 'pm25')?.calibrationApplied && (
                    <span className="text-emerald-600 dark:text-emerald-400 font-mono">
                      ✓ {personalHardwareSource.measurements.find(m => m.pollutant === 'pm25')?.calibrationApplied}
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <div className="p-3 rounded-lg bg-white dark:bg-zinc-900 border border-stone-200 dark:border-zinc-800 text-xs text-ink-muted dark:text-zinc-400 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Info className="w-4 h-4 text-stone-400 shrink-0" />
                  <span>No personal hardware monitor is currently connected.</span>
                </div>
                <span className="text-[10px] font-mono text-cyan-600 dark:text-cyan-400 font-semibold">
                  Connect via USB/Wi-Fi
                </span>
              </div>
            )}
          </div>

          {effectiveSources.length === 0 ? (
            <div className="p-6 rounded-xl bg-stone-50 dark:bg-zinc-800/40 border border-stone-200 dark:border-zinc-800 text-center space-y-2">
              <AlertCircle className="w-6 h-6 text-stone-400 mx-auto" />
              <p className="text-sm font-semibold text-ink dark:text-white">
                Environmental source details are currently unavailable.
              </p>
              <p className="text-xs text-ink-muted dark:text-zinc-400">
                Atmospheric telemetry pipeline has not populated independent source registry records for {cityName}.
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {effectiveSources.map((source) => {
                const kindBadge = getSourceKindBadge(source.sourceKind);
                const isModel = source.sourceKind === 'atmospheric_model' || source.sourceKind === 'satellite_reanalysis';
                const pm25Eligibility = !isModel ? evaluateMeasurementEligibility(source, 'pm25') : undefined;
                const statusBadge = isModel
                  ? getStatusBadge(source.status)
                  : getPhysicalStatusBadge(source.status, pm25Eligibility);
                const pm25 = source.measurements?.find((m) => m.pollutant === 'pm25');

                return (
                  <div
                    key={source.id}
                    className="p-4 rounded-xl bg-stone-50 dark:bg-zinc-800/40 border border-stone-200 dark:border-zinc-800 space-y-2.5 transition-colors hover:border-stone-300 dark:hover:border-zinc-700"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="space-y-0.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-bold text-sm text-ink dark:text-white">
                            {source.sourceName || source.name}
                          </span>
                          <span className={`text-[10px] font-mono px-2 py-0.5 rounded border font-semibold ${kindBadge.color}`}>
                            {kindBadge.label}
                          </span>
                          <span className={`text-[10px] font-mono px-2 py-0.5 rounded font-semibold ${statusBadge.color}`}>
                            {statusBadge.label}
                          </span>
                        </div>
                        <p className="text-xs text-ink-muted dark:text-zinc-400">
                          Provider: <strong>{source.providerName || source.provider}</strong>
                          {source.distanceKm !== null && source.distanceKm !== undefined && (
                            <span> &bull; Distance: <strong>{source.distanceKm} km</strong></span>
                          )}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 self-start sm:self-center">
                        <div className="text-right">
                          <div className="text-base font-mono font-bold text-ink dark:text-white">
                            {pm25 && pm25.value !== null ? `${pm25.value} µg/m³` : '—'}
                          </div>
                          <div className="text-[10px] font-mono text-ink-muted dark:text-zinc-400">
                            {pm25 && pm25.value !== null ? 'PM2.5 (Fine Dust)' : 'PM2.5 Unavailable'}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Measurement Provenance & Limitations */}
                    <div className="text-[11px] text-ink-muted dark:text-zinc-400 pt-1 border-t border-stone-200/60 dark:border-zinc-800/60 space-y-1">
                      <div className="flex flex-wrap items-center justify-between gap-1">
                        <span>Attribution: {source.attribution}</span>
                        {pm25?.observedAt ? (
                          <span className="flex items-center gap-1 text-[10px]">
                            <Clock className="w-3 h-3 text-stone-400" />
                            Observed: {new Date(pm25.observedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        ) : isModel && (pm25?.validAt || source.validAt) ? (
                          <span className="flex items-center gap-1 text-[10px]">
                            <Clock className="w-3 h-3 text-stone-400" />
                            Model Valid: {new Date(pm25?.validAt || source.validAt!).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        ) : source.observedAt ? (
                          <span className="flex items-center gap-1 text-[10px] text-stone-400">
                            <Clock className="w-3 h-3 text-stone-400" />
                            Station Heartbeat: {new Date(source.observedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} (PM2.5 untimed)
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-[10px] text-stone-400">
                            <Clock className="w-3 h-3 text-stone-400" />
                            Measurement time unavailable
                          </span>
                        )}
                      </div>
                      {source.explanation && (
                        <p className="text-stone-600 dark:text-zinc-300 italic">{source.explanation}</p>
                      )}
                      {source.provenance?.limitations && source.provenance.limitations.length > 0 && (
                        <ul className="list-disc list-inside space-y-0.5 text-[10.5px] text-stone-500 dark:text-zinc-400">
                          {source.provenance.limitations.map((lim, idx) => (
                            <li key={idx}>{lim}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* SECTION C: SOURCE COMPARISON & DIVERGENCE ENGINE */}
        <div className="p-4 rounded-xl bg-stone-50 dark:bg-zinc-800/60 border border-stone-200 dark:border-zinc-800 space-y-3">
          <div className="text-[10px] font-mono uppercase font-bold text-ink-muted dark:text-zinc-400 flex items-center justify-between">
            <span>Section C &bull; Multi-Source Inter-Comparison</span>
            <span className="font-semibold text-emerald-600 dark:text-emerald-400 font-mono">
              {sourceComparison?.mode === 'mode_c_comparable' ? 'Mode C (Comparable)' : sourceComparison?.mode === 'mode_b_incompatible' ? 'Mode B (Incompatible)' : 'Mode A (Single Source)'}
            </span>
          </div>

          {sourceComparison?.mode === 'mode_c_comparable' && sourceComparison.absoluteDifferenceUgM3 !== null ? (
            <div className="space-y-2.5">
              <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-950 dark:text-emerald-200 space-y-1">
                <div className="font-bold flex items-center gap-1.5 text-emerald-800 dark:text-emerald-300">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  <span>Comparable Independent Observation &amp; Atmospheric Model</span>
                </div>
                <p className="leading-relaxed">
                  {sourceComparison.summary}
                </p>
              </div>

              <div className="flex justify-between items-center text-xs font-mono text-ink-muted dark:text-zinc-400 px-1">
                <span>Concentration Spread:</span>
                <span className="font-bold text-ink dark:text-white">
                  {sourceComparison.minConcentration} µg/m³ &mdash; {sourceComparison.maxConcentration} µg/m³ (Δ {sourceComparison.absoluteDifferenceUgM3} µg/m³)
                </span>
              </div>

              {sourceComparison.divergenceReason && (
                <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-900 dark:text-amber-200 space-y-1">
                  <div className="font-bold flex items-center gap-1.5 text-amber-800 dark:text-amber-300">
                    <Info className="w-4 h-4 text-amber-500" />
                    <span>Atmospheric Boundary Layer Divergence</span>
                  </div>
                  <p className="leading-relaxed">{sourceComparison.divergenceReason}</p>
                </div>
              )}
            </div>
          ) : sourceComparison?.mode === 'mode_b_incompatible' ? (
            <div className="p-3.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-900 dark:text-amber-200 space-y-1.5">
              <div className="font-bold flex items-center gap-1.5 text-amber-800 dark:text-amber-300">
                <AlertCircle className="w-4 h-4 text-amber-500" />
                <span>Sources Ineligible for Quantitative Comparison</span>
              </div>
              <p className="leading-relaxed">
                {sourceComparison.summary}
              </p>
              {sourceComparison.incompatibilityReasons && sourceComparison.incompatibilityReasons.length > 0 && (
                <ul className="list-disc list-inside space-y-0.5 text-[11px] text-amber-800 dark:text-amber-300 pt-1">
                  {sourceComparison.incompatibilityReasons.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <div className="p-3.5 rounded-lg bg-stone-100 dark:bg-zinc-800 border border-stone-200 dark:border-zinc-700 text-xs text-ink-muted dark:text-zinc-300 space-y-1">
              <div className="font-bold text-ink dark:text-white flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-blue-500" />
                <span>Mode A &bull; Single Primary Provider Active</span>
              </div>
              <p className="leading-relaxed">
                Independent multi-source comparison is currently unavailable. Current atmospheric readings are provided solely by Open-Meteo numerical atmospheric chemistry models. Avir never synthesizes artificial consensus agreements or uncalibrated percentage confidence scores from a single provider.
              </p>
            </div>
          )}
        </div>

        {/* SECTION D: REGULATORY STANDARDS & INTERPRETATIONS */}
        <div className="space-y-3">
          <div className="space-y-0.5">
            <h4 className="text-xs font-mono font-bold uppercase text-ink-muted dark:text-zinc-400 flex items-center gap-1.5">
              <Scale className="w-3.5 h-3.5 text-sage-600 dark:text-emerald-400" />
              <span>Section D &bull; Derived Regulatory Interpretations</span>
            </h4>
            <p className="text-[11px] text-ink-muted dark:text-zinc-400">
              Mathematical index conversions derived from the measured particulate mass concentration. These are regulatory benchmarks, not additional ground stations.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* US EPA AirNow Standard */}
            <div className="p-3.5 rounded-xl bg-stone-50 dark:bg-zinc-800/40 border border-stone-200 dark:border-zinc-800 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-bold text-xs text-ink dark:text-white">US EPA AirNow Standard</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-500/10 text-blue-500 font-bold">
                  0-500 Scale
                </span>
              </div>
              <div className="text-xl font-mono font-black text-ink dark:text-white">
                {metrics?.usAqi !== null && metrics?.usAqi !== undefined ? `${metrics.usAqi} AQI` : '—'}
              </div>
              <p className="text-[10.5px] text-ink-muted dark:text-zinc-400 leading-relaxed">
                Calculated via standard US EPA piecewise linear concentration breakpoints for fine particulate matter (PM2.5).
              </p>
            </div>

            {/* CPCB National AQI Standard */}
            <div className="p-3.5 rounded-xl bg-stone-50 dark:bg-zinc-800/40 border border-stone-200 dark:border-zinc-800 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-bold text-xs text-ink dark:text-white">CPCB NAQI (India)</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-500 font-bold">
                  {metrics?.cpcbStatus === 'statutory_compliant'
                    ? 'Statutory Compliant (24-hr)'
                    : metrics?.cpcbStatus === 'indicative_snapshot'
                    ? 'Indicative Snapshot'
                    : 'Indicative Sub-Index'}
                </span>
              </div>
              <div className="text-xl font-mono font-black text-ink dark:text-white">
                {metrics?.cpcbAqi !== null && metrics?.cpcbAqi !== undefined ? `${metrics.cpcbAqi} NAQI` : '—'}
              </div>
              <p className="text-[10.5px] text-ink-muted dark:text-zinc-400 leading-relaxed">
                Evaluated against Ministry of Environment, Forest &amp; Climate Change Indian National Air Quality Index breakpoints. Statutory compliance requires verified 24-hr / 8-hr averages across at least 3 qualifying pollutants.
              </p>
            </div>
          </div>
        </div>

        {/* SECTION E: SOURCE METHODOLOGY */}
        <div className="p-4 rounded-xl bg-emerald-500/5 dark:bg-emerald-950/20 border border-emerald-500/20 text-xs text-ink-muted dark:text-zinc-300 space-y-2">
          <div className="font-bold text-ink dark:text-white flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            <span>Section E &bull; Environmental Data Quality &amp; Provenance Principles</span>
          </div>
          <div className="space-y-1.5 text-[11px] leading-relaxed">
            <p>
              &bull; <strong>Modeled vs. Observed:</strong> Numerical weather prediction models (e.g. Open-Meteo ECMWF/CAMS) estimate regional concentrations across 11km grid cells. Physical ground stations measure local air at human breathing height.
            </p>
            <p>
              &bull; <strong>Optical Sensors &amp; Hygroscopic Growth:</strong> Citizen science monitors (e.g. Sensor.Community SDS011) use laser light scattering, which can overestimate particulate mass under high humidity. Avir applies the scientific US EPA Barkjohn (2021) de-humidification formula when ambient relative humidity is verified.
            </p>
            <p>
              &bull; <strong>Scientific Divergence:</strong> Ground-level thermal inversions trap smoke near the surface while the upper boundary layer remains clearer. A divergence between surface monitors and regional grid models reflects genuine physical boundary layer behavior rather than instrumentation error.
            </p>
            <p>
              &bull; <strong>Comparison Ineligibility:</strong> To avoid false comparisons, Avir enforces strict spatial (&le; 25 km), temporal (&le; 120 minutes), averaging period, and unit parity before computing inter-source differences.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
