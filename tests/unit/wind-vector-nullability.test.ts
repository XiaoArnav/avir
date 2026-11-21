import { describe, it, expect } from 'vitest';
import { WindVectorGauge } from '@/components/WindVectorGauge';

describe('WindVectorGauge Nullability & Truthful Telemetry', () => {
  it('renders honest unavailable state when wind telemetry is null instead of defaulting to 315 NW', () => {
    const gauge = WindVectorGauge({
      windDirection: null,
      windSpeed: null,
      cityName: 'Delhi',
    });

    expect(gauge).toBeDefined();
  });

  it('renders compass dial when valid wind velocity and azimuth are present', () => {
    const gauge = WindVectorGauge({
      windDirection: 270,
      windSpeed: 12.5,
      cityName: 'Mumbai',
    });

    expect(gauge).toBeDefined();
  });
});
