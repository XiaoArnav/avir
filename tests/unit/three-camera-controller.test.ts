import { describe, it, expect } from 'vitest';
import {
  EARTH_RADIUS,
  DEFAULT_CAMERA_DISTANCE,
  MIN_ALTITUDE,
  MAX_ALTITUDE,
  calculateNextDistance,
  calculateWheelDistance,
  calculatePinchDistance,
  interpolateCameraDistance,
} from '@/components/globe/three-camera-controller';

describe('Three.js Cesium-Style Camera Controller', () => {
  it('defines correct physical planet dimensions and bounds', () => {
    expect(EARTH_RADIUS).toBe(90);
    expect(DEFAULT_CAMERA_DISTANCE).toBe(260);
    expect(MIN_ALTITUDE).toBeGreaterThan(5);
    expect(MAX_ALTITUDE).toBeGreaterThan(500);
    expect(DEFAULT_CAMERA_DISTANCE - EARTH_RADIUS).toBeGreaterThan(MIN_ALTITUDE);
    expect(DEFAULT_CAMERA_DISTANCE - EARTH_RADIUS).toBeLessThan(MAX_ALTITUDE);
  });

  describe('calculateNextDistance', () => {
    it('proportionally zooms in based on remaining surface altitude', () => {
      const initial = 260; // altitude = 170
      const next = calculateNextDistance(initial, 'in');
      // With factor 0.65, next altitude is 170 * 0.65 = 110.5 => distance = 200.5
      expect(next).toBeLessThan(initial);
      expect(next).toBeCloseTo(90 + 170 * 0.65, 1);
    });

    it('proportionally zooms out based on surface altitude', () => {
      const initial = 260; // altitude = 170
      const next = calculateNextDistance(initial, 'out');
      // With factor 1.45, next altitude is 170 * 1.45 = 246.5 => distance = 336.5
      expect(next).toBeGreaterThan(initial);
      expect(next).toBeCloseTo(90 + 170 * 1.45, 1);
    });

    it('never allows camera to penetrate Earth surface (clamps to MIN_ALTITUDE)', () => {
      let dist = 110;
      for (let i = 0; i < 20; i++) {
        dist = calculateNextDistance(dist, 'in');
      }
      expect(dist).toBe(EARTH_RADIUS + MIN_ALTITUDE);
      expect(dist).toBeGreaterThan(EARTH_RADIUS);
    });

    it('never allows camera to fly into infinite void (clamps to MAX_ALTITUDE)', () => {
      let dist = 800;
      for (let i = 0; i < 20; i++) {
        dist = calculateNextDistance(dist, 'out');
      }
      expect(dist).toBe(EARTH_RADIUS + MAX_ALTITUDE);
    });
  });

  describe('calculateWheelDistance', () => {
    it('zooms in when deltaY is negative (wheel scroll up)', () => {
      const initial = 260;
      const next = calculateWheelDistance(initial, -100);
      expect(next).toBeLessThan(initial);
      expect(next).toBeGreaterThan(EARTH_RADIUS + MIN_ALTITUDE);
    });

    it('zooms out when deltaY is positive (wheel scroll down)', () => {
      const initial = 260;
      const next = calculateWheelDistance(initial, 100);
      expect(next).toBeGreaterThan(initial);
      expect(next).toBeLessThan(EARTH_RADIUS + MAX_ALTITUDE);
    });

    it('normalizes deltaMode line and page units', () => {
      const initial = 260;
      const lineZoom = calculateWheelDistance(initial, 3, 1); // 3 lines
      const pixelZoom = calculateWheelDistance(initial, 48, 0); // 48 pixels
      expect(lineZoom).toBeCloseTo(pixelZoom, 1);
    });

    it('clamps rapid wheel spins to prevent abrupt jumps', () => {
      const initial = 260;
      const normalZoom = calculateWheelDistance(initial, 120);
      const crazyZoom = calculateWheelDistance(initial, 10000);
      expect(crazyZoom).toBeCloseTo(normalZoom, 1);
    });
  });

  describe('calculatePinchDistance', () => {
    it('zooms in when pinch ratio is greater than 1 (fingers spreading)', () => {
      const initial = 260;
      const next = calculatePinchDistance(initial, 1.25);
      expect(next).toBeLessThan(initial);
    });

    it('zooms out when pinch ratio is less than 1 (fingers pinching together)', () => {
      const initial = 260;
      const next = calculatePinchDistance(initial, 0.8);
      expect(next).toBeGreaterThan(initial);
    });

    it('respects altitude clamping during pinch gestures', () => {
      const extremeZoomIn = calculatePinchDistance(110, 50.0);
      expect(extremeZoomIn).toBe(EARTH_RADIUS + MIN_ALTITUDE);

      const extremeZoomOut = calculatePinchDistance(800, 0.01);
      expect(extremeZoomOut).toBe(EARTH_RADIUS + MAX_ALTITUDE);
    });
  });

  describe('interpolateCameraDistance', () => {
    it('interpolates smoothly toward target over time delta', () => {
      const current = 260;
      const target = 200;
      const deltaSeconds = 0.016; // 60fps frame
      const next = interpolateCameraDistance(current, target, deltaSeconds);
      expect(next).toBeLessThan(current);
      expect(next).toBeGreaterThan(target);
    });

    it('snaps immediately to target when reduced motion is preferred', () => {
      const current = 260;
      const target = 200;
      const next = interpolateCameraDistance(current, target, 0.016, true);
      expect(next).toBe(target);
    });

    it('settles precisely on target when within threshold to prevent micro-jitter', () => {
      const current = 200.02;
      const target = 200.0;
      const next = interpolateCameraDistance(current, target, 0.016);
      expect(next).toBe(target);
    });
  });
});
