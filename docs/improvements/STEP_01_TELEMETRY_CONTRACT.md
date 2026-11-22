# Avir Step 1: Telemetry Contract and Missing-Value Integrity

## 1. Executive Summary & Objective

**Step 1 of 24** focuses strictly on Avir's atmospheric telemetry ingestion pipeline, establishing a typed, validated, and transparent data contract. Prior to this step, atmospheric measurements lacked explicit field-level validity tracking, allowing potential edge cases where missing values could be masked or fallback substitutions could occur (such as `pm10 ?? pm25` in downstream NAQI computations).

This implementation formalizes the telemetry contract:
- Every provider measurement is typed with explicit validation metadata (`valid`, `unavailable`, or `rejected`).
- Physical invariants are enforced: `0 µg/m³` (clean air) is valid; negative concentrations, `NaN`, and `Infinity` are rejected as corrupted values.
- Coordinates are strictly validated within standard geographic boundaries (`[-90, 90]` latitude, `[-180, 180]` longitude).
- Zero fabrication is guaranteed: missing fields remain `null`; PM10 is never multiplied or substituted from PM2.5.
- Provider errors are explicitly classified (`network`, `timeout`, `rate_limit`, `validation`).
- Freshness and cache metadata are fully tracked and transparent.

---

## 2. Baseline Inspection & Previous Defects Identified

1. **Missing Field-Level Provenance & Validity**:
   - Previously, `AtmosphericMetrics` contained top-level nullable numbers (`pm25: number | null`, etc.) without recording why a field was null (e.g., whether it was absent from provider payload vs. rejected due to corruption).
2. **Accidental Fallback Substitution**:
   - In `src/services/telemetry-service.ts` line 181, `calculateCpcbNaqi(pm25, pm10 ?? pm25)` previously substituted PM2.5 when PM10 was absent. This violated zero-fabrication rules by deriving an index using a phantom PM10 value.
3. **Unchecked Coordinate Inputs**:
   - Coordinates were passed directly into URL query parameters without runtime validation, which could result in invalid queries (e.g., latitude 95°) producing unhandled provider errors.
4. **Unclassified HTTP Errors**:
   - Provider timeouts, rate limits (HTTP 429), malformed responses, and network drops were merged into generic error strings without machine-readable classification.
5. **Ambiguous Cache Freshness**:
   - Cached responses did not report whether they were returned from an active in-memory cache or a stale fallback, nor did they expose cache metadata (TTL, stored time, original measurement time).

---

## 3. Architecture & Type System Enhancements

### 3.1 Field-Level Validation Types (`src/domain/types.ts`)

```typescript
export type FieldValidationStatus = 'valid' | 'unavailable' | 'rejected';

export interface TelemetryFieldMetadata<T = number> {
  value: T | null;
  unit: string;
  provider: string;
  classification: DataProvenance;
  status: FieldValidationStatus;
  rejectionReason?: string;
}

export interface AtmosphericFieldMeasurements {
  pm25: TelemetryFieldMetadata<number>;
  pm10: TelemetryFieldMetadata<number>;
  usAqi: TelemetryFieldMetadata<number>;
  boundaryLayerHeight: TelemetryFieldMetadata<number>;
  co?: TelemetryFieldMetadata<number>;
  no2?: TelemetryFieldMetadata<number>;
  so2?: TelemetryFieldMetadata<number>;
  o3?: TelemetryFieldMetadata<number>;
  temperature?: TelemetryFieldMetadata<number>;
  humidity?: TelemetryFieldMetadata<number>;
  windSpeed?: TelemetryFieldMetadata<number>;
  windDirection?: TelemetryFieldMetadata<number>;
}

export interface TelemetryLocationMetadata {
  latitude: number;
  longitude: number;
  cityName?: string;
  timezone: string;
}

export interface TelemetryCacheMetadata {
  isCached: boolean;
  isStale: boolean;
  originalTimestamp?: string;
  cachedAt?: string;
  ttlMs?: number;
}
```

### 3.2 Backward-Compatible Extension of `AtmosphericMetrics`

`AtmosphericMetrics` was extended with optional metadata contracts, preserving 100% backward compatibility with existing components (`AtmosphereHero`, `RwaBulletinModal`, `ai-assistant-service`):

```typescript
export interface AtmosphericMetrics {
  // Existing fields preserved
  status: TelemetryStatus;
  provenance: DataProvenance;
  timestamp: string;
  retrievedAt: string;
  timezone: string;
  cityName?: string;
  latitude: number;
  longitude: number;
  usAqi: number | null;
  pm25: number | null;
  pm10: number | null;
  // ... trace gases & weather ...
  isLive: boolean;
  isStale?: boolean;
  errorMessage?: string;

  // Step 1 Telemetry Contract Metadata
  fields?: AtmosphericFieldMeasurements;
  location?: TelemetryLocationMetadata;
  cacheMetadata?: TelemetryCacheMetadata;
  freshness?: 'fresh' | 'stale' | 'expired' | 'unavailable';
  errorType?: 'network' | 'timeout' | 'rate_limit' | 'validation' | 'unknown';
}
```

---

## 4. Runtime Validation & Zero-Fabrication Pipeline

### 4.1 Geographic Coordinate Bounds

```typescript
export function isValidCoordinate(latitude: number, longitude: number): boolean {
  return (
    typeof latitude === 'number' &&
    typeof longitude === 'number' &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}
```
If coordinates are out of bounds, the service immediately returns a typed error object with `errorType: 'validation'` and physical boundary details without dispatching invalid external network requests.

### 4.2 Pollutant Validation (`validatePollutantValue`)

- **0 µg/m³ Concentration**: Clean air is a physically valid state. `value === 0` is accepted with `status: 'valid'`.
- **Missing Data**: `null` or `undefined` returns `value: null` with `status: 'unavailable'`.
- **Negative Concentrations**: Physical impossibilities (e.g., `-15 µg/m³`) are rejected with `status: 'rejected'` and logged with a specific `rejectionReason`.
- **Non-Finite Values**: `NaN` and `Infinity` are rejected with `status: 'rejected'`.
- **Physical Atmospheric Maximums**: Extreme sensor corruptions exceeding physical upper bounds (e.g., > 2000 µg/m³) are rejected.

### 4.3 Meteorological Validation (`validateWeatherValue`)

- Validates temperature `[-90, 60] °C`, relative humidity `[0, 100] %`, wind speed `[0, 400] km/h`, and boundary layer mixing height `[0, 10000] m`.

### 4.4 Honest Derivation & Zero-Fabrication Rules

1. **US AQI**:
   - If provided by Open-Meteo, validated directly under `classification: 'modeled_forecast'`.
   - If missing from Open-Meteo but PM2.5 is valid, derived cleanly using official US EPA breakpoints and marked with `classification: 'derived_calculation'` and `provider: 'Avir Derived (EPA Breakpoints)'`.
   - If both are missing, remains `null` with `status: 'unavailable'`.
2. **PM10**:
   - If absent, remains `null`.
   - **Zero-Fabrication Guarantee**: PM10 is never multiplied or estimated from PM2.5 (e.g., `pm25 * 1.4` is forbidden).
   - In `calculateCpcbNaqi(pm25, pm10)`, `pm10` is passed directly as `null`, avoiding the previous `pm10 ?? pm25` substitution.

---

## 5. HTTP Resilience & Error Classification

In `fetchWithRetry` and `fetchLiveAtmosphericMetrics`:
- **HTTP 429 (Rate Limit)**: Bypasses retry loops to avoid spamming the provider; immediately returns typed `errorType: 'rate_limit'`.
- **HTTP 5xx**: Retries up to 2 times with exponential backoff (250ms base delay).
- **Timeouts**: Caught and categorized as `errorType: 'timeout'`.
- **Network Failures**: Categorized as `errorType: 'network'`.
- **Malformed Payloads**: Categorized as `errorType: 'validation'`.
- **AbortSignal**: Explicit caller cancellations (e.g., rapid city switching) are rethrown immediately without side effects.
- **Stale Fallback**: When an expired cache entry exists during a network drop, returns `status: 'stale'`, `isStale: true`, `freshness: 'stale'`, preserving the **original measurement timestamp** and exposing complete `cacheMetadata`.

---

## 6. Verification & Automated Test Suite

### 6.1 16 Mandated Regression Scenarios

All 16 scenarios specified in the Step 1 requirement were automated in `tests/integration/telemetry.test.ts`:

| # | Scenario | Verified Output |
|---|---|---|
| 1 | Complete valid provider response | `status: 'success'`, `pm25: 45.2`, `pm10: 82.1`, `usAqi: 125`, `freshness: 'fresh'` |
| 2 | Missing PM2.5 | `pm25: null`, `fields.pm25.status: 'unavailable'` |
| 3 | Missing PM10 | `pm10: null`, `fields.pm10.status: 'unavailable'`, not multiplied from PM2.5 |
| 4 | Missing US AQI | Derived from PM2.5 (100 AQI), `classification: 'derived_calculation'`, `provider: 'Avir Derived (EPA Breakpoints)'` |
| 5 | Valid zero concentration | `pm25: 0`, `pm10: 0`, `usAqi: 0`, `fields.pm25.status: 'valid'` |
| 6 | Invalid negative concentration | `pm25: null`, `fields.pm25.status: 'rejected'`, `rejectionReason` contains 'negative' |
| 7 | NaN and Infinity | Values rejected, preserved as `null` with `status: 'rejected'` |
| 8 | Malformed JSON / API error payload | `status: 'error'`, `errorType: 'validation'` |
| 9 | Provider timeout | `status: 'error'`, `errorType: 'timeout'` |
| 10 | HTTP 429 Rate Limit | `status: 'error'`, `errorType: 'rate_limit'`, no infinite retry |
| 11 | Failed optional weather request | `status: 'partial'`, `pm25: 45`, `temperature: null`, `availability.weather: false` |
| 12 | Valid cached result | `freshness: 'fresh'`, `cacheMetadata.isCached: true`, `cacheMetadata.isStale: false` |
| 13 | Expired cached result | `status: 'stale'`, `isStale: true`, `freshness: 'stale'`, `cacheMetadata.isStale: true` |
| 14 | Original timestamp preservation | Stale fallback preserves original measurement timestamp rather than current time |
| 15 | Correct location metadata | `latitude: 28.61`, `longitude: 77.21`, `cityName: 'Delhi-NCR'`, `timezone: 'Asia/Kolkata'` |
| 16 | Zero-fabrication guarantee | Missing PM10 is never fabricated or copied from PM2.5 |
| + | Coordinate validation | Out-of-bounds coordinates (e.g. lat: 95) rejected with `errorType: 'validation'` |

### 6.2 Quality Gates Executed

1. **Vitest Test Suite**:
   ```bash
   npm test
   # Test Files  12 passed (12)
   # Tests       131 passed (131)
   # Duration    6.68s
   ```
2. **TypeScript Compilation Check**:
   ```bash
   npx tsc --noEmit
   # Exit code 0, 0 errors
   ```
3. **Next.js Production Build**:
   ```bash
   npm run build
   # Compiled successfully in 1081ms
   # Generating static pages (5/5)
   # Exit code 0
   ```

---

## 7. Known Limitations & Handoff to Step 2

- **Scope Boundary**: This step updated the core telemetry ingestion contract, domain types, and service validation. It did not alter the user-facing UI layouts or implement Step 2+ features (such as CPCB NAQI multi-pollutant index recalculation or enhanced visual provenance badges in the hero view).
- **UI Null Compatibility**: Components currently render existing fallback placeholders (e.g., `--`) when measurements are `null`. Subsequent steps will introduce richer UI affordances to display field rejection reasons and partial availability indicators to end users.
