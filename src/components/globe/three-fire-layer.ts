/**
 * Three.js NASA FIRMS Active-Fire Hotspots Visualization Layer (Phase 4)
 * 
 * Renders satellite-detected thermal anomalies as pulsing radiant thermal beacons
 * hugging the Earth globe surface at radius 90.15.
 */

import * as THREE from 'three';
import { FirmsHotspot } from '@/domain/firms-types';
import { latLongToVector3 } from '@/services/geo/geographic-observation-adapter';

export interface ThreeFireLayerOptions {
  radius?: number;
}

export class ThreeFireLayer {
  private parentGroup: THREE.Group;
  private radius: number;
  private fireGroup: THREE.Group;
  private hotspots: FirmsHotspot[] = [];
  private pulseMaterials: THREE.MeshBasicMaterial[] = [];

  constructor(parentGroup: THREE.Group, options: ThreeFireLayerOptions = {}) {
    this.parentGroup = parentGroup;
    this.radius = options.radius ?? 90.15;
    this.fireGroup = new THREE.Group();
    this.parentGroup.add(this.fireGroup);
  }

  public setHotspots(hotspots: FirmsHotspot[]) {
    this.clear();
    this.hotspots = hotspots.slice(0, 500); // Cap to 500 active hotspots for optimal WebGL performance

    const coreGeo = new THREE.SphereGeometry(0.45, 8, 8);
    const ringGeo = new THREE.RingGeometry(0.5, 0.9, 16);

    this.hotspots.forEach((spot, idx) => {
      const rawPos = latLongToVector3(spot.latitude, spot.longitude, this.radius);
      const pos = new THREE.Vector3(rawPos.x, rawPos.y, rawPos.z);
      const normal = pos.clone().normalize();

      // Color intensity based on Fire Radiative Power (FRP)
      const frp = spot.frp ?? 10;
      const isHighIntensity = frp > 50;
      const color = isHighIntensity ? 0xef4444 : 0xf97316; // Red or Orange

      // 1. Central Core Bead
      const coreMat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.9,
      });
      const coreMesh = new THREE.Mesh(coreGeo, coreMat);
      coreMesh.position.copy(pos);
      coreMesh.userData = { spot, isFireCore: true };
      this.fireGroup.add(coreMesh);

      // 2. Radiating Thermal Pulse Ring
      const ringMat = new THREE.MeshBasicMaterial({
        color,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.7,
        blending: THREE.AdditiveBlending,
      });
      this.pulseMaterials.push(ringMat);

      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      ringMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
      ringMesh.position.copy(pos).addScaledVector(normal, 0.05);
      ringMesh.userData = {
        spot,
        isFireRing: true,
        phase: (idx * 0.3) % (Math.PI * 2),
      };
      this.fireGroup.add(ringMesh);
    });
  }

  /**
   * Animates pulsing thermal emission rings and updates camera backside occlusion.
   */
  public update(cameraPosition: THREE.Vector3, elapsedTime: number) {
    if (!this.fireGroup.visible || this.hotspots.length === 0) return;

    const globeCenter = new THREE.Vector3(0, 0, 0);

    this.fireGroup.children.forEach((child) => {
      const markerWorldPos = child.position;
      const normal = markerWorldPos.clone().sub(globeCenter).normalize();
      const toCam = cameraPosition.clone().sub(markerWorldPos).normalize();

      // Back-side occlusion check: normal.dot(toCam) > 0.05
      child.visible = normal.dot(toCam) > 0.05;

      if (child.visible && child.userData?.isFireRing) {
        const pulse = (Math.sin(elapsedTime * 4.0 + child.userData.phase) + 1) * 0.5;
        const scale = 1.0 + pulse * 0.6;
        child.scale.set(scale, scale, scale);
        const mat = (child as THREE.Mesh).material as THREE.MeshBasicMaterial;
        if (mat) {
          mat.opacity = 0.75 - pulse * 0.45;
        }
      }
    });
  }

  public setVisible(visible: boolean) {
    this.fireGroup.visible = visible;
  }

  public clear() {
    while (this.fireGroup.children.length > 0) {
      const child = this.fireGroup.children.pop() as THREE.Mesh;
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
        else child.material.dispose();
      }
    }
    this.pulseMaterials = [];
    this.hotspots = [];
  }

  public dispose() {
    this.clear();
    if (this.parentGroup.children.includes(this.fireGroup)) {
      this.parentGroup.remove(this.fireGroup);
    }
  }
}
