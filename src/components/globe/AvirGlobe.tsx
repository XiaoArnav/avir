'use client';

import React, { useState } from 'react';
import dynamic from 'next/dynamic';
import {
  GeographicObservationPoint,
  AqiStandard,
} from '@/services/geo/geographic-observation-adapter';
import { GlobeControls, EnvironmentalLayersState } from './GlobeControls';
import { GlobeCityCard } from './GlobeCityCard';
import { AccessibleEarthFallback } from './AccessibleEarthFallback';
import type { CameraAction } from './cesium/AvirCesiumGlobe';

// Client-only dynamic import of the Three.js Canvas
const DynamicGlobeCanvas = dynamic(
  () => import('./AvirGlobeCanvas').then((mod) => mod.AvirGlobeCanvas),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full flex items-center justify-center bg-black/40 text-xs text-sky-300 telemetry-mono">
        <span className="animate-pulse">INITIALIZING 3D EARTH TELEMETRY ENGINE...</span>
      </div>
    ),
  }
);

// Client-only dynamic import of the CesiumJS Engine (Satellite Earth Architecture)
const DynamicCesiumGlobe = dynamic(
  () => import('./cesium/AvirCesiumGlobe').then((mod) => mod.AvirCesiumGlobe),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full flex items-center justify-center bg-[#030712] text-xs text-sky-300 telemetry-mono">
        <span className="animate-pulse">INITIALIZING SATELLITE EARTH ENGINE...</span>
      </div>
    ),
  }
);

export interface AvirGlobeProps {
  points: GeographicObservationPoint[];
  selectedPointId?: string | null;
  activeCityName?: string;
  onSelectPoint: (point: GeographicObservationPoint | null) => void;
  onClearInspectedPoint?: () => void;
  onSetActiveCity?: (point: GeographicObservationPoint) => void;
  standard?: AqiStandard;
  onToggleStandard?: () => void;
  selectedHour?: number;
  validAtUtc?: string | null;
  themeMode?: 'dark' | 'light';
  layers?: Partial<EnvironmentalLayersState>;
  onToggleLayer?: (layer: keyof EnvironmentalLayersState) => void;
  className?: string;
}

export function AvirGlobe({
  points,
  selectedPointId,
  activeCityName,
  onSelectPoint,
  onClearInspectedPoint,
  onSetActiveCity,
  standard = 'cpcb',
  onToggleStandard,
  selectedHour = 12,
  validAtUtc,
  themeMode = 'dark',
  layers,
  onToggleLayer,
  className = '',
}: AvirGlobeProps) {
  const [is3D, setIs3D] = useState<boolean>(true);
  const [engineMode, setEngineMode] = useState<'three' | 'cesium'>('three');
  const [isAutoRotating, setIsAutoRotating] = useState<boolean>(true);
  const [zoomLevel, setZoomLevel] = useState<number>(260);
  const [cameraAction, setCameraAction] = useState<CameraAction | null>(null);
  const [fallbackNotice, setFallbackNotice] = useState<string | null>(null);
  const [internalLayers, setInternalLayers] = useState<EnvironmentalLayersState>({
    wind: true,
    fires: true,
    terrain: false,
    satelliteComparison: false,
  });

  const activeLayers = {
    ...internalLayers,
    ...layers,
  };

  const handleToggleLayer = (layer: keyof EnvironmentalLayersState) => {
    setInternalLayers((prev) => ({
      ...prev,
      [layer]: !prev[layer],
    }));
    onToggleLayer?.(layer);
  };

  const selectedPoint = points.find((p) => p.id === selectedPointId) || null;

  const handleZoomIn = () => {
    setZoomLevel((prev) => Math.max(150, prev - 30));
    setCameraAction({ type: 'zoomIn', timestamp: Date.now() });
  };

  const handleZoomOut = () => {
    setZoomLevel((prev) => Math.min(360, prev + 30));
    setCameraAction({ type: 'zoomOut', timestamp: Date.now() });
  };

  const handleResetView = () => {
    setZoomLevel(260);
    setIsAutoRotating(true);
    setCameraAction({ type: 'reset', timestamp: Date.now() });
  };

  const handleCesiumFallback = (reason: string) => {
    setEngineMode('three');
    setFallbackNotice(`Cesium unavailable (${reason}). Reverted to Three.js.`);
    // Auto-dismiss notice after 8 seconds
    setTimeout(() => setFallbackNotice(null), 8000);
  };

  const hasCustomHeight = className.includes('h-');

  return (
    <div
      className={`relative w-full ${hasCustomHeight ? '' : 'h-[520px] sm:h-[620px]'} rounded-3xl overflow-hidden border border-stone-200/80 dark:border-sky-500/20 bg-stone-100 dark:bg-[#040711] shadow-2xl ${className}`}
    >
      {/* Background Radial Atmosphere Glow */}
      <div className="absolute inset-0 bg-radial-atmosphere pointer-events-none" />
      <div className="absolute inset-0 hud-grid-background opacity-40 pointer-events-none" />

      {/* Non-blocking Fallback Notification Banner */}
      {fallbackNotice && (
        <div className="absolute top-4 left-4 z-30 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-950/80 border border-amber-500/40 text-amber-200 text-xs telemetry-mono shadow-lg animate-in fade-in">
          <span>{fallbackNotice}</span>
          <button
            type="button"
            onClick={() => setFallbackNotice(null)}
            className="text-amber-400 hover:text-white font-bold ml-1"
            aria-label="Dismiss fallback notification"
          >
            ×
          </button>
        </div>
      )}

      {/* Main 3D Canvas, CesiumJS Engine, or Accessible 2D Fallback */}
      {is3D ? (
        engineMode === 'cesium' ? (
          <DynamicCesiumGlobe
            points={points}
            selectedPointId={selectedPointId}
            activeCityName={activeCityName}
            onSelectPoint={onSelectPoint}
            onSetActiveCity={onSetActiveCity}
            standard={standard}
            validAtUtc={validAtUtc}
            themeMode={themeMode}
            isAutoRotating={isAutoRotating}
            cameraAction={cameraAction}
            onFallbackToThree={handleCesiumFallback}
            className="w-full h-full"
          />
        ) : (
          <DynamicGlobeCanvas
            points={points}
            selectedPointId={selectedPointId}
            onSelectPoint={onSelectPoint}
            isAutoRotating={isAutoRotating}
            zoomLevel={zoomLevel}
            selectedHour={selectedHour}
            validAtUtc={validAtUtc}
            themeMode={themeMode}
            className="w-full h-full"
          />
        )
      ) : (
        <div className="p-4 w-full h-full overflow-y-auto">
          <AccessibleEarthFallback
            points={points}
            selectedPointId={selectedPointId}
            onSelectPoint={onSelectPoint}
          />
        </div>
      )}

      {/* Floating City Card Inspector (only displayed when inspecting another city on the globe) */}
      {selectedPoint && activeCityName?.toLowerCase() !== selectedPoint.name.toLowerCase() && (
        <div className="absolute top-4 right-4 sm:top-6 sm:right-6 z-20">
          <GlobeCityCard
            point={selectedPoint}
            isActiveCity={false}
            onSelectAsActiveCity={(pt) => {
              if (onSetActiveCity) onSetActiveCity(pt);
            }}
            onClose={() => {
              if (onClearInspectedPoint) {
                onClearInspectedPoint();
              } else {
                onSelectPoint(null);
              }
            }}
          />
        </div>
      )}

      {/* Floating Bottom Globe Controls */}
      <div className="absolute bottom-16 right-4 sm:bottom-20 sm:right-6 z-20">
        <GlobeControls
          is3D={is3D}
          onToggle3D={() => setIs3D((prev) => !prev)}
          isAutoRotating={isAutoRotating}
          onToggleAutoRotate={() => setIsAutoRotating((prev) => !prev)}
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
          onResetView={handleResetView}
          standard={standard}
          onToggleStandard={onToggleStandard || (() => {})}
          engineMode={engineMode}
          onToggleEngine={() => setEngineMode((prev) => (prev === 'three' ? 'cesium' : 'three'))}
          layers={activeLayers}
          onToggleLayer={handleToggleLayer}
        />
      </div>

      {/* Corner HUD Decorators */}
      <div className="absolute top-3 right-4 pointer-events-none text-[10px] text-ink-faint dark:text-sky-300/40 telemetry-mono hidden sm:block">
        3D ORBITAL TELEMETRY // GL-ES 3.0
      </div>
    </div>
  );
}
