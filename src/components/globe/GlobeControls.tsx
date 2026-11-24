'use client';

import React from 'react';
import { ZoomIn, ZoomOut, RotateCcw, Play, Pause, Map, Globe as GlobeIcon } from 'lucide-react';
import { AqiStandard } from '@/services/geo/geographic-observation-adapter';

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
  className = '',
}: GlobeControlsProps) {
  return (
    <div
      role="toolbar"
      aria-label="Earth Observation Controls"
      className={`inline-flex flex-wrap items-center gap-1.5 p-1.5 rounded-xl bg-white/80 dark:bg-[#060b18]/85 backdrop-blur-xl border border-stone-200/90 dark:border-sky-500/20 shadow-lg ${className}`}
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
