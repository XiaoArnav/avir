'use client';

import React, { useState } from 'react';
import dynamic from 'next/dynamic';
import {
  GeographicObservationPoint,
  AqiStandard,
} from '@/services/geo/geographic-observation-adapter';
import { GlobeControls } from './GlobeControls';
import { GlobeCityCard } from './GlobeCityCard';
import { AccessibleEarthFallback } from './AccessibleEarthFallback';

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

export interface AvirGlobeProps {
  points: GeographicObservationPoint[];
  selectedPointId?: string | null;
  activeCityName?: string;
  onSelectPoint: (point: GeographicObservationPoint) => void;
  onSetActiveCity?: (point: GeographicObservationPoint) => void;
  standard?: AqiStandard;
  onToggleStandard?: () => void;
  className?: string;
}

export function AvirGlobe({
  points,
  selectedPointId,
  activeCityName,
  onSelectPoint,
  onSetActiveCity,
  standard = 'cpcb',
  onToggleStandard,
  className = '',
}: AvirGlobeProps) {
  const [is3D, setIs3D] = useState<boolean>(true);
  const [isAutoRotating, setIsAutoRotating] = useState<boolean>(true);
  const [zoomLevel, setZoomLevel] = useState<number>(260);

  const selectedPoint = points.find((p) => p.id === selectedPointId) || null;

  const handleZoomIn = () => {
    setZoomLevel((prev) => Math.max(150, prev - 30));
  };

  const handleZoomOut = () => {
    setZoomLevel((prev) => Math.min(360, prev + 30));
  };

  const handleResetView = () => {
    setZoomLevel(260);
    setIsAutoRotating(true);
  };

  return (
    <div
      className={`relative w-full h-[520px] sm:h-[620px] rounded-3xl overflow-hidden border border-stone-200/80 dark:border-sky-500/20 bg-stone-100 dark:bg-[#040711] shadow-2xl ${className}`}
    >
      {/* Background Radial Atmosphere Glow */}
      <div className="absolute inset-0 bg-radial-atmosphere pointer-events-none" />
      <div className="absolute inset-0 hud-grid-background opacity-40 pointer-events-none" />

      {/* Main 3D Canvas or Accessible 2D Fallback */}
      {is3D ? (
        <DynamicGlobeCanvas
          points={points}
          selectedPointId={selectedPointId}
          onSelectPoint={onSelectPoint}
          isAutoRotating={isAutoRotating}
          zoomLevel={zoomLevel}
          className="w-full h-full"
        />
      ) : (
        <div className="p-4 w-full h-full overflow-y-auto">
          <AccessibleEarthFallback
            points={points}
            selectedPointId={selectedPointId}
            onSelectPoint={onSelectPoint}
          />
        </div>
      )}

      {/* Floating City Card Inspector */}
      {selectedPoint && (
        <div className="absolute top-4 left-4 z-20">
          <GlobeCityCard
            point={selectedPoint}
            isActiveCity={activeCityName?.toLowerCase() === selectedPoint.name.toLowerCase()}
            onSelectAsActiveCity={(pt) => {
              if (onSetActiveCity) onSetActiveCity(pt);
            }}
            onClose={() => onSelectPoint({} as GeographicObservationPoint)}
          />
        </div>
      )}

      {/* Floating Bottom Globe Controls */}
      <div className="absolute bottom-4 right-4 z-20">
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
        />
      </div>

      {/* Corner HUD Decorators */}
      <div className="absolute top-3 right-4 pointer-events-none text-[10px] text-ink-faint dark:text-sky-300/40 telemetry-mono hidden sm:block">
        3D ORBITAL TELEMETRY // GL-ES 3.0
      </div>
    </div>
  );
}
