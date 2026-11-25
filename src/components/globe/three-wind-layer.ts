/**
 * Three.js Global Wind-Flow Visualization Layer (Phase 6)
 *
 * Renders curved, GPU-animated wind streamlines hugging the Earth sphere from the shared
 * validated GFS/IFS global wind grid (`bakeWindStreamlines`), with:
 * - Thin sphere-tangent quad ribbons + custom GLSL shader animation (`uPhaseTime`)
 * - Strict front-hemisphere backface horizon occlusion in GLSL
 * - Smooth camera-altitude fade on close surface approach
 * - Optional scalar field overlay sphere (`Speed`, `2m Temperature`, `MSL Pressure`)
 * - Pause / Resume & `prefers-reduced-motion` support
 * - Clean resource disposal with zero GPU buffer leaks
 *
 * Also retains full backwards compatibility for the legacy `setWindVectors(WindVectorPoint[])`
 * particle test contract without fabricating vectors when data is unavailable.
 */

import * as THREE from 'three';
import { GlobalWindOverlayKind, GlobalWindSnapshot, WindVectorPoint } from '@/domain/wind-types';
import { createWindOverlayRaster, toWindGridView, validateWindGrid } from '@/domain/wind-field';
import {
  WIND_PATH_STEPS,
  bakeWindStreamlines,
  resolveAdaptivePathBudget,
} from '@/domain/wind-streamlines';
import { latLongToVector3 } from '@/services/geo/geographic-observation-adapter';

export interface ThreeWindLayerOptions {
  radius?: number;
  particleCount?: number;
  color?: THREE.ColorRepresentation;
  maxProbeInfluenceDeg?: number;
}

const DEFAULT_MAX_PROBE_INFLUENCE_DEG = 14;
const VISUAL_STREAMLINE_SCALE = 0.08;
const METERS_PER_DEGREE_LAT = 111000;
const MIN_LAT_CLAMP = -85;
const MAX_LAT_CLAMP = 85;
const STREAMLINE_RIBBON_HALF_WIDTH = 0.22;

const STREAMLINE_VERTEX_SHADER = `
  attribute vec3 aNormal;
  attribute vec2 aSt;
  attribute float aSeed;
  attribute float aSpeed;

  varying vec2 vSt;
  varying float vSeed;
  varying float vSpeed;
  varying float vFacing;

  void main() {
    vSt = aSt;
    vSeed = aSeed;
    vSpeed = aSpeed;

    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vec3 worldNormal = normalize(mat3(modelMatrix) * aNormal);
    vec3 toCamera = normalize(cameraPosition - worldPos.xyz);
    vFacing = dot(worldNormal, toCamera);

    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

const STREAMLINE_FRAGMENT_SHADER = `
  uniform float uPhaseTime;
  uniform float uTipSpeed;
  uniform float uGhostAlpha;
  uniform float uHeightFade;
  uniform vec3 uBaseColor;

  varying vec2 vSt;
  varying float vSeed;
  varying float vSpeed;
  varying float vFacing;

  void main() {
    float horizon = smoothstep(0.02, 0.14, vFacing);
    if (horizon <= 0.001) discard;

    float offset = fract((vSeed + 1.0) * 0.61803398875);
    float speedMod = mix(0.75, 1.35, clamp(vSpeed / 25.0, 0.0, 1.0));
    float behind = fract(uPhaseTime * uTipSpeed * speedMod + offset - vSt.s);

    float tail = 1.0 - smoothstep(0.0, 0.32, behind);
    float tip = 1.0 - smoothstep(0.0, 0.045, behind);
    float ends = smoothstep(0.0, 0.055, vSt.s) * (1.0 - smoothstep(0.945, 1.0, vSt.s));
    float edge = 1.0 - smoothstep(0.24, 0.5, abs(vSt.t - 0.5));

    vec3 color = mix(uBaseColor, vec3(0.92, 0.99, 1.0), tip);
    float alpha = (uGhostAlpha + 0.62 * tail + 0.18 * tip) * ends * edge * horizon * uHeightFade;

    if (alpha <= 0.005) discard;
    gl_FragColor = vec4(color, alpha);
  }
`;

function wrapLongitude(lng: number): number {
  let normalized = ((lng + 180) % 360 + 360) % 360 - 180;
  if (normalized === -180 && lng > 0) normalized = 180;
  return normalized;
}

function clampLatitude(lat: number): number {
  return Math.max(MIN_LAT_CLAMP, Math.min(MAX_LAT_CLAMP, lat));
}

function isValidWindVector(wv: WindVectorPoint): boolean {
  return (
    Boolean(wv) &&
    Number.isFinite(wv.latitude) &&
    wv.latitude >= -90 &&
    wv.latitude <= 90 &&
    Number.isFinite(wv.longitude) &&
    wv.longitude >= -180 &&
    wv.longitude <= 180 &&
    Number.isFinite(wv.u) &&
    Number.isFinite(wv.v) &&
    Number.isFinite(wv.speedKmh) &&
    wv.speedKmh >= 0
  );
}

/** Computes smooth altitude opacity fade for Three.js camera distances (EARTH_RADIUS=90). */
export function threeWindDistanceFade(cameraDistance: number, globeRadius = 90): number {
  if (!Number.isFinite(cameraDistance)) return 1;
  const altitude = cameraDistance - globeRadius;
  return Math.max(0.08, Math.min(1, (altitude - 10) / 30));
}

export class ThreeWindLayer {
  private parentGroup: THREE.Group;
  private particleCount: number;
  private radius: number;
  private maxProbeInfluenceDeg: number;

  // Slot 0 compatibility Points (kept for legacy point-probe unit tests)
  private particlesMesh: THREE.Points | null = null;
  private geometry: THREE.BufferGeometry | null = null;
  private material: THREE.PointsMaterial | null = null;
  private particlePositions: Float32Array;
  private particleLats: Float32Array;
  private particleLngs: Float32Array;
  private particleAges: Float32Array;
  private particleMaxAges: Float32Array;
  private windVectors: WindVectorPoint[] = [];

  // V2 GPU Shader Streamline Ribbon + Scalar Overlay Sphere
  private streamlineMesh: THREE.Mesh | null = null;
  private streamlineGeometry: THREE.BufferGeometry | null = null;
  private streamlineMaterial: THREE.ShaderMaterial | null = null;
  private overlayMesh: THREE.Mesh | null = null;
  private overlayGeometry: THREE.BufferGeometry | null = null;
  private overlayMaterial: THREE.MeshBasicMaterial | null = null;
  private overlayTexture: THREE.Texture | null = null;

  private activeSnapshot: GlobalWindSnapshot | null = null;
  private activeFieldKey: string | null = null;
  private activeOverlay: GlobalWindOverlayKind = 'none';
  private paused = false;
  private reducedMotion = false;
  private layerVisible = true;
  private phaseTime = 0;
  private streamlineCount = 0;
  private disposed = false;

  constructor(parentGroup: THREE.Group, options: ThreeWindLayerOptions = {}) {
    this.parentGroup = parentGroup;
    this.radius = options.radius ?? 90.1;
    this.particleCount = Math.max(0, options.particleCount ?? 450);
    this.maxProbeInfluenceDeg = options.maxProbeInfluenceDeg ?? DEFAULT_MAX_PROBE_INFLUENCE_DEG;

    this.particlePositions = new Float32Array(this.particleCount * 3);
    this.particleLats = new Float32Array(this.particleCount);
    this.particleLngs = new Float32Array(this.particleCount);
    this.particleAges = new Float32Array(this.particleCount);
    this.particleMaxAges = new Float32Array(this.particleCount);

    this.initParticles(options.color ?? 0x38bdf8);
  }

  /** V2 Global Wind Streamlines entry point shared with CesiumJS forecast snapshot. */
  public setGlobalField(
    snapshot: GlobalWindSnapshot | null,
    options: {
      overlay?: GlobalWindOverlayKind;
      paused?: boolean;
      reducedMotion?: boolean;
      viewportWidth?: number;
    } = {}
  ): void {
    if (this.disposed) return;

    if (typeof options.paused === 'boolean') this.paused = options.paused;
    if (typeof options.reducedMotion === 'boolean') this.reducedMotion = options.reducedMotion;
    const nextOverlay = options.overlay ?? snapshot?.manifest.overlay ?? 'none';

    if (!snapshot || !snapshot.manifest.isAvailable) {
      this.clearGlobalField();
      return;
    }

    const grid = toWindGridView(snapshot);
    const valid = validateWindGrid(grid, { requireAllFinite: false });
    if (!grid || !valid.ok) {
      this.clearGlobalField();
      return;
    }

    // Deactivate legacy scattered points cleanly while V2 streamlines drive rendering
    if (this.geometry && this.particlesMesh) {
      this.geometry.setDrawRange(0, 0);
      this.particlesMesh.visible = false;
    }

    const budget = resolveAdaptivePathBudget({
      viewportWidth:
        options.viewportWidth ?? (typeof window !== 'undefined' ? window.innerWidth : 1280),
      hardwareConcurrency:
        typeof navigator !== 'undefined' ? navigator.hardwareConcurrency : 8,
      deviceMemory:
        typeof navigator !== 'undefined' ? (navigator as any).deviceMemory ?? 8 : 8,
    });

    const nextFieldKey = `${snapshot.manifest.model}|${snapshot.manifest.initTimeUtc}|${snapshot.manifest.validTimeUtc}|${budget}`;
    if (nextFieldKey !== this.activeFieldKey) {
      this.activeSnapshot = snapshot;
      this.activeFieldKey = nextFieldKey;
      this.rebuildStreamlineMesh(grid, budget);
    } else {
      this.activeSnapshot = snapshot;
    }

    if (nextOverlay !== this.activeOverlay || !this.overlayMesh) {
      this.activeOverlay = nextOverlay;
      this.rebuildOverlaySphere(snapshot, nextOverlay);
    }

    this.syncVisibility();
    this.syncShaderUniforms();
  }

  public setOptions(options: {
    overlay?: GlobalWindOverlayKind;
    paused?: boolean;
    reducedMotion?: boolean;
  }): void {
    if (this.disposed) return;
    if (typeof options.paused === 'boolean') this.paused = options.paused;
    if (typeof options.reducedMotion === 'boolean') this.reducedMotion = options.reducedMotion;
    if (options.overlay && options.overlay !== this.activeOverlay) {
      this.activeOverlay = options.overlay;
      if (this.activeSnapshot) {
        this.rebuildOverlaySphere(this.activeSnapshot, options.overlay);
      }
    }
    this.syncShaderUniforms();
    this.syncVisibility();
  }

  public clearGlobalField(): void {
    this.activeSnapshot = null;
    this.activeFieldKey = null;
    this.streamlineCount = 0;

    if (this.streamlineMesh && this.streamlineMesh.parent) {
      this.streamlineMesh.parent.remove(this.streamlineMesh);
    }
    this.streamlineGeometry?.dispose();
    this.streamlineMaterial?.dispose();
    this.streamlineGeometry = null;
    this.streamlineMaterial = null;
    this.streamlineMesh = null;

    this.disposeOverlaySphere();
  }

  public getStreamlineCount(): number {
    return this.streamlineCount;
  }

  private rebuildStreamlineMesh(
    grid: NonNullable<ReturnType<typeof toWindGridView>>,
    budget: number
  ): void {
    if (this.streamlineMesh && this.streamlineMesh.parent) {
      this.streamlineMesh.parent.remove(this.streamlineMesh);
    }
    this.streamlineGeometry?.dispose();
    this.streamlineMaterial?.dispose();
    this.streamlineMesh = null;
    this.streamlineGeometry = null;
    this.streamlineMaterial = null;
    this.streamlineCount = 0;

    const paths = bakeWindStreamlines(grid, {
      count: budget,
      steps: WIND_PATH_STEPS,
    });
    if (paths.length === 0) return;

    let totalVertices = 0;
    let totalIndices = 0;
    for (const p of paths) {
      const n = p.coordinates.length;
      if (n < 2) continue;
      totalVertices += n * 2;
      totalIndices += (n - 1) * 6;
    }
    if (totalVertices === 0) return;

    const positions = new Float32Array(totalVertices * 3);
    const normals = new Float32Array(totalVertices * 3);
    const sts = new Float32Array(totalVertices * 2);
    const seeds = new Float32Array(totalVertices);
    const speeds = new Float32Array(totalVertices);
    const indices = new Uint32Array(totalIndices);

    const pCurr = new THREE.Vector3();
    const pPrev = new THREE.Vector3();
    const pNext = new THREE.Vector3();
    const tangent = new THREE.Vector3();
    const radial = new THREE.Vector3();
    const side = new THREE.Vector3();

    let vCursor = 0;
    let iCursor = 0;

    for (const path of paths) {
      const coords = path.coordinates;
      const n = coords.length;
      if (n < 2) continue;

      const baseVertex = vCursor;
      const denom = n - 1;

      for (let k = 0; k < n; k++) {
        const [lon, lat] = coords[k];
        const posObj = latLongToVector3(lat, lon, this.radius);
        pCurr.set(posObj.x, posObj.y, posObj.z);
        radial.copy(pCurr).normalize();

        const prevIdx = Math.max(0, k - 1);
        const nextIdx = Math.min(n - 1, k + 1);
        const prevObj = latLongToVector3(coords[prevIdx][1], coords[prevIdx][0], this.radius);
        const nextObj = latLongToVector3(coords[nextIdx][1], coords[nextIdx][0], this.radius);
        pPrev.set(prevObj.x, prevObj.y, prevObj.z);
        pNext.set(nextObj.x, nextObj.y, nextObj.z);

        tangent.subVectors(pNext, pPrev);
        if (tangent.lengthSq() < 1e-10) {
          tangent.set(1, 0, 0);
        } else {
          tangent.normalize();
        }
        side.crossVectors(tangent, radial);
        if (side.lengthSq() < 1e-10) {
          side.set(0, 1, 0);
        } else {
          side.normalize();
        }

        const along = k / denom;
        for (const dir of [-1, 1] as const) {
          const vx = pCurr.x + side.x * dir * STREAMLINE_RIBBON_HALF_WIDTH;
          const vy = pCurr.y + side.y * dir * STREAMLINE_RIBBON_HALF_WIDTH;
          const vz = pCurr.z + side.z * dir * STREAMLINE_RIBBON_HALF_WIDTH;

          positions[vCursor * 3] = vx;
          positions[vCursor * 3 + 1] = vy;
          positions[vCursor * 3 + 2] = vz;

          normals[vCursor * 3] = radial.x;
          normals[vCursor * 3 + 1] = radial.y;
          normals[vCursor * 3 + 2] = radial.z;

          sts[vCursor * 2] = along;
          sts[vCursor * 2 + 1] = dir < 0 ? 0 : 1;

          seeds[vCursor] = path.seed;
          speeds[vCursor] = path.speedMs;
          vCursor++;
        }

        if (k < n - 1) {
          const a = baseVertex + k * 2;
          const b = a + 1;
          const c = a + 2;
          const d = a + 3;
          indices[iCursor++] = a;
          indices[iCursor++] = c;
          indices[iCursor++] = b;
          indices[iCursor++] = b;
          indices[iCursor++] = c;
          indices[iCursor++] = d;
        }
      }
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geom.setAttribute('aNormal', new THREE.BufferAttribute(normals, 3));
    geom.setAttribute('aSt', new THREE.BufferAttribute(sts, 2));
    geom.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
    geom.setAttribute('aSpeed', new THREE.BufferAttribute(speeds, 1));
    geom.setIndex(new THREE.BufferAttribute(indices, 1));
    geom.computeBoundingSphere();

    const mat = new THREE.ShaderMaterial({
      vertexShader: STREAMLINE_VERTEX_SHADER,
      fragmentShader: STREAMLINE_FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: {
        uPhaseTime: { value: this.phaseTime },
        uTipSpeed: { value: 0.22 },
        uGhostAlpha: { value: this.paused || this.reducedMotion ? 0.36 : 0.25 },
        uHeightFade: { value: 1.0 },
        uBaseColor: { value: new THREE.Color(0x67d8f7) },
      },
    });

    const mesh = new THREE.Mesh(geom, mat);
    mesh.renderOrder = 3;
    mesh.frustumCulled = false;

    this.streamlineGeometry = geom;
    this.streamlineMaterial = mat;
    this.streamlineMesh = mesh;
    this.streamlineCount = paths.length;
    this.parentGroup.add(mesh);
  }

  private disposeOverlaySphere(): void {
    if (this.overlayMesh && this.overlayMesh.parent) {
      this.overlayMesh.parent.remove(this.overlayMesh);
    }
    this.overlayTexture?.dispose();
    this.overlayGeometry?.dispose();
    this.overlayMaterial?.dispose();
    this.overlayTexture = null;
    this.overlayGeometry = null;
    this.overlayMaterial = null;
    this.overlayMesh = null;
  }

  private rebuildOverlaySphere(
    snapshot: GlobalWindSnapshot,
    overlay: GlobalWindOverlayKind
  ): void {
    this.disposeOverlaySphere();
    if (overlay === 'none' || typeof document === 'undefined') return;

    const raster = createWindOverlayRaster(snapshot, overlay);
    if (!raster) return;

    const canvas = document.createElement('canvas');
    canvas.width = raster.width;
    canvas.height = raster.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const imageData = ctx.createImageData(raster.width, raster.height);
    imageData.data.set(raster.rgba);
    ctx.putImageData(imageData, 0, 0);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;

    const geom = new THREE.SphereGeometry(Math.max(89.5, this.radius - 0.18), 64, 32);
    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      opacity: overlay === 'temperature' ? 0.72 : 0.58,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.renderOrder = 1;

    this.overlayTexture = tex;
    this.overlayGeometry = geom;
    this.overlayMaterial = mat;
    this.overlayMesh = mesh;
    this.parentGroup.add(mesh);
  }

  private syncShaderUniforms(): void {
    if (!this.streamlineMaterial) return;
    this.streamlineMaterial.uniforms.uGhostAlpha.value =
      this.paused || this.reducedMotion ? 0.36 : 0.25;
  }

  private syncVisibility(): void {
    const showGlobal = this.layerVisible && this.streamlineCount > 0;
    if (this.streamlineMesh) {
      this.streamlineMesh.visible = showGlobal;
    }
    if (this.overlayMesh) {
      this.overlayMesh.visible = showGlobal && this.activeOverlay !== 'none';
    }
    if (this.particlesMesh) {
      this.particlesMesh.visible =
        this.layerVisible && this.streamlineCount === 0 && this.windVectors.length > 0;
    }
  }

  public setWindVectors(vectors: WindVectorPoint[]) {
    if (this.disposed) return;

    this.windVectors = Array.isArray(vectors) ? vectors.filter(isValidWindVector) : [];

    if (!this.geometry || !this.particlesMesh) return;

    if (this.windVectors.length === 0) {
      this.geometry.setDrawRange(0, 0);
      this.particlesMesh.visible = false;
      return;
    }

    this.geometry.setDrawRange(0, this.particleCount);
    this.particlesMesh.visible = this.layerVisible && this.streamlineCount === 0;

    for (let i = 0; i < this.particleCount; i++) {
      this.resetParticle(i);
    }
    const posAttr = this.geometry.getAttribute('position') as THREE.BufferAttribute;
    if (posAttr) posAttr.needsUpdate = true;
  }

  public getActiveVectorCount(): number {
    return this.streamlineCount > 0 ? this.streamlineCount : this.windVectors.length;
  }

  private initParticles(color: THREE.ColorRepresentation) {
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.particlePositions, 3));
    this.geometry.setDrawRange(0, 0);

    this.material = new THREE.PointsMaterial({
      color,
      size: 2.2,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.particlesMesh = new THREE.Points(this.geometry, this.material);
    this.particlesMesh.visible = false;
    this.parentGroup.add(this.particlesMesh);
  }

  private resetParticle(i: number) {
    if (this.windVectors.length === 0) {
      this.particleAges[i] = 0;
      return;
    }

    const ref = this.windVectors[Math.floor(Math.random() * this.windVectors.length)];
    const jitterRadius = Math.min(8, this.maxProbeInfluenceDeg * 0.6);
    this.particleLats[i] = clampLatitude(ref.latitude + (Math.random() - 0.5) * jitterRadius);
    this.particleLngs[i] = wrapLongitude(ref.longitude + (Math.random() - 0.5) * jitterRadius);

    this.particleAges[i] = 0;
    this.particleMaxAges[i] = 60 + Math.random() * 80;

    this.update3DPosition(i);
  }

  private update3DPosition(i: number) {
    const lat = this.particleLats[i];
    const lng = this.particleLngs[i];

    const pos = latLongToVector3(lat, lng, this.radius);
    this.particlePositions[i * 3] = pos.x;
    this.particlePositions[i * 3 + 1] = pos.y;
    this.particlePositions[i * 3 + 2] = pos.z;
  }

  public update(deltaSeconds = 0.016, cameraDistance?: number) {
    if (this.disposed || !this.layerVisible) return;

    if (this.streamlineCount > 0 && this.streamlineMaterial) {
      const fade =
        typeof cameraDistance === 'number'
          ? threeWindDistanceFade(cameraDistance, this.radius - 0.35)
          : 1;
      this.streamlineMaterial.uniforms.uHeightFade.value = fade;

      if (!this.paused && !this.reducedMotion && deltaSeconds > 0) {
        const safeDt = Number.isFinite(deltaSeconds) ? Math.min(deltaSeconds, 0.1) : 0.016;
        this.phaseTime = (this.phaseTime + safeDt) % 10_000;
        this.streamlineMaterial.uniforms.uPhaseTime.value = this.phaseTime;
      }
      return;
    }

    if (!this.geometry || !this.particlesMesh || this.windVectors.length === 0) {
      return;
    }
    if (this.paused || this.reducedMotion) return;

    const safeDelta = Number.isFinite(deltaSeconds)
      ? Math.min(Math.max(deltaSeconds, 0), 0.1)
      : 0.016;
    const visualStep = VISUAL_STREAMLINE_SCALE * (safeDelta / 0.016);

    for (let i = 0; i < this.particleCount; i++) {
      this.particleAges[i] += 1;
      if (this.particleAges[i] >= this.particleMaxAges[i]) {
        this.resetParticle(i);
        continue;
      }

      const lat = this.particleLats[i];
      const lng = this.particleLngs[i];

      const vec = this.findNearestWindVector(lat, lng);
      if (!vec) {
        this.resetParticle(i);
        continue;
      }

      if (vec.u === 0 && vec.v === 0) {
        continue;
      }

      const latCos = Math.max(0.15, Math.cos((lat * Math.PI) / 180));
      const nextLat = lat + (vec.v / METERS_PER_DEGREE_LAT) * 3600 * visualStep;
      const nextLng = lng + (vec.u / (METERS_PER_DEGREE_LAT * latCos)) * 3600 * visualStep;

      if (Math.abs(nextLat) > MAX_LAT_CLAMP) {
        this.resetParticle(i);
        continue;
      }

      this.particleLats[i] = clampLatitude(nextLat);
      this.particleLngs[i] = wrapLongitude(nextLng);

      this.update3DPosition(i);
    }

    const posAttr = this.geometry.getAttribute('position') as THREE.BufferAttribute;
    if (posAttr) posAttr.needsUpdate = true;
  }

  private findNearestWindVector(lat: number, lng: number): WindVectorPoint | null {
    if (this.windVectors.length === 0) return null;

    let nearest: WindVectorPoint | null = null;
    let minDistSq = this.maxProbeInfluenceDeg * this.maxProbeInfluenceDeg;

    for (const wv of this.windVectors) {
      const dLat = wv.latitude - lat;
      let dLng = Math.abs(wv.longitude - lng);
      if (dLng > 180) dLng = 360 - dLng;
      const distSq = dLat * dLat + dLng * dLng;
      if (distSq <= minDistSq) {
        minDistSq = distSq;
        nearest = wv;
      }
    }

    return nearest;
  }

  public setVisible(visible: boolean) {
    this.layerVisible = visible;
    this.syncVisibility();
  }

  public dispose() {
    this.disposed = true;
    this.windVectors = [];
    this.clearGlobalField();
    if (this.particlesMesh && this.parentGroup.children.includes(this.particlesMesh)) {
      this.parentGroup.remove(this.particlesMesh);
    }
    this.geometry?.dispose();
    this.material?.dispose();
    this.geometry = null;
    this.material = null;
    this.particlesMesh = null;
  }
}
