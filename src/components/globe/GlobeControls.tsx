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
} from 'lucide-react';
import { AqiStandard } from '@/services/geo/geographic-observation-adapter';

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
        className: 'text-slate-400 border-slate-700/60 bg-slate-900/50',
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
            className: 'text-slate-400 border-slate-700/40 bg-slate-900/40',
          };
  }
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
  className = '',
}: GlobeControlsProps) {
  const [isLayersOpen, setIsLayersOpen] = useState(false);
  const layersPanelRef = useRef<HTMLDivElement>(null);

  const activeLayers: EnvironmentalLayersState = {
    wind: layers?.wind ?? false,
    fires: layers?.fires ?? false,
    terrain: layers?.terrain ?? false,
    satelliteComparison: layers?.satelliteComparison ?? false,
  };

  const windSupported = is3D && engineMode === 'three';
  const firesSupported = is3D;
  const terrainSupported = is3D && engineMode === 'cesium';

  const effectiveWindPressed = windSupported && activeLayers.wind;
  const effectiveFiresPressed = firesSupported && activeLayers.fires;
  const effectiveTerrainPressed = terrainSupported && activeLayers.terrain;

  const windStatus: EnvironmentalLayerStatusInfo = !windSupported
    ? { state: 'unsupported', detail: is3D ? 'Three.js Engine Only' : 'Available in 3D Three.js Mode' }
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

  const windBadge = getStatusBadgePresentation(windStatus.state, effectiveWindPressed, 'THREE.JS ONLY');
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

      <div className="relative" ref={layersPanelRef}>
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
            className="absolute bottom-full right-0 mb-2 w-80 rounded-2xl bg-white/95 dark:bg-[#070d1e]/95 backdrop-blur-xl border border-stone-200 dark:border-sky-500/30 p-3.5 shadow-2xl z-50 text-ink-primary dark:text-white"
          >
            <div className="flex items-center justify-between pb-2 border-b border-stone-200 dark:border-slate-800">
              <div className="flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-sky-400" />
                <span className="text-xs font-bold telemetry-mono text-sky-400">ENVIRONMENTAL LAYERS</span>
              </div>
              <button
                type="button"
                onClick={() => setIsLayersOpen(false)}
                className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-white/10"
                aria-label="Close layers menu"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="flex flex-col gap-3 py-3">
              {/* Wind Layer */}
              <div className="flex items-start justify-between gap-2 text-xs">
                <div className="flex items-start gap-2 min-w-0">
                  <Wind className="w-3.5 h-3.5 text-sky-400 mt-0.5 shrink-0" />
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
                    <div className="text-[9px] text-slate-400 telemetry-mono truncate">
                      {windStatus.detail || '10m GFS / Open-Meteo'}
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
                        ? 'bg-sky-500/20 text-sky-300 border-sky-500/50'
                        : 'bg-stone-100 dark:bg-slate-800 text-slate-400 border-transparent'
                  }`}
                  aria-label="Toggle Wind Flow layer"
                  aria-pressed={effectiveWindPressed}
                  title={!windSupported ? 'Switch to Three.js engine to activate wind particles' : undefined}
                >
                  {effectiveWindPressed ? 'ON' : 'OFF'}
                </button>
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
              Observational telemetry: NOAA, NASA FIRMS, GIBS, Re:Earth.
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
