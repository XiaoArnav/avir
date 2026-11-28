export interface AvirThreeCameraDebugHandle {
  getDistance: () => number;
  getTargetDistance: () => number;
  getOrientation: () => { x: number; y: number };
}

declare global {
  interface Window {
    __avirThreeCamera?: AvirThreeCameraDebugHandle;
    CESIUM_BASE_URL?: string;
  }
}

export {};
