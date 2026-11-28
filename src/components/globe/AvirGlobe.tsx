'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

const MemoizedGlobeControls = React.memo(GlobeControls);
import { GlobeCityCard } from './GlobeCityCard';
import { AccessibleEarthFallback } from './AccessibleEarthFallback';
import type { CameraAction, CesiumTerrainLoadState } from './cesium/AvirCesiumGlobe';
import type {
  GlobalWindManifest,
  GlobalWindModelId,
  GlobalWindOverlayKind,
  GlobalWindSnapshot,
  WindInspectionReading,
  WindSpeedUnit,
  WindVectorPoint,
} from '@/domain/wind-types';
import { inspectWindAtPoint } from '@/domain/wind-field';
import { fetchClientGlobalWindSnapshot } from '@/services/environment/global-wind-client';
import type { FirmsHotspot } from '@/domain/firms-types';
import type { SatelliteComparisonPair } from '@/domain/imagery-types';
import {
  buildSatelliteComparison,
  probeWvsRegionalCoverage,
  verifyImageryAvailability,
} from '@/services/environment/satellite-imagery-service';
import { SatelliteComparisonSlider } from '@/components/environment/SatelliteComparisonSlider';
import {
  type ActiveCityEnvironmentTarget,
  isValidGeographicCoordinate,
  resolveActiveCityEnvironmentTarget,
} from './globe-location-utils';
import {
  buildEnvironmentalLayerStatus,
  mapFirmsStatusToLayerInfo,
  mapGlobalWindSnapshotToLayerInfo,
  mapWindStatusToLayerInfo,
} from './globe-layer-status';
import {
  type LayerFetchResult,
  fetchActiveCityFirmsLayer,
  fetchActiveCityWindLayer,
} from './globe-layer-fetchers';
import { buildInitialSatelliteComparisonForTarget } from './globe-satellite-comparison';

export {
  isValidGeographicCoordinate,
  resolveActiveCityEnvironmentTarget,
  mapFirmsStatusToLayerInfo,
  mapGlobalWindSnapshotToLayerInfo,
  mapWindStatusToLayerInfo,
  fetchActiveCityWindLayer,
  fetchActiveCityFirmsLayer,
  buildInitialSatelliteComparisonForTarget,
};
export type { ActiveCityEnvironmentTarget, LayerFetchResult };

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
  activeCityLatitude?: number;
  activeCityLongitude?: number;
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
  activeCityLatitude,
  activeCityLongitude,
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

  const activeLayers: EnvironmentalLayersState = useMemo(
    () => ({
      wind: layers?.wind !== undefined ? layers.wind : internalLayers.wind,
      fires: layers?.fires !== undefined ? layers.fires : internalLayers.fires,
      terrain: layers?.terrain !== undefined ? layers.terrain : internalLayers.terrain,
      satelliteComparison:
        layers?.satelliteComparison !== undefined
          ? layers.satelliteComparison
          : internalLayers.satelliteComparison,
    }),
    [
      layers?.wind,
      layers?.fires,
      layers?.terrain,
      layers?.satelliteComparison,
      internalLayers,
    ]
  );

  // Real runtime data & honest per-layer availability status
  const [windVectors, setWindVectors] = useState<WindVectorPoint[]>([]);
  const [windSnapshot, setWindSnapshot] = useState<GlobalWindSnapshot | null>(null);
  const [windManifest, setWindManifest] = useState<GlobalWindManifest | null>(null);
  const [windModel, setWindModel] = useState<GlobalWindModelId>('gfs');
  const [windOverlay, setWindOverlay] = useState<GlobalWindOverlayKind>('none');
  const [windPaused, setWindPaused] = useState<boolean>(false);
  const [windSpeedUnit, setWindSpeedUnit] = useState<WindSpeedUnit>('km/h');
  const [inspectedWindCoords, setInspectedWindCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState<boolean>(false);
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

  const selectedPoint = useMemo(
    () => points.find((p) => p.id === selectedPointId) || null,
    [points, selectedPointId]
  );
  const activeCityTarget = useMemo(
    () =>
      resolveActiveCityEnvironmentTarget({
        activeCityName,
        activeCityLatitude,
        activeCityLongitude,
        points,
      }),
    [activeCityName, activeCityLatitude, activeCityLongitude, points]
  );

  const activeCityTargetRef = useRef(activeCityTarget);
  activeCityTargetRef.current = activeCityTarget;

  const windSpeedUnitRef = useRef(windSpeedUnit);
  windSpeedUnitRef.current = windSpeedUnit;

  const handleToggleLayer = useCallback(
    (layer: keyof EnvironmentalLayersState) => {
      if (layer === 'terrain' && (!is3D || engineMode !== 'cesium')) {
        return;
      }
      if (layer === 'wind' && !is3D) {
        return;
      }
      if (layer === 'fires' && !is3D) {
        return;
      }

      const isControlled = Boolean(
        layers &&
          Object.prototype.hasOwnProperty.call(layers, layer) &&
          layers[layer] !== undefined
      );
      if (!isControlled) {
        setInternalLayers((prev) => ({
          ...prev,
          [layer]: !prev[layer],
        }));
      }
      onToggleLayer?.(layer);
    },
    [is3D, engineMode, layers, onToggleLayer]
  );

  // Observe user reduced-motion preference safely
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(media.matches);
    const onChange = () => setPrefersReducedMotion(media.matches);
    media.addEventListener?.('change', onChange);
    return () => media.removeEventListener?.('change', onChange);
  }, []);

  // 1. Global GFS/IFS Wind Field Connection — shared across BOTH CesiumJS & Three.js
  // Switching Cesium <-> Three.js intentionally preserves windModel, windSnapshot, and state without re-downloading.
  useEffect(() => {
    const reqId = ++windReqIdRef.current;

    if (!is3D) {
      setWindVectors([]);
      setWindSnapshot(null);
      setWindManifest(null);
      setInspectedWindCoords(null);
      setWindInfo({
        state: 'unsupported',
        detail: 'Available in 3D Globe Mode',
      });
      return;
    }

    if (!activeLayers.wind) {
      setWindVectors([]);
      setWindSnapshot(null);
      setWindManifest(null);
      setInspectedWindCoords(null);
      setWindInfo({ state: 'off', detail: '10m GFS / ECMWF IFS Streamlines' });
      return;
    }

    const controller = new AbortController();
    const modelLabel = windModel === 'ifs' ? 'ECMWF IFS' : 'NOAA GFS';
    setWindInfo({ state: 'loading', detail: `Fetching ${modelLabel} global wind grid...` });

    void fetchClientGlobalWindSnapshot({
      model: windModel,
      overlay: windOverlay,
      validAtUtc,
      signal: controller.signal,
    }).then((result) => {
      if (result.aborted || controller.signal.aborted || reqId !== windReqIdRef.current) return;

      setWindManifest(result.manifest);
      if (result.snapshot) {
        setWindSnapshot(result.snapshot);
        setWindInfo(
          mapGlobalWindSnapshotToLayerInfo(
            result.snapshot,
            activeCityTargetRef.current,
            windSpeedUnitRef.current
          )
        );
      } else {
        setWindSnapshot(null);
        setWindInfo({
          state: 'unavailable',
          detail: result.error || result.manifest?.unavailableReason || 'Global wind forecast unavailable',
        });
      }
    });

    return () => {
      controller.abort();
    };
  }, [is3D, activeLayers.wind, windModel, windOverlay, validAtUtc]);

  // Recompute status speed display if active city or unit changes without refetching grid
  const activeTargetName = activeCityTarget?.name;
  const activeTargetLat = activeCityTarget?.latitude;
  const activeTargetLon = activeCityTarget?.longitude;

  useEffect(() => {
    if (!is3D || !activeLayers.wind || !windSnapshot) return;
    setWindInfo(
      mapGlobalWindSnapshotToLayerInfo(
        windSnapshot,
        activeCityTargetRef.current,
        windSpeedUnit
      )
    );
  }, [is3D, activeLayers.wind, windSnapshot, activeTargetLat, activeTargetLon, windSpeedUnit]);

  const windInspection: WindInspectionReading | null = useMemo(() => {
    if (!activeLayers.wind || !windSnapshot || !inspectedWindCoords) return null;
    return inspectWindAtPoint(
      windSnapshot,
      inspectedWindCoords.latitude,
      inspectedWindCoords.longitude,
      {
        speedUnits: windSpeedUnit,
        overlay: windOverlay,
      }
    );
  }, [activeLayers.wind, windSnapshot, inspectedWindCoords, windSpeedUnit, windOverlay]);

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

    const target = activeCityTargetRef.current;
    if (!target) {
      setFireHotspots([]);
      setFiresInfo({ state: 'unavailable', detail: 'Active city coordinates unavailable' });
      return;
    }

    const controller = new AbortController();
    setFiresInfo({ state: 'loading', detail: 'Querying NASA FIRMS NOAA-20 NRT...' });

    void fetchActiveCityFirmsLayer({
      target,
      radiusKm: 500,
      signal: controller.signal,
    }).then((result) => {
      if (result.aborted || controller.signal.aborted || reqId !== firesReqIdRef.current) return;
      setFiresInfo(result.info);
      setFireHotspots(result.data);
    });

    return () => {
      controller.abort();
    };
  }, [is3D, activeLayers.fires, activeTargetName, activeTargetLat, activeTargetLon]);

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

    const target = activeCityTargetRef.current;
    const initial = buildInitialSatelliteComparisonForTarget(target);
    setSatelliteComparison(initial.comparison);
    setSatelliteError(initial.error);
    setSatelliteInfo(initial.info);

    if (!target || !initial.comparison || !initial.dateA || !initial.dateB) {
      return;
    }

    const { dateA, dateB } = initial;
    const extent = initial.comparison.coverageExtent;
    let cancelled = false;

    void Promise.all([
      verifyImageryAvailability({
        product: 'VIIRS',
        date: dateA,
        bbox: extent,
      }),
      verifyImageryAvailability({
        product: 'VIIRS',
        date: dateB,
        bbox: extent,
      }),
    ]).then(async ([domainA, domainB]) => {
      if (cancelled || reqId !== satelliteReqIdRef.current) return;

      const [wvsA, wvsB] = await Promise.all([
        domainA.availability === 'unavailable'
          ? Promise.resolve(domainA)
          : probeWvsRegionalCoverage({ product: 'VIIRS', date: dateA, bbox: extent }),
        domainB.availability === 'unavailable'
          ? Promise.resolve(domainB)
          : probeWvsRegionalCoverage({ product: 'VIIRS', date: dateB, bbox: extent }),
      ]);
      if (cancelled || reqId !== satelliteReqIdRef.current) return;

      const resolveFinalEntry = (domainEntry: typeof domainA, wvsEntry: typeof wvsA) => {
        if (wvsEntry.availability === 'verified_regional' || wvsEntry.availability === 'unavailable') {
          return wvsEntry;
        }
        return domainEntry;
      };

      const entryA = resolveFinalEntry(domainA, wvsA);
      const entryB = resolveFinalEntry(domainB, wvsB);

      const updatedComparison = buildSatelliteComparison({
        city: target.name,
        latitude: target.latitude,
        longitude: target.longitude,
        dateA,
        dateB,
        productA: 'VIIRS',
        productB: 'VIIRS',
        availabilityA: entryA.availability,
        availabilityB: entryB.availability,
        verifiedDateA: entryA.verifiedObservationDate,
        verifiedDateB: entryB.verifiedObservationDate,
      });

      setSatelliteComparison(updatedComparison);

      if (entryA.availability === 'unavailable' || entryB.availability === 'unavailable') {
        setSatelliteInfo({
          state: 'unavailable',
          detail: `Imagery unavailable for bbox (${dateA} / ${dateB})`,
        });
      } else if (
        entryA.availability === 'verified_regional' &&
        entryB.availability === 'verified_regional'
      ) {
        setSatelliteInfo({
          state: 'live',
          detail: `${dateA} vs ${dateB} • Swath Verified`,
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

    return () => {
      cancelled = true;
    };
  }, [
    activeLayers.satelliteComparison,
    activeTargetName,
    activeTargetLat,
    activeTargetLon,
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
  }, [activeLayers.satelliteComparison, handleToggleLayer]);

  const layerStatus: EnvironmentalLayersStatusMap = useMemo(
    () =>
      buildEnvironmentalLayerStatus({
        is3D,
        engineMode,
        isTerrainEnabled: activeLayers.terrain,
        terrainLoadState,
        windInfo,
        firesInfo,
        satelliteInfo,
      }),
    [is3D, engineMode, activeLayers.terrain, terrainLoadState, windInfo, firesInfo, satelliteInfo]
  );

  const handleZoomIn = useCallback(() => {
    setCameraAction({ type: 'zoomIn', timestamp: Date.now() });
  }, []);

  const handleZoomOut = useCallback(() => {
    setCameraAction({ type: 'zoomOut', timestamp: Date.now() });
  }, []);

  const handleResetView = useCallback(() => {
    setIsAutoRotating(true);
    setCameraAction({ type: 'reset', timestamp: Date.now() });
  }, []);

  const handleCesiumFallback = useCallback((reason: string) => {
    setEngineMode('three');
    setFallbackNotice(`Cesium unavailable (${reason}). Reverted to Three.js.`);
    setTimeout(() => setFallbackNotice(null), 8000);
  }, []);

  const handleToggle3D = useCallback(() => {
    setIs3D((prev) => !prev);
  }, []);

  const handleToggleAutoRotate = useCallback(() => {
    setIsAutoRotating((prev) => !prev);
  }, []);

  const handleToggleEngine = useCallback(() => {
    setEngineMode((prev) => (prev === 'three' ? 'cesium' : 'three'));
  }, []);

  const handleToggleStandardFallback = useCallback(() => {
    if (onToggleStandard) onToggleStandard();
  }, [onToggleStandard]);

  const handleToggleWindPause = useCallback(() => {
    setWindPaused((prev) => !prev);
  }, []);

  const handleInspectActiveCityWind = useCallback(() => {
    if (
      activeCityTarget &&
      isValidGeographicCoordinate(activeCityTarget.latitude, activeCityTarget.longitude)
    ) {
      setInspectedWindCoords({
        latitude: activeCityTarget.latitude,
        longitude: activeCityTarget.longitude,
      });
    }
  }, [activeCityTarget]);

  const handleClearWindInspection = useCallback(() => {
    setInspectedWindCoords(null);
  }, []);

  const windControls = useMemo(
    () => ({
      model: windModel,
      onChangeModel: setWindModel,
      overlay: windOverlay,
      onChangeOverlay: setWindOverlay,
      paused: windPaused,
      onTogglePause: handleToggleWindPause,
      speedUnit: windSpeedUnit,
      onChangeSpeedUnit: setWindSpeedUnit,
      prefersReducedMotion,
      manifest: windManifest,
      inspection: windInspection,
      onInspectActiveCity: handleInspectActiveCityWind,
      onClearInspection: handleClearWindInspection,
    }),
    [
      windModel,
      windOverlay,
      windPaused,
      handleToggleWindPause,
      windSpeedUnit,
      prefersReducedMotion,
      windManifest,
      windInspection,
      handleInspectActiveCityWind,
      handleClearWindInspection,
    ]
  );

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
            isWindEnabled={activeLayers.wind}
            windSnapshot={windSnapshot}
            windOverlay={windOverlay}
            windPaused={windPaused}
            onInspectWindCoords={setInspectedWindCoords}
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
            windSnapshot={windSnapshot}
            windOverlay={windOverlay}
            windPaused={windPaused}
            onInspectWindCoords={setInspectedWindCoords}
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
          className="absolute inset-x-3 top-3 sm:inset-x-auto sm:right-4 sm:top-4 sm:w-[min(92vw,680px)] max-h-[85%] overflow-y-auto z-40 rounded-2xl bg-slate-950/95 border border-slate-700/70 shadow-2xl"
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

      {/* Floating Clicked/Inspected Global Wind Readout (when active outside popup) */}
      {activeLayers.wind && windInspection && (
        <aside
          aria-label="Global wind point inspection"
          data-testid="globe-wind-inspection-badge"
          className="hidden sm:flex absolute bottom-36 left-3 sm:left-6 z-20 max-w-xs flex-col gap-0.5 rounded-xl bg-slate-950/90 backdrop-blur-md border border-sky-500/35 px-3 py-2 text-[10px] text-slate-200 telemetry-mono shadow-xl"
        >
          <div className="flex items-center justify-between gap-3">
            <span className="font-bold text-sky-300">
              WIND @ {Math.abs(windInspection.latitude).toFixed(2)}°{windInspection.latitude < 0 ? 'S' : 'N'},{' '}
              {Math.abs(windInspection.longitude).toFixed(2)}°{windInspection.longitude < 0 ? 'W' : 'E'}
            </span>
            <button
              type="button"
              aria-label="Dismiss wind point inspection"
              onClick={() => setInspectedWindCoords(null)}
              className="text-slate-400 hover:text-white"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
          <div>
            <strong>{windInspection.speedDisplay} {windInspection.speedUnits}</strong>
            {' · '}
            {windInspection.isCalm
              ? 'Calm'
              : `From ${windInspection.compassPoint} (${windInspection.fromDirectionDeg}°)`}
          </div>
          <div className="text-[9px] text-slate-400">
            U: {windInspection.u} m/s · V: {windInspection.v} m/s · {windInspection.model.toUpperCase()}
            {windInspection.scalarValue !== null && windInspection.scalarUnits
              ? ` · ${windInspection.scalarValue} ${windInspection.scalarUnits}`
              : ''}
          </div>
        </aside>
      )}

      {/* Floating Bottom Globe Controls */}
      <div className="absolute bottom-20 right-3 sm:bottom-20 sm:right-6 z-30 max-w-[calc(100vw-1.5rem)]">
        <MemoizedGlobeControls
          is3D={is3D}
          onToggle3D={handleToggle3D}
          isAutoRotating={isAutoRotating}
          onToggleAutoRotate={handleToggleAutoRotate}
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
          onResetView={handleResetView}
          standard={standard}
          onToggleStandard={handleToggleStandardFallback}
          engineMode={engineMode}
          onToggleEngine={handleToggleEngine}
          layers={activeLayers}
          layerStatus={layerStatus}
          onToggleLayer={handleToggleLayer}
          windControls={windControls}
        />
      </div>

      {/* Corner HUD Decorators */}
      <div className="absolute top-3 right-4 pointer-events-none text-[10px] text-ink-faint dark:text-sky-300/40 telemetry-mono hidden sm:block">
        3D ORBITAL TELEMETRY // GL-ES 3.0
      </div>
    </div>
  );
}
