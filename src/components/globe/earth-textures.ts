'use client';

import * as THREE from 'three';

/**
 * Atmospheric Earth Textures & Shaders
 * Generates an offline, high-definition photorealistic Earth texture,
 * starfield, and Rayleigh scattering atmospheric shaders.
 */

// Helper to convert geographic coordinates (lat, lon) to equirectangular canvas pixels (x, y)
function geoToCanvas(lat: number, lon: number, width: number, height: number): [number, number] {
  const x = ((lon + 180) / 360) * width;
  const y = ((90 - lat) / 180) * height;
  return [x, y];
}

interface PolygonCoord {
  lat: number;
  lon: number;
}

const CONTINENT_POLYGONS: PolygonCoord[][] = [
  // 1. Indian Subcontinent & Sri Lanka
  [
    { lat: 35.5, lon: 74.5 },
    { lat: 34.0, lon: 77.5 },
    { lat: 31.0, lon: 78.5 },
    { lat: 28.5, lon: 81.0 },
    { lat: 27.5, lon: 88.0 },
    { lat: 26.5, lon: 89.5 },
    { lat: 28.0, lon: 96.0 },
    { lat: 25.0, lon: 94.0 },
    { lat: 22.0, lon: 91.5 },
    { lat: 21.5, lon: 88.5 },
    { lat: 20.0, lon: 86.5 },
    { lat: 17.5, lon: 83.5 },
    { lat: 13.0, lon: 80.3 },
    { lat: 10.0, lon: 79.8 },
    { lat: 8.1, lon: 77.5 }, // Kanyakumari
    { lat: 8.5, lon: 76.9 },
    { lat: 11.5, lon: 75.8 },
    { lat: 15.5, lon: 73.8 },
    { lat: 19.0, lon: 72.8 }, // Mumbai
    { lat: 20.5, lon: 72.8 },
    { lat: 22.0, lon: 69.0 }, // Gujarat
    { lat: 23.5, lon: 68.5 },
    { lat: 24.5, lon: 68.2 },
    { lat: 27.0, lon: 71.0 },
    { lat: 31.0, lon: 74.0 },
    { lat: 33.0, lon: 73.5 },
  ],
  // Sri Lanka
  [
    { lat: 9.8, lon: 80.2 },
    { lat: 8.5, lon: 81.2 },
    { lat: 6.0, lon: 80.6 },
    { lat: 7.0, lon: 79.8 },
  ],
  // 2. Eurasia (Europe, Russia, Central Asia, China, East Asia, SE Asia)
  [
    { lat: 71.0, lon: 26.0 },
    { lat: 68.0, lon: 44.0 },
    { lat: 73.0, lon: 70.0 },
    { lat: 76.0, lon: 100.0 },
    { lat: 72.0, lon: 130.0 },
    { lat: 70.0, lon: 170.0 },
    { lat: 66.0, lon: 170.0 },
    { lat: 58.0, lon: 162.0 },
    { lat: 51.0, lon: 157.0 },
    { lat: 55.0, lon: 140.0 },
    { lat: 48.0, lon: 135.0 },
    { lat: 42.0, lon: 131.0 },
    { lat: 38.0, lon: 119.0 },
    { lat: 32.0, lon: 121.5 }, // Shanghai
    { lat: 26.0, lon: 119.5 },
    { lat: 22.5, lon: 114.0 }, // Hong Kong
    { lat: 21.0, lon: 108.0 },
    { lat: 15.0, lon: 108.5 },
    { lat: 10.5, lon: 107.0 },
    { lat: 1.3, lon: 103.8 }, // Singapore/Malaysia
    { lat: 6.0, lon: 100.0 },
    { lat: 15.0, lon: 98.0 },
    { lat: 20.0, lon: 93.0 },
    { lat: 25.0, lon: 66.0 },
    { lat: 25.0, lon: 57.0 },
    { lat: 30.0, lon: 49.0 },
    { lat: 27.0, lon: 51.0 },
    { lat: 24.0, lon: 54.0 },
    { lat: 13.0, lon: 44.0 },
    { lat: 16.0, lon: 42.0 },
    { lat: 28.0, lon: 34.0 },
    { lat: 32.0, lon: 35.0 },
    { lat: 36.5, lon: 36.0 },
    { lat: 37.0, lon: 27.0 },
    { lat: 40.0, lon: 26.0 },
    { lat: 38.0, lon: 23.0 },
    { lat: 41.0, lon: 19.5 },
    { lat: 41.0, lon: 15.0 },
    { lat: 38.0, lon: 15.5 },
    { lat: 43.5, lon: 10.5 },
    { lat: 43.5, lon: 4.0 },
    { lat: 36.0, lon: -5.5 },
    { lat: 37.0, lon: -9.0 },
    { lat: 43.5, lon: -9.0 },
    { lat: 43.5, lon: -1.5 },
    { lat: 48.5, lon: -4.5 },
    { lat: 51.0, lon: 2.0 },
    { lat: 54.0, lon: 8.5 },
    { lat: 58.0, lon: 11.5 },
    { lat: 64.0, lon: 21.0 },
    { lat: 60.0, lon: 5.0 },
  ],
  // Great Britain & Ireland
  [
    { lat: 58.5, lon: -3.5 },
    { lat: 55.0, lon: -1.5 },
    { lat: 51.0, lon: 1.5 },
    { lat: 50.0, lon: -5.5 },
    { lat: 53.5, lon: -4.5 },
    { lat: 57.0, lon: -6.0 },
  ],
  // Japan
  [
    { lat: 45.5, lon: 142.0 },
    { lat: 43.0, lon: 145.5 },
    { lat: 35.5, lon: 140.5 },
    { lat: 33.5, lon: 135.5 },
    { lat: 31.0, lon: 130.5 },
    { lat: 34.0, lon: 131.0 },
    { lat: 37.5, lon: 137.0 },
    { lat: 41.0, lon: 140.5 },
  ],
  // 3. Africa
  [
    { lat: 37.0, lon: 10.0 },
    { lat: 32.0, lon: 24.0 },
    { lat: 31.5, lon: 32.0 },
    { lat: 24.0, lon: 36.0 },
    { lat: 12.0, lon: 44.0 },
    { lat: 10.0, lon: 51.0 },
    { lat: 0.0, lon: 42.5 },
    { lat: -15.0, lon: 40.5 },
    { lat: -28.0, lon: 32.5 },
    { lat: -34.5, lon: 20.0 },
    { lat: -33.0, lon: 18.0 },
    { lat: -22.0, lon: 14.5 },
    { lat: -6.0, lon: 12.0 },
    { lat: 4.5, lon: 7.0 },
    { lat: 5.0, lon: -3.0 },
    { lat: 11.5, lon: -15.0 },
    { lat: 15.0, lon: -17.5 },
    { lat: 21.0, lon: -17.0 },
    { lat: 28.0, lon: -12.0 },
    { lat: 35.5, lon: -6.0 },
    { lat: 36.0, lon: 1.0 },
  ],
  // Madagascar
  [
    { lat: -12.0, lon: 49.5 },
    { lat: -25.0, lon: 47.0 },
    { lat: -25.0, lon: 44.0 },
    { lat: -16.0, lon: 44.0 },
  ],
  // 4. North America
  [
    { lat: 71.0, lon: -156.0 },
    { lat: 65.0, lon: -168.0 },
    { lat: 58.0, lon: -160.0 },
    { lat: 58.0, lon: -136.0 },
    { lat: 50.0, lon: -127.0 },
    { lat: 38.0, lon: -123.0 },
    { lat: 33.0, lon: -118.0 },
    { lat: 23.0, lon: -110.0 },
    { lat: 18.0, lon: -105.0 },
    { lat: 15.0, lon: -93.0 },
    { lat: 8.5, lon: -80.0 },
    { lat: 10.0, lon: -83.5 },
    { lat: 16.0, lon: -88.0 },
    { lat: 21.5, lon: -87.0 },
    { lat: 26.0, lon: -97.0 },
    { lat: 29.0, lon: -95.0 },
    { lat: 29.5, lon: -89.5 },
    { lat: 25.0, lon: -80.5 },
    { lat: 31.0, lon: -81.0 },
    { lat: 36.0, lon: -75.5 },
    { lat: 40.5, lon: -74.0 },
    { lat: 44.5, lon: -64.0 },
    { lat: 52.0, lon: -56.0 },
    { lat: 60.0, lon: -65.0 },
    { lat: 63.0, lon: -80.0 },
    { lat: 70.0, lon: -95.0 },
    { lat: 72.0, lon: -125.0 },
  ],
  // Greenland
  [
    { lat: 83.0, lon: -35.0 },
    { lat: 75.0, lon: -20.0 },
    { lat: 60.0, lon: -44.0 },
    { lat: 70.0, lon: -54.0 },
    { lat: 78.0, lon: -70.0 },
  ],
  // 5. South America
  [
    { lat: 12.0, lon: -72.0 },
    { lat: 10.5, lon: -62.0 },
    { lat: 6.0, lon: -53.0 },
    { lat: -1.0, lon: -48.0 },
    { lat: -7.0, lon: -35.0 },
    { lat: -13.0, lon: -38.5 },
    { lat: -23.0, lon: -43.0 },
    { lat: -34.5, lon: -58.5 },
    { lat: -42.0, lon: -64.0 },
    { lat: -54.5, lon: -67.0 },
    { lat: -45.0, lon: -75.0 },
    { lat: -33.0, lon: -71.5 },
    { lat: -18.0, lon: -71.0 },
    { lat: -5.0, lon: -81.0 },
    { lat: 1.0, lon: -79.0 },
    { lat: 8.0, lon: -77.5 },
  ],
  // 6. Australia
  [
    { lat: -12.0, lon: 136.0 },
    { lat: -11.0, lon: 142.5 },
    { lat: -20.0, lon: 148.5 },
    { lat: -28.0, lon: 153.5 },
    { lat: -34.0, lon: 151.0 },
    { lat: -38.5, lon: 146.0 },
    { lat: -35.0, lon: 136.0 },
    { lat: -32.0, lon: 115.5 },
    { lat: -22.0, lon: 114.0 },
    { lat: -15.0, lon: 125.0 },
    { lat: -15.0, lon: 136.0 },
  ],
  // New Zealand
  [
    { lat: -35.0, lon: 173.5 },
    { lat: -41.0, lon: 175.0 },
    { lat: -46.5, lon: 168.0 },
    { lat: -42.0, lon: 171.0 },
  ],
  // 7. Maritime Southeast Asia (Indonesia & Philippines)
  [
    { lat: 5.5, lon: 95.5 },
    { lat: -5.5, lon: 105.5 },
    { lat: -7.5, lon: 112.5 },
    { lat: -8.5, lon: 116.0 },
    { lat: 4.0, lon: 117.0 },
    { lat: -3.0, lon: 115.0 },
    { lat: -1.0, lon: 109.5 },
    { lat: 7.0, lon: 125.5 },
    { lat: 14.5, lon: 121.0 },
    { lat: 18.0, lon: 120.5 },
  ],
  // 8. Antarctica Coastline
  [
    { lat: -65.0, lon: -180.0 },
    { lat: -64.0, lon: -120.0 },
    { lat: -63.0, lon: -65.0 },
    { lat: -72.0, lon: -30.0 },
    { lat: -68.0, lon: 20.0 },
    { lat: -66.0, lon: 90.0 },
    { lat: -65.0, lon: 150.0 },
    { lat: -65.0, lon: 180.0 },
    { lat: -90.0, lon: 180.0 },
    { lat: -90.0, lon: -180.0 },
  ],
];

const CITY_LIGHTS = [
  // Indo-Gangetic & Indian Megalopolises
  { lat: 28.61, lon: 77.21, intensity: 1.0, r: 5 }, // Delhi-NCR
  { lat: 19.07, lon: 72.87, intensity: 0.95, r: 4.5 }, // Mumbai
  { lat: 12.97, lon: 77.59, intensity: 0.9, r: 4 }, // Bengaluru
  { lat: 22.57, lon: 88.36, intensity: 0.85, r: 4 }, // Kolkata
  { lat: 13.08, lon: 80.27, intensity: 0.8, r: 4 }, // Chennai
  { lat: 17.38, lon: 78.48, intensity: 0.8, r: 4 }, // Hyderabad
  { lat: 23.02, lon: 72.57, intensity: 0.75, r: 3.5 }, // Ahmedabad
  { lat: 26.85, lon: 80.94, intensity: 0.7, r: 3 }, // Lucknow
  { lat: 31.52, lon: 74.35, intensity: 0.8, r: 3.5 }, // Lahore
  { lat: 23.81, lon: 90.41, intensity: 0.8, r: 3.5 }, // Dhaka
  // East & Southeast Asia
  { lat: 35.68, lon: 139.69, intensity: 1.0, r: 5 }, // Tokyo
  { lat: 31.23, lon: 121.47, intensity: 1.0, r: 5 }, // Shanghai
  { lat: 39.90, lon: 116.40, intensity: 0.95, r: 4.5 }, // Beijing
  { lat: 23.13, lon: 113.26, intensity: 0.95, r: 4.5 }, // Pearl River Delta
  { lat: 37.56, lon: 126.97, intensity: 0.9, r: 4 }, // Seoul
  { lat: 1.35, lon: 103.82, intensity: 0.85, r: 3 }, // Singapore
  { lat: 13.75, lon: 100.50, intensity: 0.85, r: 3.5 }, // Bangkok
  { lat: -6.20, lon: 106.84, intensity: 0.8, r: 3.5 }, // Jakarta
  // Europe
  { lat: 51.51, lon: -0.12, intensity: 0.95, r: 4.5 }, // London
  { lat: 48.85, lon: 2.35, intensity: 0.95, r: 4.5 }, // Paris
  { lat: 52.52, lon: 13.40, intensity: 0.85, r: 4 }, // Berlin
  { lat: 55.75, lon: 37.61, intensity: 0.9, r: 4 }, // Moscow
  { lat: 41.90, lon: 12.49, intensity: 0.8, r: 3.5 }, // Rome
  { lat: 40.41, lon: -3.70, intensity: 0.8, r: 3.5 }, // Madrid
  // North America
  { lat: 40.71, lon: -74.00, intensity: 1.0, r: 5 }, // New York
  { lat: 34.05, lon: -118.24, intensity: 0.95, r: 5 }, // Los Angeles
  { lat: 41.88, lon: -87.63, intensity: 0.9, r: 4 }, // Chicago
  { lat: 37.77, lon: -122.42, intensity: 0.85, r: 4 }, // San Francisco
  { lat: 29.76, lon: -95.37, intensity: 0.85, r: 3.5 }, // Houston
  { lat: 19.43, lon: -99.13, intensity: 0.9, r: 4 }, // Mexico City
  // Middle East & Africa
  { lat: 25.20, lon: 55.27, intensity: 0.95, r: 4 }, // Dubai
  { lat: 30.04, lon: 31.23, intensity: 0.9, r: 4 }, // Cairo
  { lat: -26.20, lon: 28.04, intensity: 0.8, r: 3.5 }, // Johannesburg
  // South America & Oceania
  { lat: -23.55, lon: -46.63, intensity: 0.95, r: 4.5 }, // São Paulo
  { lat: -34.60, lon: -58.38, intensity: 0.85, r: 4 }, // Buenos Aires
  { lat: -33.87, lon: 151.21, intensity: 0.85, r: 4 }, // Sydney
];

/**
 * Creates a photorealistic, 2048x1024 high-definition Earth texture on an offscreen canvas
 * with deep obsidian oceans, delicate turquoise coastal shelves, refined satellite terrain,
 * and warm night city clusters.
 */
export function createAtmosphericEarthTexture(): THREE.CanvasTexture {
  const width = 2048;
  const height = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    // 1. Deep Obsidian / Midnight Ocean Base
    const oceanGrad = ctx.createLinearGradient(0, 0, 0, height);
    oceanGrad.addColorStop(0.0, '#02050e');
    oceanGrad.addColorStop(0.2, '#030a18');
    oceanGrad.addColorStop(0.5, '#051226');
    oceanGrad.addColorStop(0.8, '#030a18');
    oceanGrad.addColorStop(1.0, '#02050e');
    ctx.fillStyle = oceanGrad;
    ctx.fillRect(0, 0, width, height);

    // Subtle oceanic bathymetric depth gradient
    const bathymetry = ctx.createRadialGradient(
      width * 0.65, height * 0.55, 80,
      width * 0.65, height * 0.55, 600
    );
    bathymetry.addColorStop(0, 'rgba(14, 165, 233, 0.05)');
    bathymetry.addColorStop(1, 'transparent');
    ctx.fillStyle = bathymetry;
    ctx.fillRect(0, 0, width, height);

    // 2. Latitude/Longitude Atmospheric Telemetry Grid
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.04)';
    ctx.lineWidth = 1;
    for (let lon = -180; lon <= 180; lon += 15) {
      const [x] = geoToCanvas(0, lon, width, height);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let lat = -75; lat <= 75; lat += 15) {
      const [, y] = geoToCanvas(lat, 0, width, height);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // 3. Draw Continents with Refined Shallow Coastal Water Washes
    CONTINENT_POLYGONS.forEach((coords) => {
      if (coords.length < 3) return;

      const path2D = new Path2D();
      const first = geoToCanvas(coords[0].lat, coords[0].lon, width, height);
      path2D.moveTo(first[0], first[1]);

      for (let i = 1; i < coords.length; i++) {
        const pt = geoToCanvas(coords[i].lat, coords[i].lon, width, height);
        path2D.lineTo(pt[0], pt[1]);
      }
      path2D.closePath();

      // Outer Continental Shelf Glow (Natural Oceanic Coastal Shelf)
      ctx.strokeStyle = 'rgba(14, 165, 233, 0.08)';
      ctx.lineWidth = 4;
      ctx.stroke(path2D);

      // Continent Landmass Base (Natural dark satellite earth)
      ctx.fillStyle = '#0f241d';
      ctx.fill(path2D);

      // Subtle topography relief shading
      ctx.fillStyle = 'rgba(16, 44, 34, 0.45)';
      ctx.fill(path2D);
    });

    // 4. Arid Plateaus & Highlands (Warm Ochre / Desert Shading)
    const aridRegions = [
      { lat: 25.0, lon: 15.0, rX: 180, rY: 80 },  // Sahara
      { lat: 24.0, lon: 45.0, rX: 80, rY: 60 },   // Arabian Peninsula
      { lat: 32.0, lon: 86.0, rX: 90, rY: 45 },   // Tibetan Plateau
      { lat: -25.0, lon: 134.0, rX: 110, rY: 70 }, // Australian Outback
      { lat: 35.0, lon: -110.0, rX: 70, rY: 50 }, // American Southwest
    ];

    aridRegions.forEach((reg) => {
      const [cx, cy] = geoToCanvas(reg.lat, reg.lon, width, height);
      const grad = ctx.createRadialGradient(cx, cy, 10, cx, cy, reg.rX);
      grad.addColorStop(0, 'rgba(160, 115, 50, 0.20)');
      grad.addColorStop(0.7, 'rgba(100, 75, 30, 0.08)');
      grad.addColorStop(1, 'transparent');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(cx, cy, reg.rX, reg.rY, 0, 0, Math.PI * 2);
      ctx.fill();
    });

    // 5. Polar Ice Caps & Glacial Covers
    const arcticGrad = ctx.createLinearGradient(0, 0, 0, height * 0.14);
    arcticGrad.addColorStop(0, 'rgba(215, 235, 255, 0.70)');
    arcticGrad.addColorStop(0.6, 'rgba(160, 200, 240, 0.30)');
    arcticGrad.addColorStop(1, 'transparent');
    ctx.fillStyle = arcticGrad;
    ctx.fillRect(0, 0, width, height * 0.14);

    const antarcticGrad = ctx.createLinearGradient(0, height * 0.86, 0, height);
    antarcticGrad.addColorStop(0, 'transparent');
    antarcticGrad.addColorStop(0.4, 'rgba(170, 210, 245, 0.35)');
    antarcticGrad.addColorStop(1, 'rgba(225, 240, 255, 0.75)');
    ctx.fillStyle = antarcticGrad;
    ctx.fillRect(0, height * 0.86, width, height * 0.14);

    // 6. Night City Lights (Warm golden/amber luminescence)
    CITY_LIGHTS.forEach((city) => {
      const [cx, cy] = geoToCanvas(city.lat, city.lon, width, height);
      const glow = ctx.createRadialGradient(cx, cy, 0.5, cx, cy, city.r * 2.2);
      glow.addColorStop(0, `rgba(254, 240, 138, ${city.intensity * 0.9})`);
      glow.addColorStop(0.4, `rgba(251, 191, 36, ${city.intensity * 0.4})`);
      glow.addColorStop(1, 'transparent');

      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(cx, cy, city.r * 2.2, 0, Math.PI * 2);
      ctx.fill();

      // Sharp Core Light
      ctx.fillStyle = '#fffbeb';
      ctx.beginPath();
      ctx.arc(cx, cy, Math.max(1.0, city.r * 0.25), 0, Math.PI * 2);
      ctx.fill();
    });

    // 7. Atmospheric Cirrus & Cloud Swirls (Soft organic wisps, zero horizontal banding)
    const cloudVortices = [
      { cx: width * 0.25, cy: height * 0.45, r: 80, a: 0.05 },
      { cx: width * 0.55, cy: height * 0.52, r: 110, a: 0.06 },
      { cx: width * 0.78, cy: height * 0.48, r: 90, a: 0.04 },
      { cx: width * 0.35, cy: height * 0.30, r: 70, a: 0.04 },
      { cx: width * 0.65, cy: height * 0.28, r: 85, a: 0.05 },
      { cx: width * 0.45, cy: height * 0.65, r: 95, a: 0.04 },
    ];

    cloudVortices.forEach((vortex) => {
      const grad = ctx.createRadialGradient(vortex.cx, vortex.cy, 5, vortex.cx, vortex.cy, vortex.r);
      grad.addColorStop(0, `rgba(255, 255, 255, ${vortex.a})`);
      grad.addColorStop(0.5, `rgba(240, 248, 255, ${vortex.a * 0.5})`);
      grad.addColorStop(1, 'transparent');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(vortex.cx, vortex.cy, vortex.r, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  return texture;
}

/**
 * Creates Rayleigh Scattering Atmospheric Rim Shader Material
 * Renders an ethereal, glowing atmospheric limb with smooth exponential falloff.
 */
export function createAtmosphericRimShaderMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vEye;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vEye = normalize(-mvPosition.xyz);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      varying vec3 vNormal;
      varying vec3 vEye;
      void main() {
        float rim = 1.0 - max(0.0, dot(vNormal, vEye));
        // Soft exponential falloff for real atmospheric limb (eliminates harsh neon ring)
        float atmosphere = pow(rim, 5.5) * 0.45;
        vec3 skyColor = mix(vec3(0.01, 0.18, 0.55), vec3(0.08, 0.48, 0.85), rim);
        gl_FragColor = vec4(skyColor, atmosphere);
      }
    `,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
  });
}

/**
 * Creates an immersive 3D Starfield surrounding the globe
 */
export function createDeepSpaceStarfield(count: number = 1000, radius: number = 700): THREE.Points {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    const u = Math.random();
    const v = Math.random();
    const theta = u * 2.0 * Math.PI;
    const phi = Math.acos(2.0 * v - 1.0);
    const r = radius + (Math.random() - 0.5) * 120;

    const x = r * Math.sin(phi) * Math.cos(theta);
    const y = r * Math.sin(phi) * Math.sin(theta);
    const z = r * Math.cos(phi);

    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;

    const tint = Math.random();
    if (tint > 0.8) {
      colors[i * 3] = 0.65;
      colors[i * 3 + 1] = 0.82;
      colors[i * 3 + 2] = 1.0;
    } else if (tint > 0.6) {
      colors[i * 3] = 1.0;
      colors[i * 3 + 1] = 0.92;
      colors[i * 3 + 2] = 0.75;
    } else {
      colors[i * 3] = 0.85;
      colors[i * 3 + 1] = 0.85;
      colors[i * 3 + 2] = 0.92;
    }
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const material = new THREE.PointsMaterial({
    size: 2.0,
    vertexColors: true,
    transparent: true,
    opacity: 0.8,
    sizeAttenuation: true,
  });

  return new THREE.Points(geometry, material);
}
