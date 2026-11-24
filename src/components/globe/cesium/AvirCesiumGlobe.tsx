'use client';

import React, { useEffect, useRef, useState } from 'react';
import type { GeographicObservationPoint, AqiStandard } from '@/services/geo/geographic-observation-adapter';

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
}: AvirCesiumGlobeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [initError, setInitError] = useState<string | null>(null);
  const viewerRef = useRef<any>(null);

  useEffect(() => {
    let isMounted = true;

    async function initCesium() {
      if (!containerRef.current) return;

      try {
        // Set Cesium static assets base URL before module load
        if (typeof window !== 'undefined') {
          (window as any).CESIUM_BASE_URL = '/cesium';
        }

        // Ensure Cesium widgets stylesheet is loaded
        if (typeof document !== 'undefined' && !document.getElementById('cesium-widgets-css')) {
          const link = document.createElement('link');
          link.id = 'cesium-widgets-css';
          link.rel = 'stylesheet';
          link.href = '/cesium/Widgets/widgets.css';
          document.head.appendChild(link);
        }

        // Dynamically import Cesium on client side
        const Cesium = await import('cesium');

        if (!isMounted || !containerRef.current) return;

        // Keyless Esri World Imagery provider (same robust layer used in God's Eye View)
        let baseLayer: any;
        try {
          baseLayer = await Cesium.ArcGisMapServerImageryProvider.fromUrl(
            'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer',
            {
              credit:
                'Tiles © Esri — Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
              enablePickFeatures: false,
            }
          );
        } catch {
          // Fallback to OSM if Esri is unreachable
          baseLayer = new Cesium.OpenStreetMapImageryProvider({
            url: 'https://tile.openstreetmap.org/',
            credit: '© OpenStreetMap contributors',
          });
        }

        // Initialize minimalist Cesium Viewer tailored for Avir futuristic UI
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
            },
          },
        });

        // Enable planetary lighting based on sun angle
        viewer.scene.globe.enableLighting = true;
        viewer.scene.backgroundColor = Cesium.Color.fromCssColorString('#030712');

        // Set initial camera perspective over India / Asia
        const activePoint = points.find(
          (p) => p.name.toLowerCase() === activeCityName?.toLowerCase()
        ) || points[0];

        const initialLon = activePoint?.longitude ?? 77.5946;
        const initialLat = activePoint?.latitude ?? 12.9716;

        viewer.camera.setView({
          destination: Cesium.Cartesian3.fromDegrees(initialLon, initialLat, 8500000),
          orientation: {
            heading: Cesium.Math.toRadians(0),
            pitch: Cesium.Math.toRadians(-85),
            roll: 0,
          },
        });

        // Register entity click handler
        const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
        handler.setInputAction((click: any) => {
          const pickedObject = viewer.scene.pick(click.position);
          if (Cesium.defined(pickedObject) && pickedObject.id && pickedObject.id.properties) {
            const pointData = pickedObject.id.properties.pointData?.getValue();
            if (pointData) {
              onSelectPoint(pointData);
            }
          }
        }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

        viewerRef.current = { viewer, Cesium, handler };
        setIsInitializing(false);
      } catch (err: any) {
        console.error('CesiumJS initialization failed:', err);
        setInitError(err?.message || 'Cesium WebGL failed to initialize');
        setIsInitializing(false);
      }
    }

    initCesium();

    return () => {
      isMounted = false;
      if (viewerRef.current) {
        const { viewer, handler } = viewerRef.current;
        if (handler && !handler.isDestroyed()) handler.destroy();
        if (viewer && !viewer.isDestroyed()) viewer.destroy();
        viewerRef.current = null;
      }
    };
  }, []);

  // Update dynamic sunlight from validAtUtc
  useEffect(() => {
    if (!viewerRef.current) return;
    const { viewer, Cesium } = viewerRef.current;
    if (viewer.isDestroyed()) return;

    if (validAtUtc) {
      const parsed = new Date(validAtUtc);
      if (!Number.isNaN(parsed.getTime())) {
        viewer.clock.currentTime = Cesium.JulianDate.fromDate(parsed);
      }
    }
  }, [validAtUtc]);

  // Update observation point entities whenever points or standard change
  useEffect(() => {
    if (!viewerRef.current) return;
    const { viewer, Cesium } = viewerRef.current;
    if (viewer.isDestroyed()) return;

    viewer.entities.removeAll();

    points.forEach((point) => {
      const aqiVal = standard === 'cpcb' ? point.cpcbAqi : point.usAqi;
      const isSelected = point.id === selectedPointId;
      const isActive = point.name.toLowerCase() === activeCityName?.toLowerCase();

      // Color mapping
      let color = Cesium.Color.fromCssColorString(point.categoryColor || '#10B981');
      if (isSelected) {
        color = Cesium.Color.fromCssColorString('#38BDF8'); // Sky blue for selected
      }

      const entity = viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(point.longitude, point.latitude, 0),
        point: {
          pixelSize: isSelected || isActive ? 14 : 9,
          color,
          outlineColor: Cesium.Color.WHITE,
          outlineWidth: isSelected || isActive ? 2.5 : 1.5,
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        },
        label: {
          text: `${point.name}\n${aqiVal !== null && aqiVal !== undefined ? aqiVal : '--'}`,
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
    });
  }, [points, selectedPointId, activeCityName, standard]);

  // Fly to active city when changed externally
  useEffect(() => {
    if (!viewerRef.current || !activeCityName) return;
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
        duration: 1.8,
      });
    }
  }, [activeCityName]);

  if (initError) {
    return (
      <div className={`w-full h-full flex flex-col items-center justify-center bg-black/80 text-rose-300 p-6 ${className}`}>
        <span className="font-bold text-sm telemetry-mono mb-2">CESIUM 3D ENGINE FALLBACK</span>
        <span className="text-xs text-slate-400 text-center max-w-md">
          {initError}. Please switch to the default Three.js engine using the controls below.
        </span>
      </div>
    );
  }

  return (
    <div className={`relative w-full h-full overflow-hidden ${className}`}>
      {isInitializing && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#030712] text-xs text-sky-300 telemetry-mono">
          <span className="animate-pulse">LOADING PHOTOREALISTIC CESIUMJS TERRAIN ENGINE...</span>
        </div>
      )}
      <div ref={containerRef} className="w-full h-full" />
    </div>
  );
}
