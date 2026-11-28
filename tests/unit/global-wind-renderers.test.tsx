import React from 'react';
import ReactDOMServer from 'react-dom/server';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from 'three';
import {
  createCesiumWindController,
  type CesiumWindModule,
  type CesiumWindViewer,
  windHeightFade,
  windScalarOverlayFade,
} from '@/components/globe/cesium/cesium-wind';
import { ThreeWindLayer, threeWindDistanceFade } from '@/components/globe/three-wind-layer';
import { GlobeControls } from '@/components/globe/GlobeControls';
import { mapGlobalWindSnapshotToLayerInfo } from '@/components/globe/AvirGlobe';
import type { GlobalWindSnapshot } from '@/domain/wind-types';

function createSampleGlobalSnapshot(): GlobalWindSnapshot {
  const width = 12;
  const height = 7;
  const count = width * height;
  return {
    manifest: {
      schemaVersion: 2,
      model: 'gfs',
      modelName: 'NOAA GFS (0.25° -> 1° grid)',
      provider: 'NOAA / NCEP Open Data',
      initTimeUtc: '2026-11-25T00:00:00.000Z',
      validTimeUtc: '2026-11-25T06:00:00.000Z',
      forecastHour: 6,
      retrievedAtUtc: '2026-11-25T06:01:00.000Z',
      grid: {
        width,
        height,
        lo1: 0,
        la1: 90,
        dx: 30,
        dy: 30,
        bounds: { west: -180, south: -90, east: 180, north: 90 },
        resolutionDeg: 30,
        nativeResolutionDeg: 0.25,
      },
      level: '10 m above ground',
      units: 'm/s',
      overlay: 'temperature',
      scalar: {
        kind: 'temperature',
        units: '°C',
        level: '2 m above ground',
        min: -40,
        max: 50,
      },
      scalarError: null,
      status: 'available',
      freshness: 'current',
      ageMinutes: 5,
      isAvailable: true,
      isCached: false,
      isStale: false,
      unavailableReason: null,
      attribution: 'NOAA / NCEP Global Forecast System (GFS) · 10 m Surface Wind',
      license: 'Public Domain (U.S. Government Open Data)',
      cycle: { date: '20261125', hour: 0, forecastHour: 6 },
      gridUrl: '/api/environment/wind/global/grid?model=gfs&overlay=temperature&date=20261125&hour=0&step=6',
    },
    u: new Float32Array(count).fill(8),
    v: new Float32Array(count).fill(2),
    scalarValues: new Float32Array(count).fill(18),
  };
}

function createMockCesiumEnv() {
  const preRenderListeners = new Set<() => void>();
  const addedPrimitives: unknown[] = [];
  const destroyedMaterials: unknown[] = [];

  const mockViewer: CesiumWindViewer & {
    scene: NonNullable<CesiumWindViewer['scene']> & {
      camera: {
        positionCartographic: { height: number };
        positionWC: { x: number; y: number; z: number };
        directionWC: { x: number; y: number; z: number };
        upWC: { x: number; y: number; z: number };
        frustum: { computeCullingVolume: () => { computeVisibility: () => number } };
      };
    };
  } = {
    isDestroyed: () => false,
    scene: {
      canvas: { clientWidth: 1280 },
      camera: {
        positionCartographic: { height: 2_500_000 },
        positionWC: { x: 1, y: 0, z: 0 },
        directionWC: { x: -1, y: 0, z: 0 },
        upWC: { x: 0, y: 0, z: 1 },
        frustum: {
          computeCullingVolume: () => ({
            computeVisibility: () => 1,
          }),
        },
      },
      primitives: {
        isDestroyed: () => false,
        add: vi.fn((p: unknown) => addedPrimitives.push(p)),
        remove: vi.fn((p: unknown) => {
          const idx = addedPrimitives.indexOf(p);
          if (idx >= 0) addedPrimitives.splice(idx, 1);
        }),
      },
      preRender: {
        addEventListener: vi.fn((fn: () => void) => {
          preRenderListeners.add(fn);
          return () => preRenderListeners.delete(fn);
        }),
      },
    },
    imageryLayers: {
      addImageryProvider: vi.fn(() => ({ alpha: 0.7, show: true })),
      remove: vi.fn(),
    },
  };

  const mockCesium: CesiumWindModule = {
    Cartesian3: {
      ZERO: { x: 0, y: 0, z: 0 },
      fromDegrees: (lon: number, lat: number, h?: number) => ({ lon, lat, h }),
    },
    Ellipsoid: { WGS84: { minimumRadius: 6356752 } },
    Color: {
      fromCssColorString: () => ({ withAlpha: () => ({}) }),
    },
    ArcType: { NONE: 0 },
    Intersect: { OUTSIDE: -1 },
    ComponentDatatype: { FLOAT: 5126 },
    BoundingSphere: class {
      center: unknown;
      radius: number;
      constructor(center: unknown = { x: 0, y: 0, z: 0 }, radius = 100) {
        this.center = center;
        this.radius = radius;
      }
      static fromPoints(pts: unknown[]) {
        return { center: pts[0] ?? { x: 0, y: 0, z: 0 }, radius: 100 };
      }
    },
    Occluder: class {
      cameraPosition: unknown;
      constructor(_bs: unknown, cam: unknown) {
        this.cameraPosition = cam;
      }
      isBoundingSphereVisible = vi.fn(() => true);
    },
    Material: class {
      uniforms: Record<string, unknown>;
      destroyed = false;
      constructor(opts: { fabric: { uniforms: Record<string, unknown> } }) {
        this.uniforms = opts.fabric.uniforms;
      }
      destroy() {
        this.destroyed = true;
        destroyedMaterials.push(this);
      }
      isDestroyed() {
        return this.destroyed;
      }
    },
    PolylineMaterialAppearance: class {
      static VERTEX_FORMAT = {};
      vertexShaderSource =
        'in vec3 position3DHigh; in vec3 position3DLow; void main() {\n v_st.s = st.s;\n }';
      constructor(opts: Record<string, unknown>) {
        Object.assign(this, opts);
      }
    },
    PolylineGeometry: class {
      constructor(opts: Record<string, unknown>) {
        Object.assign(this, opts);
      }
    },
    GeometryInstance: class {
      constructor(opts: Record<string, unknown>) {
        Object.assign(this, opts);
      }
    },
    GeometryInstanceAttribute: class {
      constructor(opts: Record<string, unknown>) {
        Object.assign(this, opts);
      }
    },
    Primitive: class {
      ready = true;
      show = false;
      destroyed = false;
      constructor(opts: Record<string, unknown>) {
        Object.assign(this, opts);
      }
      destroy() {
        this.destroyed = true;
      }
      isDestroyed() {
        return this.destroyed;
      }
    },
  };

  return {
    mockViewer,
    mockCesium,
    addedPrimitives,
    destroyedMaterials,
    triggerPreRender: () => preRenderListeners.forEach((fn) => fn()),
    listenerCount: () => preRenderListeners.size,
  };
}

describe('Phase 5, 6 & 7: Cesium & Three.js Streamline Renderers + Layer Controls', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('computes smooth altitude fades for streamlines and scalar overlays in both engines', () => {
    expect(windHeightFade(5_000)).toBe(0);
    expect(windHeightFade(37_500)).toBeCloseTo(0.5, 4);
    expect(windHeightFade(100_000)).toBe(1);

    expect(windScalarOverlayFade(100_000)).toBe(0);
    expect(windScalarOverlayFade(2_000_000)).toBe(1);
    expect(threeWindDistanceFade(100, 90)).toBeCloseTo(0.08, 4);
    expect(threeWindDistanceFade(260, 90)).toBe(1);
  });

  it('builds Cesium GPU streamlines across 30° cells, animates when active, pauses cleanly, and disposes zero-leak', () => {
    const env = createMockCesiumEnv();
    const controller = createCesiumWindController();
    const snapshot = createSampleGlobalSnapshot();

    controller.sync({
      viewer: env.mockViewer,
      Cesium: env.mockCesium,
      enabled: true,
      snapshot,
      overlay: 'none',
      paused: false,
    });

    const diag1 = controller.getDiagnostics();
    expect(diag1.mode).toBe('gpu-streamlines');
    expect(diag1.pathCount).toBeGreaterThan(100);
    expect(diag1.cellCount).toBeGreaterThan(5);
    expect(env.addedPrimitives.length).toBe(diag1.cellCount);
    expect(env.listenerCount()).toBe(1);

    // PreRender triggers culling and shader animation progression
    env.triggerPreRender();
    const diagTick = controller.getDiagnostics();
    expect(diagTick.visibleCells).toBeGreaterThan(0);

    // Pausing preserves built cell primitives (never rebuilds geometry) and freezes cleanly
    controller.sync({
      viewer: env.mockViewer,
      Cesium: env.mockCesium,
      enabled: true,
      snapshot,
      overlay: 'speed',
      paused: true,
    });
    expect(controller.getDiagnostics().paused).toBe(true);
    expect(env.addedPrimitives.length).toBe(diag1.cellCount);

    // Zooming down below 15km smoothly hides streamlines via heightFade=0
    env.mockViewer.scene.camera.positionCartographic.height = 10_000;
    env.triggerPreRender();
    expect(controller.getDiagnostics().heightFade).toBe(0);
    expect(controller.getDiagnostics().visibleCells).toBe(0);

    // Disabling clears primitives and disposes material cleanly
    controller.sync({
      viewer: env.mockViewer,
      Cesium: env.mockCesium,
      enabled: false,
      snapshot: null,
      overlay: 'none',
      paused: false,
    });
    expect(env.addedPrimitives).toHaveLength(0);
    expect(env.destroyedMaterials).toHaveLength(1);

    // Dispose detaches preRender listener
    controller.dispose();
    expect(env.listenerCount()).toBe(0);
  });

  it('drives ThreeWindLayer GPU streamline mesh lifecycle, pause/reducedMotion freeze, and disposal', () => {
    const group = new THREE.Group();
    const layer = new ThreeWindLayer(group, { radius: 90.35 });
    const snapshot = createSampleGlobalSnapshot();

    layer.setVisible(true);
    layer.setGlobalField(snapshot, { overlay: 'none', paused: false, reducedMotion: false });
    expect(layer.getStreamlineCount()).toBeGreaterThan(100);
    expect(layer.getActiveVectorCount()).toBe(layer.getStreamlineCount());

    // Streamline mesh is added alongside compatibility Points slot
    const streamlineMesh = group.children.find(
      (child) => child instanceof THREE.Mesh
    ) as THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
    expect(streamlineMesh).toBeDefined();
    expect(streamlineMesh.visible).toBe(true);

    const t0 = streamlineMesh.material.uniforms.uPhaseTime.value;
    layer.update(0.05, 260);
    const t1 = streamlineMesh.material.uniforms.uPhaseTime.value;
    expect(t1).toBeGreaterThan(t0);

    // Pausing stops shader uPhaseTime advancement without hiding mesh
    layer.setOptions({ paused: true });
    layer.update(0.05, 260);
    expect(streamlineMesh.material.uniforms.uPhaseTime.value).toBe(t1);
    expect(streamlineMesh.visible).toBe(true);

    // Reduced motion also freezes uPhaseTime
    layer.setOptions({ paused: false, reducedMotion: true });
    layer.update(0.05, 260);
    expect(streamlineMesh.material.uniforms.uPhaseTime.value).toBe(t1);

    // Toggling off hides and clearing removes mesh
    layer.setVisible(false);
    expect(streamlineMesh.visible).toBe(false);
    layer.clearGlobalField();
    expect(layer.getStreamlineCount()).toBe(0);

    layer.dispose();
    expect(group.children).toHaveLength(0);
  });

  it('renders Cesium-enabled Wind Flow controls, model/overlay/unit selectors, metadata, and inspection in GlobeControls', () => {
    const snapshot = createSampleGlobalSnapshot();
    const info = mapGlobalWindSnapshotToLayerInfo(
      snapshot,
      { name: 'Delhi-NCR', latitude: 28.6139, longitude: 77.209 },
      'km/h'
    );
    expect(info.state).toBe('live');
    expect(info.detail).toContain('NOAA GFS');

    const html = ReactDOMServer.renderToString(
      <GlobeControls
        is3D={true}
        onToggle3D={vi.fn()}
        isAutoRotating={false}
        onToggleAutoRotate={vi.fn()}
        onZoomIn={vi.fn()}
        onZoomOut={vi.fn()}
        onResetView={vi.fn()}
        standard="cpcb"
        onToggleStandard={vi.fn()}
        engineMode="cesium"
        onToggleEngine={vi.fn()}
        defaultLayersOpen={true}
        layers={{ wind: true, fires: false, terrain: true, satelliteComparison: false }}
        layerStatus={{ wind: info }}
        windControls={{
          model: 'gfs',
          onChangeModel: vi.fn(),
          overlay: 'temperature',
          onChangeOverlay: vi.fn(),
          paused: false,
          onTogglePause: vi.fn(),
          speedUnit: 'km/h',
          onChangeSpeedUnit: vi.fn(),
          manifest: snapshot.manifest,
          onInspectActiveCity: vi.fn(),
        }}
      />
    );
    expect(html).toContain('CESIUM');
    expect(html).toContain('Wind Flow');
    expect(html).toContain('NOAA GFS');
    expect(html).toContain('ECMWF IFS');
    expect(html).toContain('Inspect City Wind');
    expect(html).not.toContain('THREE.JS ONLY');
  });
});
