/**
 * Three.js NASA FIRMS Active-Fire Hotspots Visualization Layer (Phase 4)
 *
 * Renders validated NASA FIRMS satellite thermal anomaly detections on the Earth globe.
 *
 * Scientific & Visual Guarantees:
 * - Zero Fabricated FRP: Missing FRP (`null`) renders with an explicit unknown/neutral visual
 *   marker (`0xfbbf24`) rather than fabricating an arbitrary MW intensity value.
 * - Visualization Convention Only: Marker colors classify visual contrast for measured FRP (`> 50 MW`
 *   crimson vs `0..50 MW` orange vs `null` neutral amber), never wildfire verification or smoke exposure.
 * - Clean GPU Lifecycle: Properly detaches child meshes (`fireGroup.remove`) and disposes shared
 *   geometries once alongside per-marker materials.
 */

import * as THREE from 'three';
import { FirmsHotspot } from '@/domain/firms-types';
import { latLongToVector3 } from '@/services/geo/geographic-observation-adapter';

export interface ThreeFireLayerOptions {
  radius?: number;
}

export type FireVisualCategory = 'elevated_frp_visual' | 'measured_frp_visual' | 'unknown_frp';

const ELEVATED_FRP_VISUAL_THRESHOLD_MW = 50;
const COLOR_ELEVATED_FRP = 0xef4444; // Visualization threshold > 50 MW
const COLOR_MEASURED_FRP = 0xf97316; // Measured FRP 0..50 MW
const COLOR_UNKNOWN_FRP = 0xfbbf24;  // Neutral amber when FRP is null / unavailable

function isValidHotspotCoord(spot: FirmsHotspot): boolean {
  return (
    Boolean(spot) &&
    Number.isFinite(spot.latitude) &&
    spot.latitude >= -90 &&
    spot.latitude <= 90 &&
    Number.isFinite(spot.longitude) &&
    spot.longitude >= -180 &&
    spot.longitude <= 180
  );
}

export function classifySpotVisualization(frp: number | null | undefined): {
  category: FireVisualCategory;
  color: number;
  frpMeasured: boolean;
} {
  if (typeof frp !== 'number' || !Number.isFinite(frp) || frp < 0) {
    return {
      category: 'unknown_frp',
      color: COLOR_UNKNOWN_FRP,
      frpMeasured: false,
    };
  }
  if (frp > ELEVATED_FRP_VISUAL_THRESHOLD_MW) {
    return {
      category: 'elevated_frp_visual',
      color: COLOR_ELEVATED_FRP,
      frpMeasured: true,
    };
  }
  return {
    category: 'measured_frp_visual',
    color: COLOR_MEASURED_FRP,
    frpMeasured: true,
  };
}

export class ThreeFireLayer {
  private parentGroup: THREE.Group;
  private radius: number;
  private fireGroup: THREE.Group;
  private hotspots: FirmsHotspot[] = [];
  private sharedCoreGeo: THREE.BufferGeometry | null = null;
  private sharedRingGeo: THREE.BufferGeometry | null = null;
  private pulseMaterials: THREE.MeshBasicMaterial[] = [];
  private allMaterials: THREE.Material[] = [];
  private disposed = false;

  constructor(parentGroup: THREE.Group, options: ThreeFireLayerOptions = {}) {
    this.parentGroup = parentGroup;
    this.radius = options.radius ?? 90.15;
    this.fireGroup = new THREE.Group();
    this.parentGroup.add(this.fireGroup);
  }

  public setHotspots(hotspots: FirmsHotspot[]) {
    if (this.disposed) return;

    this.clear();
    const validHotspots = Array.isArray(hotspots) ? hotspots.filter(isValidHotspotCoord) : [];
    this.hotspots = validHotspots.slice(0, 500); // Cap rendered markers for WebGL frame stability

    if (this.hotspots.length === 0) return;

    this.sharedCoreGeo = new THREE.SphereGeometry(0.45, 8, 8);
    this.sharedRingGeo = new THREE.RingGeometry(0.5, 0.9, 16);

    const zAxis = new THREE.Vector3(0, 0, 1);

    this.hotspots.forEach((spot, idx) => {
      const rawPos = latLongToVector3(spot.latitude, spot.longitude, this.radius);
      const pos = new THREE.Vector3(rawPos.x, rawPos.y, rawPos.z);
      const normal = pos.clone().normalize();

      const visual = classifySpotVisualization(spot.frp);

      // 1. Core thermal anomaly marker
      const coreMat = new THREE.MeshBasicMaterial({
        color: visual.color,
        transparent: true,
        opacity: visual.frpMeasured ? 0.9 : 0.78,
      });
      this.allMaterials.push(coreMat);

      const coreMesh = new THREE.Mesh(this.sharedCoreGeo!, coreMat);
      coreMesh.position.copy(pos);
      coreMesh.userData = {
        spot,
        isFireCore: true,
        frpMeasured: visual.frpMeasured,
        visualCategory: visual.category,
      };
      this.fireGroup.add(coreMesh);

      // 2. Pulse ring indicator
      const ringMat = new THREE.MeshBasicMaterial({
        color: visual.color,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: visual.frpMeasured ? 0.7 : 0.55,
        blending: THREE.AdditiveBlending,
      });
      this.allMaterials.push(ringMat);
      this.pulseMaterials.push(ringMat);

      const ringMesh = new THREE.Mesh(this.sharedRingGeo!, ringMat);
      ringMesh.quaternion.setFromUnitVectors(zAxis, normal);
      ringMesh.position.copy(pos).addScaledVector(normal, 0.05);
      ringMesh.userData = {
        spot,
        isFireRing: true,
        frpMeasured: visual.frpMeasured,
        visualCategory: visual.category,
        phase: (idx * 0.3) % (Math.PI * 2),
      };
      this.fireGroup.add(ringMesh);
    });
  }

  public getHotspotCount(): number {
    return this.hotspots.length;
  }

  /**
   * Updates pulse ring opacity/scale and applies world-space camera backside occlusion.
   */
  public update(cameraPosition: THREE.Vector3, elapsedTime: number) {
    if (this.disposed || !this.fireGroup.visible || this.hotspots.length === 0) return;

    const globeCenter = new THREE.Vector3();
    this.parentGroup.getWorldPosition(globeCenter);
    const markerWorldPos = new THREE.Vector3();
    const normal = new THREE.Vector3();
    const toCam = new THREE.Vector3();

    this.fireGroup.children.forEach((child) => {
      child.getWorldPosition(markerWorldPos);
      normal.copy(markerWorldPos).sub(globeCenter).normalize();
      toCam.copy(cameraPosition).sub(markerWorldPos).normalize();

      child.visible = normal.dot(toCam) > 0.05;

      if (child.visible && child.userData?.isFireRing) {
        const pulse = (Math.sin(elapsedTime * 4.0 + child.userData.phase) + 1) * 0.5;
        const scale = 1.0 + pulse * 0.6;
        child.scale.set(scale, scale, scale);
        const mat = (child as THREE.Mesh).material as THREE.MeshBasicMaterial;
        if (mat) {
          const baseOpacity = child.userData.frpMeasured ? 0.75 : 0.55;
          mat.opacity = baseOpacity - pulse * 0.35;
        }
      }
    });
  }

  public setVisible(visible: boolean) {
    this.fireGroup.visible = visible;
    if (!visible) {
      this.fireGroup.children.forEach((child) => {
        child.visible = false;
      });
    }
  }

  public clear() {
    while (this.fireGroup.children.length > 0) {
      const child = this.fireGroup.children[this.fireGroup.children.length - 1];
      this.fireGroup.remove(child);
    }

    for (const mat of this.allMaterials) {
      mat.dispose();
    }
    this.allMaterials = [];
    this.pulseMaterials = [];

    if (this.sharedCoreGeo) {
      this.sharedCoreGeo.dispose();
      this.sharedCoreGeo = null;
    }
    if (this.sharedRingGeo) {
      this.sharedRingGeo.dispose();
      this.sharedRingGeo = null;
    }

    this.hotspots = [];
  }

  public dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.clear();
    if (this.fireGroup.parent) {
      this.fireGroup.parent.remove(this.fireGroup);
    }
  }
}
