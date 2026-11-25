'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Play,
  Pause,
  Map,
  Globe as GlobeIcon,
  Layers,
  Wind,
  Flame,
  Mountain,
  Eye,
  X,
  Crosshair,
} from 'lucide-react';
import { AqiStandard } from '@/services/geo/geographic-observation-adapter';
import type {
  GlobalWindManifest,
  GlobalWindModelId,
  GlobalWindOverlayKind,
  WindInspectionReading,
  WindSpeedUnit,
} from '@/domain/wind-types';
import { WIND_OVERLAY_SCALES } from '@/domain/wind-field';

export interface EnvironmentalLayersState {
  wind: boolean;
  fires: boolean;
  terrain: boolean;
  satelliteComparison: boolean;
}

export type LayerRuntimeState =
  | 'off'
  | 'loading'
  | 'live'
  | 'no_detections'
  | 'stale'
  | 'unconfigured'
  | 'rate_limited'
  | 'global_date_listed'
  | 'unverified'
  | 'unavailable'
  | 'unsupported';

export interface EnvironmentalLayerStatusInfo {
  state: LayerRuntimeState;
  detail?: string;
}

export type EnvironmentalLayersStatusMap = Partial<
  Record<keyof EnvironmentalLayersState, EnvironmentalLayerStatusInfo>
>;

export interface WindLayerControlProps {
  model: GlobalWindModelId;
  onChangeModel: (model: GlobalWindModelId) => void;
  overlay: GlobalWindOverlayKind;
  onChangeOverlay: (overlay: GlobalWindOverlayKind) => void;
  paused: boolean;
  onTogglePause: () => void;
  speedUnit: WindSpeedUnit;
  onChangeSpeedUnit: (unit: WindSpeedUnit) => void;
  prefersReducedMotion?: boolean;
  manifest?: GlobalWindManifest | null;
  inspection?: WindInspectionReading | null;
  onInspectActiveCity?: () => void;
  onClearInspection?: () => void;
}

export interface GlobeControlsProps {
  is3D: boolean;
  onToggle3D: () => void;
  isAutoRotating: boolean;
  onToggleAutoRotate: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetView: () => void;
  standard: AqiStandard;
  onToggleStandard: () => void;
  engineMode?: 'three' | 'cesium';
  onToggleEngine?: () => void;
  layers?: Partial<EnvironmentalLayersState>;
  layerStatus?: EnvironmentalLayersStatusMap;
  onToggleLayer?: (layer: keyof EnvironmentalLayersState) => void;
  windControls?: WindLayerControlProps;
  defaultLayersOpen?: boolean;
  className?: string;
}

function getStatusBadgePresentation(
  state: LayerRuntimeState,
  requested: boolean,
  unsupportedLabel: string
): { label: string; className: string } {
  switch (state) {
    case 'unsupported':
      return {
        label: unsupportedLabel,
        className:
          'text-slate-600 border-stone-300 bg-stone-100 dark:text-slate-400 dark:border-slate-700/60 dark:bg-slate-900/50',
      };
    case 'loading':
      return {
        label: 'LOADING',
        className: 'text-sky-300 border-sky-500/40 bg-sky-950/60',
      };
    case 'live':
      return {
        label: 'LIVE',
        className: 'text-emerald-300 border-emerald-500/40 bg-emerald-950/60',
      };
    case 'no_detections':
      return {
        label: 'NO DETECTIONS',
        className: 'text-teal-300 border-teal-500/40 bg-teal-950/60',
      };
    case 'stale':
      return {
        label: 'STALE',
        className: 'text-amber-300 border-amber-500/40 bg-amber-950/60',
      };
    case 'unconfigured':
      return {
        label: 'UNCONFIGURED',
        className: 'text-amber-300 border-amber-500/40 bg-amber-950/60',
      };
    case 'rate_limited':
      return {
        label: 'RATE LIMITED',
        className: 'text-rose-300 border-rose-500/40 bg-rose-950/60',
      };
    case 'global_date_listed':
      return {
        label: 'GLOBAL DATE',
        className: 'text-sky-300 border-sky-500/40 bg-sky-950/60',
      };
    case 'unverified':
      return {
        label: 'UNVERIFIED',
        className: 'text-amber-300 border-amber-500/40 bg-amber-950/60',
      };
    case 'unavailable':
      return {
        label: 'UNAVAILABLE',
        className: 'text-rose-300 border-rose-500/40 bg-rose-950/60',
      };
    case 'off':
    default:
      return requested
        ? {
            label: 'REQUESTED',
            className: 'text-sky-300 border-sky-500/30 bg-sky-950/40',
          }
        : {
            label: 'OFF',
            className:
              'text-slate-600 border-stone-300 bg-stone-100 dark:text-slate-400 dark:border-slate-700/40 dark:bg-slate-900/40',
          };
  }
}

function formatUtcCompact(iso: string | null | undefined): string {
  if (!iso) return 'Unavailable';
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return 'Unavailable';
  return `${new Date(ms).toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

function formatCoord(val: number, posHem: string, negHem: string): string {
  return `${Math.abs(val).toFixed(2)}°${val < 0 ? negHem : posHem}`;
}

export function GlobeControls({
  is3D,
  onToggle3D,
  isAutoRotating,
  onToggleAutoRotate,
  onZoomIn,
  onZoomOut,
  onResetView,
  standard,
  onToggleStandard,
  engineMode = 'three',
  onToggleEngine,
  layers,
  layerStatus,
  onToggleLayer,
  windControls,
  defaultLayersOpen = false,
  className = '',
}: GlobeControlsProps) {
  const [isLayersOpen, setIsLayersOpen] = useState(defaultLayersOpen);
  const layersPanelRef = useRef<HTMLDivElement>(null);

  const activeLayers: EnvironmentalLayersState = {
    wind: layers?.wind ?? false,
    fires: layers?.fires ?? false,
    terrain: layers?.terrain ?? false,
    satelliteComparison: layers?.satelliteComparison ?? false,
  };

  const windSupported = is3D;
  const firesSupported = is3D;
  const terrainSupported = is3D && engineMode === 'cesium';

  const effectiveWindPressed = windSupported && activeLayers.wind;
  const effectiveFiresPressed = firesSupported && activeLayers.fires;
  const effectiveTerrainPressed = terrainSupported && activeLayers.terrain;

  const windStatus: EnvironmentalLayerStatusInfo = !windSupported
    ? { state: 'unsupported', detail: 'Available in 3D Globe Mode' }
    : layerStatus?.wind ?? { state: activeLayers.wind ? 'loading' : 'off' };

  const firesStatus: EnvironmentalLayerStatusInfo = !firesSupported
    ? { state: 'unsupported', detail: 'Available in 3D Globe Mode' }
    : layerStatus?.fires ?? { state: activeLayers.fires ? 'loading' : 'off' };

  const terrainStatus: EnvironmentalLayerStatusInfo = !terrainSupported
    ? { state: 'unsupported', detail: 'Cesium Engine Only' }
    : layerStatus?.terrain ?? { state: activeLayers.terrain ? 'loading' : 'off' };

  const satelliteStatus: EnvironmentalLayerStatusInfo =
    layerStatus?.satelliteComparison ?? {
      state: activeLayers.satelliteComparison ? 'unverified' : 'off',
    };

  const windBadge = getStatusBadgePresentation(windStatus.state, effectiveWindPressed, '3D ONLY');
  const firesBadge = getStatusBadgePresentation(firesStatus.state, effectiveFiresPressed, '3D ONLY');
  const terrainBadge = getStatusBadgePresentation(terrainStatus.state, effectiveTerrainPressed, 'CESIUM ONLY');
  const satelliteBadge = getStatusBadgePresentation(
    satelliteStatus.state,
    activeLayers.satelliteComparison,
    'UNSUPPORTED'
  );

  // Close layers panel on Escape or outside click without interrupting globe focus
  useEffect(() => {
    if (!isLayersOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsLayersOpen(false);
      }
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (layersPanelRef.current && !layersPanelRef.current.contains(e.target as Node)) {
        setIsLayersOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isLayersOpen]);

  const showWindDrawer = effectiveWindPressed && Boolean(windControls);
  const manifest = windControls?.manifest;
  const activeOverlayKind = windControls?.overlay ?? 'none';

  return (
    <div
      role="toolbar"
      aria-label="Earth Observation Controls"
      className={`relative inline-flex flex-wrap items-center gap-1.5 p-1.5 rounded-xl bg-white/80 dark:bg-[#060b18]/85 backdrop-blur-xl border border-stone-200/90 dark:border-sky-500/20 shadow-lg ${className}`}
    >
      {/* 3D / 2D Toggle */}
      <button
        type="button"
        onClick={onToggle3D}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-stone-200 dark:border-sky-500/30 bg-stone-50 dark:bg-sky-950/40 text-ink-primary dark:text-sky-200 hover:border-sky-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 transition-colors"
        title={is3D ? 'Switch to Accessible 2D Map' : 'Switch to 3D Earth Globe'}
        aria-label={is3D ? 'Switch to Accessible 2D Map' : 'Switch to 3D Earth Globe'}
      >
        {is3D ? (
          <>
            <GlobeIcon className="w-3.5 h-3.5 text-sky-500" />
            <span className="telemetry-mono">3D</span>
          </>
        ) : (
          <>
            <Map className="w-3.5 h-3.5 text-sky-500" />
            <span className="telemetry-mono">2D MAP</span>
          </>
        )}
      </button>

      {/* Auto-Rotation Toggle (only active in 3D mode) */}
      {is3D && (
        <button
          type="button"
          onClick={onToggleAutoRotate}
          className={`p-1.5 rounded-lg text-xs font-semibold border transition-colors ${
            isAutoRotating
              ? 'bg-sky-500/20 border-sky-500/40 text-sky-700 dark:text-sky-300'
              : 'border-stone-200 dark:border-sky-500/20 text-ink-muted dark:text-slate-400 hover:text-ink-primary dark:hover:text-white'
          }`}
          title={isAutoRotating ? 'Pause rotation' : 'Start auto-rotation'}
          aria-label={isAutoRotating ? 'Pause rotation' : 'Start auto-rotation'}
        >
          {isAutoRotating ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
        </button>
      )}

      {/* Zoom In */}
      <button
        type="button"
        onClick={onZoomIn}
        className="p-1.5 rounded-lg text-xs font-semibold border border-stone-200 dark:border-sky-500/20 text-ink-muted dark:text-slate-300 hover:text-ink-primary dark:hover:text-white hover:border-sky-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 transition-colors"
        title="Zoom In"
        aria-label="Zoom In"
      >
        <ZoomIn className="w-3.5 h-3.5" />
      </button>

      {/* Zoom Out */}
      <button
        type="button"
        onClick={onZoomOut}
        className="p-1.5 rounded-lg text-xs font-semibold border border-stone-200 dark:border-sky-500/20 text-ink-muted dark:text-slate-300 hover:text-ink-primary dark:hover:text-white hover:border-sky-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 transition-colors"
        title="Zoom Out"
        aria-label="Zoom Out"
      >
        <ZoomOut className="w-3.5 h-3.5" />
      </button>

      {/* Reset Camera View */}
      <button
        type="button"
        onClick={onResetView}
        className="p-1.5 rounded-lg text-xs font-semibold border border-stone-200 dark:border-sky-500/20 text-ink-muted dark:text-slate-300 hover:text-ink-primary dark:hover:text-white hover:border-sky-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 transition-colors"
        title="Reset Globe Orientation"
        aria-label="Reset Globe Orientation"
      >
        <RotateCcw className="w-3.5 h-3.5" />
      </button>

      {/* 3D Engine Switcher (Three.js vs CesiumJS) */}
      {is3D && onToggleEngine && (
        <>
          <div className="h-4 w-px bg-stone-300 dark:bg-sky-500/20 mx-0.5" />
          <button
            type="button"
            onClick={onToggleEngine}
            className="px-2 py-1 rounded-lg text-[11px] font-semibold border border-stone-200 dark:border-sky-500/30 bg-stone-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 hover:border-sky-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 transition-colors telemetry-mono uppercase"
            title={`Active Engine: ${engineMode === 'cesium' ? 'CesiumJS (Satellite Earth)' : 'Three.js (Atmospheric Globe)'}. Click to switch.`}
            aria-label={`Toggle 3D Engine, currently ${engineMode === 'cesium' ? 'CesiumJS (Satellite Earth)' : 'Three.js (Atmospheric Globe)'}`}
          >
            {engineMode === 'cesium' ? 'CESIUM' : 'THREE'}
          </button>
        </>
      )}

      {/* Unified Environmental Layer Controls */}
      <div className="h-4 w-px bg-stone-300 dark:bg-sky-500/20 mx-0.5" />

      <div className="sm:relative" ref={layersPanelRef}>
        <button
          type="button"
          onClick={() => setIsLayersOpen((prev) => !prev)}
          className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-semibold border transition-colors telemetry-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${
            isLayersOpen
              ? 'bg-sky-500/20 border-sky-500/40 text-sky-700 dark:text-sky-300'
              : 'border-stone-200 dark:border-sky-500/20 text-ink-muted dark:text-slate-300 hover:text-ink-primary dark:hover:text-white'
          }`}
          aria-expanded={isLayersOpen}
          aria-haspopup="dialog"
          aria-label="Environmental Intelligence Layers"
          title="Toggle Environmental Layers Menu"
        >
          <Layers className="w-3.5 h-3.5 text-sky-500" />
          <span className="hidden sm:inline">LAYERS</span>
        </button>

        {/* Layers Menu Popover */}
        {isLayersOpen && (
          <div
            role="dialog"
            aria-label="Environmental Intelligence Layers Panel"
            className="absolute bottom-full right-0 mb-2 w-[min(calc(100vw-2.5rem),22rem)] max-h-[min(25rem,52dvh)] overflow-y-auto rounded-2xl bg-white/95 dark:bg-[#070d1e]/95 backdrop-blur-xl border border-stone-200 dark:border-sky-500/30 px-3.5 pb-3.5 shadow-2xl z-50 text-ink-primary dark:text-white"
          >
            <div className="sticky top-0 z-10 flex items-center justify-between pt-3 pb-2 bg-white/95 dark:bg-[#070d1e]/95 backdrop-blur-xl border-b border-stone-200 dark:border-slate-800">
              <div className="flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                <span className="text-xs font-bold telemetry-mono text-sky-700 dark:text-sky-400">
                  ENVIRONMENTAL LAYERS
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsLayersOpen(false)}
                className="p-1 rounded-md text-slate-500 hover:text-slate-900 hover:bg-stone-200/70 dark:text-slate-400 dark:hover:text-white dark:hover:bg-white/10"
                aria-label="Close layers menu"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="flex flex-col gap-3 py-3">
              {/* Wind Layer + Inline Global Wind Controls */}
              <div className="flex flex-col gap-2">
                <div className="flex items-start justify-between gap-2 text-xs">
                  <div className="flex items-start gap-2 min-w-0">
                    <Wind className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400 mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <div className="font-semibold text-[11px] flex items-center gap-1.5">
                        <span>Wind Flow</span>
                        <span
                          data-testid="layer-status-wind"
                          className={`px-1.5 py-px rounded border text-[8.5px] telemetry-mono ${windBadge.className}`}
                        >
                          {windBadge.label}
                        </span>
                      </div>
                      <div className="text-[9px] text-slate-600 dark:text-slate-400 telemetry-mono truncate">
                        {windStatus.detail || '10m GFS / ECMWF IFS Streamlines'}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={!windSupported}
                    onClick={() => {
                      if (windSupported) onToggleLayer?.('wind');
                    }}
                    className={`px-2 py-0.5 rounded text-[10px] font-bold telemetry-mono transition-colors border shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${
                      !windSupported
                        ? 'opacity-40 cursor-not-allowed bg-stone-100 dark:bg-slate-800 text-slate-500 border-transparent'
                        : effectiveWindPressed
                          ? 'bg-sky-600 text-white border-sky-600 dark:bg-sky-500/20 dark:text-sky-300 dark:border-sky-500/50'
                          : 'bg-stone-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-transparent'
                    }`}
                    aria-label="Toggle Wind Flow layer"
                    aria-pressed={effectiveWindPressed}
                    title={!windSupported ? 'Switch to 3D globe mode to enable global wind flow' : undefined}
                  >
                    {effectiveWindPressed ? 'ON' : 'OFF'}
                  </button>
                </div>

                {/* Global Wind Controls Subpanel (shown when Wind Flow is active in 3D) */}
                {showWindDrawer && windControls && (
                  <div
                    data-testid="wind-controls-subpanel"
                    className="ml-1 pl-2.5 border-l border-sky-500/35 dark:border-sky-500/25 flex flex-col gap-2 py-1 text-[10px] telemetry-mono"
                  >
                    {/* Forecast Model Selector */}
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[9px] uppercase tracking-wider text-slate-600 dark:text-slate-400">
                        Model
                      </span>
                      <div className="flex items-center gap-1" role="group" aria-label="Wind forecast model">
                        {(
                          [
                            { id: 'gfs', label: 'NOAA GFS' },
                            { id: 'ifs', label: 'ECMWF IFS' },
                          ] as const
                        ).map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            data-testid={`wind-model-${item.id}`}
                            aria-pressed={windControls.model === item.id}
                            onClick={() => windControls.onChangeModel(item.id)}
                            className={`px-1.5 py-0.5 rounded border text-[9px] transition-colors ${
                              windControls.model === item.id
                                ? 'bg-sky-600 border-sky-600 text-white font-bold dark:bg-sky-500/25 dark:border-sky-400/60 dark:text-sky-200'
                                : 'bg-stone-100 border-stone-300 text-slate-700 hover:bg-stone-200 dark:bg-slate-900/60 dark:border-slate-700/60 dark:text-slate-300 dark:hover:text-white'
                            }`}
                          >
                            {item.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Visualization Selector */}
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[9px] uppercase tracking-wider text-slate-600 dark:text-slate-400">
                        Field
                      </span>
                      <div className="flex flex-wrap items-center justify-end gap-1" role="group" aria-label="Wind visualization mode">
                        {(
                          [
                            { id: 'none', label: 'Flow' },
                            { id: 'speed', label: 'Speed' },
                            { id: 'temperature', label: 'Temp' },
                            { id: 'pressure', label: 'Pressure' },
                          ] as const
                        ).map((mode) => (
                          <button
                            key={mode.id}
                            type="button"
                            data-testid={`wind-overlay-${mode.id}`}
                            aria-pressed={windControls.overlay === mode.id}
                            onClick={() => windControls.onChangeOverlay(mode.id)}
                            className={`px-1.5 py-0.5 rounded border text-[9px] transition-colors ${
                              windControls.overlay === mode.id
                                ? 'bg-sky-600 border-sky-600 text-white font-bold dark:bg-sky-500/25 dark:border-sky-400/60 dark:text-sky-200'
                                : 'bg-stone-100 border-stone-300 text-slate-700 hover:bg-stone-200 dark:bg-slate-900/60 dark:border-slate-700/60 dark:text-slate-300 dark:hover:text-white'
                            }`}
                          >
                            {mode.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Animation & Units Row */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1" role="group" aria-label="Wind speed units">
                        {(['km/h', 'm/s', 'mph'] as const).map((unit) => (
                          <button
                            key={unit}
                            type="button"
                            data-testid={`wind-unit-${unit}`}
                            aria-pressed={windControls.speedUnit === unit}
                            onClick={() => windControls.onChangeSpeedUnit(unit)}
                            className={`px-1.5 py-0.5 rounded border text-[9px] transition-colors ${
                              windControls.speedUnit === unit
                                ? 'bg-sky-600 border-sky-600 text-white font-bold dark:bg-sky-500/25 dark:border-sky-400/60 dark:text-sky-200'
                                : 'bg-stone-100 border-stone-300 text-slate-700 hover:bg-stone-200 dark:bg-slate-900/60 dark:border-slate-700/60 dark:text-slate-300 dark:hover:text-white'
                            }`}
                          >
                            {unit}
                          </button>
                        ))}
                      </div>

                      <button
                        type="button"
                        data-testid="wind-animation-toggle"
                        disabled={Boolean(windControls.prefersReducedMotion)}
                        aria-pressed={!windControls.paused && !windControls.prefersReducedMotion}
                        aria-label={
                          windControls.prefersReducedMotion
                            ? 'Wind animation disabled by reduced motion setting'
                            : windControls.paused
                              ? 'Resume wind animation'
                              : 'Pause wind animation'
                        }
                        onClick={windControls.onTogglePause}
                        className={`flex items-center gap-1 px-1.5 py-0.5 rounded border text-[9px] font-semibold transition-colors ${
                          windControls.prefersReducedMotion
                            ? 'opacity-50 cursor-not-allowed bg-stone-100 border-stone-300 text-slate-500 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-400'
                            : windControls.paused
                              ? 'bg-amber-100 border-amber-400 text-amber-900 dark:bg-amber-500/20 dark:border-amber-500/40 dark:text-amber-200'
                              : 'bg-emerald-100 border-emerald-400 text-emerald-900 dark:bg-emerald-500/15 dark:border-emerald-500/40 dark:text-emerald-200'
                        }`}
                      >
                        {windControls.paused || windControls.prefersReducedMotion ? (
                          <>
                            <Play className="w-2.5 h-2.5" />
                            <span>{windControls.prefersReducedMotion ? 'REDUCED' : 'PAUSED'}</span>
                          </>
                        ) : (
                          <>
                            <Pause className="w-2.5 h-2.5" />
                            <span>FLOWING</span>
                          </>
                        )}
                      </button>
                    </div>

                    {/* Optional Scalar Color Legend */}
                    {activeOverlayKind !== 'none' && WIND_OVERLAY_SCALES[activeOverlayKind] && (
                      <div className="rounded-lg bg-stone-100/90 border border-stone-200 text-slate-800 dark:bg-slate-900/70 dark:border-slate-800 dark:text-slate-200 px-2 py-1">
                        <div className="flex items-center justify-between text-[8.5px] mb-1">
                          <span>{WIND_OVERLAY_SCALES[activeOverlayKind].label}</span>
                          <span>
                            {WIND_OVERLAY_SCALES[activeOverlayKind].min}–
                            {WIND_OVERLAY_SCALES[activeOverlayKind].max}{' '}
                            {WIND_OVERLAY_SCALES[activeOverlayKind].units}
                          </span>
                        </div>
                        <div
                          className="h-1.5 rounded-full w-full"
                          style={{
                            background: `linear-gradient(90deg, ${WIND_OVERLAY_SCALES[activeOverlayKind].stops.join(', ')})`,
                          }}
                        />
                      </div>
                    )}

                    {/* Forecast Provenance & Metadata */}
                    {manifest && (
                      <div
                        data-testid="wind-forecast-metadata"
                        className="rounded-lg bg-stone-100/90 border border-stone-200 text-slate-700 dark:bg-slate-900/60 dark:border-slate-800/80 dark:text-slate-300 p-2 flex flex-col gap-0.5 text-[8.5px] leading-tight"
                      >
                        <div className="flex items-center justify-between gap-1 font-semibold text-sky-800 dark:text-sky-200">
                          <span className="truncate">{manifest.modelName}</span>
                          <span className="px-1 py-px rounded bg-sky-100 border border-sky-300 text-sky-800 dark:bg-sky-950 dark:border-sky-500/30 dark:text-sky-200 text-[8px] uppercase">
                            {manifest.freshness}
                          </span>
                        </div>
                        <div>Init: {formatUtcCompact(manifest.initTimeUtc)}</div>
                        <div>Valid: {formatUtcCompact(manifest.validTimeUtc)}</div>
                        <div className="text-slate-500 dark:text-slate-400">
                          10 m surface wind model · {manifest.license}
                        </div>
                        {manifest.scalarError && (
                          <div className="text-amber-700 dark:text-amber-300">{manifest.scalarError}</div>
                        )}
                        {manifest.unavailableReason && (
                          <div className="text-amber-700 dark:text-amber-300">{manifest.unavailableReason}</div>
                        )}
                      </div>
                    )}

                    {/* Wind Location Inspection Controls & Readout */}
                    <div className="flex items-center justify-between gap-1.5">
                      <button
                        type="button"
                        data-testid="wind-inspect-city"
                        disabled={!manifest?.isAvailable}
                        onClick={() => windControls.onInspectActiveCity?.()}
                        className="flex items-center gap-1 px-2 py-1 rounded border border-sky-300 bg-sky-50 text-sky-800 hover:bg-sky-100 dark:border-sky-500/30 dark:bg-sky-950/50 dark:text-sky-200 dark:hover:border-sky-400 disabled:opacity-40 text-[9px] font-medium transition-colors"
                      >
                        <Crosshair className="w-3 h-3" />
                        <span>Inspect City Wind</span>
                      </button>
                      <span className="text-[8px] text-slate-500 dark:text-slate-400">or click globe</span>
                    </div>

                    {windControls.inspection && (
                      <div
                        data-testid="wind-inspection-card"
                        className="rounded-lg bg-sky-50 border border-sky-200 text-slate-800 dark:bg-sky-950/60 dark:border-sky-500/35 dark:text-slate-200 p-2 flex flex-col gap-0.5 text-[8.5px]"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-sky-800 dark:text-sky-300">
                            {formatCoord(windControls.inspection.latitude, 'N', 'S')},{' '}
                            {formatCoord(windControls.inspection.longitude, 'E', 'W')}
                          </span>
                          <button
                            type="button"
                            aria-label="Clear wind inspection"
                            onClick={() => windControls.onClearInspection?.()}
                            className="text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                        <div>
                          Speed: <strong>{windControls.inspection.speedDisplay} {windControls.inspection.speedUnits}</strong>
                          {' · '}
                          {windControls.inspection.isCalm
                            ? 'Calm'
                            : `From ${windControls.inspection.compassPoint} (${windControls.inspection.fromDirectionDeg}°)`}
                        </div>
                        <div className="text-slate-700 dark:text-slate-300">
                          U: {windControls.inspection.u} m/s · V: {windControls.inspection.v} m/s
                        </div>
                        {windControls.inspection.scalarValue !== null && windControls.inspection.scalarUnits && (
                          <div className="text-slate-700 dark:text-slate-300">
                            Overlay ({windControls.inspection.scalarKind}):{' '}
                            {windControls.inspection.scalarValue} {windControls.inspection.scalarUnits}
                          </div>
                        )}
                        <div className="text-slate-500 dark:text-slate-400 text-[8px]">
                          {windControls.inspection.model.toUpperCase()} · {formatUtcCompact(windControls.inspection.validTimeUtc)} · Forecast only
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Fire Anomalies Layer */}
              <div className="flex items-start justify-between gap-2 text-xs">
                <div className="flex items-start gap-2 min-w-0">
                  <Flame className="w-3.5 h-3.5 text-amber-500 mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <div className="font-semibold text-[11px] flex items-center gap-1.5">
                      <span>Active Fires</span>
                      <span
                        data-testid="layer-status-fires"
                        className={`px-1.5 py-px rounded border text-[8.5px] telemetry-mono ${firesBadge.className}`}
                      >
                        {firesBadge.label}
                      </span>
                    </div>
                    <div className="text-[9px] text-slate-400 telemetry-mono truncate">
                      {firesStatus.detail || 'NASA FIRMS Thermal Anomalies'}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={!firesSupported}
                  onClick={() => {
                    if (firesSupported) onToggleLayer?.('fires');
                  }}
                  className={`px-2 py-0.5 rounded text-[10px] font-bold telemetry-mono transition-colors border shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${
                    !firesSupported
                      ? 'opacity-40 cursor-not-allowed bg-stone-100 dark:bg-slate-800 text-slate-500 border-transparent'
                      : effectiveFiresPressed
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/50'
                        : 'bg-stone-100 dark:bg-slate-800 text-slate-400 border-transparent'
                  }`}
                  aria-label="Toggle Active Fires layer"
                  aria-pressed={effectiveFiresPressed}
                >
                  {effectiveFiresPressed ? 'ON' : 'OFF'}
                </button>
              </div>

              {/* 3D Elevation Terrain Layer */}
              <div className="flex items-start justify-between gap-2 text-xs">
                <div className="flex items-start gap-2 min-w-0">
                  <Mountain className="w-3.5 h-3.5 text-emerald-400 mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <div className="font-semibold text-[11px] flex items-center gap-1.5">
                      <span>3D Terrain Mesh</span>
                      <span
                        data-testid="layer-status-terrain"
                        className={`px-1.5 py-px rounded border text-[8.5px] telemetry-mono ${terrainBadge.className}`}
                      >
                        {terrainBadge.label}
                      </span>
                    </div>
                    <div className="text-[9px] text-slate-400 telemetry-mono truncate">
                      {terrainStatus.detail || (terrainSupported ? 'Re:Earth Quantized Mesh' : 'Cesium Engine Only')}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={!terrainSupported}
                  onClick={() => {
                    if (terrainSupported) onToggleLayer?.('terrain');
                  }}
                  className={`px-2 py-0.5 rounded text-[10px] font-bold telemetry-mono transition-colors border shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 ${
                    !terrainSupported
                      ? 'opacity-40 cursor-not-allowed bg-stone-100 dark:bg-slate-800 text-slate-500 border-transparent'
                      : effectiveTerrainPressed
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50'
                        : 'bg-stone-100 dark:bg-slate-800 text-slate-400 border-transparent'
                  }`}
                  aria-label="Toggle 3D Terrain Mesh layer"
                  aria-pressed={effectiveTerrainPressed}
                  title={!terrainSupported ? 'Switch to Cesium engine to activate 3D terrain' : undefined}
                >
                  {effectiveTerrainPressed ? 'ON' : 'OFF'}
                </button>
              </div>

              {/* Satellite Comparison Slider */}
              <div className="flex items-start justify-between gap-2 text-xs">
                <div className="flex items-start gap-2 min-w-0">
                  <Eye className="w-3.5 h-3.5 text-purple-400 mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <div className="font-semibold text-[11px] flex items-center gap-1.5">
                      <span>Satellite Imagery</span>
                      <span
                        data-testid="layer-status-satellite"
                        className={`px-1.5 py-px rounded border text-[8.5px] telemetry-mono ${satelliteBadge.className}`}
                      >
                        {satelliteBadge.label}
                      </span>
                    </div>
                    <div className="text-[9px] text-slate-400 telemetry-mono truncate">
                      {satelliteStatus.detail || 'NASA GIBS Reflectance'}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onToggleLayer?.('satelliteComparison')}
                  className={`px-2 py-0.5 rounded text-[10px] font-bold telemetry-mono transition-colors border shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400 ${
                    activeLayers.satelliteComparison
                      ? 'bg-purple-500/20 text-purple-300 border-purple-500/50'
                      : 'bg-stone-100 dark:bg-slate-800 text-slate-400 border-transparent'
                  }`}
                  aria-label="Toggle Satellite Imagery Comparison panel"
                  aria-pressed={activeLayers.satelliteComparison}
                >
                  {activeLayers.satelliteComparison ? 'VIEW' : 'OFF'}
                </button>
              </div>
            </div>

            <div className="border-t border-stone-200 dark:border-slate-800 pt-2 text-[9px] text-slate-400 telemetry-mono leading-tight">
              Observational &amp; forecast telemetry: NOAA GFS, ECMWF IFS, NASA FIRMS, GIBS, Re:Earth.
            </div>
          </div>
        )}
      </div>

      {/* Standard Selector */}
      <div className="h-4 w-px bg-stone-300 dark:bg-sky-500/20 mx-0.5" />

      <button
        type="button"
        onClick={onToggleStandard}
        className="px-2 py-1 rounded-lg text-[11px] font-semibold border border-stone-200 dark:border-sky-500/20 bg-stone-50 dark:bg-sky-950/40 text-ink-primary dark:text-sky-300 hover:border-sky-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 transition-colors telemetry-mono uppercase"
        title={`Current standard: ${standard.toUpperCase()}. Click to switch.`}
        aria-label={`Toggle AQI standard, current ${standard.toUpperCase()}`}
      >
        {standard === 'cpcb' ? 'CPCB' : 'EPA'}
      </button>
    </div>
  );
}
