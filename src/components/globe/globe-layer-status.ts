import type { FirmsStatusResponse } from '@/domain/firms-types';
import { convertWindSpeed, sampleWindVector, toWindGridView } from '@/domain/wind-field';
import type { GlobalWindSnapshot, WindForecastResponse, WindSpeedUnit } from '@/domain/wind-types';
import type {
  EnvironmentalLayerStatusInfo,
  EnvironmentalLayersStatusMap,
} from './GlobeControls';
import type { CesiumTerrainLoadState } from './cesium/AvirCesiumGlobe';
import {
  ActiveCityEnvironmentTarget,
  isValidGeographicCoordinate,
} from './globe-location-utils';

export function mapFirmsStatusToLayerInfo(res: FirmsStatusResponse): EnvironmentalLayerStatusInfo {
  switch (res.status) {
    case 'active': {
      const obsUtc = res.latestObservationUtc ? ` • UTC ${res.latestObservationUtc.slice(11, 16)}` : '';
      return {
        state: 'live',
        detail: `${res.count} thermal ${res.count === 1 ? 'anomaly' : 'anomalies'}${obsUtc}`,
      };
    }
    case 'no_detections':
      return {
        state: 'no_detections',
        detail: '0 detections within 500 km (clouds/off-pass not excluded)',
      };
    case 'unconfigured':
      return {
        state: 'unconfigured',
        detail: 'FIRMS_MAP_KEY not configured on server',
      };
    case 'quota_exceeded':
      return {
        state: 'rate_limited',
        detail: 'NASA FIRMS rate limit reached',
      };
    case 'stale_cached':
      return {
        state: 'stale',
        detail: `${res.count} ${res.count === 1 ? 'cached anomaly' : 'cached anomalies'} (live feed unavailable)`,
      };
    case 'invalid_credentials':
      return {
        state: 'unavailable',
        detail: 'NASA FIRMS credential rejected',
      };
    case 'upstream_timeout':
    case 'malformed_csv':
    case 'upstream_error':
    default:
      return {
        state: 'unavailable',
        detail: res.message || 'NASA FIRMS telemetry unavailable',
      };
  }
}

export function mapGlobalWindSnapshotToLayerInfo(
  snapshot: GlobalWindSnapshot,
  target: ActiveCityEnvironmentTarget | null,
  speedUnit: WindSpeedUnit = 'km/h'
): EnvironmentalLayerStatusInfo {
  const m = snapshot.manifest;
  if (!m.isAvailable || snapshot.u.length === 0 || snapshot.v.length === 0) {
    return {
      state: 'unavailable',
      detail: m.unavailableReason || 'Global wind forecast unavailable',
    };
  }

  let speedPrefix = '';
  if (target && isValidGeographicCoordinate(target.latitude, target.longitude)) {
    const gridView = toWindGridView(snapshot);
    if (gridView) {
      const sample = sampleWindVector(gridView, target.longitude, target.latitude);
      if (sample.valid) {
        const displayVal = convertWindSpeed(sample.speedMs, speedUnit);
        speedPrefix = `~${Math.round(displayVal)} ${speedUnit} • `;
      }
    }
  }

  const modelShort = m.model === 'ifs' ? 'ECMWF IFS' : 'NOAA GFS';
  if (m.status === 'stale_cached' || m.isStale) {
    return {
      state: 'stale',
      detail: `${speedPrefix}Cached ${modelShort} 1° grid`,
    };
  }

  return {
    state: 'live',
    detail: `${speedPrefix}${modelShort} 1° forecast`,
  };
}

export function mapWindStatusToLayerInfo(res: WindForecastResponse): EnvironmentalLayerStatusInfo {
  if (res.status === 'rate_limited') {
    return {
      state: 'rate_limited',
      detail: 'Wind forecast rate limit reached',
    };
  }
  if (!res.isAvailable || !Array.isArray(res.grid) || res.grid.length === 0) {
    return {
      state: 'unavailable',
      detail: res.unavailableReason || 'Wind vector telemetry unavailable',
    };
  }
  const speedText =
    res.cityWind && Number.isFinite(res.cityWind.speedKmh)
      ? `~${Math.round(res.cityWind.speedKmh)} km/h • `
      : '';
  if (res.status === 'stale_cached' || res.isStale) {
    return {
      state: 'stale',
      detail: `${speedText}Cached GFS vectors (${res.grid.length} probes)`,
    };
  }
  return {
    state: 'live',
    detail: `${speedText}${res.grid.length} GFS/Open-Meteo probes`,
  };
}

export interface BuildEnvironmentalLayerStatusParams {
  is3D: boolean;
  engineMode: 'three' | 'cesium';
  isTerrainEnabled: boolean;
  terrainLoadState: CesiumTerrainLoadState;
  windInfo: EnvironmentalLayerStatusInfo;
  firesInfo: EnvironmentalLayerStatusInfo;
  satelliteInfo: EnvironmentalLayerStatusInfo;
}

export function buildEnvironmentalLayerStatus({
  is3D,
  engineMode,
  isTerrainEnabled,
  terrainLoadState,
  windInfo,
  firesInfo,
  satelliteInfo,
}: BuildEnvironmentalLayerStatusParams): EnvironmentalLayersStatusMap {
  let terrainStatusInfo: EnvironmentalLayerStatusInfo;
  if (!is3D || engineMode !== 'cesium') {
    terrainStatusInfo = { state: 'unsupported', detail: 'Cesium Engine Only' };
  } else if (!isTerrainEnabled) {
    terrainStatusInfo = { state: 'off', detail: 'Re:Earth Quantized Mesh' };
  } else if (terrainLoadState === 'active') {
    terrainStatusInfo = { state: 'live', detail: 'Re:Earth Quantized Mesh active' };
  } else if (terrainLoadState === 'fallback') {
    terrainStatusInfo = { state: 'unavailable', detail: 'Terrain failed — ellipsoid active' };
  } else {
    terrainStatusInfo = { state: 'loading', detail: 'Loading Re:Earth terrain...' };
  }

  return {
    wind: windInfo,
    fires: firesInfo,
    terrain: terrainStatusInfo,
    satelliteComparison: satelliteInfo,
  };
}
