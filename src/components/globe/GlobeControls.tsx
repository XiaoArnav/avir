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
  onToggleLayer?: (layer: keyof EnvironmentalLayersState) => void;
  className?: string;
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
  onToggleLayer,
  className = '',
}: GlobeControlsProps) {
  const [isLayersOpen, setIsLayersOpen] = useState(false);
  const layersPanelRef = useRef<HTMLDivElement>(null);

  const activeLayers: EnvironmentalLayersState = {
    wind: layers?.wind ?? true,
    fires: layers?.fires ?? true,
    terrain: layers?.terrain ?? false,
    satelliteComparison: layers?.satelliteComparison ?? false,
  };

  // Close layers panel on Escape or outside click
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
          className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-semibold border transition-colors telemetry-mono ${
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
            className="absolute bottom-full right-0 mb-2 w-72 rounded-2xl bg-white/95 dark:bg-[#070d1e]/95 backdrop-blur-xl border border-stone-200 dark:border-sky-500/30 p-3.5 shadow-2xl z-50 text-ink-primary dark:text-white"
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

            <div className="flex flex-col gap-2.5 py-3">
              {/* Wind Layer */}
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <Wind className="w-3.5 h-3.5 text-sky-400" />
                  <div>
                    <div className="font-semibold text-[11px]">Wind Flow</div>
                    <div className="text-[9px] text-slate-400 telemetry-mono">10m GFS / Open-Meteo</div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onToggleLayer?.('wind')}
                  className={`px-2 py-0.5 rounded text-[10px] font-bold telemetry-mono transition-colors border ${
                    activeLayers.wind
                      ? 'bg-sky-500/20 text-sky-300 border-sky-500/50'
                      : 'bg-stone-100 dark:bg-slate-800 text-slate-400 border-transparent'
                  }`}
                  aria-pressed={activeLayers.wind}
                >
                  {activeLayers.wind ? 'ON' : 'OFF'}
                </button>
              </div>

              {/* Fire Anomalies Layer */}
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <Flame className="w-3.5 h-3.5 text-amber-500" />
                  <div>
                    <div className="font-semibold text-[11px]">Active Fires</div>
                    <div className="text-[9px] text-slate-400 telemetry-mono">NASA FIRMS Hotspots</div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onToggleLayer?.('fires')}
                  className={`px-2 py-0.5 rounded text-[10px] font-bold telemetry-mono transition-colors border ${
                    activeLayers.fires
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/50'
                      : 'bg-stone-100 dark:bg-slate-800 text-slate-400 border-transparent'
                  }`}
                  aria-pressed={activeLayers.fires}
                >
                  {activeLayers.fires ? 'ON' : 'OFF'}
                </button>
              </div>

              {/* 3D Elevation Terrain Layer */}
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <Mountain className="w-3.5 h-3.5 text-emerald-400" />
                  <div>
                    <div className="font-semibold text-[11px]">3D Terrain Mesh</div>
                    <div className="text-[9px] text-slate-400 telemetry-mono">
                      {engineMode === 'cesium' ? 'Re:Earth Quantized Mesh' : 'Cesium Engine Only'}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={engineMode !== 'cesium'}
                  onClick={() => onToggleLayer?.('terrain')}
                  className={`px-2 py-0.5 rounded text-[10px] font-bold telemetry-mono transition-colors border ${
                    engineMode !== 'cesium'
                      ? 'opacity-40 cursor-not-allowed bg-stone-100 dark:bg-slate-800 text-slate-500 border-transparent'
                      : activeLayers.terrain
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50'
                        : 'bg-stone-100 dark:bg-slate-800 text-slate-400 border-transparent'
                  }`}
                  aria-pressed={activeLayers.terrain}
                  title={engineMode !== 'cesium' ? 'Switch to Cesium engine to activate 3D terrain' : undefined}
                >
                  {activeLayers.terrain ? 'ON' : 'OFF'}
                </button>
              </div>

              {/* Satellite Comparison Slider */}
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <Eye className="w-3.5 h-3.5 text-purple-400" />
                  <div>
                    <div className="font-semibold text-[11px]">Satellite Imagery</div>
                    <div className="text-[9px] text-slate-400 telemetry-mono">NASA GIBS Reflectance</div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onToggleLayer?.('satelliteComparison')}
                  className={`px-2 py-0.5 rounded text-[10px] font-bold telemetry-mono transition-colors border ${
                    activeLayers.satelliteComparison
                      ? 'bg-purple-500/20 text-purple-300 border-purple-500/50'
                      : 'bg-stone-100 dark:bg-slate-800 text-slate-400 border-transparent'
                  }`}
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
