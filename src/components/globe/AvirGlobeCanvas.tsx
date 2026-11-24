'use client';

import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import {
  GeographicObservationPoint,
  latLongToVector3,
} from '@/services/geo/geographic-observation-adapter';
import { AccessibleEarthFallback } from './AccessibleEarthFallback';
import {
  createAtmosphericEarthTexture,
  createAtmosphericRimShaderMaterial,
  createDeepSpaceStarfield,
} from './earth-textures';

export interface AvirGlobeCanvasProps {
  points: GeographicObservationPoint[];
  selectedPointId?: string | null;
  onSelectPoint: (point: GeographicObservationPoint) => void;
  isAutoRotating?: boolean;
  zoomLevel?: number;
  className?: string;
}

export function AvirGlobeCanvas({
  points,
  selectedPointId,
  onSelectPoint,
  isAutoRotating = true,
  className = '',
}: AvirGlobeCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [webGLAvailable, setWebGLAvailable] = useState<boolean>(true);
  const [hoveredPoint, setHoveredPoint] = useState<GeographicObservationPoint | null>(null);

  // Three.js instances ref
  const instancesRef = useRef<{
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    globeGroup: THREE.Group;
    earthMesh: THREE.Mesh;
    atmosMesh: THREE.Mesh;
    markersGroup: THREE.Group;
    starfield: THREE.Points;
    raycaster: THREE.Raycaster;
    mouse: THREE.Vector2;
    animFrameId: number;
    targetRotation: { x: number; y: number };
    currentRotation: { x: number; y: number };
    isDragging: boolean;
    previousMousePosition: { x: number; y: number };
    cameraDistance: number;
    targetCameraDistance: number;
    elapsedTime: number;
  } | null>(null);

  // Check WebGL availability
  useEffect(() => {
    try {
      const canvas = document.createElement('canvas');
      const supported = Boolean(
        window.WebGLRenderingContext &&
          (canvas.getContext('webgl') || canvas.getContext('experimental-webgl'))
      );
      setWebGLAvailable(supported);
    } catch {
      setWebGLAvailable(false);
    }
  }, []);

  // Initialize Three.js scene
  useEffect(() => {
    if (!webGLAvailable || !containerRef.current) return;

    const container = containerRef.current;
    const width = container.clientWidth || 800;
    const height = container.clientHeight || 600;

    // 1. Scene & Camera
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, width / height, 1, 2000);
    camera.position.set(0, 0, 260);

    // 2. WebGL Renderer
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance',
      });
    } catch {
      setWebGLAvailable(false);
      return;
    }

    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // 3. Deep Space Starfield
    const starfield = createDeepSpaceStarfield(1200, 750);
    scene.add(starfield);

    // 4. Globe Group (Earth + Atmosphere + 3D AQI Beacons)
    const globeGroup = new THREE.Group();
    // Default orientation focused on South Asia / Indian Ocean
    globeGroup.rotation.y = -Math.PI * 0.42;
    globeGroup.rotation.x = 0.22;
    scene.add(globeGroup);

    // 5. Earth Sphere with High-Definition Atmospheric Surface
    const earthRadius = 90;
    const earthGeo = new THREE.SphereGeometry(earthRadius, 64, 64);
    const earthTex = createAtmosphericEarthTexture();
    const earthMat = new THREE.MeshPhongMaterial({
      map: earthTex,
      bumpScale: 0.08,
      specular: new THREE.Color(0x38bdf8),
      shininess: 24,
    });
    const earthMesh = new THREE.Mesh(earthGeo, earthMat);
    globeGroup.add(earthMesh);

    // 6. Atmospheric Rayleigh Outer Rim Glow Shell
    const atmosGeo = new THREE.SphereGeometry(earthRadius * 1.045, 64, 64);
    const atmosMat = createAtmosphericRimShaderMaterial();
    const atmosMesh = new THREE.Mesh(atmosGeo, atmosMat);
    globeGroup.add(atmosMesh);

    // 7. Lighting System
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.95);
    scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xe0f2fe, 1.4);
    sunLight.position.set(200, 120, 180);
    scene.add(sunLight);

    const fillLight = new THREE.DirectionalLight(0x0284c7, 0.45);
    fillLight.position.set(-180, -60, -100);
    scene.add(fillLight);

    // 8. 3D Beacons & Markers Group
    const markersGroup = new THREE.Group();
    globeGroup.add(markersGroup);

    const instances = {
      scene,
      camera,
      renderer,
      globeGroup,
      earthMesh,
      atmosMesh,
      markersGroup,
      starfield,
      raycaster: new THREE.Raycaster(),
      mouse: new THREE.Vector2(),
      animFrameId: 0,
      targetRotation: { x: globeGroup.rotation.x, y: globeGroup.rotation.y },
      currentRotation: { x: globeGroup.rotation.x, y: globeGroup.rotation.y },
      isDragging: false,
      previousMousePosition: { x: 0, y: 0 },
      cameraDistance: 260,
      targetCameraDistance: 260,
      elapsedTime: 0,
    };
    instancesRef.current = instances;

    // Animation Render Loop
    const animate = () => {
      instances.animFrameId = requestAnimationFrame(animate);
      instances.elapsedTime += 0.016;

      // Subtle slow starfield drift
      starfield.rotation.y += 0.00015;

      // Auto-rotation when user is not actively dragging
      if (isAutoRotating && !instances.isDragging) {
        instances.targetRotation.y += 0.0016;
      }

      // Smooth damping on rotation (glide to target)
      instances.currentRotation.x += (instances.targetRotation.x - instances.currentRotation.x) * 0.07;
      instances.currentRotation.y += (instances.targetRotation.y - instances.currentRotation.y) * 0.07;
      globeGroup.rotation.x = instances.currentRotation.x;
      globeGroup.rotation.y = instances.currentRotation.y;

      // Smooth damping on camera zoom
      instances.cameraDistance += (instances.targetCameraDistance - instances.cameraDistance) * 0.1;
      camera.position.z = instances.cameraDistance;

      // Animate pulsing AQI beacon rings on surface
      markersGroup.children.forEach((child) => {
        if (child.userData?.isPulseRing) {
          const pulse = (Math.sin(instances.elapsedTime * 3.5 + child.userData.phaseOffset) + 1) * 0.5;
          const s = 1.0 + pulse * 0.45;
          child.scale.set(s, s, s);
          const mat = child as THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
          if (mat.material) {
            mat.material.opacity = 0.85 - pulse * 0.45;
          }
        }
      });

      renderer.render(scene, camera);
    };
    animate();

    // Responsive Resize Handler
    const handleResize = () => {
      if (!containerRef.current) return;
      const w = containerRef.current.clientWidth;
      const h = containerRef.current.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(instances.animFrameId);
      earthGeo.dispose();
      earthMat.dispose();
      earthTex.dispose();
      atmosGeo.dispose();
      atmosMat.dispose();
      starfield.geometry.dispose();
      if (Array.isArray(starfield.material)) {
        starfield.material.forEach((m) => m.dispose());
      } else {
        starfield.material.dispose();
      }
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      instancesRef.current = null;
    };
  }, [webGLAvailable, isAutoRotating]);

  // Construct High-Impact 3D AQI Beacons & Surface Markers
  useEffect(() => {
    const inst = instancesRef.current;
    if (!inst) return;

    // Clear previous markers
    while (inst.markersGroup.children.length > 0) {
      const child = inst.markersGroup.children[0] as THREE.Mesh;
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
        else child.material.dispose();
      }
      inst.markersGroup.remove(child);
    }

    const earthRadius = 90;

    points.forEach((point, idx) => {
      const surfacePos = latLongToVector3(point.latitude, point.longitude, earthRadius);
      const normal = new THREE.Vector3(surfacePos.x, surfacePos.y, surfacePos.z).normalize();
      const isSelected = selectedPointId === point.id;
      const markerColor = new THREE.Color(point.categoryColor);

      // 1. Dynamic AQI Pillar Height (AirIndx Style: hazardous = tall beacon, good = short)
      const aqiVal = point.aqi ?? 50;
      const pillarHeight = isSelected
        ? Math.max(16, 10 + (Math.min(aqiVal, 500) / 500) * 32)
        : Math.max(8, 6 + (Math.min(aqiVal, 500) / 500) * 24);

      // Vertical 3D Light Cylinder
      const cylGeo = new THREE.CylinderGeometry(
        isSelected ? 0.7 : 0.45,
        isSelected ? 1.4 : 0.9,
        pillarHeight,
        12
      );
      const cylMat = new THREE.MeshBasicMaterial({
        color: markerColor,
        transparent: true,
        opacity: isSelected ? 0.9 : 0.65,
        blending: THREE.AdditiveBlending,
      });
      const cylMesh = new THREE.Mesh(cylGeo, cylMat);

      // Position cylinder along the surface normal
      cylMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
      cylMesh.position
        .copy(surfacePos as THREE.Vector3)
        .addScaledVector(normal, pillarHeight / 2);
      cylMesh.userData = { point };
      inst.markersGroup.add(cylMesh);

      // 2. Beacon Glowing Head / Flare Sphere at top of pillar
      const headGeo = new THREE.SphereGeometry(isSelected ? 2.2 : 1.3, 16, 16);
      const headMat = new THREE.MeshBasicMaterial({
        color: markerColor,
        transparent: true,
        opacity: 0.95,
      });
      const headMesh = new THREE.Mesh(headGeo, headMat);
      headMesh.position
        .copy(surfacePos as THREE.Vector3)
        .addScaledVector(normal, pillarHeight + (isSelected ? 1.5 : 0.8));
      headMesh.userData = { point };
      inst.markersGroup.add(headMesh);

      // 3. Surface Base Pulsing Halo Ring on Earth surface
      const ringGeo = new THREE.RingGeometry(isSelected ? 2.5 : 1.2, isSelected ? 5.5 : 3.2, 32);
      const ringMat = new THREE.MeshBasicMaterial({
        color: markerColor,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.8,
        blending: THREE.AdditiveBlending,
      });
      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      ringMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
      ringMesh.position
        .copy(surfacePos as THREE.Vector3)
        .addScaledVector(normal, 0.4);
      ringMesh.userData = {
        point,
        isPulseRing: true,
        phaseOffset: idx * 0.4,
      };
      inst.markersGroup.add(ringMesh);

      // 4. Extra Concentric Orbital Ring for Currently Selected City
      if (isSelected) {
        const outerRingGeo = new THREE.RingGeometry(6.0, 7.2, 32);
        const outerRingMat = new THREE.MeshBasicMaterial({
          color: 0x38bdf8, // vibrant cyan targeting ring
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.9,
          blending: THREE.AdditiveBlending,
        });
        const outerRingMesh = new THREE.Mesh(outerRingGeo, outerRingMat);
        outerRingMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
        outerRingMesh.position
          .copy(surfacePos as THREE.Vector3)
          .addScaledVector(normal, 0.5);
        outerRingMesh.userData = {
          point,
          isPulseRing: true,
          phaseOffset: 1.2,
        };
        inst.markersGroup.add(outerRingMesh);
      }
    });
  }, [points, selectedPointId]);

  // Smooth Camera Fly-To-City Transition on Selection
  useEffect(() => {
    const inst = instancesRef.current;
    if (!inst || !selectedPointId) return;

    const selectedPt = points.find((p) => p.id === selectedPointId);
    if (!selectedPt) return;

    // Calculate rotation angles to orient the target city front and center to the camera
    const targetY = -((selectedPt.longitude + 90) * (Math.PI / 180));
    const targetX = selectedPt.latitude * (Math.PI / 180) * 0.55;

    inst.targetRotation.y = targetY;
    inst.targetRotation.x = targetX;
  }, [selectedPointId, points]);

  // Interactive Pointer Events (Drag / Orbit / Hover)
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const inst = instancesRef.current;
    if (!inst) return;
    inst.isDragging = true;
    inst.previousMousePosition = { x: e.clientX, y: e.clientY };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const inst = instancesRef.current;
    if (!inst) return;

    if (inst.isDragging) {
      const deltaX = e.clientX - inst.previousMousePosition.x;
      const deltaY = e.clientY - inst.previousMousePosition.y;

      inst.targetRotation.y += deltaX * 0.005;
      inst.targetRotation.x = Math.max(
        -Math.PI / 2.4,
        Math.min(Math.PI / 2.4, inst.targetRotation.x + deltaY * 0.005)
      );

      inst.previousMousePosition = { x: e.clientX, y: e.clientY };
    }

    // Raycast check for hover feedback over beacon pillars
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      inst.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      inst.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      inst.raycaster.setFromCamera(inst.mouse, inst.camera);
      const intersects = inst.raycaster.intersectObjects(inst.markersGroup.children);

      if (intersects.length > 0) {
        const hit = intersects[0].object;
        if (hit.userData?.point) {
          setHoveredPoint(hit.userData.point);
          if (containerRef.current) containerRef.current.style.cursor = 'pointer';
          return;
        }
      }
      setHoveredPoint(null);
      if (containerRef.current) {
        containerRef.current.style.cursor = inst.isDragging ? 'grabbing' : 'grab';
      }
    }
  };

  const handlePointerUp = () => {
    const inst = instancesRef.current;
    if (inst) inst.isDragging = false;
  };

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const inst = instancesRef.current;
    if (!inst || !containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    inst.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    inst.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    inst.raycaster.setFromCamera(inst.mouse, inst.camera);
    const intersects = inst.raycaster.intersectObjects(inst.markersGroup.children);

    if (intersects.length > 0) {
      const hit = intersects[0].object;
      if (hit.userData?.point) {
        onSelectPoint(hit.userData.point);
      }
    }
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const inst = instancesRef.current;
    if (!inst) return;
    const newDist = inst.targetCameraDistance + e.deltaY * 0.18;
    inst.targetCameraDistance = Math.max(140, Math.min(380, newDist));
  };

  // Accessible Fallback for WebGL-disabled environments
  if (!webGLAvailable) {
    return (
      <AccessibleEarthFallback
        points={points}
        selectedPointId={selectedPointId}
        onSelectPoint={onSelectPoint}
        className={className}
      />
    );
  }

  return (
    <div
      className={`relative w-full h-full select-none overflow-hidden touch-none ${className}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onClick={handleClick}
      onWheel={handleWheel}
      aria-label="Interactive 3D Earth Globe showing atmospheric air quality telemetry"
    >
      <div ref={containerRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

      {/* Floating Hover Beacon Telemetry Tooltip */}
      {hoveredPoint && (
        <div className="pointer-events-none absolute bottom-6 left-1/2 -translate-x-1/2 px-4 py-2 rounded-2xl bg-black/85 backdrop-blur-md border border-sky-500/40 text-white text-xs shadow-2xl flex items-center gap-3 telemetry-mono z-20 animate-in fade-in zoom-in-95 duration-150">
          <span
            className="w-3 h-3 rounded-full ring-2 ring-white/30"
            style={{ backgroundColor: hoveredPoint.categoryColor }}
          />
          <div className="flex flex-col">
            <span className="font-bold tracking-wide">
              {hoveredPoint.name}{' '}
              <span className="text-slate-400 font-normal">[{hoveredPoint.countryCode}]</span>
            </span>
            <span className="text-[11px] text-sky-300">
              {hoveredPoint.categoryLabel} • Click to Inspect
            </span>
          </div>
          <div className="pl-2 border-l border-white/20 text-right">
            <div className="text-xs text-slate-400">AQI</div>
            <div className="text-sm font-bold" style={{ color: hoveredPoint.categoryColor }}>
              {hoveredPoint.aqi !== null ? Math.round(hoveredPoint.aqi) : 'N/A'}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
