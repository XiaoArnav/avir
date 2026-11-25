'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  ImageryAvailabilityState,
  SatelliteComparisonPair,
  SatelliteImageSlot,
} from '@/domain/imagery-types';

export interface SatelliteComparisonSliderProps {
  comparison: SatelliteComparisonPair;
  initialPosition?: number;
  className?: string;
}

export type SlotLoadStatus = 'loading' | 'loaded' | 'failed' | 'unavailable';

const IMAGE_LOAD_TIMEOUT_MS = 15_000;

export function clampSliderPct(value: number): number {
  if (!Number.isFinite(value)) return 50;
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function deriveInitialLoadStatus(slot: SatelliteImageSlot): SlotLoadStatus {
  if (slot.availability === 'unavailable' || !slot.imageUrl) {
    return 'unavailable';
  }
  return 'loading';
}

export function reconcileSlotLoadStatus(
  slot: SatelliteImageSlot,
  prevUrl: string | null,
  prevStatus: SlotLoadStatus,
  imgEl: { complete: boolean; naturalWidth: number; getAttribute: (name: string) => string | null } | null
): SlotLoadStatus {
  if (slot.availability === 'unavailable' || !slot.imageUrl) {
    return 'unavailable';
  }
  if (imgEl && imgEl.getAttribute('src') === slot.imageUrl && imgEl.complete) {
    return imgEl.naturalWidth > 0 ? 'loaded' : 'failed';
  }
  // Metadata-only upgrade (e.g. 'unverified' -> 'verified_regional') for the exact same imageUrl
  // must preserve an already-loaded image instead of re-arming a 15s load timeout.
  if (prevUrl === slot.imageUrl && prevStatus === 'loaded') {
    return 'loaded';
  }
  return 'loading';
}

export function computeSliderPercentFromPointer(
  clientX: number,
  rect: { left: number; width: number }
): number | null {
  if (!Number.isFinite(clientX) || !Number.isFinite(rect.left) || !Number.isFinite(rect.width) || rect.width <= 0) {
    return null;
  }
  const x = clientX - rect.left;
  return clampSliderPct((x / rect.width) * 100);
}

export function applySliderKeyAction(
  currentPct: number,
  key: string
): { nextPct: number; handled: boolean } {
  if (key === 'ArrowLeft' || key === 'ArrowDown') {
    return { nextPct: clampSliderPct(currentPct - 5), handled: true };
  }
  if (key === 'ArrowRight' || key === 'ArrowUp') {
    return { nextPct: clampSliderPct(currentPct + 5), handled: true };
  }
  if (key === 'Home') {
    return { nextPct: 0, handled: true };
  }
  if (key === 'End') {
    return { nextPct: 100, handled: true };
  }
  return { nextPct: currentPct, handled: false };
}

export function formatAvailabilityBadge(
  availability: ImageryAvailabilityState,
  loadStatus: SlotLoadStatus
): { label: string; toneClass: string } {
  if (loadStatus === 'failed') {
    return { label: 'IMAGE LOAD FAILED', toneClass: 'text-rose-300 border-rose-500/40 bg-rose-950/70' };
  }
  if (loadStatus === 'unavailable' || availability === 'unavailable') {
    return { label: 'UNAVAILABLE', toneClass: 'text-rose-300 border-rose-500/40 bg-rose-950/70' };
  }
  if (loadStatus === 'loading') {
    return { label: 'LOADING', toneClass: 'text-sky-300 border-sky-500/40 bg-slate-900/80' };
  }
  if (availability === 'verified_regional') {
    return { label: 'REGIONAL COVERAGE VERIFIED', toneClass: 'text-emerald-300 border-emerald-500/40 bg-emerald-950/70' };
  }
  if (availability === 'global_date_listed') {
    return { label: 'GLOBAL LAYER DATE LISTED', toneClass: 'text-sky-300 border-sky-500/40 bg-sky-950/70' };
  }
  if (availability === 'candidate') {
    return { label: 'CANDIDATE DATE (UNVERIFIED)', toneClass: 'text-amber-300 border-amber-500/40 bg-amber-950/70' };
  }
  return { label: 'AVAILABILITY UNKNOWN', toneClass: 'text-amber-300 border-amber-500/40 bg-amber-950/70' };
}

export function resolveComparisonBannerState(
  slotA: SatelliteImageSlot,
  slotB: SatelliteImageSlot,
  statusA: SlotLoadStatus,
  statusB: SlotLoadStatus
): { hasFailure: boolean; bothLoaded: boolean; message: string } {
  const aFailed = statusA === 'failed' || statusA === 'unavailable';
  const bFailed = statusB === 'failed' || statusB === 'unavailable';
  const hasFailure = aFailed || bFailed;
  const bothLoaded = statusA === 'loaded' && statusB === 'loaded';

  if (hasFailure) {
    const parts: string[] = [];
    if (aFailed) parts.push(`Slot A (${slotA.date}) ${statusA}`);
    if (bFailed) parts.push(`Slot B (${slotB.date}) ${statusB}`);
    return {
      hasFailure: true,
      bothLoaded: false,
      message: `Comparison incomplete — ${parts.join(' and ')}.`,
    };
  }

  if (bothLoaded) {
    if (slotA.availability === 'verified_regional' && slotB.availability === 'verified_regional') {
      return {
        hasFailure: false,
        bothLoaded: true,
        message: 'Both NASA GIBS regional observations loaded and verified (cloud cover not excluded).',
      };
    }
    if (
      (slotA.availability === 'global_date_listed' || slotA.availability === 'verified_regional') &&
      (slotB.availability === 'global_date_listed' || slotB.availability === 'verified_regional')
    ) {
      return {
        hasFailure: false,
        bothLoaded: true,
        message:
          'Snapshots loaded (global layer dates listed in NASA GIBS; local swath coverage and acquisition dates over this city remain unverified).',
      };
    }
    return {
      hasFailure: false,
      bothLoaded: true,
      message: 'Snapshots loaded; regional GIBS availability and city acquisition dates remain unverified.',
    };
  }

  return {
    hasFailure: false,
    bothLoaded: false,
    message: 'Loading NASA GIBS satellite comparison frames...',
  };
}

export function SatelliteComparisonSlider({
  comparison,
  initialPosition = 50,
  className = '',
}: SatelliteComparisonSliderProps) {
  const { slotA, slotB, city, coverageExtent, crs, disclaimer } = comparison;

  const [sliderPosition, setSliderPosition] = useState<number>(() => clampSliderPct(initialPosition));
  const [statusA, setStatusA] = useState<SlotLoadStatus>(() => deriveInitialLoadStatus(slotA));
  const [statusB, setStatusB] = useState<SlotLoadStatus>(() => deriveInitialLoadStatus(slotB));

  const containerRef = useRef<HTMLDivElement>(null);
  const imgARef = useRef<HTMLImageElement>(null);
  const imgBRef = useRef<HTMLImageElement>(null);
  const prevUrlARef = useRef<string | null>(slotA.imageUrl);
  const prevUrlBRef = useRef<string | null>(slotB.imageUrl);
  const isDraggingRef = useRef<boolean>(false);
  const activePointerIdRef = useRef<number | null>(null);

  // Sync loading states when slot URL or availability changes without clobbering already-loaded frames
  useEffect(() => {
    const nextA = reconcileSlotLoadStatus(slotA, prevUrlARef.current, statusA, imgARef.current);
    prevUrlARef.current = slotA.imageUrl;
    setStatusA(nextA);
    if (nextA !== 'loading') return;

    const timer = setTimeout(() => {
      setStatusA((prev) => (prev === 'loading' ? 'failed' : prev));
    }, IMAGE_LOAD_TIMEOUT_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slotA.imageUrl, slotA.availability, slotA.date, slotA.productId]);

  useEffect(() => {
    const nextB = reconcileSlotLoadStatus(slotB, prevUrlBRef.current, statusB, imgBRef.current);
    prevUrlBRef.current = slotB.imageUrl;
    setStatusB(nextB);
    if (nextB !== 'loading') return;

    const timer = setTimeout(() => {
      setStatusB((prev) => (prev === 'loading' ? 'failed' : prev));
    }, IMAGE_LOAD_TIMEOUT_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slotB.imageUrl, slotB.availability, slotB.date, slotB.productId]);

  // Global release guard so releasing outside the slider never leaves dragging active
  useEffect(() => {
    const stopGlobalDrag = () => {
      isDraggingRef.current = false;
      activePointerIdRef.current = null;
    };
    window.addEventListener('pointerup', stopGlobalDrag);
    window.addEventListener('pointercancel', stopGlobalDrag);
    return () => {
      window.removeEventListener('pointerup', stopGlobalDrag);
      window.removeEventListener('pointercancel', stopGlobalDrag);
    };
  }, []);

  const updateSliderFromClientX = (clientX: number) => {
    if (!containerRef.current) return;
    const pct = computeSliderPercentFromPointer(
      clientX,
      containerRef.current.getBoundingClientRect()
    );
    if (pct !== null) {
      setSliderPosition(pct);
    }
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    isDraggingRef.current = true;
    activePointerIdRef.current = e.pointerId;
    try {
      e.currentTarget.setPointerCapture?.(e.pointerId);
    } catch {
      // Ignore synthetic event environments without pointer capture support
    }
    updateSliderFromClientX(e.clientX);
  };

  const stopDragging = (e?: React.PointerEvent<HTMLDivElement>) => {
    isDraggingRef.current = false;
    const capturedId = activePointerIdRef.current;
    activePointerIdRef.current = null;
    if (e && capturedId !== null) {
      try {
        if (e.currentTarget.hasPointerCapture?.(capturedId)) {
          e.currentTarget.releasePointerCapture?.(capturedId);
        }
      } catch {
        // Ignore synthetic release errors
      }
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current) return;
    if (activePointerIdRef.current !== null && e.pointerId !== activePointerIdRef.current) return;
    updateSliderFromClientX(e.clientX);
  };

  const handlePointerLeave = (e: React.PointerEvent<HTMLDivElement>) => {
    const isCaptured =
      activePointerIdRef.current !== null &&
      Boolean(e.currentTarget.hasPointerCapture?.(activePointerIdRef.current));
    if (!isCaptured) {
      isDraggingRef.current = false;
      activePointerIdRef.current = null;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const res = applySliderKeyAction(sliderPosition, e.key);
    if (res.handled) {
      e.preventDefault();
      setSliderPosition(res.nextPct);
    }
  };

  const badgeA = formatAvailabilityBadge(slotA.availability, statusA);
  const badgeB = formatAvailabilityBadge(slotB.availability, statusB);
  const banner = resolveComparisonBannerState(slotA, slotB, statusA, statusB);
  const combinedAttribution =
    slotA.attribution === slotB.attribution
      ? slotA.attribution
      : `${slotA.attribution} | ${slotB.attribution}`;

  const renderSlotUnavailable = (slotLabel: string, slot: SatelliteImageSlot, status: SlotLoadStatus) => (
    <div
      role="status"
      data-testid={`slot-${slotLabel.toLowerCase()}-fallback`}
      className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/95 px-6 text-center text-slate-200"
    >
      <span className="text-xs font-bold telemetry-mono text-rose-300">
        {`SLOT ${slotLabel} IMAGERY ${status === 'unavailable' ? 'UNAVAILABLE' : 'FAILED TO LOAD'}`}
      </span>
      <span className="mt-1 text-[11px] text-slate-300 telemetry-mono">
        {`Requested Date: ${slot.date} • ${slot.productName}`}
      </span>
      <span className="mt-1 max-w-md text-[10px] text-slate-400">
        {status === 'unavailable'
          ? slot.availabilityNote
          : `NASA GIBS snapshot request for ${slot.date} did not return a valid image. No replacement date or synthetic imagery is displayed.`}
      </span>
      <span className="mt-2 text-[9px] text-slate-500 telemetry-mono">{slot.attribution}</span>
    </div>
  );

  return (
    <div className={`flex flex-col gap-3 rounded-2xl bg-slate-900/90 border border-slate-700/60 p-4 text-white shadow-xl ${className}`}>
      {/* Header with City & Requested Dates */}
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

      {/* Explicit Comparison Status Banner */}
      <div
        role="status"
        aria-live="polite"
        data-testid="comparison-status-banner"
        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-1.5 text-[10px] telemetry-mono"
      >
        <span className={banner.hasFailure ? 'text-rose-300' : banner.bothLoaded ? 'text-slate-200' : 'text-sky-300'}>
          {banner.message}
        </span>
        <span className="text-slate-400">
          Extent ({crs}): {coverageExtent.south.toFixed(2)}°,{coverageExtent.west.toFixed(2)}° to{' '}
          {coverageExtent.north.toFixed(2)}°,{coverageExtent.east.toFixed(2)}°
        </span>
      </div>

      {/* Interactive Visual Comparison Frame — Identical Full-Frame Alignment via clip-path */}
      <div
        ref={containerRef}
        data-testid="comparison-slider-viewport"
        className="relative w-full h-72 md:h-96 rounded-xl overflow-hidden select-none touch-none cursor-ew-resize bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
        onPointerDown={handlePointerDown}
        onPointerUp={stopDragging}
        onPointerCancel={stopDragging}
        onLostPointerCapture={stopDragging}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        role="slider"
        aria-label="Satellite imagery before and after comparison slider"
        aria-valuenow={sliderPosition}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuetext={`${sliderPosition}% Slot A (${slotA.date}, ${slotA.productName}) versus ${100 - sliderPosition}% Slot B (${slotB.date}, ${slotB.productName})`}
      >
        {/* Layer B (Full-frame right/base layer) */}
        <div className="absolute inset-0 w-full h-full pointer-events-none" data-testid="comparison-layer-b">
          {slotB.imageUrl && statusB !== 'unavailable' && statusB !== 'failed' ? (
            <img
              ref={imgBRef}
              src={slotB.imageUrl}
              alt={`Satellite imagery for ${city} on requested date ${slotB.date} (${slotB.productName})`}
              className="absolute inset-0 w-full h-full object-cover pointer-events-none"
              onLoad={() => setStatusB('loaded')}
              onError={() => setStatusB('failed')}
            />
          ) : (
            renderSlotUnavailable('B', slotB, statusB)
          )}
          {statusB === 'loading' && (
            <div
              data-testid="slot-b-loading"
              className="absolute inset-0 flex items-center justify-center bg-slate-950/75 text-xs telemetry-mono text-amber-300"
            >
              Loading Slot B ({slotB.date})...
            </div>
          )}
        </div>

        {/* Layer A (Identical full-frame geometry clipped cleanly by sliderPosition; zero width scaling) */}
        <div
          className="absolute inset-0 w-full h-full overflow-hidden pointer-events-none"
          data-testid="comparison-layer-a"
          style={{ clipPath: `inset(0 ${100 - sliderPosition}% 0 0)` }}
        >
          {slotA.imageUrl && statusA !== 'unavailable' && statusA !== 'failed' ? (
            <img
              ref={imgARef}
              src={slotA.imageUrl}
              alt={`Satellite imagery for ${city} on requested date ${slotA.date} (${slotA.productName})`}
              className="absolute inset-0 w-full h-full object-cover pointer-events-none"
              onLoad={() => setStatusA('loaded')}
              onError={() => setStatusA('failed')}
            />
          ) : (
            renderSlotUnavailable('A', slotA, statusA)
          )}
          {statusA === 'loading' && (
            <div
              data-testid="slot-a-loading"
              className="absolute inset-0 flex items-center justify-center bg-slate-950/75 text-xs telemetry-mono text-sky-300"
            >
              Loading Slot A ({slotA.date})...
            </div>
          )}
        </div>

        {/* Draggable Divider Line */}
        <div
          className="absolute top-0 bottom-0 w-1 bg-white shadow-[0_0_12px_rgba(255,255,255,0.8)] pointer-events-none"
          data-testid="comparison-divider"
          style={{ left: `${sliderPosition}%` }}
        >
          <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-8 h-8 rounded-full bg-white text-slate-900 font-bold flex items-center justify-center text-xs shadow-lg">
            ⇄
          </div>
        </div>

        {/* Slot A Pill */}
        <div className="absolute top-3 left-3 flex flex-col gap-1 pointer-events-none">
          <div className="px-2.5 py-1 rounded-md bg-black/75 backdrop-blur-md border border-white/20 text-[10px] telemetry-mono text-white">
            <span className="font-bold text-sky-400">SLOT A</span> • Req: {slotA.date} ({slotA.sensor})
          </div>
          <span className={`self-start px-2 py-0.5 rounded border text-[9px] telemetry-mono ${badgeA.toneClass}`}>
            {badgeA.label}
          </span>
        </div>

        {/* Slot B Pill */}
        <div className="absolute top-3 right-3 flex flex-col items-end gap-1 pointer-events-none">
          <div className="px-2.5 py-1 rounded-md bg-black/75 backdrop-blur-md border border-white/20 text-[10px] telemetry-mono text-white">
            <span className="font-bold text-amber-400">SLOT B</span> • Req: {slotB.date} ({slotB.sensor})
          </div>
          <span className={`px-2 py-0.5 rounded border text-[9px] telemetry-mono ${badgeB.toneClass}`}>
            {badgeB.label}
          </span>
        </div>
      </div>

      {/* Metadata, Provenance & Legal Attribution */}
      <div className="flex flex-col gap-1 text-[10px] text-slate-400 telemetry-mono border-t border-slate-800 pt-2">
        <div className="flex flex-wrap justify-between gap-2">
          <span>
            A: {slotA.resolutionDescription} • {slotA.measurementType}
            {slotA.verifiedAcquisitionDate
              ? ` • Verified acquisition: ${slotA.verifiedAcquisitionDate}`
              : ' • Actual acquisition date: Unverified'}
          </span>
          <span>{combinedAttribution}</span>
        </div>
        <div className="flex flex-wrap justify-between gap-2 text-slate-400/90">
          <span>
            B: {slotB.resolutionDescription} • {slotB.measurementType}
            {slotB.verifiedAcquisitionDate
              ? ` • Verified acquisition: ${slotB.verifiedAcquisitionDate}`
              : ' • Actual acquisition date: Unverified'}
          </span>
        </div>
        <div className="text-[9px] text-slate-400 leading-relaxed italic mt-1">
          ⚠️ {disclaimer}
        </div>
      </div>
    </div>
  );
}
