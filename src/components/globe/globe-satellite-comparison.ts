import type { SatelliteComparisonPair } from '@/domain/imagery-types';
import {
  buildSatelliteComparison,
  getAvailableImageryDates,
} from '@/services/environment/satellite-imagery-service';
import type { EnvironmentalLayerStatusInfo } from './GlobeControls';
import {
  ActiveCityEnvironmentTarget,
  isValidGeographicCoordinate,
} from './globe-location-utils';

export function buildInitialSatelliteComparisonForTarget(
  target: ActiveCityEnvironmentTarget | null
): {
  comparison: SatelliteComparisonPair | null;
  error: string | null;
  info: EnvironmentalLayerStatusInfo;
  dateA?: string;
  dateB?: string;
} {
  if (!target || !isValidGeographicCoordinate(target.latitude, target.longitude)) {
    return {
      comparison: null,
      error: 'Satellite imagery comparison requires valid active city coordinates.',
      info: { state: 'unavailable', detail: 'Active city coordinates unavailable' },
    };
  }

  try {
    const candidates = getAvailableImageryDates(7, { product: 'VIIRS' });
    const dateB = candidates[0]?.date;
    const dateA = candidates[candidates.length - 1]?.date;

    if (!dateA || !dateB) {
      return {
        comparison: null,
        error: 'No candidate NASA GIBS dates available.',
        info: { state: 'unavailable', detail: 'No candidate dates' },
      };
    }

    const comparison = buildSatelliteComparison({
      city: target.name,
      latitude: target.latitude,
      longitude: target.longitude,
      dateA,
      dateB,
      productA: 'VIIRS',
      productB: 'VIIRS',
    });

    return {
      comparison,
      error: null,
      info: { state: 'unverified', detail: `${dateA} vs ${dateB} (unverified)` },
      dateA,
      dateB,
    };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Unable to construct NASA GIBS snapshot extent.';
    return {
      comparison: null,
      error: message,
      info: { state: 'unavailable', detail: message },
    };
  }
}
