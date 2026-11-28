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
import type { CameraAction } from './cesium/AvirCesiumGlobe';
import {
  EARTH_RADIUS,
  DEFAULT_CAMERA_DISTANCE,
  calculateNextDistance,
  calculateWheelDistance,
  calculatePinchDistance,
  interpolateCameraDistance,
} from './three-camera-controller';
import { ThreeWindLayer } from './three-wind-layer';
import { ThreeFireLayer } from './three-fire-layer';
import type { GlobalWindOverlayKind, GlobalWindSnapshot, WindVectorPoint } from '@/domain/wind-types';
import type { FirmsHotspot } from '@/domain/firms-types';

export interface AvirGlobeCanvasProps {
  points: GeographicObservationPoint[];
  selectedPointId?: string | null;
  activeCityName?: string;
  onSelectPoint: (point: GeographicObservationPoint) => void;
  isAutoRotating?: boolean;
  cameraAction?: CameraAction | null;
  selectedHour?: number; // 0-23 diurnal hour
  validAtUtc?: string | null;
  themeMode?: 'dark' | 'light';
  isWindEnabled?: boolean;
  windVectors?: WindVectorPoint[];
  windSnapshot?: GlobalWindSnapshot | null;
  windOverlay?: GlobalWindOverlayKind;
  windPaused?: boolean;
  onInspectWindCoords?: (coords: { latitude: number; longitude: number }) => void;
  isFiresEnabled?: boolean;
  fireHotspots?: FirmsHotspot[];
  className?: string;
}

export function AvirGlobeCanvas({
  points,
  selectedPointId,
  activeCityName,
  onSelectPoint,
  isAutoRotating = true,
  cameraAction = null,
  selectedHour = 12,
  validAtUtc,
  themeMode = 'dark',
  isWindEnabled = false,
  windVectors = [],
  windSnapshot = null,
  windOverlay = 'none',
  windPaused = false,
  onInspectWindCoords,
  isFiresEnabled = false,
  fireHotspots = [],
  className = '',
}: AvirGlobeCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [webGLAvailable, setWebGLAvailable] = useState<boolean>(true);
  const [hoveredPoint, setHoveredPoint] = useState<GeographicObservationPoint | null>(null);

  // Mutable refs for stable event and loop closures
  const isAutoRotatingRef = useRef(isAutoRotating);
  isAutoRotatingRef.current = isAutoRotating;

  const pointsRef = useRef(points);
  pointsRef.current = points;

  const activeCityNameRef = useRef(activeCityName);
  activeCityNameRef.current = activeCityName;

  const isWindEnabledRef = useRef(isWindEnabled);
  isWindEnabledRef.current = isWindEnabled;

  const windVectorsRef = useRef(windVectors);
  windVectorsRef.current = windVectors;

  const windSnapshotRef = useRef(windSnapshot);
  windSnapshotRef.current = windSnapshot;

  const windOverlayRef = useRef(windOverlay);
  windOverlayRef.current = windOverlay;

  const windPausedRef = useRef(windPaused);
  windPausedRef.current = windPaused;

  const onInspectWindCoordsRef = useRef(onInspectWindCoords);
  onInspectWindCoordsRef.current = onInspectWindCoords;

  const isFiresEnabledRef = useRef(isFiresEnabled);
  isFiresEnabledRef.current = isFiresEnabled;

  const fireHotspotsRef = useRef(fireHotspots);
  fireHotspotsRef.current = fireHotspots;

  const themeModeRef = useRef(themeMode);
  themeModeRef.current = themeMode;

  const selectedHourRef = useRef(selectedHour);
  selectedHourRef.current = selectedHour;

  const validAtUtcRef = useRef(validAtUtc);
  validAtUtcRef.current = validAtUtc;

  const lastFlownTargetRef = useRef<{ name: string; latitude: number; longitude: number } | null>(null);

  // Three.js instances ref
  const instancesRef = useRef<{
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    globeGroup: THREE.Group;
    earthMesh: THREE.Mesh;
    earthMat: THREE.MeshPhongMaterial;
    atmosMesh: THREE.Mesh;
    markersGroup: THREE.Group;
    windLayer: ThreeWindLayer;
    fireLayer: ThreeFireLayer;
    starfield: THREE.Points;
    sunLight: THREE.DirectionalLight;
    targetSunPos: THREE.Vector3;
    raycaster: THREE.Raycaster;
    mouse: THREE.Vector2;
    animFrameId: number;
    targetRotation: { x: number; y: number };
    currentRotation: { x: number; y: number };
    isDragging: boolean;
    dragDistance: number;
    wasPinching: boolean;
    previousMousePosition: { x: number; y: number };
    cameraDistance: number;
    targetCameraDistance: number;
    elapsedTime: number;
    isVisible: boolean;
    activePointers: Map<number, { x: number; y: number }>;
    initialPinchDistance: number | null;
    initialCameraDistanceOnPinch: number | null;
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

  // Initialize Three.js scene (Stable lifecycle: depends only on webGLAvailable)
  useEffect(() => {
    if (!webGLAvailable || !containerRef.current) return;

    const container = containerRef.current;
    const width = container.clientWidth || 800;
    const height = container.clientHeight || 600;

    // 1. Scene & Camera (near = 0.5, far = 3000 to cleanly support close inspection and deep orbit)
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.5, 3000);
    camera.position.set(0, 0, DEFAULT_CAMERA_DISTANCE);

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
    const earthGeo = new THREE.SphereGeometry(EARTH_RADIUS, 64, 64);
    const earthTex = createAtmosphericEarthTexture();
    const earthMat = new THREE.MeshPhongMaterial({
      map: earthTex,
      bumpScale: 0.02,
      specular: new THREE.Color(0x0c4a6e),
      shininess: 8,
    });
    const earthMesh = new THREE.Mesh(earthGeo, earthMat);
    globeGroup.add(earthMesh);

    // Load authentic NASA satellite texture (Black Marble for night / Blue Marble for day)
    const textureLoader = new THREE.TextureLoader();
    const isDark = themeModeRef.current !== 'light';
    const satelliteTexturePath = isDark ? '/textures/earth-night.jpg' : '/textures/earth-blue-marble.jpg';
    textureLoader.load(
      satelliteTexturePath,
      (loadedTex) => {
        loadedTex.colorSpace = THREE.SRGBColorSpace;
        loadedTex.anisotropy = 4;
        earthMat.map = loadedTex;
        earthMat.needsUpdate = true;
      },
      undefined,
      (err) => {
        console.warn('Satellite texture load fallback to procedural texture:', err);
      }
    );

    // 6. Atmospheric Rayleigh Outer Rim Glow Shell (closely hugs the planet surface)
    const atmosGeo = new THREE.SphereGeometry(EARTH_RADIUS * 1.012, 64, 64);
    const atmosMat = createAtmosphericRimShaderMaterial();
    const atmosMesh = new THREE.Mesh(atmosGeo, atmosMat);
    globeGroup.add(atmosMesh);

    // 7. Dynamic Diurnal Sunlight System
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.65);
    scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xfff8ee, 1.2);
    let initialUtcHour = selectedHourRef.current ?? 12;
    if (validAtUtcRef.current) {
      const parsed = new Date(validAtUtcRef.current);
      if (!Number.isNaN(parsed.getTime())) {
        initialUtcHour = parsed.getUTCHours() + parsed.getUTCMinutes() / 60;
      }
    }
    const initialSunAngle = ((12 - initialUtcHour) / 24) * Math.PI * 2;
    sunLight.position.set(Math.sin(initialSunAngle) * 350, 100, Math.cos(initialSunAngle) * 350);
    scene.add(sunLight);

    const fillLight = new THREE.DirectionalLight(0x0284c7, 0.25);
    fillLight.position.set(-180, -60, -100);
    scene.add(fillLight);

    // 8. 3D Beacons & Markers Group + Environmental Visualization Layers
    const markersGroup = new THREE.Group();
    globeGroup.add(markersGroup);

    const windLayer = new ThreeWindLayer(globeGroup, { radius: EARTH_RADIUS + 0.35 });
    const initialReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    windLayer.setVisible(isWindEnabledRef.current);
    if (isWindEnabledRef.current && windSnapshotRef.current?.manifest.isAvailable) {
      windLayer.setGlobalField(windSnapshotRef.current, {
        overlay: windOverlayRef.current,
        paused: windPausedRef.current,
        reducedMotion: initialReducedMotion,
      });
    } else if (isWindEnabledRef.current && windVectorsRef.current.length > 0) {
      windLayer.setWindVectors(windVectorsRef.current);
    }

    const fireLayer = new ThreeFireLayer(globeGroup, { radius: EARTH_RADIUS + 0.25 });
    fireLayer.setVisible(isFiresEnabledRef.current);
    if (isFiresEnabledRef.current && fireHotspotsRef.current.length > 0) {
      fireLayer.setHotspots(fireHotspotsRef.current);
    }

    const targetSunPos = new THREE.Vector3(
      Math.sin(initialSunAngle) * 350,
      120,
      Math.cos(initialSunAngle) * 350
    );

    const instances = {
      scene,
      camera,
      renderer,
      globeGroup,
      earthMesh,
      earthMat,
      atmosMesh,
      markersGroup,
      windLayer,
      fireLayer,
      starfield,
      sunLight,
      targetSunPos,
      raycaster: new THREE.Raycaster(),
      mouse: new THREE.Vector2(),
      animFrameId: 0,
      targetRotation: { x: globeGroup.rotation.x, y: globeGroup.rotation.y },
      currentRotation: { x: globeGroup.rotation.x, y: globeGroup.rotation.y },
      isDragging: false,
      dragDistance: 0,
      wasPinching: false,
      previousMousePosition: { x: 0, y: 0 },
      cameraDistance: DEFAULT_CAMERA_DISTANCE,
      targetCameraDistance: DEFAULT_CAMERA_DISTANCE,
      elapsedTime: 0,
      isVisible: true,
      activePointers: new Map<number, { x: number; y: number }>(),
      initialPinchDistance: null,
      initialCameraDistanceOnPinch: null,
    };
    instancesRef.current = instances;

    // Visibility and Performance Optimization (pause rendering offscreen / tab hidden)
    const handleVisibilityChange = () => {
      if (document.hidden) {
        instances.isVisible = false;
      } else {
        instances.isVisible = true;
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    let observer: IntersectionObserver | null = null;
    if (typeof IntersectionObserver !== 'undefined' && containerRef.current) {
      observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            instances.isVisible = entry.isIntersecting && !document.hidden;
          });
        },
        { threshold: 0.05 }
      );
      observer.observe(containerRef.current);
    }

    // Animation Render Loop with Frame-Rate-Independent Delta Timing
    let lastTime = performance.now();

    const animate = () => {
      instances.animFrameId = requestAnimationFrame(animate);

      // Skip heavy GPU render calls if canvas is offscreen or document is hidden
      if (!instances.isVisible) {
        lastTime = performance.now();
        return;
      }

      const now = performance.now();
      const deltaSeconds = Math.min((now - lastTime) / 1000, 0.1); // Clamp to 100ms max
      lastTime = now;
      instances.elapsedTime += deltaSeconds;

      const prefersReducedMotion =
        typeof window !== 'undefined' &&
        window.matchMedia &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      if (!prefersReducedMotion) {
        // Slow starfield drift
        starfield.rotation.y += 0.0001;

        // Auto-rotation when user is not dragging and not pinching (0.084 rad/s ≈ 0.0014 rad @ 60Hz)
        if (
          isAutoRotatingRef.current &&
          !instances.isDragging &&
          instances.activePointers.size === 0
        ) {
          instances.targetRotation.y += 0.084 * deltaSeconds;
        }
      }

      // Smooth damping on rotation (delta-aware)
      const rotAlpha = prefersReducedMotion ? 1 : 1 - Math.exp(-8.0 * deltaSeconds);
      instances.currentRotation.x += (instances.targetRotation.x - instances.currentRotation.x) * rotAlpha;
      instances.currentRotation.y += (instances.targetRotation.y - instances.currentRotation.y) * rotAlpha;
      globeGroup.rotation.x = instances.currentRotation.x;
      globeGroup.rotation.y = instances.currentRotation.y;

      // Smooth proportional damping on camera zoom (Cesium-style frame-rate independent)
      instances.cameraDistance = interpolateCameraDistance(
        instances.cameraDistance,
        instances.targetCameraDistance,
        deltaSeconds,
        prefersReducedMotion
      );
      camera.position.z = instances.cameraDistance;

      if (containerRef.current) {
        containerRef.current.dataset.cameraDistance = instances.cameraDistance.toFixed(1);
        containerRef.current.dataset.targetCameraDistance = instances.targetCameraDistance.toFixed(1);
      }
      if (typeof window !== 'undefined') {
        window.__avirThreeCamera = {
          getDistance: () => instances.cameraDistance,
          getTargetDistance: () => instances.targetCameraDistance,
          getOrientation: () => ({ x: instances.currentRotation.x, y: instances.currentRotation.y }),
        };
      }

      // Smooth lerp on dynamic sunlight position according to diurnal hour
      sunLight.position.lerp(instances.targetSunPos, 0.06);

      // Back-Side Marker Occlusion (Requirement 3.5):
      // Calculate dot product of each marker's normal with the camera direction
      const globeCenter = new THREE.Vector3();
      globeGroup.getWorldPosition(globeCenter);

      markersGroup.children.forEach((child) => {
        const markerWorldPos = new THREE.Vector3();
        child.getWorldPosition(markerWorldPos);
        const normal = markerWorldPos.clone().sub(globeCenter).normalize();
        const toCam = camera.position.clone().sub(markerWorldPos).normalize();
        // Dot product > 0.08 means facing towards camera (front hemisphere)
        child.visible = normal.dot(toCam) > 0.08;
      });

      // Animate pulsing AQI beacon rings & active environmental layers on globe surface
      if (!prefersReducedMotion) {
        markersGroup.children.forEach((child) => {
          if (child.visible && child.userData?.isPulseRing) {
            const pulse = (Math.sin(instances.elapsedTime * 3.5 + child.userData.phaseOffset) + 1) * 0.5;
            const s = 1.0 + pulse * 0.4;
            child.scale.set(s, s, s);
            const mat = child as THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
            if (mat.material) {
              mat.material.opacity = 0.8 - pulse * 0.45;
            }
          }
        });
      }
      if (isWindEnabledRef.current) {
        windLayer.setOptions({ reducedMotion: prefersReducedMotion, paused: windPausedRef.current });
        windLayer.update(prefersReducedMotion ? 0 : deltaSeconds, instances.cameraDistance);
      }
      if (isFiresEnabledRef.current) {
        fireLayer.update(camera.position, instances.elapsedTime);
      }

      renderer.render(scene, camera);
    };
    animate();

    // Native non-passive wheel listener isolated to the Three.js canvas container
    // Cancels native browser page/pinch scrolling cleanly over the globe without affecting outside scroll
    const handleNativeWheel = (event: WheelEvent) => {
      const target = event.target as Node | null;
      if (target && target !== container && !container.contains(target)) {
        return;
      }

      if (event.cancelable) {
        event.preventDefault();
      }
      event.stopPropagation();

      if (!Number.isFinite(event.deltaY)) return;

      const inst = instancesRef.current;
      if (!inst) return;

      inst.targetCameraDistance = calculateWheelDistance(
        inst.targetCameraDistance,
        event.deltaY,
        event.deltaMode
      );
    };
    container.addEventListener('wheel', handleNativeWheel, { passive: false });

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
      container.removeEventListener('wheel', handleNativeWheel);
      window.removeEventListener('resize', handleResize);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (observer) observer.disconnect();
      cancelAnimationFrame(instances.animFrameId);
      windLayer.dispose();
      fireLayer.dispose();
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
      lastFlownTargetRef.current = null;
      if (typeof window !== 'undefined') {
        delete window.__avirThreeCamera;
      }
    };
  }, [webGLAvailable]);

  // Update dynamic sunlight position whenever selectedHour or validAtUtc changes
  useEffect(() => {
    const inst = instancesRef.current;
    if (!inst) return;
    let utcHour = selectedHour ?? 12;
    if (validAtUtc) {
      const parsed = new Date(validAtUtc);
      if (!Number.isNaN(parsed.getTime())) {
        utcHour = parsed.getUTCHours() + parsed.getUTCMinutes() / 60;
      }
    }
    const sunAngle = ((12 - utcHour) / 24) * Math.PI * 2;
    inst.targetSunPos.set(Math.sin(sunAngle) * 350, 90, Math.cos(sunAngle) * 350);
  }, [selectedHour, validAtUtc]);

  // Synchronize Three.js Wind Flow streamlines with validated global GFS/IFS snapshot (or legacy probes)
  useEffect(() => {
    const inst = instancesRef.current;
    if (!inst) return;
    const reduced =
      typeof window !== 'undefined' &&
      Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

    if (isWindEnabled && windSnapshot?.manifest.isAvailable) {
      inst.windLayer.setVisible(true);
      inst.windLayer.setGlobalField(windSnapshot, {
        overlay: windOverlay,
        paused: windPaused,
        reducedMotion: reduced,
        viewportWidth: containerRef.current?.clientWidth,
      });
    } else if (isWindEnabled && windVectors.length > 0) {
      inst.windLayer.clearGlobalField();
      inst.windLayer.setVisible(true);
      inst.windLayer.setWindVectors(windVectors);
      inst.windLayer.setOptions({ paused: windPaused, reducedMotion: reduced });
    } else {
      inst.windLayer.setVisible(false);
      inst.windLayer.clearGlobalField();
      inst.windLayer.setWindVectors([]);
    }
  }, [isWindEnabled, windSnapshot, windOverlay, windPaused, windVectors, webGLAvailable]);

  // Synchronize Three.js NASA FIRMS active-fire thermal anomaly markers
  useEffect(() => {
    const inst = instancesRef.current;
    if (!inst) return;
    if (isFiresEnabled && fireHotspots.length > 0) {
      inst.fireLayer.setVisible(true);
      inst.fireLayer.setHotspots(fireHotspots);
    } else {
      inst.fireLayer.setVisible(false);
      inst.fireLayer.clear();
    }
  }, [isFiresEnabled, fireHotspots, webGLAvailable]);

  // Adjust scene styling and swap NASA Satellite texture on Theme switch (Black Marble / Blue Marble)
  useEffect(() => {
    const inst = instancesRef.current;
    if (!inst) return;
    const isDark = themeMode !== 'light';
    const satelliteTexturePath = isDark ? '/textures/earth-night.jpg' : '/textures/earth-blue-marble.jpg';
    new THREE.TextureLoader().load(
      satelliteTexturePath,
      (loadedTex) => {
        loadedTex.colorSpace = THREE.SRGBColorSpace;
        loadedTex.anisotropy = 4;
        inst.earthMat.map = loadedTex;
        inst.earthMat.needsUpdate = true;
      },
      undefined,
      (err) => {
        console.warn('Satellite texture load fallback:', err);
      }
    );
  }, [themeMode]);

  // Handle external camera actions (Zoom In, Zoom Out, Reset) from GlobeControls
  useEffect(() => {
    const inst = instancesRef.current;
    if (!inst || !cameraAction) return;

    if (cameraAction.type === 'zoomIn') {
      inst.targetCameraDistance = calculateNextDistance(inst.targetCameraDistance, 'in');
    } else if (cameraAction.type === 'zoomOut') {
      inst.targetCameraDistance = calculateNextDistance(inst.targetCameraDistance, 'out');
    } else if (cameraAction.type === 'reset') {
      inst.targetCameraDistance = DEFAULT_CAMERA_DISTANCE;
      const currentPoints = pointsRef.current;
      const cityName = activeCityNameRef.current;
      if (cityName) {
        const pt = currentPoints.find((p) => p.name.toLowerCase() === cityName.toLowerCase());
        if (pt) {
          inst.targetRotation.y = -((pt.longitude + 90) * (Math.PI / 180));
          inst.targetRotation.x = pt.latitude * (Math.PI / 180) * 0.55;
          return;
        }
      }
      inst.targetRotation.x = 0.22;
      inst.targetRotation.y = -Math.PI * 0.42;
    }
  }, [cameraAction]);

  // Construct Refined 3D AQI Beacons & Surface Markers
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

    points.forEach((point, idx) => {
      const surfacePos = latLongToVector3(point.latitude, point.longitude, EARTH_RADIUS);
      const normal = new THREE.Vector3(surfacePos.x, surfacePos.y, surfacePos.z).normalize();
      const isSelected = selectedPointId === point.id;
      const markerColor = new THREE.Color(point.categoryColor);

      // Dynamic AQI Light Beam Pillar Height
      const aqiVal = point.aqi ?? 50;
      const pillarHeight = isSelected
        ? Math.max(14, 8 + (Math.min(aqiVal, 500) / 500) * 26)
        : Math.max(6, 4 + (Math.min(aqiVal, 500) / 500) * 18);

      // 1. Refined Slim 3D Light Cylinder (delicate fiber-optic beam)
      const cylGeo = new THREE.CylinderGeometry(
        isSelected ? 0.22 : 0.15,
        isSelected ? 0.45 : 0.3,
        pillarHeight,
        8
      );
      const cylMat = new THREE.MeshBasicMaterial({
        color: markerColor,
        transparent: true,
        opacity: isSelected ? 0.85 : 0.5,
        blending: THREE.AdditiveBlending,
      });
      const cylMesh = new THREE.Mesh(cylGeo, cylMat);
      cylMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
      cylMesh.position
        .copy(surfacePos as THREE.Vector3)
        .addScaledVector(normal, pillarHeight / 2);
      cylMesh.userData = { point };
      inst.markersGroup.add(cylMesh);

      // 2. Beacon Point Flare at Pillar Top (crisp glowing apex point)
      const headGeo = new THREE.SphereGeometry(isSelected ? 0.9 : 0.6, 10, 10);
      const headMat = new THREE.MeshBasicMaterial({
        color: markerColor,
        transparent: true,
        opacity: 0.95,
      });
      const headMesh = new THREE.Mesh(headGeo, headMat);
      headMesh.position
        .copy(surfacePos as THREE.Vector3)
        .addScaledVector(normal, pillarHeight + (isSelected ? 0.5 : 0.3));
      headMesh.userData = { point };
      inst.markersGroup.add(headMesh);

      // 3. Compact Surface Base Ring on Earth (subtle anchor point)
      const ringGeo = new THREE.RingGeometry(isSelected ? 0.6 : 0.3, isSelected ? 1.6 : 0.9, 16);
      const ringMat = new THREE.MeshBasicMaterial({
        color: markerColor,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.6,
        blending: THREE.AdditiveBlending,
      });
      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      ringMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
      ringMesh.position
        .copy(surfacePos as THREE.Vector3)
        .addScaledVector(normal, 0.2);
      ringMesh.userData = {
        point,
        isPulseRing: true,
        phaseOffset: idx * 0.4,
      };
      inst.markersGroup.add(ringMesh);

      // 4. Subtle Targeting Halo for Selected City
      if (isSelected) {
        const outerRingGeo = new THREE.RingGeometry(2.0, 2.5, 24);
        const outerRingMat = new THREE.MeshBasicMaterial({
          color: 0x38bdf8,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.75,
          blending: THREE.AdditiveBlending,
        });
        const outerRingMesh = new THREE.Mesh(outerRingGeo, outerRingMat);
        outerRingMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
        outerRingMesh.position
          .copy(surfacePos as THREE.Vector3)
          .addScaledVector(normal, 0.25);
        outerRingMesh.userData = {
          point,
          isPulseRing: true,
          phaseOffset: 1.0,
        };
        inst.markersGroup.add(outerRingMesh);
      }
    });
  }, [points, selectedPointId]);

  // Smooth Camera Fly-To-City Transition on Selection (only when destination city changes, never on telemetry ID switches or refreshes)
  useEffect(() => {
    if (!selectedPointId) {
      lastFlownTargetRef.current = null;
      return;
    }
    const inst = instancesRef.current;
    if (!inst) return;

    const selectedPt = points.find((p) => p.id === selectedPointId);
    if (!selectedPt) return;

    const prevTarget = lastFlownTargetRef.current;
    if (prevTarget !== null) {
      const dLat = Math.abs(prevTarget.latitude - selectedPt.latitude);
      const dLon = Math.abs(prevTarget.longitude - selectedPt.longitude);
      const sameName = prevTarget.name.trim().toLowerCase() === selectedPt.name.trim().toLowerCase();
      if ((sameName && dLat < 0.5 && dLon < 0.5) || (dLat < 0.05 && dLon < 0.05)) {
        return;
      }
    }

    lastFlownTargetRef.current = {
      name: selectedPt.name,
      latitude: selectedPt.latitude,
      longitude: selectedPt.longitude,
    };
    const targetY = -((selectedPt.longitude + 90) * (Math.PI / 180));
    const targetX = selectedPt.latitude * (Math.PI / 180) * 0.55;

    inst.targetRotation.y = targetY;
    inst.targetRotation.x = targetX;
  }, [selectedPointId, points]);

  // Interactive Pointer Events (Drag / Orbit / Pinch / Hover)
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const inst = instancesRef.current;
    if (!inst) return;

    inst.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try {
      (e.target as HTMLElement)?.setPointerCapture?.(e.pointerId);
    } catch {
      // Safe ignore
    }

    if (inst.activePointers.size === 1) {
      inst.isDragging = true;
      inst.dragDistance = 0;
      inst.wasPinching = false;
      inst.previousMousePosition = { x: e.clientX, y: e.clientY };
    } else if (inst.activePointers.size === 2) {
      // Transition to two-finger touch pinch zoom
      inst.isDragging = false;
      inst.wasPinching = true;
      const pts = Array.from(inst.activePointers.values());
      inst.initialPinchDistance = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
      inst.initialCameraDistanceOnPinch = inst.targetCameraDistance;
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const inst = instancesRef.current;
    if (!inst) return;

    if (inst.activePointers.has(e.pointerId)) {
      inst.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }

    // Two-finger touch pinch zoom
    if (
      inst.activePointers.size === 2 &&
      inst.initialPinchDistance &&
      inst.initialPinchDistance > 0 &&
      inst.initialCameraDistanceOnPinch !== null
    ) {
      const pts = Array.from(inst.activePointers.values());
      const currentPinchDistance = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
      const scaleRatio = currentPinchDistance / inst.initialPinchDistance;
      inst.targetCameraDistance = calculatePinchDistance(
        inst.initialCameraDistanceOnPinch,
        scaleRatio
      );
      return;
    }

    // Single-finger drag rotation
    if (inst.isDragging && inst.activePointers.size === 1) {
      const deltaX = e.clientX - inst.previousMousePosition.x;
      const deltaY = e.clientY - inst.previousMousePosition.y;
      inst.dragDistance += Math.abs(deltaX) + Math.abs(deltaY);

      inst.targetRotation.y += deltaX * 0.005;
      inst.targetRotation.x = Math.max(
        -Math.PI / 2.4,
        Math.min(Math.PI / 2.4, inst.targetRotation.x + deltaY * 0.005)
      );

      inst.previousMousePosition = { x: e.clientX, y: e.clientY };
    }

    // Raycast hover detection (when not dragging or pinching)
    if (containerRef.current && !inst.isDragging && inst.activePointers.size === 0) {
      const rect = containerRef.current.getBoundingClientRect();
      inst.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      inst.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      inst.raycaster.setFromCamera(inst.mouse, inst.camera);
      const visibleMarkers = inst.markersGroup.children.filter((c) => c.visible);
      const intersects = inst.raycaster.intersectObjects([inst.earthMesh, ...visibleMarkers]);

      if (intersects.length > 0 && intersects[0].object !== inst.earthMesh) {
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

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const inst = instancesRef.current;
    if (!inst) return;

    inst.activePointers.delete(e.pointerId);
    try {
      (e.target as HTMLElement)?.releasePointerCapture?.(e.pointerId);
    } catch {
      // Safe ignore
    }

    if (inst.activePointers.size === 0) {
      inst.isDragging = false;
      inst.initialPinchDistance = null;
      inst.initialCameraDistanceOnPinch = null;
    } else if (inst.activePointers.size === 1) {
      inst.isDragging = false;
      inst.initialPinchDistance = null;
      inst.initialCameraDistanceOnPinch = null;
    }
  };

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const inst = instancesRef.current;
    if (!inst || !containerRef.current) return;

    // Suppress clicks if user dragged more than 6px or was pinching
    if (inst.dragDistance > 6 || inst.wasPinching) {
      inst.wasPinching = false;
      return;
    }

    const rect = containerRef.current.getBoundingClientRect();
    inst.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    inst.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    inst.raycaster.setFromCamera(inst.mouse, inst.camera);
    const visibleMarkers = inst.markersGroup.children.filter((c) => c.visible);
    const intersects = inst.raycaster.intersectObjects([inst.earthMesh, ...visibleMarkers]);

    if (intersects.length > 0 && intersects[0].object !== inst.earthMesh) {
      const hit = intersects[0].object;
      if (hit.userData?.point) {
        onSelectPoint(hit.userData.point);
        return;
      }
    }

    if (
      intersects.length > 0 &&
      intersects[0].object === inst.earthMesh &&
      isWindEnabledRef.current &&
      onInspectWindCoordsRef.current
    ) {
      const localPt = inst.globeGroup.worldToLocal(intersects[0].point.clone());
      const r = localPt.length();
      if (r > 0) {
        const lat = (Math.asin(Math.max(-1, Math.min(1, localPt.y / r))) * 180) / Math.PI;
        const thetaDeg = (Math.atan2(localPt.z, -localPt.x) * 180) / Math.PI;
        const rawLng = thetaDeg - 180;
        const longitude = ((((rawLng + 180) % 360) + 360) % 360) - 180;
        onInspectWindCoordsRef.current({ latitude: lat, longitude });
      }
    }
  };

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
      onPointerCancel={handlePointerUp}
      onClick={handleClick}
      aria-label="Interactive 3D Earth Globe showing atmospheric air quality telemetry"
    >
      <div ref={containerRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

      {/* Floating Hover Beacon Telemetry Tooltip */}
      {hoveredPoint && (
        <div className="pointer-events-none absolute bottom-6 left-1/2 -translate-x-1/2 px-4 py-2 rounded-2xl bg-black/80 backdrop-blur-xl border border-sky-500/30 text-white text-xs shadow-2xl flex items-center gap-3 telemetry-mono z-20 animate-in fade-in zoom-in-95 duration-150">
          <span
            className="w-2.5 h-2.5 rounded-full ring-2 ring-white/20"
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
