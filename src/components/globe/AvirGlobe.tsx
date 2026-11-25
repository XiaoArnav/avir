'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { X } from 'lucide-react';
import {
  GeographicObservationPoint,
  AqiStandard,
} from '@/services/geo/geographic-observation-adapter';
import {
  GlobeControls,
  EnvironmentalLayersState,
  EnvironmentalLayersStatusMap,
  EnvironmentalLayerStatusInfo,
} from './GlobeControls';
import { GlobeCityCard } from './GlobeCityCard';
import { AccessibleEarthFallback } from './AccessibleEarthFallback';
import type { CameraAction, CesiumTerrainLoadState } from './cesium/AvirCesiumGlobe';
import type { WindForecastResponse, WindVectorPoint } from '@/domain/wind-types';
import type { FirmsHotspot, FirmsStatusResponse } from '@/domain/firms-types';
import type { SatelliteComparisonPair } from '@/domain/imagery-types';
import {
  buildSatelliteComparison,
  getAvailableImageryDates,
  verifyImageryAvailability,
} from '@/services/environment/satellite-imagery-service';
import { SatelliteComparisonSlider } from '@/components/environment/SatelliteComparisonSlider';

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

export function mapFirmsStatusToLayerInfo(res: FirmsStatusResponse): EnvironmentalLayerStatusInfo {
  switch (res.status) {
    case 'active': {
      const obsUtc = res.latestObservationUtc ? ` • UTC ${res.latestObservationUtc.slice(11, 16)}` : '';
      return {
        state: 'live',
        detail: `${res.count} thermal ${res.count === 1 ? 'anomaly' : 'anomalies'}${obsUtc}`,
      };
    }
    case 'no_detections':
      return {
        state: 'no_detections',
        detail: '0 detections within 500 km (clouds/off-pass not excluded)',
      };
    case 'unconfigured':
      return {
        state: 'unconfigured',
        detail: 'FIRMS_MAP_KEY not configured on server',
      };
    case 'quota_exceeded':
      return {
        state: 'rate_limited',
        detail: 'NASA FIRMS rate limit reached',
      };
    case 'stale_cached':
      return {
        state: 'stale',
        detail: `${res.count} ${res.count === 1 ? 'cached anomaly' : 'cached anomalies'} (live feed unavailable)`,
      };
    case 'invalid_credentials':
      return {
        state: 'unavailable',
        detail: 'NASA FIRMS credential rejected',
      };
    case 'upstream_timeout':
    case 'malformed_csv':
    case 'upstream_error':
    default:
      return {
        state: 'unavailable',
        detail: res.message || 'NASA FIRMS telemetry unavailable',
      };
  }
}

export function mapWindStatusToLayerInfo(res: WindForecastResponse): EnvironmentalLayerStatusInfo {
  if (res.status === 'rate_limited') {
    return {
      state: 'rate_limited',
      detail: 'Wind forecast rate limit reached',
    };
  }
  if (!res.isAvailable || !Array.isArray(res.grid) || res.grid.length === 0) {
    return {
      state: 'unavailable',
      detail: res.unavailableReason || 'Wind vector telemetry unavailable',
    };
  }
  const speedText =
    res.cityWind && Number.isFinite(res.cityWind.speedKmh)
      ? `~${Math.round(res.cityWind.speedKmh)} km/h • `
      : '';
  if (res.status === 'stale_cached' || res.isStale) {
    return {
      state: 'stale',
      detail: `${speedText}Cached GFS vectors (${res.grid.length} probes)`,
    };
  }
  return {
    state: 'live',
    detail: `${speedText}${res.grid.length} GFS/Open-Meteo probes`,
  };
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
  const [engineMode, setEngineMode] = useState<'three' | 'cesium'>('cesium');
  const [isAutoRotating, setIsAutoRotating] = useState<boolean>(true);
  const [cameraAction, setCameraAction] = useState<CameraAction | null>(null);
  const [fallbackNotice, setFallbackNotice] = useState<string | null>(null);

  // Authoritative uncontrolled defaults reflect actual unverified availability until enabled
  const [internalLayers, setInternalLayers] = useState<EnvironmentalLayersState>({
    wind: false,
    fires: false,
    terrain: false,
    satelliteComparison: false,
  });

  const activeLayers: EnvironmentalLayersState = {
    wind: layers?.wind !== undefined ? layers.wind : internalLayers.wind,
    fires: layers?.fires !== undefined ? layers.fires : internalLayers.fires,
    terrain: layers?.terrain !== undefined ? layers.terrain : internalLayers.terrain,
    satelliteComparison:
      layers?.satelliteComparison !== undefined
        ? layers.satelliteComparison
        : internalLayers.satelliteComparison,
  };

  // Real runtime data & honest per-layer availability status
  const [windVectors, setWindVectors] = useState<WindVectorPoint[]>([]);
  const [windInfo, setWindInfo] = useState<EnvironmentalLayerStatusInfo>({ state: 'off' });

  const [fireHotspots, setFireHotspots] = useState<FirmsHotspot[]>([]);
  const [firesInfo, setFiresInfo] = useState<EnvironmentalLayerStatusInfo>({ state: 'off' });

  const [terrainLoadState, setTerrainLoadState] = useState<CesiumTerrainLoadState>('off');

  const [satelliteComparison, setSatelliteComparison] = useState<SatelliteComparisonPair | null>(null);
  const [satelliteError, setSatelliteError] = useState<string | null>(null);
  const [satelliteInfo, setSatelliteInfo] = useState<EnvironmentalLayerStatusInfo>({ state: 'off' });

  const windReqIdRef = useRef(0);
  const firesReqIdRef = useRef(0);
  const satelliteReqIdRef = useRef(0);

  const selectedPoint = points.find((p) => p.id === selectedPointId) || null;
  const activeCityPoint =
    points.find((p) => p.name.toLowerCase() === activeCityName?.toLowerCase()) ||
    selectedPoint ||
    points[0] ||
    null;

  const hasValidCoordinates =
    Boolean(activeCityPoint) &&
    Number.isFinite(activeCityPoint!.latitude) &&
    activeCityPoint!.latitude >= -90 &&
    activeCityPoint!.latitude <= 90 &&
    Number.isFinite(activeCityPoint!.longitude) &&
    activeCityPoint!.longitude >= -180 &&
    activeCityPoint!.longitude <= 180;

  const isLayerControlled = (layer: keyof EnvironmentalLayersState): boolean =>
    Boolean(
      layers &&
        Object.prototype.hasOwnProperty.call(layers, layer) &&
        layers[layer] !== undefined
    );

  const handleToggleLayer = (layer: keyof EnvironmentalLayersState) => {
    if (layer === 'terrain' && (!is3D || engineMode !== 'cesium')) {
      return;
    }
    if (layer === 'wind' && (!is3D || engineMode !== 'three')) {
      return;
    }
    if (layer === 'fires' && !is3D) {
      return;
    }

    if (!isLayerControlled(layer)) {
      setInternalLayers((prev) => ({
        ...prev,
        [layer]: !prev[layer],
      }));
    }
    onToggleLayer?.(layer);
  };

  // 1. Live Wind Vectors Connection (/api/environment/wind) — Three.js mode
  useEffect(() => {
    const reqId = ++windReqIdRef.current;

    if (!is3D || engineMode !== 'three') {
      setWindVectors([]);
      setWindInfo({
        state: 'unsupported',
        detail: is3D ? 'Three.js Engine Only' : 'Available in 3D Three.js Mode',
      });
      return;
    }

    if (!activeLayers.wind) {
      setWindVectors([]);
      setWindInfo({ state: 'off', detail: '10m GFS / Open-Meteo' });
      return;
    }

    if (!hasValidCoordinates || !activeCityPoint) {
      setWindVectors([]);
      setWindInfo({ state: 'unavailable', detail: 'No valid city coordinates' });
      return;
    }

    const controller = new AbortController();
    setWindInfo({ state: 'loading', detail: 'Fetching GFS wind vectors...' });

    const params = new URLSearchParams({
      lat: String(activeCityPoint.latitude),
      lng: String(activeCityPoint.longitude),
    });

    if (validAtUtc) {
      const parsedMs = Date.parse(validAtUtc);
      if (!Number.isNaN(parsedMs)) {
        const normalizedIso = new Date(parsedMs).toISOString();
        params.set('validTimeUtc', normalizedIso);
        params.set('hour', String(new Date(parsedMs).getUTCHours()));
      }
    } else if (Number.isInteger(selectedHour) && selectedHour >= 0 && selectedHour <= 23) {
      params.set('hour', String(selectedHour));
    }

    fetch(`/api/environment/wind?${params.toString()}`, { signal: controller.signal })
      .then(async (res) => {
        if (controller.signal.aborted || reqId !== windReqIdRef.current) return;
        if (res.status === 429) {
          setWindVectors([]);
          setWindInfo({ state: 'rate_limited', detail: 'Wind forecast rate limited' });
          return;
        }
        if (!res.ok) {
          setWindVectors([]);
          setWindInfo({ state: 'unavailable', detail: `Wind API returned HTTP ${res.status}` });
          return;
        }
        const data = (await res.json()) as WindForecastResponse;
        if (controller.signal.aborted || reqId !== windReqIdRef.current) return;
        const info = mapWindStatusToLayerInfo(data);
        setWindInfo(info);
        if (data.isAvailable && Array.isArray(data.grid) && data.grid.length > 0) {
          setWindVectors(data.grid);
        } else {
          setWindVectors([]);
        }
      })
      .catch((err) => {
        if (controller.signal.aborted || reqId !== windReqIdRef.current) return;
        if (err instanceof Error && err.name === 'AbortError') return;
        setWindVectors([]);
        setWindInfo({ state: 'unavailable', detail: 'Wind telemetry network error' });
      });

    return () => {
      controller.abort();
    };
  }, [
    is3D,
    engineMode,
    activeLayers.wind,
    hasValidCoordinates,
    activeCityPoint?.latitude,
    activeCityPoint?.longitude,
    validAtUtc,
    selectedHour,
  ]);

  // 2. NASA FIRMS Active-Fire Hotspots Connection (/api/environment/fires) — Both Three.js & Cesium
  useEffect(() => {
    const reqId = ++firesReqIdRef.current;

    if (!is3D) {
      setFireHotspots([]);
      setFiresInfo({ state: 'unsupported', detail: 'Available in 3D Globe Mode' });
      return;
    }

    if (!activeLayers.fires) {
      setFireHotspots([]);
      setFiresInfo({ state: 'off', detail: 'NASA FIRMS Thermal Anomalies' });
      return;
    }

    if (!hasValidCoordinates || !activeCityPoint) {
      setFireHotspots([]);
      setFiresInfo({ state: 'unavailable', detail: 'No valid city coordinates' });
      return;
    }

    const controller = new AbortController();
    setFiresInfo({ state: 'loading', detail: 'Querying NASA FIRMS NOAA-20 NRT...' });

    const params = new URLSearchParams({
      lat: String(activeCityPoint.latitude),
      lng: String(activeCityPoint.longitude),
      radiusKm: '500',
    });

    fetch(`/api/environment/fires?${params.toString()}`, { signal: controller.signal })
      .then(async (res) => {
        if (controller.signal.aborted || reqId !== firesReqIdRef.current) return;
        if (res.status === 429) {
          setFireHotspots([]);
          setFiresInfo({ state: 'rate_limited', detail: 'Fires API rate limit exceeded' });
          return;
        }
        if (!res.ok) {
          setFireHotspots([]);
          setFiresInfo({ state: 'unavailable', detail: `FIRMS API returned HTTP ${res.status}` });
          return;
        }
        const data = (await res.json()) as FirmsStatusResponse;
        if (controller.signal.aborted || reqId !== firesReqIdRef.current) return;
        const info = mapFirmsStatusToLayerInfo(data);
        setFiresInfo(info);
        if (
          data.isAvailable &&
          (data.status === 'active' || data.status === 'stale_cached') &&
          Array.isArray(data.hotspots)
        ) {
          setFireHotspots(data.hotspots);
        } else {
          setFireHotspots([]);
        }
      })
      .catch((err) => {
        if (controller.signal.aborted || reqId !== firesReqIdRef.current) return;
        if (err instanceof Error && err.name === 'AbortError') return;
        setFireHotspots([]);
        setFiresInfo({ state: 'unavailable', detail: 'NASA FIRMS network error' });
      });

    return () => {
      controller.abort();
    };
  }, [
    is3D,
    activeLayers.fires,
    hasValidCoordinates,
    activeCityPoint?.latitude,
    activeCityPoint?.longitude,
  ]);

  // 3. Reset terrain load state when switching out of Cesium mode
  useEffect(() => {
    if (!is3D || engineMode !== 'cesium' || !activeLayers.terrain) {
      setTerrainLoadState('off');
    }
  }, [is3D, engineMode, activeLayers.terrain]);

  // 4. NASA GIBS Satellite Comparison Assembly & DescribeDomains Availability Check
  useEffect(() => {
    const reqId = ++satelliteReqIdRef.current;

    if (!activeLayers.satelliteComparison) {
      setSatelliteComparison(null);
      setSatelliteError(null);
      setSatelliteInfo({ state: 'off', detail: 'NASA GIBS Reflectance' });
      return;
    }

    if (!hasValidCoordinates || !activeCityPoint) {
      setSatelliteComparison(null);
      setSatelliteError('Satellite imagery comparison requires valid active city coordinates.');
      setSatelliteInfo({ state: 'unavailable', detail: 'No valid city coordinates' });
      return;
    }

    let cancelled = false;

    try {
      const candidates = getAvailableImageryDates(7, { product: 'VIIRS' });
      const dateB = candidates[0]?.date;
      const dateA = candidates[candidates.length - 1]?.date;

      if (!dateA || !dateB) {
        setSatelliteComparison(null);
        setSatelliteError('No candidate NASA GIBS dates available.');
        setSatelliteInfo({ state: 'unavailable', detail: 'No candidate dates' });
        return;
      }

      const initialComparison = buildSatelliteComparison({
        city: activeCityPoint.name,
        latitude: activeCityPoint.latitude,
        longitude: activeCityPoint.longitude,
        dateA,
        dateB,
        productA: 'VIIRS',
        productB: 'VIIRS',
      });

      setSatelliteComparison(initialComparison);
      setSatelliteError(null);
      setSatelliteInfo({ state: 'unverified', detail: `${dateA} vs ${dateB} (unverified)` });

      void Promise.all([
        verifyImageryAvailability({
          product: 'VIIRS',
          date: dateA,
          bbox: initialComparison.coverageExtent,
        }),
        verifyImageryAvailability({
          product: 'VIIRS',
          date: dateB,
          bbox: initialComparison.coverageExtent,
        }),
      ]).then(([entryA, entryB]) => {
        if (cancelled || reqId !== satelliteReqIdRef.current) return;

        const updatedComparison = buildSatelliteComparison({
          city: activeCityPoint.name,
          latitude: activeCityPoint.latitude,
          longitude: activeCityPoint.longitude,
          dateA,
          dateB,
          productA: 'VIIRS',
          productB: 'VIIRS',
          availabilityA: entryA.availability,
          availabilityB: entryB.availability,
        });

        setSatelliteComparison(updatedComparison);

        if (entryA.availability === 'unavailable' || entryB.availability === 'unavailable') {
          setSatelliteInfo({
            state: 'unavailable',
            detail: `GIBS date unavailable (${dateA} / ${dateB})`,
          });
        } else if (
          entryA.availability === 'global_date_listed' &&
          entryB.availability === 'global_date_listed'
        ) {
          setSatelliteInfo({
            state: 'global_date_listed',
            detail: 'Global GIBS dates listed (local swath unverified)',
          });
        } else {
          setSatelliteInfo({
            state: 'unverified',
            detail: `${dateA} vs ${dateB} (unverified)`,
          });
        }
      });
    } catch (err) {
      setSatelliteComparison(null);
      const message =
        err instanceof Error ? err.message : 'Unable to construct NASA GIBS snapshot extent.';
      setSatelliteError(message);
      setSatelliteInfo({ state: 'unavailable', detail: message });
    }

    return () => {
      cancelled = true;
    };
  }, [
    activeLayers.satelliteComparison,
    hasValidCoordinates,
    activeCityPoint?.name,
    activeCityPoint?.latitude,
    activeCityPoint?.longitude,
  ]);

  // Allow Escape to close Satellite Comparison Panel cleanly without side effects
  useEffect(() => {
    if (!activeLayers.satelliteComparison) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleToggleLayer('satelliteComparison');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeLayers.satelliteComparison, is3D, engineMode]);

  const layerStatus: EnvironmentalLayersStatusMap = useMemo(() => {
    let terrainStatusInfo: EnvironmentalLayerStatusInfo;
    if (!is3D || engineMode !== 'cesium') {
      terrainStatusInfo = { state: 'unsupported', detail: 'Cesium Engine Only' };
    } else if (!activeLayers.terrain) {
      terrainStatusInfo = { state: 'off', detail: 'Re:Earth Quantized Mesh' };
    } else if (terrainLoadState === 'active') {
      terrainStatusInfo = { state: 'live', detail: 'Re:Earth Quantized Mesh active' };
    } else if (terrainLoadState === 'fallback') {
      terrainStatusInfo = { state: 'unavailable', detail: 'Terrain failed — ellipsoid active' };
    } else {
      terrainStatusInfo = { state: 'loading', detail: 'Loading Re:Earth terrain...' };
    }

    return {
      wind: windInfo,
      fires: firesInfo,
      terrain: terrainStatusInfo,
      satelliteComparison: satelliteInfo,
    };
  }, [is3D, engineMode, activeLayers.terrain, terrainLoadState, windInfo, firesInfo, satelliteInfo]);

  const handleZoomIn = () => {
    setCameraAction({ type: 'zoomIn', timestamp: Date.now() });
  };

  const handleZoomOut = () => {
    setCameraAction({ type: 'zoomOut', timestamp: Date.now() });
  };

  const handleResetView = () => {
    setIsAutoRotating(true);
    setCameraAction({ type: 'reset', timestamp: Date.now() });
  };

  const handleCesiumFallback = (reason: string) => {
    setEngineMode('three');
    setFallbackNotice(`Cesium unavailable (${reason}). Reverted to Three.js.`);
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
            isTerrainEnabled={activeLayers.terrain}
            isFiresEnabled={activeLayers.fires}
            fireHotspots={fireHotspots}
            onTerrainStatusChange={setTerrainLoadState}
            onFallbackToThree={handleCesiumFallback}
            className="w-full h-full"
          />
        ) : (
          <DynamicGlobeCanvas
            points={points}
            selectedPointId={selectedPointId}
            activeCityName={activeCityName}
            onSelectPoint={onSelectPoint}
            isAutoRotating={isAutoRotating}
            cameraAction={cameraAction}
            selectedHour={selectedHour}
            validAtUtc={validAtUtc}
            themeMode={themeMode}
            isWindEnabled={activeLayers.wind}
            windVectors={windVectors}
            isFiresEnabled={activeLayers.fires}
            fireHotspots={fireHotspots}
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

      {/* Floating NASA Satellite Comparison Overlay (when enabled) */}
      {activeLayers.satelliteComparison && (
        <div
          role="dialog"
          aria-modal="false"
          aria-label="NASA Satellite Imagery Comparison Panel"
          data-testid="satellite-comparison-panel"
          className="absolute inset-x-3 top-3 sm:inset-x-auto sm:right-4 sm:top-4 sm:w-[min(92vw,680px)] max-h-[85%] overflow-y-auto z-30 rounded-2xl bg-slate-950/95 border border-slate-700/70 shadow-2xl"
        >
          <div className="flex items-center justify-between px-4 py-2 border-b border-slate-800">
            <span className="text-[10px] font-bold telemetry-mono text-purple-300">
              SATELLITE IMAGERY COMPARISON OVERLAY
            </span>
            <button
              type="button"
              onClick={() => handleToggleLayer('satelliteComparison')}
              aria-label="Close satellite imagery comparison"
              className="p-1 rounded-md bg-slate-900 border border-slate-700 text-slate-300 hover:text-white hover:border-sky-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          {satelliteComparison ? (
            <SatelliteComparisonSlider
              comparison={satelliteComparison}
              className="rounded-t-none border-0 shadow-none"
            />
          ) : (
            <div
              role="status"
              data-testid="satellite-comparison-unavailable"
              className="p-5 text-white"
            >
              <div className="text-xs font-bold telemetry-mono text-rose-300">
                NASA SATELLITE IMAGERY COMPARISON UNAVAILABLE
              </div>
              <p className="mt-1.5 text-xs text-slate-300">
                {satelliteError ||
                  'Unable to assemble a valid NASA GIBS comparison snapshot for the selected region.'}
              </p>
            </div>
          )}
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
          layerStatus={layerStatus}
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
