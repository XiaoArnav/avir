'use client';

import React, { useRef, useState, useMemo, useEffect } from 'react';
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
  Database,
  Sliders,
  RotateCcw,
  Check,
  ArrowUpDown,
  Building2,
  Globe2,
  Sparkles,
} from 'lucide-react';
import { useAccessibleDialog } from '@/components/ui/AccessibleDialog';
import {
  SourcePreference,
  SourceSelectionMode,
  ResolvedSourceData,
} from '@/services/source-control/source-control-types';
import {
  DEFAULT_SOURCE_PREFERENCE,
  loadSourcePreference,
  saveSourcePreference,
  resetSourcePreference,
} from '@/services/source-control/source-preferences';
import { resolveSource } from '@/services/source-control/source-resolution';

export interface MultiSourceInspectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  cityName: string;
  ensemble?: EnsembleConsensusAnalysis;
  environmentalSources?: EnvironmentalSourceRecord[];
  sourceComparison?: SourceComparison | null;
  metrics?: AtmosphericMetrics | null;
  personalHardwareSource?: EnvironmentalSourceRecord | null;
  sourcePreference?: SourcePreference;
  onUpdateSourcePreference?: (preference: SourcePreference) => void;
  resolvedSource?: ResolvedSourceData | null;
  initialTab?: 'control' | 'inspector';
}

export const MultiSourceInspectorModal: React.FC<MultiSourceInspectorModalProps> = ({
  isOpen,
  onClose,
  cityName,
  environmentalSources = [],
  sourceComparison,
  metrics,
  personalHardwareSource: propPersonalSource,
  sourcePreference: propPreference,
  onUpdateSourcePreference,
  resolvedSource: propResolvedSource,
  initialTab = 'control',
}) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const sourceControlSectionRef = useRef<HTMLDivElement>(null);
  const scientificAuditSectionRef = useRef<HTMLDivElement>(null);
  useAccessibleDialog({ isOpen, onClose, dialogRef });

  // Internal preference state with automatic persistence fallback
  const [internalPreference, setInternalPreference] = useState<SourcePreference>(() => {
    return propPreference || (typeof window !== 'undefined' ? loadSourcePreference() : DEFAULT_SOURCE_PREFERENCE);
  });

  useEffect(() => {
    if (propPreference) {
      setInternalPreference(propPreference);
    }
  }, [propPreference]);

  const activePreference = propPreference || internalPreference;

  const updatePreference = (updated: SourcePreference) => {
    setInternalPreference(updated);
    saveSourcePreference(updated);
    onUpdateSourcePreference?.(updated);
  };

  const handleModeChange = (mode: SourceSelectionMode) => {
    updatePreference({
      ...activePreference,
      mode,
    });
  };

  const handleStationChange = (stationId: string, stationName?: string) => {
    updatePreference({
      ...activePreference,
      mode: 'specific_station',
      stationId,
      stationName,
    });
  };

  const handleToggleFallback = () => {
    updatePreference({
      ...activePreference,
      allowFallbackToModel: !activePreference.allowFallbackToModel,
    });
  };

  const handleResetPreference = () => {
    const reset = resetSourcePreference();
    setInternalPreference(reset);
    onUpdateSourcePreference?.(reset);
  };

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

  // Dynamically resolve source according to active preference and metrics
  const activeResolvedSource: ResolvedSourceData = useMemo(() => {
    if (propResolvedSource) return propResolvedSource;
    return resolveSource(activePreference, metrics ?? null, 'cpcb');
  }, [propResolvedSource, activePreference, metrics]);

  // Aggregate candidate physical ground stations for explicit selection
  const availableStations = useMemo(() => {
    const list: Array<{ id: string; name: string; distanceKm: number | null; pm25: number | null; provider: string; isOfficial: boolean }> = [];
    for (const s of effectiveSources) {
      if (s.sourceKind === 'official_ground_station' || s.sourceKind === 'physical_observation' || s.sourceKind === 'community_optical') {
        const pm25 = s.measurements?.find((m) => m.pollutant === 'pm25')?.value ?? null;
        list.push({
          id: s.id,
          name: s.sourceName || s.name || 'Ground Monitor',
          distanceKm: s.distanceKm,
          pm25,
          provider: s.providerName || s.provider || 'Ground Station',
          isOfficial: s.sourceKind === 'official_ground_station',
        });
      }
    }
    if (metrics?.groundStation) {
      const gsId = String(metrics.groundStation.stationId);
      if (!list.some((st) => st.id === gsId)) {
        list.push({
          id: gsId,
          name: metrics.groundStation.stationName || 'Official Ground Station',
          distanceKm: metrics.groundStation.distanceKm,
          pm25: metrics.groundStation.pm25,
          provider: metrics.groundStation.provider || 'CPCB',
          isOfficial: true,
        });
      }
    }
    return list;
  }, [effectiveSources, metrics?.groundStation]);

  // Build structured comparison list across all available environmental feeds
  const comparisonItems = useMemo(() => {
    const items: Array<{
      id: string;
      name: string;
      provider: string;
      kind: string;
      pm25: number | null;
      deltaUgM3: number | null;
      distanceKm: number | null;
      timeLabel: string;
      status: string;
      isCurrentlyActive: boolean;
      modeForSelection: SourceSelectionMode;
      stationId?: string;
    }> = [];

    const activeConcentration = activeResolvedSource?.concentration ?? null;

    effectiveSources.forEach((src) => {
      const pm25 = src.measurements?.find((m) => m.pollutant === 'pm25')?.value ?? null;
      let delta: number | null = null;
      if (activeConcentration !== null && pm25 !== null) {
        delta = Math.round((pm25 - activeConcentration) * 10) / 10;
      }

      let timeLabel = 'Time unavailable';
      const pm25Meas = src.measurements?.find((m) => m.pollutant === 'pm25');
      if (pm25Meas?.observedAt) {
        timeLabel = `Observed ${new Date(pm25Meas.observedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
      } else if (pm25Meas?.validAt || src.validAt) {
        timeLabel = `Model Valid ${new Date(pm25Meas?.validAt || src.validAt!).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
      } else if (src.observedAt) {
        timeLabel = `Observed ${new Date(src.observedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
      }

      const isCurrentlyActive = activeResolvedSource?.stationId
        ? activeResolvedSource.stationId === src.id
        : activeResolvedSource?.providerId === (src.providerId || src.provider);

      let modeForSelection: SourceSelectionMode = 'specific_station';
      if (src.sourceKind === 'atmospheric_model') modeForSelection = 'atmospheric_model';
      else if (src.sourceKind === 'official_ground_station') modeForSelection = 'official_ground';
      else if (src.providerId === 'openaq') modeForSelection = 'openaq';

      items.push({
        id: src.id,
        name: src.sourceName || src.name || 'Environmental Source',
        provider: src.providerName || src.provider || 'Provider',
        kind: src.sourceKind,
        pm25,
        deltaUgM3: delta,
        distanceKm: src.distanceKm,
        timeLabel,
        status: src.status,
        isCurrentlyActive,
        modeForSelection,
        stationId: src.id,
      });
    });

    return items;
  }, [effectiveSources, activeResolvedSource]);

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

  if (!isOpen) return null;

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div 
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-sources-title"
        tabIndex={-1}
        className="bg-white dark:bg-zinc-900 border border-stone-200 dark:border-zinc-800 rounded-2xl max-w-3xl w-full p-6 shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto focus:outline-none"
      >
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
            className="p-1.5 rounded-lg text-ink-muted hover:text-ink dark:text-zinc-400 dark:hover:text-white transition-colors focus-visible-ring cursor-pointer"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Quick Jump Navigation */}
        <div className="flex items-center justify-between gap-2 -mt-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => sourceControlSectionRef.current?.scrollIntoView({ behavior: 'smooth' })}
              className="px-3 py-1.5 rounded-lg text-xs font-bold telemetry-mono bg-sky-500/10 text-sky-600 dark:text-sky-300 border border-sky-500/20 hover:bg-sky-500/20 transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <Database className="w-3.5 h-3.5" />
              <span>Source Control</span>
            </button>
            <button
              type="button"
              onClick={() => scientificAuditSectionRef.current?.scrollIntoView({ behavior: 'smooth' })}
              className="px-3 py-1.5 rounded-lg text-xs font-bold telemetry-mono bg-stone-100 dark:bg-zinc-800 text-stone-600 dark:text-zinc-300 border border-stone-200 dark:border-zinc-700 hover:bg-stone-200 dark:hover:bg-zinc-700 transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Scientific Audit Trail</span>
            </button>
          </div>
          <button
            type="button"
            onClick={handleResetPreference}
            className="text-[11px] font-mono text-stone-500 hover:text-stone-800 dark:text-zinc-400 dark:hover:text-white flex items-center gap-1 transition-colors cursor-pointer"
            title="Reset to automatic optimal source selection"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Reset Defaults</span>
          </button>
        </div>

        {/* SECTION 0: AVIR SOURCE CONTROL & SELECTION ENGINE */}
        <div
          ref={sourceControlSectionRef}
          className="p-4 sm:p-5 rounded-xl bg-gradient-to-b from-sky-500/5 to-transparent dark:from-sky-950/20 dark:to-transparent border border-sky-500/30 dark:border-sky-500/20 space-y-4 shadow-sm"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-sky-500/20">
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4 text-sky-500" />
              <h4 className="text-sm font-bold text-ink dark:text-white">
                Avir Source Control &amp; Selection
              </h4>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono uppercase text-sky-600 dark:text-sky-400 font-bold bg-sky-500/10 px-2 py-0.5 rounded">
                Active Mode: {activePreference.mode.replace('_', ' ')}
              </span>
            </div>
          </div>

          {/* Active Resolution Diagnostic Banner */}
          <div className="p-3 rounded-lg bg-white dark:bg-zinc-900 border border-stone-200 dark:border-zinc-800 space-y-2 text-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
              <div>
                <span className="text-[10px] font-mono uppercase text-ink-muted dark:text-zinc-400 block">
                  Currently Active Resolved Source:
                </span>
                <span className="font-bold text-sm text-ink dark:text-white">
                  {activeResolvedSource.stationName}
                </span>
                <span className="text-[11px] text-ink-muted dark:text-zinc-400 ml-2">
                  ({activeResolvedSource.providerName})
                </span>
              </div>
              <div className="flex items-center gap-2">
                {activeResolvedSource.resolutionStatus === 'resolved' ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                    <CheckCircle2 className="w-3 h-3" />
                    <span>Active &amp; Verified</span>
                  </span>
                ) : activeResolvedSource.resolutionStatus === 'fallback' ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                    <AlertCircle className="w-3 h-3" />
                    <span>Model Fallback Active</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                    <AlertCircle className="w-3 h-3" />
                    <span>Source Offline</span>
                  </span>
                )}
              </div>
            </div>

            <p className="text-[11px] text-ink-muted dark:text-zinc-400 leading-relaxed">
              {activeResolvedSource.selectionReason}
            </p>

            {activeResolvedSource.isFallback && activeResolvedSource.fallbackReason && (
              <p className="text-[11px] text-amber-600 dark:text-amber-400 font-medium">
                Fallback Notice: {activeResolvedSource.fallbackReason}
              </p>
            )}
          </div>

          {/* Mode Selection Grid */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold uppercase tracking-wider text-ink-muted dark:text-zinc-400 font-mono">
              Select Preferred Data Source Mode:
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {/* Option 1: Automatic */}
              <button
                type="button"
                onClick={() => handleModeChange('automatic')}
                className={`p-3 rounded-lg border text-left transition-all cursor-pointer ${
                  activePreference.mode === 'automatic'
                    ? 'bg-sky-500/15 border-sky-500 text-sky-900 dark:text-sky-100 ring-1 ring-sky-500/50'
                    : 'bg-white dark:bg-zinc-900 border-stone-200 dark:border-zinc-800 hover:border-stone-300 dark:hover:border-zinc-700'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold text-xs flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-sky-500" />
                    <span>Automatic (Optimal)</span>
                  </span>
                  {activePreference.mode === 'automatic' && <Check className="w-3.5 h-3.5 text-sky-500" />}
                </div>
                <p className="text-[10.5px] text-ink-muted dark:text-zinc-400 leading-normal">
                  Prioritizes official CPCB ground stations within 35km, then OpenAQ, falling back to CAMS models.
                </p>
              </button>

              {/* Option 2: Official Ground */}
              <button
                type="button"
                onClick={() => handleModeChange('official_ground')}
                className={`p-3 rounded-lg border text-left transition-all cursor-pointer ${
                  activePreference.mode === 'official_ground'
                    ? 'bg-amber-500/15 border-amber-500 text-amber-900 dark:text-amber-100 ring-1 ring-amber-500/50'
                    : 'bg-white dark:bg-zinc-900 border-stone-200 dark:border-zinc-800 hover:border-stone-300 dark:hover:border-zinc-700'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold text-xs flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-amber-500" />
                    <span>Official CPCB Ground</span>
                  </span>
                  {activePreference.mode === 'official_ground' && <Check className="w-3.5 h-3.5 text-amber-500" />}
                </div>
                <p className="text-[10.5px] text-ink-muted dark:text-zinc-400 leading-normal">
                  Statutory CAAQMS reference monitors at human breathing height.
                </p>
              </button>

              {/* Option 3: OpenAQ */}
              <button
                type="button"
                onClick={() => handleModeChange('openaq')}
                className={`p-3 rounded-lg border text-left transition-all cursor-pointer ${
                  activePreference.mode === 'openaq'
                    ? 'bg-emerald-500/15 border-emerald-500 text-emerald-900 dark:text-emerald-100 ring-1 ring-emerald-500/50'
                    : 'bg-white dark:bg-zinc-900 border-stone-200 dark:border-zinc-800 hover:border-stone-300 dark:hover:border-zinc-700'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold text-xs flex items-center gap-1.5">
                    <Globe2 className="w-3.5 h-3.5 text-emerald-500" />
                    <span>OpenAQ Network</span>
                  </span>
                  {activePreference.mode === 'openaq' && <Check className="w-3.5 h-3.5 text-emerald-500" />}
                </div>
                <p className="text-[10.5px] text-ink-muted dark:text-zinc-400 leading-normal">
                  OpenAQ international physical sensor network with verified sensor types.
                </p>
              </button>

              {/* Option 4: Atmospheric Model */}
              <button
                type="button"
                onClick={() => handleModeChange('atmospheric_model')}
                className={`p-3 rounded-lg border text-left transition-all cursor-pointer ${
                  activePreference.mode === 'atmospheric_model'
                    ? 'bg-blue-500/15 border-blue-500 text-blue-900 dark:text-blue-100 ring-1 ring-blue-500/50'
                    : 'bg-white dark:bg-zinc-900 border-stone-200 dark:border-zinc-800 hover:border-stone-300 dark:hover:border-zinc-700'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold text-xs flex items-center gap-1.5">
                    <Radio className="w-3.5 h-3.5 text-blue-500" />
                    <span>CAMS Atmospheric Model</span>
                  </span>
                  {activePreference.mode === 'atmospheric_model' && <Check className="w-3.5 h-3.5 text-blue-500" />}
                </div>
                <p className="text-[10.5px] text-ink-muted dark:text-zinc-400 leading-normal">
                  Open-Meteo ECMWF CAMS global chemistry model (11km grid simulation).
                </p>
              </button>

              {/* Option 5: Specific Station */}
              <button
                type="button"
                onClick={() => handleModeChange('specific_station')}
                className={`p-3 rounded-lg border text-left transition-all cursor-pointer ${
                  activePreference.mode === 'specific_station'
                    ? 'bg-purple-500/15 border-purple-500 text-purple-900 dark:text-purple-100 ring-1 ring-purple-500/50'
                    : 'bg-white dark:bg-zinc-900 border-stone-200 dark:border-zinc-800 hover:border-stone-300 dark:hover:border-zinc-700'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold text-xs flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 text-purple-500" />
                    <span>Specific Station</span>
                  </span>
                  {activePreference.mode === 'specific_station' && <Check className="w-3.5 h-3.5 text-purple-500" />}
                </div>
                <p className="text-[10.5px] text-ink-muted dark:text-zinc-400 leading-normal">
                  Pin to a specific verified ground station in {cityName}.
                </p>
              </button>
            </div>
          </div>

          {/* Specific Station Picker (Visible when mode === 'specific_station') */}
          {activePreference.mode === 'specific_station' && (
            <div className="p-3 rounded-lg bg-purple-500/5 border border-purple-500/20 space-y-2">
              <label htmlFor="specific-station-select" className="text-xs font-bold text-purple-900 dark:text-purple-300 block">
                Select Designated Monitoring Station:
              </label>
              {availableStations.length > 0 ? (
                <select
                  id="specific-station-select"
                  value={activePreference.stationId || ''}
                  onChange={(e) => {
                    const selId = e.target.value;
                    const match = availableStations.find((st) => st.id === selId);
                    handleStationChange(selId, match?.name);
                  }}
                  className="w-full px-3 py-2 rounded-lg bg-white dark:bg-zinc-900 border border-purple-500/30 text-xs font-bold text-ink dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500 cursor-pointer"
                >
                  <option value="" disabled>-- Select a ground station in {cityName} --</option>
                  {availableStations.map((st) => (
                    <option key={st.id} value={st.id}>
                      {st.name} — {st.distanceKm !== null ? `${st.distanceKm} km` : 'Local'} ({st.provider}) {st.pm25 !== null ? `[${st.pm25} µg/m³]` : '[No PM2.5]'}
                    </option>
                  ))}
                </select>
              ) : (
                <p className="text-xs text-ink-muted dark:text-zinc-400 italic">
                  No verified ground stations discovered within range of {cityName}.
                </p>
              )}
            </div>
          )}

          {/* Fallback Configuration Toggle (Explicit Opt-In) */}
          <div className="p-3 rounded-lg bg-white dark:bg-zinc-900 border border-stone-200 dark:border-zinc-800 flex items-start gap-3">
            <input
              type="checkbox"
              id="source-fallback-toggle"
              checked={Boolean(activePreference.allowFallbackToModel)}
              onChange={handleToggleFallback}
              className="mt-0.5 w-4 h-4 text-sky-600 rounded border-stone-300 dark:border-zinc-700 focus:ring-sky-500 cursor-pointer"
            />
            <label htmlFor="source-fallback-toggle" className="text-xs space-y-0.5 cursor-pointer select-none">
              <span className="font-bold text-ink dark:text-white block">
                Allow fallback to Atmospheric Model if preferred source is unavailable
              </span>
              <span className="text-[11px] text-ink-muted dark:text-zinc-400 block leading-relaxed">
                If checked, Avir transparently utilizes the regional CAMS numerical model when your preferred station goes offline or stops reporting PM2.5. If unchecked, Avir displays an honest offline status without silent fallbacks.
              </span>
            </label>
          </div>

          {/* Scientific Comparison Table (Phase 7) */}
          <div className="space-y-2 pt-2 border-t border-sky-500/20">
            <div className="flex items-center justify-between">
              <h5 className="text-xs font-mono font-bold uppercase text-ink-muted dark:text-zinc-400 flex items-center gap-1.5">
                <ArrowUpDown className="w-3.5 h-3.5 text-sky-500" />
                <span>Available Environmental Sources for {cityName} ({comparisonItems.length})</span>
              </h5>
            </div>

            {comparisonItems.length > 0 ? (
              <div className="overflow-x-auto border border-stone-200 dark:border-zinc-800 rounded-lg">
                <table className="w-full text-left text-xs">
                  <thead className="bg-stone-100 dark:bg-zinc-800 text-[10px] uppercase font-mono text-ink-muted dark:text-zinc-400 border-b border-stone-200 dark:border-zinc-700">
                    <tr>
                      <th className="p-2.5">Source &amp; Provider</th>
                      <th className="p-2.5">Type</th>
                      <th className="p-2.5">PM2.5</th>
                      <th className="p-2.5">Δ vs Active</th>
                      <th className="p-2.5">Distance</th>
                      <th className="p-2.5">Timing</th>
                      <th className="p-2.5 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-200 dark:divide-zinc-800">
                    {comparisonItems.map((item) => (
                      <tr
                        key={`comp-${item.id}`}
                        className={`transition-colors ${
                          item.isCurrentlyActive
                            ? 'bg-sky-500/10 dark:bg-sky-950/30'
                            : 'hover:bg-stone-50 dark:hover:bg-zinc-800/40'
                        }`}
                      >
                        <td className="p-2.5 font-bold text-ink dark:text-white">
                          <div>{item.name}</div>
                          <div className="text-[10px] font-normal text-ink-muted dark:text-zinc-400">{item.provider}</div>
                        </td>
                        <td className="p-2.5 font-mono text-[10px]">
                          {item.kind === 'atmospheric_model' ? (
                            <span className="text-blue-600 dark:text-blue-400">Model</span>
                          ) : (
                            <span className="text-emerald-600 dark:text-emerald-400">Ground</span>
                          )}
                        </td>
                        <td className="p-2.5 font-mono font-bold text-ink dark:text-white">
                          {item.pm25 !== null ? `${item.pm25} µg/m³` : '—'}
                        </td>
                        <td className="p-2.5 font-mono text-[11px]">
                          {item.isCurrentlyActive ? (
                            <span className="text-sky-600 dark:text-sky-400 font-bold">Active</span>
                          ) : item.deltaUgM3 !== null ? (
                            <span className={item.deltaUgM3 > 0 ? 'text-rose-500' : 'text-emerald-500'}>
                              {item.deltaUgM3 > 0 ? `+${item.deltaUgM3}` : item.deltaUgM3} µg/m³
                            </span>
                          ) : (
                            <span className="text-stone-400">—</span>
                          )}
                        </td>
                        <td className="p-2.5 text-ink-muted dark:text-zinc-400 font-mono text-[11px]">
                          {item.distanceKm !== null ? `${item.distanceKm} km` : '0 km'}
                        </td>
                        <td className="p-2.5 text-[10px] text-ink-muted dark:text-zinc-400">
                          {item.timeLabel}
                        </td>
                        <td className="p-2.5 text-right">
                          {item.isCurrentlyActive ? (
                            <span className="px-2 py-1 rounded text-[10px] font-bold font-mono bg-sky-500 text-white">
                              Selected
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                if (item.kind === 'atmospheric_model') {
                                  handleModeChange('atmospheric_model');
                                } else if (item.kind === 'official_ground_station') {
                                  handleStationChange(item.id, item.name);
                                } else {
                                  handleStationChange(item.id, item.name);
                                }
                              }}
                              className="px-2.5 py-1 rounded text-[10px] font-bold font-mono bg-stone-100 hover:bg-stone-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-ink dark:text-white border border-stone-300 dark:border-zinc-700 transition-colors cursor-pointer"
                            >
                              Select
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-xs text-ink-muted dark:text-zinc-400 italic">
                No comparative sources available for {cityName}.
              </p>
            )}
          </div>
        </div>

        {/* SCIENTIFIC AUDIT SECTIONS (A through E) */}
        <div ref={scientificAuditSectionRef} className="space-y-6 pt-2 border-t border-stone-200 dark:border-zinc-800">

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
                  {metrics?.aqiEvidence?.method === 'provider_reported'
                    ? 'Provider Reported'
                    : metrics?.aqiEvidence?.method === 'epa_pm25_24h_subindex'
                    ? 'PM2.5 Sub-Index (2024)'
                    : '0-500 Scale (2024 Breakpoints)'}
                </span>
              </div>
              <div className="text-xl font-mono font-black text-ink dark:text-white">
                {metrics?.usAqi !== null && metrics?.usAqi !== undefined ? `${metrics.usAqi} AQI` : '—'}
              </div>
              <p className="text-[10.5px] text-ink-muted dark:text-zinc-400 leading-relaxed">
                Calculated via standard US EPA 2024 revised piecewise linear concentration breakpoints (40 CFR Part 58 Appendix G) for fine particulate matter (PM2.5).
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
    </div>
  );
};
