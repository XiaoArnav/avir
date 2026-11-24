/**
 * Environmental Source Catalog Service
 * 
 * Extracts, normalizes, and groups available environmental sources for user selection
 * and station inspection without fabrication.
 */

import { EnvironmentalSourceRecord } from '@/domain/types';
import { SourceCatalogItem } from './source-control-types';

/**
 * Normalizes an EnvironmentalSourceRecord into a client-safe SourceCatalogItem.
 */
export function toSourceCatalogItem(src: EnvironmentalSourceRecord): SourceCatalogItem {
  const pm25Measurement = src.measurements?.find((m) => m.pollutant === 'pm25');
  const pm10Measurement = src.measurements?.find((m) => m.pollutant === 'pm10');

  const pm25 =
    pm25Measurement && pm25Measurement.value !== null && Number.isFinite(pm25Measurement.value)
      ? pm25Measurement.value
      : null;

  const pm10 =
    pm10Measurement && pm10Measurement.value !== null && Number.isFinite(pm10Measurement.value)
      ? pm10Measurement.value
      : null;

  const isAvailable =
    src.status === 'active' ||
    src.status === 'fresh' ||
    (pm25 !== null && src.status !== 'unavailable' && src.status !== 'rejected');

  const isStale = src.status === 'stale';
  const isReference =
    src.sourceKind === 'official_ground_station' ||
    src.providerId === 'cpcb' ||
    Boolean(src.provenance?.network?.toLowerCase().includes('cpcb'));

  return {
    id: src.id,
    name: src.sourceName || src.name || src.id,
    providerId: src.providerId,
    providerName: src.providerName || src.provider || src.providerId,
    sourceKind: src.sourceKind,
    distanceKm: src.distanceKm ?? null,
    pm25,
    pm10,
    observedAt: src.observedAt ?? src.measuredAt ?? null,
    validAt: src.validAt ?? null,
    status: src.status,
    isAvailable,
    isStale,
    isReference,
    attribution: src.attribution || src.provenance?.licenseOrAttribution || 'Open Data',
  };
}

/**
 * Builds a structured catalog of all available sources present in current telemetry.
 */
export function buildSourceCatalog(sources: EnvironmentalSourceRecord[]): {
  all: SourceCatalogItem[];
  officialGround: SourceCatalogItem[];
  openaqGround: SourceCatalogItem[];
  atmosphericModels: SourceCatalogItem[];
  communitySensors: SourceCatalogItem[];
} {
  const items = (sources || []).map(toSourceCatalogItem);

  const officialGround = items.filter(
    (i) => i.sourceKind === 'official_ground_station' || i.providerId === 'cpcb'
  );

  const openaqGround = items.filter(
    (i) =>
      i.providerId === 'openaq' &&
      i.sourceKind !== 'official_ground_station' &&
      i.sourceKind !== 'atmospheric_model'
  );

  const atmosphericModels = items.filter(
    (i) => i.sourceKind === 'atmospheric_model' || i.providerId === 'open_meteo'
  );

  const communitySensors = items.filter(
    (i) =>
      i.sourceKind === 'community_optical' ||
      i.sourceKind === 'user_hardware' ||
      i.providerId === 'sensor_community'
  );

  return {
    all: items,
    officialGround,
    openaqGround,
    atmosphericModels,
    communitySensors,
  };
}
