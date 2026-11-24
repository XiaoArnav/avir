/**
 * Three.js Global Wind-Flow Visualization Layer (Phase 3)
 *
 * Renders animated particle streamlines hugging the Earth globe surface,
 * strictly propelled by validated 10m atmospheric U/V vector samples.
 *
 * Integrity Guarantees:
 * - Zero Fabrication: Never animates fallback vectors when wind data is unavailable.
 * - Bounded Spatial Influence: Particles only animate within local proximity of validated probes
 *   (no global extrapolation over unmeasured oceans or poles).
 * - Animation vs Physics: `VISUAL_STREAMLINE_SCALE` controls visual motion speed only; physical
 *   velocities remain in `WindVectorPoint` (`u`, `v`, `speedMs`, `speedKmh`).
 */

import * as THREE from 'three';
import { WindVectorPoint } from '@/domain/wind-types';
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

export class ThreeWindLayer {
  private parentGroup: THREE.Group;
  private particleCount: number;
  private radius: number;
  private maxProbeInfluenceDeg: number;
  private particlesMesh: THREE.Points | null = null;
  private geometry: THREE.BufferGeometry | null = null;
  private material: THREE.PointsMaterial | null = null;
  private particlePositions: Float32Array;
  private particleLats: Float32Array;
  private particleLngs: Float32Array;
  private particleAges: Float32Array;
  private particleMaxAges: Float32Array;
  private windVectors: WindVectorPoint[] = [];
  private layerVisible = true;
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
    this.particlesMesh.visible = this.layerVisible;

    for (let i = 0; i < this.particleCount; i++) {
      this.resetParticle(i);
    }
    const posAttr = this.geometry.getAttribute('position') as THREE.BufferAttribute;
    if (posAttr) posAttr.needsUpdate = true;
  }

  public getActiveVectorCount(): number {
    return this.windVectors.length;
  }

  private initParticles(color: THREE.ColorRepresentation) {
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.particlePositions, 3));
    // Start hidden with 0 drawn particles until validated wind vectors are provided
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

    // Spawn strictly within bounded proximity of validated atmospheric wind probes
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

  /**
   * Advances qualitative streamline particles along validated local U/V fields.
   * No motion is simulated when `windVectors` is empty or outside bounded probe coverage.
   */
  public update(deltaSeconds: number = 0.016) {
    if (
      this.disposed ||
      !this.geometry ||
      !this.particlesMesh ||
      !this.layerVisible ||
      this.windVectors.length === 0
    ) {
      return;
    }

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

      // Calm wind (0, 0) renders stationary particles without inventing motion
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
    if (this.particlesMesh) {
      this.particlesMesh.visible = visible && this.windVectors.length > 0;
    }
  }

  public dispose() {
    this.disposed = true;
    this.windVectors = [];
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
