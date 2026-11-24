'use client';

import React, { useState, useRef } from 'react';
import { SatelliteComparisonPair } from '@/domain/imagery-types';

export interface SatelliteComparisonSliderProps {
  comparison: SatelliteComparisonPair;
  className?: string;
}

export function SatelliteComparisonSlider({
  comparison,
  className = '',
}: SatelliteComparisonSliderProps) {
  const [sliderPosition, setSliderPosition] = useState<number>(50); // 0 to 100 percent
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef<boolean>(false);

  const handlePointerDown = () => {
    isDragging.current = true;
  };

  const handlePointerUp = () => {
    isDragging.current = false;
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const pct = Math.max(0, Math.min(100, (x / rect.width) * 100));
    setSliderPosition(Math.round(pct));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowLeft') {
      setSliderPosition((prev) => Math.max(0, prev - 5));
    } else if (e.key === 'ArrowRight') {
      setSliderPosition((prev) => Math.min(100, prev + 5));
    }
  };

  const { slotA, slotB, city, disclaimer } = comparison;

  return (
    <div className={`flex flex-col gap-3 rounded-2xl bg-slate-900/90 border border-slate-700/60 p-4 text-white shadow-xl ${className}`}>
      {/* Header with City & Dates */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold telemetry-mono text-sky-400">NASA SATELLITE IMAGERY COMPARISON</span>
          <span className="text-xs text-slate-300 font-semibold">• {city}</span>
        </div>
        <div className="flex items-center gap-3 text-[11px] telemetry-mono text-slate-400">
          <span className="text-sky-300">A: {slotA.date}</span>
          <span>vs</span>
          <span className="text-amber-300">B: {slotB.date}</span>
        </div>
      </div>

      {/* Interactive Visual Comparison Frame */}
      <div
        ref={containerRef}
        className="relative w-full h-72 md:h-96 rounded-xl overflow-hidden select-none cursor-ew-resize bg-black"
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerUp}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        role="slider"
        aria-label="Satellite imagery before and after comparison slider"
        aria-valuenow={sliderPosition}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        {/* Layer B (Underneath / Right side) */}
        <img
          src={slotB.imageUrl}
          alt={`Satellite imagery for ${city} on ${slotB.date}`}
          className="absolute inset-0 w-full h-full object-cover pointer-events-none"
          loading="lazy"
        />

        {/* Layer A (Top / Left side, clipped by slider position) */}
        <div
          className="absolute inset-0 overflow-hidden pointer-events-none"
          style={{ width: `${sliderPosition}%` }}
        >
          <img
            src={slotA.imageUrl}
            alt={`Satellite imagery for ${city} on ${slotA.date}`}
            className="absolute inset-0 w-full h-full object-cover max-w-none"
            style={{ width: containerRef.current ? `${containerRef.current.clientWidth}px` : '100%' }}
            loading="lazy"
          />
        </div>

        {/* Draggable Divider Line */}
        <div
          className="absolute top-0 bottom-0 w-1 bg-white shadow-[0_0_12px_rgba(255,255,255,0.8)] pointer-events-none"
          style={{ left: `${sliderPosition}%` }}
        >
          <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-8 h-8 rounded-full bg-white text-slate-900 font-bold flex items-center justify-center text-xs shadow-lg">
            ⇄
          </div>
        </div>

        {/* Slot A Pill */}
        <div className="absolute top-3 left-3 px-2.5 py-1 rounded-md bg-black/70 backdrop-blur-md border border-white/20 text-[10px] telemetry-mono text-white pointer-events-none">
          <span className="font-bold text-sky-400">SLOT A</span> • {slotA.date} ({slotA.sensor})
        </div>

        {/* Slot B Pill */}
        <div className="absolute top-3 right-3 px-2.5 py-1 rounded-md bg-black/70 backdrop-blur-md border border-white/20 text-[10px] telemetry-mono text-white pointer-events-none">
          <span className="font-bold text-amber-400">SLOT B</span> • {slotB.date} ({slotB.sensor})
        </div>
      </div>

      {/* Metadata & Legal Attribution */}
      <div className="flex flex-col gap-1 text-[10px] text-slate-400 telemetry-mono border-t border-slate-800 pt-2">
        <div className="flex flex-wrap justify-between gap-1">
          <span>Resolution: {slotA.resolutionM}m ({slotA.productName})</span>
          <span>{slotA.attribution}</span>
        </div>
        <div className="text-[9px] text-slate-400 leading-relaxed italic mt-1">
          ⚠️ {disclaimer}
        </div>
      </div>
    </div>
  );
}
