/**
 * CesiumJS Global Wind-Flow Visualization Controller (Phase 5)
 *
 * Renders thousands of GPU-animated streamlines curving around Earth above the terrain ellipsoid
 * in 30° culling cells with strict backface occlusion, altitude fade, pause/reduced-motion
 * handling, optional scalar color overlay draping, and safe resource cleanup.
 * Adapted from MIT-licensed God's Eye View Cesium streamline architecture (Bilawal Sidhu).
 */

import type { GlobalWindOverlayKind, GlobalWindSnapshot } from '@/domain/wind-types';
import { createWindOverlayRaster, toWindGridView, validateWindGrid } from '@/domain/wind-field';
import {
  WIND_CELL_DEGREES,
  WIND_DISPLAY_HEIGHT_METERS,
  WIND_PATH_STEPS,
  bakeWindStreamlines,
  groupWindPaths,
  resolveAdaptivePathBudget,
} from '@/domain/wind-streamlines';

const WIND_FADE_LOW_METERS = 15_000;
const WIND_FADE_HIGH_METERS = 60_000;
const WIND_FIELD_FADE_LOW_METERS = 200_000;
const WIND_FIELD_FADE_HIGH_METERS = 1_200_000;
const TIP_SPEED = 0.16;
const GHOST_ALPHA = 0.28;
const GHOST_ALPHA_PAUSED = 0.38;
const STEP_SECONDS = 0.032;
const DEFAULT_STREAMLINE_COLOR = '#67d8f7';

const FLOW_MATERIAL_GLSL = `
in float v_windFacing;
czm_material czm_getMaterial(czm_materialInput materialInput)
{
    czm_material material = czm_getDefaultMaterial(materialInput);
    float pathId = floor(materialInput.st.s);
    float along = fract(materialInput.st.s);
    float offset = fract((pathId + 1.0) * 0.61803398875);
    float behind = fract(phaseTime * tipSpeed + offset - along);
    float tail = (1.0 - smoothstep(0.0, 0.32, behind));
    float tip = 1.0 - smoothstep(0.0, 0.045, behind);
    float ends = smoothstep(0.0, 0.055, along) * (1.0 - smoothstep(0.945, 1.0, along));
    float edge = 1.0 - smoothstep(0.26, 0.5, abs(materialInput.st.t - 0.5));
    float horizon = smoothstep(0.0, 0.065, v_windFacing);
    material.diffuse = mix(baseColor.rgb, vec3(0.92, 0.99, 1.0), tip);
    material.alpha = (ghostAlpha + 0.64 * tail + 0.16 * tip) * ends * edge * horizon * heightFade;
    return material;
}`;

export function windHeightFade(cameraHeightMeters: number): number {
  if (!Number.isFinite(cameraHeightMeters)) return 1;
  return Math.max(
    0,
    Math.min(
      1,
      (cameraHeightMeters - WIND_FADE_LOW_METERS) /
        (WIND_FADE_HIGH_METERS - WIND_FADE_LOW_METERS)
    )
  );
}

export function windScalarOverlayFade(cameraHeightMeters: number): number {
  if (!Number.isFinite(cameraHeightMeters)) return 1;
  if (cameraHeightMeters <= WIND_FIELD_FADE_LOW_METERS) return 0;
  if (cameraHeightMeters >= WIND_FIELD_FADE_HIGH_METERS) return 1;
  return (
    Math.log(cameraHeightMeters / WIND_FIELD_FADE_LOW_METERS) /
    Math.log(WIND_FIELD_FADE_HIGH_METERS / WIND_FIELD_FADE_LOW_METERS)
  );
}

export interface CesiumWindDiagnostics {
  mode: 'gpu-streamlines' | 'polyline-fallback' | 'idle';
  pathCount: number;
  cellCount: number;
  visibleCells: number;
  heightFade: number;
  paused: boolean;
  reducedMotion: boolean;
  ready: boolean;
}

export interface CesiumWindColor {
  withAlpha?(alpha: number): CesiumWindColor;
}

export interface CesiumWindMaterial {
  uniforms: Record<string, unknown>;
  isDestroyed?(): boolean;
  destroy?(): void;
}

export interface CesiumWindPrimitive {
  show: boolean;
  ready?: boolean;
  isDestroyed?(): boolean;
  destroy?(): void;
}

export interface CesiumWindPolylineCollection {
  show: boolean;
  add?(polyline: unknown): unknown;
}

export interface CesiumWindImageryLayer {
  alpha: number;
  show: boolean;
}

export interface CesiumWindOccluder {
  cameraPosition: unknown;
  isBoundingSphereVisible?(sphere: unknown): boolean;
}

export interface CesiumWindCullingVolume {
  computeVisibility?(sphere: unknown): number;
}

export interface CesiumWindViewer<TCartesian = unknown> {
  isDestroyed?(): boolean;
  camera?: {
    positionWC?: TCartesian;
    positionCartographic?: { height?: number };
  };
  scene?: {
    canvas?: { clientWidth?: number };
    camera?: {
      positionWC?: TCartesian;
      directionWC?: TCartesian;
      upWC?: TCartesian;
      positionCartographic?: { height?: number };
      frustum?: {
        computeCullingVolume?(pos: unknown, dir: unknown, up: unknown): CesiumWindCullingVolume;
      };
    };
    primitives?: {
      isDestroyed?(): boolean;
      add?(primitive: unknown): unknown;
      remove?(primitive: unknown): unknown;
    };
    preRender?: {
      addEventListener?(listener: () => void): (() => void) | void;
    };
  };
  imageryLayers?: {
    addImageryProvider?(provider: unknown): CesiumWindImageryLayer;
    remove?(layer: CesiumWindImageryLayer, destroy?: boolean): unknown;
  };
}

export interface CesiumWindOverlayModule<TRectangle = unknown> {
  Rectangle?: {
    fromDegrees?(west?: number, south?: number, east?: number, north?: number): TRectangle;
  };
  SingleTileImageryProvider?:
    | ({
        fromUrl?(
          url: string,
          options: { tileWidth?: number; tileHeight?: number; rectangle?: TRectangle }
        ): Promise<unknown>;
      } & (new (options: {
        url: string;
        tileWidth?: number;
        tileHeight?: number;
        rectangle?: TRectangle;
      }) => unknown))
    | {
        fromUrl?(
          url: string,
          options: { tileWidth?: number; tileHeight?: number; rectangle?: TRectangle }
        ): Promise<unknown>;
      };
}

export interface CesiumWindModule<
  TRectangle = unknown,
  TCartesian = unknown,
  TBoundingSphere = unknown,
  TMaterial extends CesiumWindMaterial = CesiumWindMaterial,
  TArcType = unknown,
  TVertexFormat = unknown,
  TGeometry = unknown,
  TCompType = unknown,
  TAttr = unknown,
  TGeometryInstance = unknown,
  TAppearance extends { vertexShaderSource?: string } = { vertexShaderSource?: string }
> extends CesiumWindOverlayModule<TRectangle> {
  Cartesian3: {
    ZERO: TCartesian;
    fromDegrees(lon: number, lat: number, height?: number): TCartesian;
  };
  Ellipsoid: {
    WGS84: { minimumRadius: number };
  };
  Color?:
    | ({
        fromCssColorString?(color: string): CesiumWindColor | undefined;
      } & (new (red?: number, green?: number, blue?: number, alpha?: number) => CesiumWindColor))
    | {
        fromCssColorString?(color: string): CesiumWindColor | undefined;
      };
  ArcType?: { NONE?: TArcType };
  Intersect: { OUTSIDE: number };
  ComponentDatatype: { FLOAT: TCompType };
  BoundingSphere: {
    new (center?: TCartesian, radius?: number): TBoundingSphere;
    fromPoints(positions: TCartesian[]): TBoundingSphere;
  };
  Occluder: new (boundingSphere: TBoundingSphere, cameraPosition: TCartesian) => CesiumWindOccluder;
  Material: {
    new (options: {
      fabric: {
        type: string;
        uniforms: Record<string, unknown>;
        source: string;
      };
      translucent?: () => boolean;
    }): TMaterial;
    fromType?(type: string, uniforms?: Record<string, unknown>): unknown;
  };
  PolylineMaterialAppearance: (new (options: {
    material?: TMaterial;
    vertexShaderSource?: string;
    translucent?: boolean;
    renderState?: Record<string, unknown>;
  }) => TAppearance) & {
    VERTEX_FORMAT: TVertexFormat;
  };
  PolylineGeometry: new (options: {
    positions: TCartesian[];
    width?: number;
    arcType?: TArcType;
    vertexFormat?: TVertexFormat;
  }) => TGeometry;
  GeometryInstance: new (options: {
    geometry: TGeometry;
    attributes?: Record<string, TAttr>;
  }) => TGeometryInstance;
  GeometryInstanceAttribute: new (options: {
    componentDatatype: TCompType;
    componentsPerAttribute: number;
    value: number[];
  }) => TAttr;
  Primitive: new (options: {
    show?: boolean;
    geometryInstances?: TGeometryInstance[];
    appearance?: TAppearance;
    asynchronous?: boolean;
    allowPicking?: boolean;
    releaseGeometryInstances?: boolean;
    compressVertices?: boolean;
  }) => CesiumWindPrimitive;
  PolylineCollection?: new () => CesiumWindPolylineCollection;
}

export interface CesiumWindController {
  sync<
    TRectangle = unknown,
    TCartesian = unknown,
    TBoundingSphere = unknown,
    TMaterial extends CesiumWindMaterial = CesiumWindMaterial,
    TArcType = unknown,
    TVertexFormat = unknown,
    TGeometry = unknown,
    TCompType = unknown,
    TAttr = unknown,
    TGeometryInstance = unknown,
    TAppearance extends { vertexShaderSource?: string } = { vertexShaderSource?: string }
  >(params: {
    viewer: CesiumWindViewer;
    Cesium: CesiumWindModule<
      TRectangle,
      TCartesian,
      TBoundingSphere,
      TMaterial,
      TArcType,
      TVertexFormat,
      TGeometry,
      TCompType,
      TAttr,
      TGeometryInstance,
      TAppearance
    >;
    enabled: boolean;
    snapshot: GlobalWindSnapshot | null;
    overlay: GlobalWindOverlayKind;
    paused: boolean;
  }): void;
  getDiagnostics(): CesiumWindDiagnostics;
  dispose(): void;
}

interface CellPrimitiveEntry {
  primitive: CesiumWindPrimitive;
  sphere: unknown;
}

function sameSnapshotField(a: GlobalWindSnapshot | null, b: GlobalWindSnapshot | null): boolean {
  if (!a || !b) return false;
  if (a.manifest.model !== b.manifest.model) return false;
  if (a.manifest.initTimeUtc !== b.manifest.initTimeUtc) return false;
  if (a.manifest.validTimeUtc !== b.manifest.validTimeUtc) return false;
  if (a.u === b.u && a.v === b.v) return true;
  if (a.u.length !== b.u.length || a.v.length !== b.v.length) return false;
  // Quick spot check + full length check without wasting frames
  for (let i = 0; i < a.u.length; i += 251) {
    if (a.u[i] !== b.u[i] || a.v[i] !== b.v[i]) return false;
  }
  return true;
}

export function createCesiumWindController(): CesiumWindController {
  let activeViewer: CesiumWindViewer | null = null;
  let activeOverlayInstall: (() => Promise<void>) | null = null;
  let intersectOutsideValue = -1;
  let hasActiveCesium = false;
  let currentSnapshot: GlobalWindSnapshot | null = null;
  let currentOverlay: GlobalWindOverlayKind = 'none';
  let currentPaused = false;
  let enabledState = false;
  let disposed = false;

  const cells: CellPrimitiveEntry[] = [];
  let material: CesiumWindMaterial | null = null;
  let occluder: CesiumWindOccluder | null = null;
  let fallbackCollection: CesiumWindPolylineCollection | null = null;
  let overlayImageryLayer: CesiumWindImageryLayer | null = null;
  let overlayRequestSeq = 0;

  let phaseTime = 0;
  let lastTickMs: number | null = null;
  let visibleCells = 0;
  let pathCount = 0;
  let heightFade = 1;
  let renderMode: 'gpu-streamlines' | 'polyline-fallback' | 'idle' = 'idle';
  let bakedBudget = 0;
  let reducedMotion = false;

  let offPreRender: (() => void) | null = null;
  let visibilityListener: (() => void) | null = null;
  let motionMedia: MediaQueryList | null = null;
  let motionListener: (() => void) | null = null;

  const liveViewer = (): CesiumWindViewer | null =>
    activeViewer && !activeViewer.isDestroyed?.() ? activeViewer : null;

  function clearStreamlines(): void {
    const scene = liveViewer()?.scene ?? null;
    for (const cell of cells) {
      if (scene?.primitives && !scene.primitives.isDestroyed?.()) {
        try {
          scene.primitives.remove?.(cell.primitive);
        } catch {
          // Ignore already removed
        }
      }
      if (cell.primitive && !cell.primitive.isDestroyed?.()) {
        try {
          cell.primitive.destroy?.();
        } catch {
          // Ignore teardown errors
        }
      }
    }
    cells.length = 0;

    if (fallbackCollection && scene?.primitives && !scene.primitives.isDestroyed?.()) {
      try {
        scene.primitives.remove?.(fallbackCollection);
      } catch {
        // Ignore
      }
    }
    fallbackCollection = null;

    if (material && !material.isDestroyed?.()) {
      try {
        material.destroy?.();
      } catch {
        // Ignore
      }
    }
    material = null;
    occluder = null;
    visibleCells = 0;
    pathCount = 0;
    renderMode = 'idle';
  }

  function clearOverlayImagery(): void {
    overlayRequestSeq += 1;
    const viewer = liveViewer();
    if (overlayImageryLayer && viewer) {
      try {
        viewer.imageryLayers?.remove?.(overlayImageryLayer, true);
      } catch {
        // Ignore
      }
    }
    overlayImageryLayer = null;
  }

  function readCameraHeight(): number {
    const viewer = liveViewer();
    if (!viewer) return 1_000_000;
    const camera = viewer.camera ?? viewer.scene?.camera;
    const h = camera?.positionCartographic?.height;
    return typeof h === 'number' && Number.isFinite(h) ? h : 1_000_000;
  }

  function updateUniforms(): void {
    if (!material) return;
    material.uniforms.ghostAlpha =
      currentPaused || reducedMotion ? GHOST_ALPHA_PAUSED : GHOST_ALPHA;
    material.uniforms.heightFade = enabledState ? heightFade : 0;
  }

  function applyOverlayAlpha(): void {
    if (!overlayImageryLayer || !enabledState) return;
    const camHeight = readCameraHeight();
    const fade = windScalarOverlayFade(camHeight);
    const baseAlpha = currentOverlay === 'temperature' ? 0.72 : 0.6;
    overlayImageryLayer.alpha = baseAlpha * fade;
    overlayImageryLayer.show = overlayImageryLayer.alpha > 0.01;
  }

  async function installOverlayImageryWith<TRectangle>(
    C: CesiumWindOverlayModule<TRectangle>
  ): Promise<void> {
    clearOverlayImagery();
    const initialViewer = liveViewer();
    if (
      disposed ||
      !enabledState ||
      !currentSnapshot ||
      currentOverlay === 'none' ||
      !initialViewer
    ) {
      return;
    }

    const reqSeq = overlayRequestSeq;
    const raster = createWindOverlayRaster(currentSnapshot, currentOverlay);
    if (!raster || typeof document === 'undefined') return;

    const canvas = document.createElement('canvas');
    canvas.width = raster.width;
    canvas.height = raster.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const imageData = ctx.createImageData(raster.width, raster.height);
    imageData.data.set(raster.rgba);
    ctx.putImageData(imageData, 0, 0);
    const dataUrl = canvas.toDataURL('image/png');

    try {
      const rectangle = C.Rectangle?.fromDegrees?.(-180, -90, 180, 90);
      let provider: unknown;
      const SingleTile = C.SingleTileImageryProvider;
      if (SingleTile && 'fromUrl' in SingleTile && typeof SingleTile.fromUrl === 'function') {
        provider = await SingleTile.fromUrl(dataUrl, {
          tileWidth: raster.width,
          tileHeight: raster.height,
          rectangle,
        });
      } else if (typeof SingleTile === 'function') {
        provider = new SingleTile({
          url: dataUrl,
          tileWidth: raster.width,
          tileHeight: raster.height,
          rectangle,
        });
      }

      const currentViewer = liveViewer();
      if (disposed || reqSeq !== overlayRequestSeq || !enabledState || !currentViewer) {
        return;
      }

      if (provider && currentViewer.imageryLayers?.addImageryProvider) {
        overlayImageryLayer = currentViewer.imageryLayers.addImageryProvider(provider);
        applyOverlayAlpha();
      }
    } catch {
      // Optional overlay failure never suppresses wind streamlines
    }
  }

  function resolveBudget(): number {
    const clientWidth = activeViewer?.scene?.canvas?.clientWidth ?? 1280;
    const hardwareConcurrency =
      typeof navigator !== 'undefined' ? navigator.hardwareConcurrency : 8;
    const deviceMemory =
      typeof navigator !== 'undefined'
        ? (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8
        : 8;
    return resolveAdaptivePathBudget({
      viewportWidth: clientWidth,
      hardwareConcurrency,
      deviceMemory,
    });
  }

  function buildStreamlines<
    TRectangle,
    TCartesian,
    TBoundingSphere,
    TMaterial extends CesiumWindMaterial,
    TArcType,
    TVertexFormat,
    TGeometry,
    TCompType,
    TAttr,
    TGeometryInstance,
    TAppearance extends { vertexShaderSource?: string }
  >(
    C: CesiumWindModule<
      TRectangle,
      TCartesian,
      TBoundingSphere,
      TMaterial,
      TArcType,
      TVertexFormat,
      TGeometry,
      TCompType,
      TAttr,
      TGeometryInstance,
      TAppearance
    >,
    snapshot: GlobalWindSnapshot
  ): void {
    clearStreamlines();
    const viewer = liveViewer();
    if (!viewer) return;

    const grid = toWindGridView(snapshot);
    const valid = validateWindGrid(grid, { requireAllFinite: false });
    if (!grid || !valid.ok) return;

    const budget = resolveBudget();
    bakedBudget = budget;
    const paths = bakeWindStreamlines(grid, {
      count: budget,
      steps: WIND_PATH_STEPS,
    });
    if (paths.length === 0) return;

    const color =
      C.Color?.fromCssColorString?.(DEFAULT_STREAMLINE_COLOR) ??
      (typeof C.Color === 'function' ? new C.Color(0.4, 0.85, 0.97, 1) : {});

    try {
      if (
        typeof C.PolylineGeometry !== 'function' ||
        typeof C.PolylineMaterialAppearance !== 'function' ||
        typeof C.Primitive !== 'function'
      ) {
        throw new Error('Cesium Polyline primitive API unavailable');
      }

      const builtMaterial = new C.Material({
        fabric: {
          type: 'AvirWindStreamline',
          uniforms: {
            phaseTime,
            ghostAlpha: GHOST_ALPHA,
            heightFade: 1,
            tipSpeed: TIP_SPEED,
            baseColor: color,
          },
          source: FLOW_MATERIAL_GLSL,
        },
        translucent: () => true,
      });
      material = builtMaterial;

      const probeAppearance = new C.PolylineMaterialAppearance({ material: builtMaterial });
      const rawVs: string = probeAppearance.vertexShaderSource ?? '';
      if (!/void\s+main\s*\(\s*\)/.test(rawVs) || !/v_st\.s\s*=\s*st\.s\s*;/.test(rawVs)) {
        throw new Error('PolylineMaterialAppearance shader patch point unavailable');
      }

      const seededSource = rawVs.replace(
        /v_st\.s\s*=\s*st\.s\s*;/,
        'v_st.s = st.s * 0.999 + czm_batchTable_windSeed(batchId);'
      );
      const vertexShaderSource = `out float v_windFacing;\n${seededSource}`.replace(
        /void\s+main\s*\(\s*\)\s*\{/,
        'void main() {\nvec3 windWorld = (czm_model * vec4(position3DHigh + position3DLow, 1.0)).xyz;\nv_windFacing = dot(normalize(windWorld), normalize(czm_viewerPositionWC - windWorld));\n'
      );

      occluder = new C.Occluder(
        new C.BoundingSphere(C.Cartesian3.ZERO, C.Ellipsoid.WGS84.minimumRadius),
        ((viewer.scene?.camera ?? viewer.camera)?.positionWC ?? C.Cartesian3.ZERO) as TCartesian
      );

      for (const group of groupWindPaths(paths, WIND_CELL_DEGREES)) {
        const cellPositions: TCartesian[] = [];
        const instances = group.paths.map((path) => {
          const positions = path.coordinates.map(([lon, lat]) =>
            C.Cartesian3.fromDegrees(lon, lat, WIND_DISPLAY_HEIGHT_METERS)
          );
          cellPositions.push(...positions);
          const geometry = new C.PolylineGeometry({
            positions,
            width: 2.2,
            arcType: C.ArcType?.NONE,
            vertexFormat: C.PolylineMaterialAppearance.VERTEX_FORMAT,
          });
          return new C.GeometryInstance({
            geometry,
            attributes: {
              windSeed: new C.GeometryInstanceAttribute({
                componentDatatype: C.ComponentDatatype.FLOAT,
                componentsPerAttribute: 1,
                value: [path.seed],
              }),
            },
          });
        });

        const appearance = new C.PolylineMaterialAppearance({
          material: builtMaterial,
          vertexShaderSource,
          translucent: true,
          renderState: { depthTest: { enabled: true }, depthMask: false },
        });

        const primitive = new C.Primitive({
          show: false,
          geometryInstances: instances,
          appearance,
          asynchronous: true,
          allowPicking: false,
          releaseGeometryInstances: true,
          compressVertices: false,
        });

        cells.push({
          primitive,
          sphere: C.BoundingSphere.fromPoints(cellPositions),
        });
        viewer.scene?.primitives?.add?.(primitive);
      }

      pathCount = paths.length;
      renderMode = 'gpu-streamlines';
      updateUniforms();
    } catch {
      clearStreamlines();
      // Safe Cesium PolylineCollection fallback when shader injection is unavailable
      if (typeof C.PolylineCollection === 'function') {
        const collection = new C.PolylineCollection();
        const subset = paths.slice(0, Math.min(paths.length, 1500));
        const lineMat = C.Material?.fromType?.('Color', {
          color: color.withAlpha ? color.withAlpha(0.45) : color,
        });
        for (const path of subset) {
          collection.add?.({
            positions: path.coordinates.map(([lon, lat]) =>
              C.Cartesian3.fromDegrees(lon, lat, WIND_DISPLAY_HEIGHT_METERS)
            ),
            width: 1.4,
            material: lineMat,
          });
        }
        viewer.scene?.primitives?.add?.(collection);
        fallbackCollection = collection;
        pathCount = subset.length;
        renderMode = 'polyline-fallback';
      }
    }
  }

  function handlePreRender(): void {
    const viewer = liveViewer();
    if (disposed || !viewer || !enabledState || !hasActiveCesium) return;

    const scene = viewer.scene;
    const camera = scene?.camera;
    const camHeight = readCameraHeight();
    heightFade = windHeightFade(camHeight);
    updateUniforms();
    applyOverlayAlpha();

    if (renderMode === 'polyline-fallback' && fallbackCollection) {
      fallbackCollection.show = heightFade > 0.01;
      return;
    }

    if (cells.length === 0 || !camera) {
      visibleCells = 0;
      return;
    }

    // Horizon + camera frustum culling per 30° cell
    visibleCells = 0;
    const draws = heightFade > 0.01;
    let cullingVolume: CesiumWindCullingVolume | undefined;
    if (draws && occluder) {
      occluder.cameraPosition = camera.positionWC;
      cullingVolume = camera.frustum?.computeCullingVolume?.(
        camera.positionWC,
        camera.directionWC,
        camera.upWC
      );
    }

    for (const cell of cells) {
      const vis = Boolean(
        draws &&
          occluder?.isBoundingSphereVisible?.(cell.sphere) &&
          cullingVolume?.computeVisibility?.(cell.sphere) !== intersectOutsideValue
      );
      cell.primitive.show = vis;
      if (vis) visibleCells += 1;
    }

    // Animate moving streamline highlights only when active, unpaused, unhidden, and visible
    const isHidden = typeof document !== 'undefined' && document.hidden;
    if (draws && !currentPaused && !reducedMotion && !isHidden && visibleCells > 0 && material) {
      const nowMs =
        typeof performance !== 'undefined' && typeof performance.now === 'function'
          ? performance.now()
          : Date.now();
      if (lastTickMs === null) {
        phaseTime += 1 / 60;
        lastTickMs = nowMs;
      } else {
        const dt = (nowMs - lastTickMs) / 1000;
        if (dt >= STEP_SECONDS) {
          phaseTime = (phaseTime + Math.min(0.1, dt)) % 10_000;
          lastTickMs = nowMs;
        }
      }
      material.uniforms.phaseTime = phaseTime;
    } else {
      lastTickMs = null;
    }
  }

  function attachGlobalListeners(): void {
    const viewer = liveViewer();
    if (!viewer) return;
    if (!offPreRender && viewer.scene?.preRender?.addEventListener) {
      offPreRender = viewer.scene.preRender.addEventListener(handlePreRender) ?? null;
    }
    if (!visibilityListener && typeof document !== 'undefined') {
      visibilityListener = () => {
        lastTickMs = null;
      };
      document.addEventListener('visibilitychange', visibilityListener);
    }
    if (!motionListener && typeof window !== 'undefined' && window.matchMedia) {
      motionMedia = window.matchMedia('(prefers-reduced-motion: reduce)');
      reducedMotion = motionMedia.matches;
      motionListener = () => {
        reducedMotion = Boolean(motionMedia?.matches);
        lastTickMs = null;
        updateUniforms();
      };
      motionMedia.addEventListener?.('change', motionListener);
    }
  }

  function detachGlobalListeners(): void {
    if (offPreRender) {
      try {
        offPreRender();
      } catch {
        // Ignore teardown race
      }
      offPreRender = null;
    }
    if (visibilityListener && typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', visibilityListener);
      visibilityListener = null;
    }
    if (motionMedia && motionListener) {
      motionMedia.removeEventListener?.('change', motionListener);
      motionMedia = null;
      motionListener = null;
    }
  }

  return {
    sync({ viewer, Cesium, enabled, snapshot, overlay, paused }) {
      if (disposed) return;

      const viewerChanged = activeViewer !== viewer;
      if (viewerChanged) {
        detachGlobalListeners();
        clearOverlayImagery();
        clearStreamlines();
      }

      activeViewer = viewer;
      activeOverlayInstall = () => installOverlayImageryWith(Cesium);
      intersectOutsideValue = Cesium.Intersect.OUTSIDE;
      hasActiveCesium = true;
      enabledState = enabled;
      currentPaused = paused;

      if (!enabled || !snapshot || !snapshot.manifest.isAvailable) {
        currentSnapshot = null;
        currentOverlay = 'none';
        clearOverlayImagery();
        clearStreamlines();
        lastTickMs = null;
        return;
      }

      attachGlobalListeners();

      const budget = resolveBudget();
      const fieldChanged = !sameSnapshotField(currentSnapshot, snapshot) || bakedBudget !== budget;
      const overlayChanged = currentOverlay !== overlay || fieldChanged;

      currentSnapshot = snapshot;
      currentOverlay = overlay;

      if (fieldChanged) {
        buildStreamlines(Cesium, snapshot);
      } else {
        updateUniforms();
      }

      if (overlayChanged) {
        void activeOverlayInstall();
      } else {
        applyOverlayAlpha();
      }
    },

    getDiagnostics(): CesiumWindDiagnostics {
      return {
        mode: renderMode,
        pathCount,
        cellCount: cells.length,
        visibleCells,
        heightFade,
        paused: currentPaused,
        reducedMotion,
        ready: renderMode === 'polyline-fallback' || (cells.length > 0 && cells.every((c) => c.primitive.ready)),
      };
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      detachGlobalListeners();
      clearOverlayImagery();
      clearStreamlines();
      activeViewer = null;
      activeOverlayInstall = null;
      hasActiveCesium = false;
      currentSnapshot = null;
    },
  };
}
