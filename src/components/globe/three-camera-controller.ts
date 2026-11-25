/**
 * Three.js Cesium-Style Proportional Camera Controller
 *
 * Implements proportional surface-altitude scaling, device-normalized wheel/trackpad
 * input, touch pinch gestures, and frame-rate-independent exponential damping.
 */

export const EARTH_RADIUS = 90;
export const DEFAULT_CAMERA_DISTANCE = 260;

// Surface altitude bounds (distance above the 90-unit Earth surface)
export const MIN_ALTITUDE = 12; // Distance = 102 units (detailed regional view without clipping)
export const MAX_ALTITUDE = 910; // Distance = 1000 units (deep-space orbital overview)

// Proportional zoom factors based on remaining altitude
export const ZOOM_IN_FACTOR = 0.65; // Moves 35% closer to surface
export const ZOOM_OUT_FACTOR = 1.45; // Moves 45% farther from surface

// Damping rate for frame-rate-independent exponential smoothing
export const DAMPING_RATE = 10.0;

// Wheel and trackpad input sensitivity
export const WHEEL_SENSITIVITY = 0.0015;

/**
 * Calculates next camera distance for discrete Zoom In / Zoom Out button actions
 * using proportional altitude scaling.
 */
export function calculateNextDistance(
  currentDistance: number,
  direction: 'in' | 'out'
): number {
  const currentAltitude = currentDistance - EARTH_RADIUS;
  const factor = direction === 'in' ? ZOOM_IN_FACTOR : ZOOM_OUT_FACTOR;
  const nextAltitude = Math.min(
    Math.max(currentAltitude * factor, MIN_ALTITUDE),
    MAX_ALTITUDE
  );
  return EARTH_RADIUS + nextAltitude;
}

/**
 * Calculates next camera distance for mouse-wheel and trackpad gestures.
 * Normalizes wheel delta units and applies bounded exponential scaling.
 */
export function calculateWheelDistance(
  currentDistance: number,
  deltaY: number,
  deltaMode = 0
): number {
  // Normalize deltaMode: 0 = pixels, 1 = lines, 2 = pages
  let normalizedDelta = deltaY;
  if (deltaMode === 1) {
    normalizedDelta *= 16;
  } else if (deltaMode === 2) {
    normalizedDelta *= 100;
  }

  // Clamp per-event delta to prevent extreme jumps from high-speed fling gestures
  const clampedDelta = Math.max(-120, Math.min(120, normalizedDelta));

  const currentAltitude = currentDistance - EARTH_RADIUS;
  const zoomFactor = Math.exp(clampedDelta * WHEEL_SENSITIVITY);
  const nextAltitude = Math.min(
    Math.max(currentAltitude * zoomFactor, MIN_ALTITUDE),
    MAX_ALTITUDE
  );

  return EARTH_RADIUS + nextAltitude;
}

/**
 * Calculates next camera distance for two-finger touch pinch gestures.
 * scaleRatio > 1 means fingers spreading (zoom in).
 * scaleRatio < 1 means fingers pinching together (zoom out).
 */
export function calculatePinchDistance(
  currentDistance: number,
  scaleRatio: number
): number {
  if (scaleRatio <= 0 || !Number.isFinite(scaleRatio)) {
    return currentDistance;
  }

  const currentAltitude = currentDistance - EARTH_RADIUS;
  const nextAltitude = Math.min(
    Math.max(currentAltitude / scaleRatio, MIN_ALTITUDE),
    MAX_ALTITUDE
  );

  return EARTH_RADIUS + nextAltitude;
}

/**
 * Applies frame-rate-independent exponential damping between current and target distance.
 * Returns target immediately if reduced motion is requested or within settling threshold.
 */
export function interpolateCameraDistance(
  currentDistance: number,
  targetDistance: number,
  deltaSeconds: number,
  reducedMotion = false
): number {
  if (reducedMotion || deltaSeconds <= 0) {
    return targetDistance;
  }

  // Alpha = 1 - e^(-lambda * dt)
  const alpha = 1 - Math.exp(-DAMPING_RATE * deltaSeconds);
  const nextDistance = currentDistance + (targetDistance - currentDistance) * alpha;

  // Settle precisely on target to prevent micro-jitter
  if (Math.abs(targetDistance - nextDistance) < 0.05) {
    return targetDistance;
  }

  return nextDistance;
}
