/**
 * AVIR — Presentation Contract & Data State Normalization (Step 17 / UX08, UX10, UX16)
 *
 * Provides a unified presentation contract across all dashboard components, cards,
 * charts, and export bulletins. Enforces the strict rule:
 * - Missing is not zero.
 * - Stale is not current.
 * - Forecast is not observation.
 * - Derived is not officially published.
 * - User scenario is not live telemetry.
 */

export type DisplayDataState =
  | 'loading'
  | 'current'
  | 'partial'
  | 'stale'
  | 'unavailable'
  | 'error';

export type DisplaySourceKind =
  | 'observation'
  | 'model'
  | 'derived'
  | 'user_scenario'
  | 'unknown';

export interface DisplayMeasurement {
  value: number | null;
  unit: string;
  state: DisplayDataState;
  sourceName: string | null;
  sourceKind: DisplaySourceKind;
  validAtUtc: string | null;
  retrievedAtUtc: string | null;
  limitation: string | null;
  formattedValue: string;
  formattedTimeAgo: string | null;
}

export interface ToDisplayMeasurementOptions {
  value: number | null | undefined;
  unit: string;
  sourceName?: string | null;
  sourceKind?: DisplaySourceKind;
  validAtUtc?: string | null;
  retrievedAtUtc?: string | null;
  limitation?: string | null;
  isLoading?: boolean;
  isError?: boolean;
  maxFreshAgeMs?: number; // default: 3 hours (10,800,000 ms)
  nowMs?: number;
  decimalPlaces?: number;
}

/**
 * Human-readable relative time formatter (e.g. "Just now", "12m ago", "2h ago", "Stale (>24h ago)")
 */
export function formatTimeAgo(isoString: string | null | undefined, nowMs: number = Date.now()): string | null {
  if (!isoString) return null;
  const time = new Date(isoString).getTime();
  if (isNaN(time)) return null;

  const diffMs = nowMs - time;
  if (diffMs < 0) {
    // Future timestamp (forecast)
    const futureMin = Math.round(Math.abs(diffMs) / 60000);
    if (futureMin < 60) return `In ${futureMin}m`;
    const futureHours = Math.round(futureMin / 60);
    return `In ~${futureHours}h`;
  }

  const diffMinutes = Math.floor(diffMs / 60000);
  if (diffMinutes < 1) return 'Just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

/**
 * Standardized data state resolver
 */
export function resolveDataState(
  value: number | null | undefined,
  options: {
    isLoading?: boolean;
    isError?: boolean;
    validAtUtc?: string | null;
    maxFreshAgeMs?: number;
    nowMs?: number;
  } = {}
): DisplayDataState {
  if (options.isLoading) return 'loading';
  if (options.isError) return 'error';

  // Strict zero-validity: 0 is valid clean air
  const isValidNumber = typeof value === 'number' && Number.isFinite(value) && value >= 0;
  if (!isValidNumber) return 'unavailable';

  // Check temporal freshness if timestamp provided
  if (options.validAtUtc) {
    const time = new Date(options.validAtUtc).getTime();
    if (!isNaN(time)) {
      const now = options.nowMs ?? Date.now();
      const maxAge = options.maxFreshAgeMs ?? 3 * 60 * 60 * 1000; // 3h freshness window
      if (now - time > maxAge) {
        return 'stale';
      }
    }
  }

  return 'current';
}

/**
 * Formats numeric values preserving mathematical precision without fabricating placeholders
 */
export function formatMeasurementValue(
  value: number | null | undefined,
  state: DisplayDataState,
  decimalPlaces: number = 0
): string {
  if (state === 'loading') return '...';
  if (state === 'error' || state === 'unavailable') return '--';

  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return '--';
  }

  if (decimalPlaces > 0) {
    return value.toFixed(decimalPlaces);
  }
  return Math.round(value).toString();
}

/**
 * Creates a fully typed DisplayMeasurement conforming to the presentation contract
 */
export function toDisplayMeasurement(options: ToDisplayMeasurementOptions): DisplayMeasurement {
  const state = resolveDataState(options.value, {
    isLoading: options.isLoading,
    isError: options.isError,
    validAtUtc: options.validAtUtc,
    maxFreshAgeMs: options.maxFreshAgeMs,
    nowMs: options.nowMs,
  });

  const formattedValue = formatMeasurementValue(
    options.value,
    state,
    options.decimalPlaces ?? 0
  );

  const formattedTimeAgo = options.validAtUtc
    ? formatTimeAgo(options.validAtUtc, options.nowMs)
    : null;

  return {
    value: typeof options.value === 'number' && Number.isFinite(options.value) && options.value >= 0
      ? options.value
      : null,
    unit: options.unit,
    state,
    sourceName: options.sourceName ?? null,
    sourceKind: options.sourceKind ?? 'unknown',
    validAtUtc: options.validAtUtc ?? null,
    retrievedAtUtc: options.retrievedAtUtc ?? null,
    limitation: options.limitation ?? null,
    formattedValue,
    formattedTimeAgo,
  };
}

/**
 * Standard plain-language label mapper with preserved scientific symbols
 */
export const POLLUTANT_PRESENTATION_METADATA = {
  pm25: {
    label: 'Fine Particulate (PM2.5)',
    shortLabel: 'PM2.5',
    unit: 'µg/m³',
    description: 'Microscopic inhalable combustion particles under 2.5 micrometers.',
  },
  pm10: {
    label: 'Coarse Dust (PM10)',
    shortLabel: 'PM10',
    unit: 'µg/m³',
    description: 'Larger suspended dust, pollen, and road grit particles under 10 micrometers.',
  },
  usAqi: {
    label: 'US EPA Air Quality Index',
    shortLabel: 'US AQI',
    unit: 'Index',
    description: 'Dimensionless multi-breakpoint health index based on EPA standard.',
  },
  cpcbAqi: {
    label: 'Indian CPCB NAQI',
    shortLabel: 'CPCB AQI',
    unit: 'Index',
    description: 'Indian Central Pollution Control Board National Air Quality Index.',
  },
  boundaryLayerHeight: {
    label: 'Atmospheric Smoke Ceiling',
    shortLabel: 'Ceiling',
    unit: 'm',
    description: 'Planetary boundary layer height determining vertical dispersion.',
  },
  windSpeed: {
    label: 'Surface Wind Speed',
    shortLabel: 'Wind',
    unit: 'km/h',
    description: 'Horizontal atmospheric transport velocity.',
  },
} as const;
