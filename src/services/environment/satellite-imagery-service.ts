/**
 * NASA GIBS Satellite Imagery Service (Phase 6)
 * 
 * Provides dated satellite imagery pairs and metadata for environmental inspection
 * and before/after comparisons across urban regions.
 */

import {
  SatelliteComparisonPair,
  SatelliteImageSlot,
  SUPPORTED_IMAGERY_PRODUCTS,
  SATELLITE_IMAGERY_DISCLAIMER,
  buildGibsSnapshotUrl,
  getBoundingBoxForCoordinates,
} from '@/domain/imagery-types';

export function getAvailableImageryDates(maxDaysBack: number = 30): string[] {
  const dates: string[] = [];
  const now = new Date();

  // Start from yesterday or today UTC
  for (let i = 1; i <= maxDaysBack; i++) {
    const d = new Date(now.getTime() - i * 86_400_000);
    const iso = d.toISOString().split('T')[0];
    dates.push(iso);
  }

  return dates;
}

export function buildSatelliteComparison(params: {
  city: string;
  latitude: number;
  longitude: number;
  dateA: string; // YYYY-MM-DD
  dateB: string; // YYYY-MM-DD
  productA?: 'VIIRS' | 'HLS_S30';
  productB?: 'VIIRS' | 'HLS_S30';
  radiusKm?: number;
}): SatelliteComparisonPair {
  const {
    city,
    latitude,
    longitude,
    dateA,
    dateB,
    productA = 'VIIRS',
    productB = 'VIIRS',
    radiusKm = 80,
  } = params;

  const bbox = getBoundingBoxForCoordinates(latitude, longitude, radiusKm);
  const prodA = SUPPORTED_IMAGERY_PRODUCTS[productA] || SUPPORTED_IMAGERY_PRODUCTS.VIIRS;
  const prodB = SUPPORTED_IMAGERY_PRODUCTS[productB] || SUPPORTED_IMAGERY_PRODUCTS.VIIRS;

  const urlA = buildGibsSnapshotUrl({
    product: prodA.id,
    date: dateA,
    bbox,
  });

  const urlB = buildGibsSnapshotUrl({
    product: prodB.id,
    date: dateB,
    bbox,
  });

  const slotA: SatelliteImageSlot = {
    date: dateA,
    productId: prodA.id,
    productName: prodA.name,
    sensor: prodA.sensor,
    resolutionM: prodA.resolutionM,
    imageUrl: urlA,
    attribution: prodA.attribution,
  };

  const slotB: SatelliteImageSlot = {
    date: dateB,
    productId: prodB.id,
    productName: prodB.name,
    sensor: prodB.sensor,
    resolutionM: prodB.resolutionM,
    imageUrl: urlB,
    attribution: prodB.attribution,
  };

  return {
    city,
    coordinates: { lat: latitude, lng: longitude },
    slotA,
    slotB,
    disclaimer: SATELLITE_IMAGERY_DISCLAIMER,
  };
}
