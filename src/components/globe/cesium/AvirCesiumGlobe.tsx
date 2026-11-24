'use client';

import React, { useEffect, useRef, useState, useTransition } from 'react';
import type { GeographicObservationPoint, AqiStandard } from '@/services/geo/geographic-observation-adapter';

export type ViewerLifecycle = 'idle' | 'initializing' | 'ready' | 'failed' | 'destroyed';

export interface CameraAction {
  type: 'zoomIn' | 'zoomOut' | 'reset';
  timestamp: number;
}

export interface AvirCesiumGlobeProps {
  points: GeographicObservationPoint[];
  selectedPointId?: string | null;
  activeCityName?: string;
  onSelectPoint: (point: GeographicObservationPoint) => void;
  onSetActiveCity?: (point: GeographicObservationPoint) => void;
  standard?: AqiStandard;
  validAtUtc?: string | null;
  themeMode?: 'dark' | 'light';
  className?: string;
  // Dynamic controls & lifecycle signals
  isAutoRotating?: boolean;
  cameraAction?: CameraAction | null;
  onReady?: () => void;
  onFallbackToThree?: (reason: string) => void;
}

export function AvirCesiumGlobe({
  points,
  selectedPointId,
  activeCityName,
  onSelectPoint,
  onSetActiveCity,
  standard = 'cpcb',
  validAtUtc,
  themeMode = 'dark',
  className = '',
  isAutoRotating = true,
  cameraAction = null,
  onReady,
  onFallbackToThree,
}: AvirCesiumGlobeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [lifecycle, setLifecycle] = useState<ViewerLifecycle>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Mutable refs to prevent stale closures inside Cesium asynchronous callbacks and event listeners
  const viewerRef = useRef<{
    viewer: any;
    Cesium: any;
    handler: any;
    removeTickListener?: () => void;
  } | null>(null);

  const onSelectPointRef = useRef(onSelectPoint);
  onSelectPointRef.current = onSelectPoint;

  const onSetActiveCityRef = useRef(onSetActiveCity);
  onSetActiveCityRef.current = onSetActiveCity;

  const isAutoRotatingRef = useRef(isAutoRotating);
  isAutoRotatingRef.current = isAutoRotating;

  const pointsRef = useRef(points);
  pointsRef.current = points;

  const isUserInteractingRef = useRef(false);
  const entitiesMapRef = useRef<Map<string, any>>(new Map());

  // Main Cesium Viewer Lifecycle Effect (Mount & StrictMode clean initialization)
  useEffect(() => {
    let isMounted = true;

    async function initCesium() {
      if (!containerRef.current) return;
      setLifecycle('initializing');

      try {
        // 1. Configure Cesium static assets base URL before importing modules
        if (typeof window !== 'undefined') {
          (window as any).CESIUM_BASE_URL = '/cesium';
        }

        // 2. Ensure Cesium widgets stylesheet is loaded
        if (typeof document !== 'undefined' && !document.getElementById('cesium-widgets-css')) {
          const link = document.createElement('link');
          link.id = 'cesium-widgets-css';
          link.rel = 'stylesheet';
          link.href = '/cesium/Widgets/widgets.css';
          document.head.appendChild(link);
        }

        // 3. Dynamically import Cesium on the client
        const Cesium = await import('cesium');

        if (!isMounted || !containerRef.current) return;

        // 4. Clean container of any stale elements from previous rapid StrictMode mounts
        while (containerRef.current.firstChild) {
          containerRef.current.removeChild(containerRef.current.firstChild);
        }

        // 5. Licensed satellite imagery provider (Esri World Imagery with OSM fallback)
        let baseLayer: any;
        try {
          const esriProvider = await Cesium.ArcGisMapServerImageryProvider.fromUrl(
            'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer',
            {
              credit:
                'Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community',
              enablePickFeatures: false,
            }
          );
          baseLayer = new Cesium.ImageryLayer(esriProvider);
        } catch {
          const osmProvider = new Cesium.OpenStreetMapImageryProvider({
            url: 'https://tile.openstreetmap.org/',
            credit: '© OpenStreetMap contributors',
          });
          baseLayer = new Cesium.ImageryLayer(osmProvider);
        }

        // 6. Remove unnecessary Cesium ion branding since no Cesium ion services are used at runtime
        try {
          (Cesium.CreditDisplay as any).cesiumCredit = undefined;
        } catch {
          // Fallback handled by scoped styling
        }

        // 7. Initialize streamlined Cesium Viewer tailored for Avir aerospace UI
        const viewer = new Cesium.Viewer(containerRef.current, {
          animation: false,
          baseLayerPicker: false,
          fullscreenButton: false,
          geocoder: false,
          homeButton: false,
          infoBox: false,
          sceneModePicker: false,
          selectionIndicator: false,
          timeline: false,
          navigationHelpButton: false,
          baseLayer,
          skyAtmosphere: new Cesium.SkyAtmosphere(),
          contextOptions: {
            webgl: {
              alpha: true,
              preserveDrawingBuffer: true,
              powerPreference: 'high-performance',
            },
          },
        });

        // 7. Planetary Lighting & Scene Styling
        viewer.scene.globe.enableLighting = true;
        viewer.scene.globe.depthTestAgainstTerrain = true;
        viewer.scene.backgroundColor = Cesium.Color.fromCssColorString(
          themeMode === 'light' ? '#0F172A' : '#030712'
        );

        // 8. Initial Camera Orientation over Active City or Default Coordinates (India / Asia)
        const currentPoints = pointsRef.current;
        const initialPoint = currentPoints.find(
          (p) => p.name.toLowerCase() === activeCityName?.toLowerCase()
        ) || currentPoints[0];

        const initialLon = initialPoint?.longitude ?? 77.5946;
        const initialLat = initialPoint?.latitude ?? 12.9716;

        viewer.camera.setView({
          destination: Cesium.Cartesian3.fromDegrees(initialLon, initialLat, 8500000),
          orientation: {
            heading: Cesium.Math.toRadians(0),
            pitch: Cesium.Math.toRadians(-85),
            roll: 0,
          },
        });

        // 9. Auto-rotation loop linked to clock tick with drag suspension
        const onTick = () => {
          if (isAutoRotatingRef.current && !isUserInteractingRef.current) {
            viewer.scene.camera.rotate(Cesium.Cartesian3.UNIT_Z, -0.0006);
          }
        };
        viewer.clock.onTick.addEventListener(onTick);

        // 10. Screen-space interaction handler
        const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);

        // Track user interaction to avoid camera fighting during drag / pinch
        handler.setInputAction(() => {
          isUserInteractingRef.current = true;
        }, Cesium.ScreenSpaceEventType.LEFT_DOWN);

        handler.setInputAction(() => {
          isUserInteractingRef.current = false;
        }, Cesium.ScreenSpaceEventType.LEFT_UP);

        handler.setInputAction(() => {
          isUserInteractingRef.current = true;
        }, Cesium.ScreenSpaceEventType.PINCH_START);

        handler.setInputAction(() => {
          isUserInteractingRef.current = false;
        }, Cesium.ScreenSpaceEventType.PINCH_END);

        // Entity picking with EllipsoidalOccluder to completely prevent back-side horizon picking
        handler.setInputAction((click: any) => {
          const pickedObject = viewer.scene.pick(click.position);
          if (Cesium.defined(pickedObject) && pickedObject.id && pickedObject.id.properties) {
            const pointData = pickedObject.id.properties.pointData?.getValue();
            if (pointData) {
              // Verify point is on the visible front hemisphere of the Earth
              const entityCartesian = Cesium.Cartesian3.fromDegrees(
                pointData.longitude,
                pointData.latitude,
                0
              );
              const occluder = new Cesium.EllipsoidalOccluder(
                viewer.scene.globe.ellipsoid,
                viewer.camera.position
              );

              if (occluder.isPointVisible(entityCartesian)) {
                onSelectPointRef.current(pointData);
              }
            }
          }
        }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

        viewerRef.current = {
          viewer,
          Cesium,
          handler,
          removeTickListener: () => viewer.clock.onTick.removeEventListener(onTick),
        };

        if (isMounted) {
          setLifecycle('ready');
          onReady?.();
        }
      } catch (err: any) {
        console.error('CesiumJS initialization failed:', err);
        const message = err?.message || 'Cesium WebGL failed to initialize';
        if (isMounted) {
          setLifecycle('failed');
          setErrorMessage(message);
          onFallbackToThree?.(message);
        }
      }
    }

    initCesium();

    return () => {
      isMounted = false;
      setLifecycle('destroyed');
      if (viewerRef.current) {
        const { viewer, handler, removeTickListener } = viewerRef.current;
        if (removeTickListener) removeTickListener();
        if (handler && !handler.isDestroyed()) handler.destroy();
        if (viewer && !viewer.isDestroyed()) viewer.destroy();
        viewerRef.current = null;
      }
      entitiesMapRef.current.clear();
    };
  }, []);

  // Update dynamic solar illumination from validAtUtc
  useEffect(() => {
    if (lifecycle !== 'ready' || !viewerRef.current) return;
    const { viewer, Cesium } = viewerRef.current;
    if (viewer.isDestroyed()) return;

    if (validAtUtc) {
      const parsed = new Date(validAtUtc);
      if (!Number.isNaN(parsed.getTime())) {
        viewer.clock.currentTime = Cesium.JulianDate.fromDate(parsed);
      }
    }
  }, [validAtUtc, lifecycle]);

  // Handle external camera actions (Zoom In, Zoom Out, Reset) from GlobeControls
  useEffect(() => {
    if (lifecycle !== 'ready' || !viewerRef.current || !cameraAction) return;
    const { viewer, Cesium } = viewerRef.current;
    if (viewer.isDestroyed()) return;

    const carto = viewer.camera.positionCartographic;
    const currentHeight = carto.height;

    if (cameraAction.type === 'zoomIn') {
      if (currentHeight > 250000) {
        viewer.camera.zoomIn(Math.min(currentHeight * 0.35, 3000000));
      }
    } else if (cameraAction.type === 'zoomOut') {
      if (currentHeight < 25000000) {
        viewer.camera.zoomOut(Math.min(currentHeight * 0.45, 4500000));
      }
    } else if (cameraAction.type === 'reset') {
      const currentPoints = pointsRef.current;
      const targetPoint = currentPoints.find(
        (p) => p.name.toLowerCase() === activeCityName?.toLowerCase()
      ) || currentPoints[0];

      const targetLon = targetPoint?.longitude ?? 77.5946;
      const targetLat = targetPoint?.latitude ?? 12.9716;

      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(targetLon, targetLat, 8500000),
        orientation: {
          heading: Cesium.Math.toRadians(0),
          pitch: Cesium.Math.toRadians(-85),
          roll: 0,
        },
        duration: 1.2,
      });
    }
  }, [cameraAction, lifecycle, activeCityName]);

  // Synchronize observation point entities using keyed reconciliation
  useEffect(() => {
    if (lifecycle !== 'ready' || !viewerRef.current) return;
    const { viewer, Cesium } = viewerRef.current;
    if (viewer.isDestroyed()) return;

    const entitiesMap = entitiesMapRef.current;
    const currentPointIds = new Set(points.map((p) => p.id));

    // Remove entities that are no longer present in points
    for (const [id, entity] of entitiesMap.entries()) {
      if (!currentPointIds.has(id)) {
        viewer.entities.remove(entity);
        entitiesMap.delete(id);
      }
    }

    // Upsert points
    points.forEach((point) => {
      const aqiVal = standard === 'cpcb' ? point.cpcbAqi : point.usAqi;
      const isSelected = point.id === selectedPointId;
      const isActive = point.name.toLowerCase() === activeCityName?.toLowerCase();
      const hasValidAqi = aqiVal !== null && aqiVal !== undefined && !Number.isNaN(aqiVal);

      // Honest color mapping: neutral slate if unavailable (never default green!)
      let color: any;
      if (!hasValidAqi) {
        color = Cesium.Color.fromCssColorString('#64748B');
      } else if (isSelected) {
        color = Cesium.Color.fromCssColorString('#38BDF8'); // Sky blue for inspected
      } else {
        color = Cesium.Color.fromCssColorString(point.categoryColor || '#10B981');
      }

      const labelText = `${point.name}\n${hasValidAqi ? aqiVal : '--'}`;
      const pointSize = isSelected || isActive ? 14 : 9;
      const outlineWidth = isSelected || isActive ? 2.5 : 1.5;

      let entity = entitiesMap.get(point.id);

      if (entity) {
        // Update existing entity properties
        entity.point.color = color;
        entity.point.pixelSize = pointSize;
        entity.point.outlineWidth = outlineWidth;
        entity.label.text = labelText;
        entity.properties.pointData = point;
      } else {
        // Create new entity
        entity = viewer.entities.add({
          id: `marker-${point.id}`,
          position: Cesium.Cartesian3.fromDegrees(point.longitude, point.latitude, 0),
          point: {
            pixelSize: pointSize,
            color,
            outlineColor: Cesium.Color.WHITE,
            outlineWidth,
            heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          },
          label: {
            text: labelText,
            font: 'bold 11px monospace',
            fillColor: Cesium.Color.WHITE,
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 3,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            pixelOffset: new Cesium.Cartesian2(0, -22),
            horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
            distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 12000000),
          },
          properties: {
            pointData: point,
          },
        });
        entitiesMap.set(point.id, entity);
      }
    });
  }, [points, selectedPointId, activeCityName, standard, lifecycle]);

  // Fly to active city when changed externally
  useEffect(() => {
    if (lifecycle !== 'ready' || !viewerRef.current || !activeCityName) return;
    const { viewer, Cesium } = viewerRef.current;
    if (viewer.isDestroyed()) return;

    const targetPoint = points.find(
      (p) => p.name.toLowerCase() === activeCityName.toLowerCase()
    );
    if (targetPoint) {
      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(
          targetPoint.longitude,
          targetPoint.latitude,
          3500000
        ),
        duration: 1.6,
      });
    }
  }, [activeCityName, lifecycle, points]);

  // Adjust scene styling when themeMode toggles
  useEffect(() => {
    if (lifecycle !== 'ready' || !viewerRef.current) return;
    const { viewer, Cesium } = viewerRef.current;
    if (viewer.isDestroyed()) return;

    viewer.scene.backgroundColor = Cesium.Color.fromCssColorString(
      themeMode === 'light' ? '#0F172A' : '#030712'
    );
  }, [themeMode, lifecycle]);

  if (lifecycle === 'failed') {
    return (
      <div className={`w-full h-full flex flex-col items-center justify-center bg-black/80 text-rose-300 p-6 ${className}`}>
        <span className="font-bold text-sm telemetry-mono mb-2">CESIUM SATELLITE ENGINE FALLBACK</span>
        <span className="text-xs text-slate-400 text-center max-w-md">
          {errorMessage || 'Cesium WebGL could not initialize'}. Returning to Three.js atmospheric globe.
        </span>
      </div>
    );
  }

  return (
    <div className={`relative w-full h-full overflow-hidden ${className}`}>
      {lifecycle === 'initializing' && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#030712] text-xs text-sky-300 telemetry-mono">
          <span className="animate-pulse">Loading Satellite Earth...</span>
        </div>
      )}
      <div ref={containerRef} className="w-full h-full" />

      {/* Scoped CSS: Remove unnecessary Cesium ion branding logo while retaining clean UI */}
      <style jsx global>{`
        .cesium-credit-logoContainer {
          display: none !important;
        }
        .cesium-viewer-bottom {
          display: none !important;
        }
      `}</style>

      {/* Legally Required Satellite & Map Data Attribution Badge (Compact & Non-overlapping) */}
      <aside
        role="contentinfo"
        aria-label="Satellite imagery and map data attribution"
        className="absolute bottom-[11.5rem] sm:bottom-20 left-3 sm:left-6 z-20 pointer-events-auto max-w-[260px] sm:max-w-md bg-slate-950/80 backdrop-blur-md px-2.5 py-1.5 rounded-lg border border-slate-700/50 shadow-lg text-[9px] sm:text-[10px] text-slate-300 telemetry-mono leading-tight flex flex-col gap-0.5 select-none"
      >
        <div className="flex items-center gap-1.5 text-slate-400">
          <span className="font-semibold text-slate-200 uppercase tracking-wider text-[8px] sm:text-[9px]">Map Attribution</span>
          <span className="text-slate-500">•</span>
          <span className="text-slate-400">CesiumJS</span>
        </div>
        <div className="text-slate-300/90 text-[8.5px] sm:text-[9.5px]">
          Imagery: Tiles © Esri, Maxar, Earthstar Geographics | © OpenStreetMap contributors
        </div>
      </aside>
    </div>
  );
}
