'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import {
  GeographicObservationPoint,
  latLongToVector3,
} from '@/services/geo/geographic-observation-adapter';
import { AccessibleEarthFallback } from './AccessibleEarthFallback';

export interface AvirGlobeCanvasProps {
  points: GeographicObservationPoint[];
  selectedPointId?: string | null;
  onSelectPoint: (point: GeographicObservationPoint) => void;
  isAutoRotating?: boolean;
  zoomLevel?: number;
  className?: string;
}

/**
 * Creates an offline procedural Earth landmass texture on an offscreen canvas
 * to guarantee instantaneous rendering without external CDN/network failure risks.
 */
function createProceduralEarthTexture(): THREE.CanvasTexture {
  const width = 2048;
  const height = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    // Deep Ocean Background
    const oceanGrad = ctx.createLinearGradient(0, 0, 0, height);
    oceanGrad.addColorStop(0, '#061325');
    oceanGrad.addColorStop(0.5, '#040b18');
    oceanGrad.addColorStop(1, '#061325');
    ctx.fillStyle = oceanGrad;
    ctx.fillRect(0, 0, width, height);

    // Coordinate Latitude/Longitude Grid Lines
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.08)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= width; x += width / 24) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y <= height; y += height / 12) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // Stylized Continental Landmass Shapes (Equirectangular layout)
    ctx.fillStyle = '#0f2744';
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.25)';
    ctx.lineWidth = 2;

    const drawLand = (pathFn: (c: CanvasRenderingContext2D) => void) => {
      ctx.beginPath();
      pathFn(ctx);
      ctx.fill();
      ctx.stroke();
    };

    // Eurasia & Africa
    drawLand((c) => {
      c.ellipse(width * 0.62, height * 0.32, width * 0.22, height * 0.18, -0.1, 0, Math.PI * 2);
    });
    drawLand((c) => {
      c.ellipse(width * 0.54, height * 0.58, width * 0.11, height * 0.22, 0.1, 0, Math.PI * 2);
    });
    // Indian Subcontinent
    drawLand((c) => {
      c.beginPath();
      c.moveTo(width * 0.68, height * 0.42);
      c.lineTo(width * 0.74, height * 0.42);
      c.lineTo(width * 0.71, height * 0.58);
      c.closePath();
    });
    // North America
    drawLand((c) => {
      c.ellipse(width * 0.24, height * 0.34, width * 0.16, height * 0.18, 0.2, 0, Math.PI * 2);
    });
    // South America
    drawLand((c) => {
      c.ellipse(width * 0.32, height * 0.68, width * 0.08, height * 0.19, 0.3, 0, Math.PI * 2);
    });
    // Australia
    drawLand((c) => {
      c.ellipse(width * 0.82, height * 0.72, width * 0.07, height * 0.09, 0, 0, Math.PI * 2);
    });

    // Night city light clusters
    ctx.fillStyle = 'rgba(251, 191, 36, 0.85)';
    const lights = [
      [width * 0.71, height * 0.44], // Delhi
      [width * 0.70, height * 0.52], // Mumbai
      [width * 0.77, height * 0.35], // Beijing
      [width * 0.83, height * 0.38], // Tokyo
      [width * 0.52, height * 0.28], // London
      [width * 0.54, height * 0.30], // Paris
      [width * 0.28, height * 0.38], // NYC
      [width * 0.20, height * 0.42], // LA
    ];
    for (const [lx, ly] of lights) {
      ctx.beginPath();
      ctx.arc(lx, ly, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
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
    markersGroup: THREE.Group;
    raycaster: THREE.Raycaster;
    mouse: THREE.Vector2;
    animFrameId: number;
    targetRotation: { x: number; y: number };
    currentRotation: { x: number; y: number };
    isDragging: boolean;
    previousMousePosition: { x: number; y: number };
    cameraDistance: number;
    targetCameraDistance: number;
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
    const width = container.clientWidth || 600;
    const height = container.clientHeight || 500;

    // 1. Scene & Camera
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, width / height, 1, 1000);
    camera.position.set(0, 0, 260);

    // 2. WebGL Renderer
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    } catch {
      setWebGLAvailable(false);
      return;
    }

    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // 3. Globe Group (Earth + Atmosphere + Markers)
    const globeGroup = new THREE.Group();
    // Default orientation focused on South Asia / Indian Ocean
    globeGroup.rotation.y = -Math.PI * 0.42;
    globeGroup.rotation.x = 0.25;
    scene.add(globeGroup);

    // 4. Earth Sphere
    const earthRadius = 90;
    const earthGeo = new THREE.SphereGeometry(earthRadius, 64, 64);
    const earthTex = createProceduralEarthTexture();
    const earthMat = new THREE.MeshPhongMaterial({
      map: earthTex,
      bumpScale: 0.05,
      specular: new THREE.Color(0x38bdf8),
      shininess: 12,
    });
    const earthMesh = new THREE.Mesh(earthGeo, earthMat);
    globeGroup.add(earthMesh);

    // 5. Atmospheric Outer Glow Rim
    const atmosGeo = new THREE.SphereGeometry(earthRadius * 1.035, 48, 48);
    const atmosMat = new THREE.ShaderMaterial({
      vertexShader: `
        varying vec3 vNormal;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vNormal;
        void main() {
          float intensity = pow(0.65 - dot(vNormal, vec3(0, 0, 1.0)), 2.0);
          gl_FragColor = vec4(0.22, 0.74, 0.97, 1.0) * intensity;
        }
      `,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      transparent: true,
    });
    const atmosMesh = new THREE.Mesh(atmosGeo, atmosMat);
    globeGroup.add(atmosMesh);

    // 6. Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.85);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0x38bdf8, 1.2);
    dirLight.position.set(150, 100, 150);
    scene.add(dirLight);

    // 7. Markers Group
    const markersGroup = new THREE.Group();
    globeGroup.add(markersGroup);

    const instances = {
      scene,
      camera,
      renderer,
      globeGroup,
      markersGroup,
      raycaster: new THREE.Raycaster(),
      mouse: new THREE.Vector2(),
      animFrameId: 0,
      targetRotation: { x: globeGroup.rotation.x, y: globeGroup.rotation.y },
      currentRotation: { x: globeGroup.rotation.x, y: globeGroup.rotation.y },
      isDragging: false,
      previousMousePosition: { x: 0, y: 0 },
      cameraDistance: 260,
      targetCameraDistance: 260,
    };
    instancesRef.current = instances;

    // Animation Loop
    const animate = () => {
      instances.animFrameId = requestAnimationFrame(animate);

      // Auto-rotation when not interacting
      if (isAutoRotating && !instances.isDragging) {
        instances.targetRotation.y += 0.0018;
      }

      // Smooth damping on rotation
      instances.currentRotation.x += (instances.targetRotation.x - instances.currentRotation.x) * 0.08;
      instances.currentRotation.y += (instances.targetRotation.y - instances.currentRotation.y) * 0.08;
      globeGroup.rotation.x = instances.currentRotation.x;
      globeGroup.rotation.y = instances.currentRotation.y;

      // Smooth damping on camera zoom
      instances.cameraDistance += (instances.targetCameraDistance - instances.cameraDistance) * 0.1;
      camera.position.z = instances.cameraDistance;

      renderer.render(scene, camera);
    };
    animate();

    // Resize Handler
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
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      instancesRef.current = null;
    };
  }, [webGLAvailable, isAutoRotating]);

  // Update Markers when points or selectedPointId change
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

    const pinRadius = 90.8;

    points.forEach((point) => {
      const pos = latLongToVector3(point.latitude, point.longitude, pinRadius);
      const isSelected = selectedPointId === point.id;
      const markerColor = new THREE.Color(point.categoryColor);

      // Marker Dot Mesh
      const markerGeo = new THREE.SphereGeometry(isSelected ? 3.0 : 1.8, 16, 16);
      const markerMat = new THREE.MeshBasicMaterial({
        color: markerColor,
      });
      const markerMesh = new THREE.Mesh(markerGeo, markerMat);
      markerMesh.position.set(pos.x, pos.y, pos.z);
      markerMesh.userData = { point };
      inst.markersGroup.add(markerMesh);

      // Selection Halo Ring
      if (isSelected) {
        const ringGeo = new THREE.RingGeometry(3.6, 5.0, 32);
        const ringMat = new THREE.MeshBasicMaterial({
          color: markerColor,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.85,
        });
        const ringMesh = new THREE.Mesh(ringGeo, ringMat);
        ringMesh.position.set(pos.x * 1.01, pos.y * 1.01, pos.z * 1.01);
        ringMesh.lookAt(pos.x * 2, pos.y * 2, pos.z * 2);
        inst.markersGroup.add(ringMesh);
      }
    });
  }, [points, selectedPointId]);

  // Fly camera to selected point when selectedPointId changes
  useEffect(() => {
    const inst = instancesRef.current;
    if (!inst || !selectedPointId) return;

    const selectedPt = points.find((p) => p.id === selectedPointId);
    if (!selectedPt) return;

    // Calculate rotation to orient the selected point toward the viewer
    // Longitude maps to Y rotation, Latitude maps to X rotation
    const targetY = -((selectedPt.longitude + 90) * (Math.PI / 180));
    const targetX = (selectedPt.latitude) * (Math.PI / 180) * 0.6;

    inst.targetRotation.y = targetY;
    inst.targetRotation.x = targetX;
  }, [selectedPointId, points]);

  // Mouse & Touch Interactivity
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
        -Math.PI / 2.5,
        Math.min(Math.PI / 2.5, inst.targetRotation.x + deltaY * 0.005)
      );

      inst.previousMousePosition = { x: e.clientX, y: e.clientY };
    }

    // Raycast hover check
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
      if (containerRef.current) containerRef.current.style.cursor = inst.isDragging ? 'grabbing' : 'grab';
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
    const newDist = inst.targetCameraDistance + e.deltaY * 0.15;
    inst.targetCameraDistance = Math.max(140, Math.min(360, newDist));
  };

  // If WebGL is not available, render accessible 2D fallback directly
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

      {/* Hover Tooltip */}
      {hoveredPoint && (
        <div
          className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-xl bg-black/85 backdrop-blur-md border border-sky-500/30 text-white text-xs shadow-xl flex items-center gap-2 telemetry-mono z-20"
        >
          <span
            className="w-2.5 h-2.5 rounded-full"
            style={{ backgroundColor: hoveredPoint.categoryColor }}
          />
          <span className="font-bold">{hoveredPoint.name}</span>
          <span className="text-slate-400">[{hoveredPoint.countryCode}]</span>
          <span className="font-semibold" style={{ color: hoveredPoint.categoryColor }}>
            AQI {hoveredPoint.aqi !== null ? Math.round(hoveredPoint.aqi) : 'N/A'}
          </span>
        </div>
      )}
    </div>
  );
}
