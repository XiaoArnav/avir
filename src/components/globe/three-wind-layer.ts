/**
 * Three.js Global Wind-Flow Visualization Layer (Phase 3)
 * 
 * Renders animated particle streamlines hugging the Earth globe surface (radius 90.05),
 * propelled by real atmospheric 10m U/V vector components.
 */

import * as THREE from 'three';
import { WindVectorPoint } from '@/domain/wind-types';
import { latLongToVector3 } from '@/services/geo/geographic-observation-adapter';

export interface ThreeWindLayerOptions {
  radius?: number;
  particleCount?: number;
  color?: THREE.ColorRepresentation;
}

export class ThreeWindLayer {
  private parentGroup: THREE.Group;
  private particleCount: number;
  private radius: number;
  private particlesMesh: THREE.Points | null = null;
  private geometry: THREE.BufferGeometry | null = null;
  private material: THREE.PointsMaterial | null = null;
  private particlePositions: Float32Array;
  private particleLats: Float32Array;
  private particleLngs: Float32Array;
  private particleAges: Float32Array;
  private particleMaxAges: Float32Array;
  private windVectors: WindVectorPoint[] = [];

  constructor(parentGroup: THREE.Group, options: ThreeWindLayerOptions = {}) {
    this.parentGroup = parentGroup;
    this.radius = options.radius ?? 90.1;
    this.particleCount = options.particleCount ?? 450;

    this.particlePositions = new Float32Array(this.particleCount * 3);
    this.particleLats = new Float32Array(this.particleCount);
    this.particleLngs = new Float32Array(this.particleCount);
    this.particleAges = new Float32Array(this.particleCount);
    this.particleMaxAges = new Float32Array(this.particleCount);

    this.initParticles();
  }

  public setWindVectors(vectors: WindVectorPoint[]) {
    this.windVectors = vectors;
  }

  private initParticles() {
    this.geometry = new THREE.BufferGeometry();

    for (let i = 0; i < this.particleCount; i++) {
      this.resetParticle(i);
    }

    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.particlePositions, 3));

    // Dynamic glowing cyan/sky atmospheric particle material
    this.material = new THREE.PointsMaterial({
      color: 0x38bdf8,
      size: 2.2,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.particlesMesh = new THREE.Points(this.geometry, this.material);
    this.parentGroup.add(this.particlesMesh);
  }

  private resetParticle(i: number) {
    if (this.windVectors.length > 0 && Math.random() < 0.85) {
      // Spawn near an active wind vector probe
      const ref = this.windVectors[Math.floor(Math.random() * this.windVectors.length)];
      this.particleLats[i] = ref.latitude + (Math.random() - 0.5) * 12;
      this.particleLngs[i] = ref.longitude + (Math.random() - 0.5) * 12;
    } else {
      // Random surface distribution
      this.particleLats[i] = (Math.random() - 0.5) * 140; // Avoid extreme poles
      this.particleLngs[i] = (Math.random() - 0.5) * 360;
    }

    this.particleAges[i] = 0;
    this.particleMaxAges[i] = 60 + Math.random() * 80; // Lifespan in frames

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
   * Updates particle positions along U/V vector fields each animation frame.
   */
  public update(deltaSeconds: number = 0.016) {
    if (!this.geometry || !this.particlesMesh || !this.particlesMesh.visible) return;

    const speedScale = 0.08 * (deltaSeconds / 0.016);

    for (let i = 0; i < this.particleCount; i++) {
      this.particleAges[i] += 1;
      if (this.particleAges[i] >= this.particleMaxAges[i]) {
        this.resetParticle(i);
        continue;
      }

      const lat = this.particleLats[i];
      const lng = this.particleLngs[i];

      // Find nearest or interpolated wind vector
      const vec = this.findNearestWindVector(lat, lng);
      const u = vec ? vec.u : -2.0; // Eastward
      const v = vec ? vec.v : 0.5;  // Northward

      // Displace lat and lng according to (u, v) in m/s
      // 1 deg latitude ≈ 111,000 meters; 1 deg longitude ≈ 111,000 * cos(lat) meters
      const latCos = Math.max(0.15, Math.cos((lat * Math.PI) / 180));
      this.particleLats[i] += (v / 111000) * 3600 * speedScale;
      this.particleLngs[i] += ((u / (111000 * latCos)) * 3600 * speedScale);

      // Longitude wrapping
      if (this.particleLngs[i] > 180) this.particleLngs[i] -= 360;
      if (this.particleLngs[i] < -180) this.particleLngs[i] += 360;

      this.update3DPosition(i);
    }

    const posAttr = this.geometry.getAttribute('position') as THREE.BufferAttribute;
    posAttr.needsUpdate = true;
  }

  private findNearestWindVector(lat: number, lng: number): WindVectorPoint | null {
    if (this.windVectors.length === 0) return null;

    let nearest = this.windVectors[0];
    let minDistSq = Infinity;

    for (const wv of this.windVectors) {
      const dLat = wv.latitude - lat;
      const dLng = wv.longitude - lng;
      const distSq = dLat * dLat + dLng * dLng;
      if (distSq < minDistSq) {
        minDistSq = distSq;
        nearest = wv;
      }
    }

    return nearest;
  }

  public setVisible(visible: boolean) {
    if (this.particlesMesh) {
      this.particlesMesh.visible = visible;
    }
  }

  public dispose() {
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
