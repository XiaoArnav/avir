import type { FirmsHotspot, FirmsStatusResponse } from '@/domain/firms-types';
import type { WindForecastResponse, WindVectorPoint } from '@/domain/wind-types';
import type { EnvironmentalLayerStatusInfo } from './GlobeControls';
import { mapFirmsStatusToLayerInfo, mapWindStatusToLayerInfo } from './globe-layer-status';
import {
  ActiveCityEnvironmentTarget,
  isValidGeographicCoordinate,
} from './globe-location-utils';

export interface LayerFetchResult<T> {
  aborted?: boolean;
  info: EnvironmentalLayerStatusInfo;
  data: T[];
}

export async function fetchActiveCityWindLayer(params: {
  target: ActiveCityEnvironmentTarget | null;
  validAtUtc?: string | null;
  selectedHour?: number;
  signal?: AbortSignal;
}): Promise<LayerFetchResult<WindVectorPoint>> {
  const { target, validAtUtc, selectedHour, signal } = params;
  if (!target || !isValidGeographicCoordinate(target.latitude, target.longitude)) {
    return {
      data: [],
      info: { state: 'unavailable', detail: 'Active city coordinates unavailable' },
    };
  }

  const query = new URLSearchParams({
    lat: String(target.latitude),
    lng: String(target.longitude),
  });

  if (validAtUtc) {
    const parsedMs = Date.parse(validAtUtc);
    if (!Number.isNaN(parsedMs)) {
      const normalizedIso = new Date(parsedMs).toISOString();
      query.set('validTimeUtc', normalizedIso);
      query.set('hour', String(new Date(parsedMs).getUTCHours()));
    }
  } else if (Number.isInteger(selectedHour) && (selectedHour as number) >= 0 && (selectedHour as number) <= 23) {
    query.set('hour', String(selectedHour));
  }

  try {
    const res = await fetch(`/api/environment/wind?${query.toString()}`, { signal });
    if (signal?.aborted) {
      return { aborted: true, data: [], info: { state: 'loading', detail: 'Aborted' } };
    }
    if (res.status === 429) {
      return {
        data: [],
        info: { state: 'rate_limited', detail: 'Wind forecast rate limited' },
      };
    }
    if (!res.ok) {
      return {
        data: [],
        info: { state: 'unavailable', detail: `Wind API returned HTTP ${res.status}` },
      };
    }
    const payload = (await res.json()) as WindForecastResponse;
    const info = mapWindStatusToLayerInfo(payload);
    const data =
      payload.isAvailable && Array.isArray(payload.grid) && payload.grid.length > 0
        ? payload.grid
        : [];
    return { info, data };
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      return { aborted: true, data: [], info: { state: 'loading', detail: 'Aborted' } };
    }
    return {
      data: [],
      info: { state: 'unavailable', detail: 'Wind telemetry network error' },
    };
  }
}

export async function fetchActiveCityFirmsLayer(params: {
  target: ActiveCityEnvironmentTarget | null;
  radiusKm?: number;
  signal?: AbortSignal;
}): Promise<LayerFetchResult<FirmsHotspot>> {
  const { target, radiusKm = 500, signal } = params;
  if (!target || !isValidGeographicCoordinate(target.latitude, target.longitude)) {
    return {
      data: [],
      info: { state: 'unavailable', detail: 'Active city coordinates unavailable' },
    };
  }

  const query = new URLSearchParams({
    lat: String(target.latitude),
    lng: String(target.longitude),
    radiusKm: String(radiusKm),
  });

  try {
    const res = await fetch(`/api/environment/fires?${query.toString()}`, { signal });
    if (signal?.aborted) {
      return { aborted: true, data: [], info: { state: 'loading', detail: 'Aborted' } };
    }
    if (res.status === 429) {
      return {
        data: [],
        info: { state: 'rate_limited', detail: 'Fires API rate limit exceeded' },
      };
    }
    if (!res.ok) {
      return {
        data: [],
        info: { state: 'unavailable', detail: `FIRMS API returned HTTP ${res.status}` },
      };
    }
    const payload = (await res.json()) as FirmsStatusResponse;
    const info = mapFirmsStatusToLayerInfo(payload);
    const data =
      payload.isAvailable &&
      (payload.status === 'active' || payload.status === 'stale_cached') &&
      Array.isArray(payload.hotspots)
        ? payload.hotspots
        : [];
    return { info, data };
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      return { aborted: true, data: [], info: { state: 'loading', detail: 'Aborted' } };
    }
    return {
      data: [],
      info: { state: 'unavailable', detail: 'NASA FIRMS network error' },
    };
  }
}
