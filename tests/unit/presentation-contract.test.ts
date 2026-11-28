import { describe, it, expect } from 'vitest';
import {
  toDisplayMeasurement,
  formatTimeAgo,
  POLLUTANT_PRESENTATION_METADATA,
} from '@/domain/presentation-contract';

describe('AVIR Presentation Contract & Data State Normalization (Step 17)', () => {
  const frozenNow = new Date('2026-11-23T12:00:00Z').getTime();

  it('1. Formats valid PM2.5 observation into current DisplayMeasurement', () => {
    const validTimestamp = new Date('2026-11-23T11:45:00Z').toISOString(); // 15m ago
    const m = toDisplayMeasurement({
      value: 84.6,
      unit: 'µg/m³',
      sourceName: 'Delhi Central Station',
      sourceKind: 'observation',
      validAtUtc: validTimestamp,
      nowMs: frozenNow,
      decimalPlaces: 1,
    });

    expect(m.state).toBe('current');
    expect(m.value).toBe(84.6);
    expect(m.unit).toBe('µg/m³');
    expect(m.formattedValue).toBe('84.6');
    expect(m.formattedTimeAgo).toBe('15m ago');
    expect(m.sourceKind).toBe('observation');
  });

  it('2. Zero concentration (0 µg/m³ clean air) is treated as valid clean air, NOT unavailable or missing', () => {
    const m = toDisplayMeasurement({
      value: 0,
      unit: 'µg/m³',
      sourceKind: 'observation',
      validAtUtc: new Date('2026-11-23T11:59:00Z').toISOString(),
      nowMs: frozenNow,
    });

    expect(m.state).toBe('current');
    expect(m.value).toBe(0);
    expect(m.formattedValue).toBe('0');
  });

  it('3. Null or undefined values resolve strictly to unavailable state with "--"', () => {
    const mNull = toDisplayMeasurement({
      value: null,
      unit: 'µg/m³',
    });
    expect(mNull.state).toBe('unavailable');
    expect(mNull.value).toBeNull();
    expect(mNull.formattedValue).toBe('--');

    const mUndef = toDisplayMeasurement({
      value: undefined,
      unit: 'Index',
    });
    expect(mUndef.state).toBe('unavailable');
    expect(mUndef.value).toBeNull();
    expect(mUndef.formattedValue).toBe('--');
  });

  it('4. Negative values or NaN resolve strictly to unavailable state and null value', () => {
    const mNeg = toDisplayMeasurement({
      value: -12.5,
      unit: 'µg/m³',
    });
    expect(mNeg.state).toBe('unavailable');
    expect(mNeg.value).toBeNull();
    expect(mNeg.formattedValue).toBe('--');

    const mNan = toDisplayMeasurement({
      value: NaN,
      unit: 'µg/m³',
    });
    expect(mNan.state).toBe('unavailable');
    expect(mNan.value).toBeNull();
    expect(mNan.formattedValue).toBe('--');
  });

  it('5. Telemetry older than 3 hours resolves strictly to stale state', () => {
    const staleTimestamp = new Date('2026-11-23T08:00:00Z').toISOString(); // 4 hours ago (> 3h)
    const m = toDisplayMeasurement({
      value: 120,
      unit: 'µg/m³',
      validAtUtc: staleTimestamp,
      nowMs: frozenNow,
    });

    expect(m.state).toBe('stale');
    expect(m.formattedValue).toBe('120');
    expect(m.formattedTimeAgo).toBe('4h ago');
  });

  it('6. Loading and Error states override values correctly', () => {
    const mLoading = toDisplayMeasurement({
      value: 55,
      unit: 'µg/m³',
      isLoading: true,
    });
    expect(mLoading.state).toBe('loading');
    expect(mLoading.formattedValue).toBe('...');

    const mError = toDisplayMeasurement({
      value: 55,
      unit: 'µg/m³',
      isError: true,
    });
    expect(mError.state).toBe('error');
    expect(mError.formattedValue).toBe('--');
  });

  it('7. Future forecast timestamps format into human-friendly relative future hours', () => {
    const futureTimestamp = new Date('2026-11-23T15:00:00Z').toISOString(); // 3 hours in future
    const relativeTime = formatTimeAgo(futureTimestamp, frozenNow);
    expect(relativeTime).toBe('In ~3h');
  });

  it('8. Pollutant metadata preserves standard symbols and descriptions', () => {
    expect(POLLUTANT_PRESENTATION_METADATA.pm25.unit).toBe('µg/m³');
    expect(POLLUTANT_PRESENTATION_METADATA.pm10.unit).toBe('µg/m³');
    expect(POLLUTANT_PRESENTATION_METADATA.usAqi.unit).toBe('Index');
    expect(POLLUTANT_PRESENTATION_METADATA.boundaryLayerHeight.unit).toBe('m');
  });
});
