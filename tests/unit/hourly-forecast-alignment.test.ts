import { describe, it, expect } from 'vitest';
import {
  alignHourlyForecasts,
  lookupBoundaryLayerHeight,
  toHourlyAtmosphericPoints,
  RawHourlyStream,
} from '@/services/forecast/hourly-alignment';

describe('Phase A — Group D: Forecast Alignment & Scientific Honesty (61-80)', () => {
  it('61. Matching hourly arrays join seamlessly on exact timestamp', () => {
    const times = ['2026-11-23T10:00:00Z', '2026-11-23T11:00:00Z', '2026-11-23T12:00:00Z'];
    const aq: RawHourlyStream = {
      time: times,
      pm2_5: [80, 85, 90],
      us_aqi: [164, 166, 169],
    };
    const weather: RawHourlyStream = {
      time: times,
      temperature_2m: [24, 25, 26],
      boundary_layer_height: [600, 800, 1100],
    };

    const joined = alignHourlyForecasts(aq, weather, {
      cityName: 'Delhi',
      evaluationTime: new Date('2026-11-23T09:00:00Z'),
    });

    expect(joined.length).toBe(3);
    expect(joined[0].pm25).toBe(80);
    expect(joined[0].temperature).toBe(24);
    expect(joined[0].boundaryLayerHeight).toBe(600);
    expect(joined[0].completeness).toBe('complete');
  });

  it('62. Different array start times join by timestamp, earlier hours have null weather', () => {
    const aq: RawHourlyStream = {
      time: ['2026-11-23T08:00:00Z', '2026-11-23T09:00:00Z', '2026-11-23T10:00:00Z'],
      pm2_5: [60, 70, 80],
    };
    const weather: RawHourlyStream = {
      time: ['2026-11-23T10:00:00Z', '2026-11-23T11:00:00Z'],
      temperature_2m: [22, 23],
    };

    const joined = alignHourlyForecasts(aq, weather, {
      cityName: 'Delhi',
      evaluationTime: new Date('2026-11-23T07:00:00Z'),
    });

    const h08 = joined.find((h) => h.validAtUtc === '2026-11-23T08:00:00.000Z');
    const h10 = joined.find((h) => h.validAtUtc === '2026-11-23T10:00:00.000Z');

    expect(h08?.pm25).toBe(60);
    expect(h08?.temperature).toBeNull();
    expect(h08?.completeness).toBe('partial');

    expect(h10?.pm25).toBe(80);
    expect(h10?.temperature).toBe(22);
    expect(h10?.completeness).toBe('complete');
  });

  it('63. Missing weather hour leaves weather fields null without shifting subsequent hours', () => {
    const aq: RawHourlyStream = {
      time: ['2026-11-23T08:00:00Z', '2026-11-23T09:00:00Z', '2026-11-23T10:00:00Z'],
      pm2_5: [50, 60, 70],
    };
    // Weather is missing 09:00
    const weather: RawHourlyStream = {
      time: ['2026-11-23T08:00:00Z', '2026-11-23T10:00:00Z'],
      temperature_2m: [20, 25],
    };

    const joined = alignHourlyForecasts(aq, weather, {
      cityName: 'Delhi',
      evaluationTime: new Date('2026-11-23T07:00:00Z'),
    });

    const h09 = joined.find((h) => h.validAtUtc === '2026-11-23T09:00:00.000Z');
    const h10 = joined.find((h) => h.validAtUtc === '2026-11-23T10:00:00.000Z');

    expect(h09?.pm25).toBe(60);
    expect(h09?.temperature).toBeNull();

    // 10:00 gets 25, not shifted to 09:00!
    expect(h10?.pm25).toBe(70);
    expect(h10?.temperature).toBe(25);
  });

  it('64. Missing air-quality hour leaves particulate fields null without dropping weather', () => {
    const aq: RawHourlyStream = {
      time: ['2026-11-23T08:00:00Z', '2026-11-23T10:00:00Z'],
      pm2_5: [50, 70],
    };
    const weather: RawHourlyStream = {
      time: ['2026-11-23T08:00:00Z', '2026-11-23T09:00:00Z', '2026-11-23T10:00:00Z'],
      temperature_2m: [20, 22, 25],
    };

    const joined = alignHourlyForecasts(aq, weather, {
      cityName: 'Delhi',
      evaluationTime: new Date('2026-11-23T07:00:00Z'),
    });

    const h09 = joined.find((h) => h.validAtUtc === '2026-11-23T09:00:00.000Z');
    expect(h09?.pm25).toBeNull();
    expect(h09?.temperature).toBe(22);
  });

  it('65. Unsorted records in upstream payload are sorted chronologically by UTC instant', () => {
    const aq: RawHourlyStream = {
      time: ['2026-11-23T12:00:00Z', '2026-11-23T08:00:00Z', '2026-11-23T10:00:00Z'],
      pm2_5: [120, 80, 100],
    };

    const joined = alignHourlyForecasts(aq, null, {
      cityName: 'Delhi',
      evaluationTime: new Date('2026-11-23T07:00:00Z'),
    });

    expect(joined[0].validAtUtc).toBe('2026-11-23T08:00:00.000Z');
    expect(joined[1].validAtUtc).toBe('2026-11-23T10:00:00.000Z');
    expect(joined[2].validAtUtc).toBe('2026-11-23T12:00:00.000Z');
  });

  it('66. Duplicate timestamps in streams overwrite cleanly rather than duplicating array entries', () => {
    const aq: RawHourlyStream = {
      time: ['2026-11-23T08:00:00Z', '2026-11-23T08:00:00Z'],
      pm2_5: [50, 55],
    };

    const joined = alignHourlyForecasts(aq, null, {
      cityName: 'Delhi',
      evaluationTime: new Date('2026-11-23T07:00:00Z'),
    });

    expect(joined.length).toBe(1);
    expect(joined[0].pm25).toBe(55);
  });

  it('67. Different array lengths (24 vs 48 hours) do not throw out-of-bounds error', () => {
    const aqTimes = Array.from({ length: 48 }, (_, i) => {
      const h = String(i % 24).padStart(2, '0');
      const d = i < 24 ? '23' : '24';
      return `2026-11-${d}T${h}:00:00Z`;
    });
    const weatherTimes = aqTimes.slice(0, 24);

    const aq: RawHourlyStream = {
      time: aqTimes,
      pm2_5: aqTimes.map(() => 75),
    };
    const weather: RawHourlyStream = {
      time: weatherTimes,
      temperature_2m: weatherTimes.map(() => 22),
    };

    const joined = alignHourlyForecasts(aq, weather, {
      cityName: 'Delhi',
      maxHours: 48,
      evaluationTime: new Date('2026-11-23T00:00:00Z'),
    });

    expect(joined.length).toBe(48);
    expect(joined[23].temperature).toBe(22);
    expect(joined[24].temperature).toBeNull();
  });

  it('68. Weather array with UTC Z parses and assigns correct city-local clock hour', () => {
    // 06:00 UTC = 11:30 IST
    const weather: RawHourlyStream = {
      time: ['2026-11-23T06:00:00Z'],
      temperature_2m: [24],
    };
    const joined = alignHourlyForecasts(null, weather, {
      cityName: 'Delhi', // Asia/Kolkata (+05:30)
      evaluationTime: new Date('2026-11-23T05:00:00Z'),
    });

    expect(joined[0].localHour).toBe(11);
    expect(joined[0].localDisplayTime).toBe('11:30');
  });

  it('69. Air-quality array with local ISO time parses in specified timezone', () => {
    const aq: RawHourlyStream = {
      time: ['2026-11-23T15:00'],
      pm2_5: [90],
    };
    const joined = alignHourlyForecasts(aq, null, {
      cityName: 'London',
      timezone: 'Europe/London',
      evaluationTime: new Date('2026-11-23T12:00:00Z'),
    });

    expect(joined[0].localHour).toBe(15);
    expect(joined[0].timezone).toBe('Europe/London');
  });

  it('70. Partial weather values: temperature present, BLH missing -> BLH is null, not 0', () => {
    const weather: RawHourlyStream = {
      time: ['2026-11-23T10:00:00Z'],
      temperature_2m: [25],
      boundary_layer_height: [null],
    };
    const joined = alignHourlyForecasts(null, weather, {
      cityName: 'Delhi',
      evaluationTime: new Date('2026-11-23T09:00:00Z'),
    });

    expect(joined[0].temperature).toBe(25);
    expect(joined[0].boundaryLayerHeight).toBeNull();
  });

  it('71. Valid zero PM2.5 is treated as genuine reading, not null or falsy', () => {
    const aq: RawHourlyStream = {
      time: ['2026-11-23T10:00:00Z'],
      pm2_5: [0],
    };
    const joined = alignHourlyForecasts(aq, null, {
      cityName: 'Tokyo',
      evaluationTime: new Date('2026-11-23T09:00:00Z'),
    });

    expect(joined[0].pm25).toBe(0);
    expect(joined[0].pm25).not.toBeNull();
  });

  it('72. Valid zero BLH is preserved as 0', () => {
    const weather: RawHourlyStream = {
      time: ['2026-11-23T10:00:00Z'],
      boundary_layer_height: [0],
    };
    const joined = alignHourlyForecasts(null, weather, {
      cityName: 'Tokyo',
      evaluationTime: new Date('2026-11-23T09:00:00Z'),
    });

    expect(joined[0].boundaryLayerHeight).toBe(0);
  });

  it('73. Missing BLH lookup returns null, does not invent numbers', () => {
    const weather: RawHourlyStream = {
      time: ['2026-11-23T10:00:00Z'],
      boundary_layer_height: [null],
    };
    const res = lookupBoundaryLayerHeight('2026-11-23T10:00:00Z', weather, 'UTC');
    expect(res.blh).toBeNull();
  });

  it('74. Negative pollutant concentrations are filtered out as null', () => {
    const aq: RawHourlyStream = {
      time: ['2026-11-23T10:00:00Z'],
      pm2_5: [-999], // Sensor error code
    };
    const joined = alignHourlyForecasts(aq, null, {
      cityName: 'Delhi',
      evaluationTime: new Date('2026-11-23T09:00:00Z'),
    });

    expect(joined[0].pm25).toBeNull();
  });

  it('75. No fabricated forecast hours: empty stream produces empty result', () => {
    const joined = alignHourlyForecasts(null, null, {
      cityName: 'Delhi',
    });
    expect(joined).toEqual([]);
  });

  it('76. No incorrect timestamp joins: instant match required for BLH lookup', () => {
    const weather: RawHourlyStream = {
      time: ['2026-11-23T10:00:00Z'],
      boundary_layer_height: [850],
    };
    // Target 5 hours away (> 60m threshold)
    const res = lookupBoundaryLayerHeight('2026-11-23T15:00:00Z', weather, 'UTC', 60);
    expect(res.blh).toBeNull();
    expect(res.matchedValidAt).toBeNull();
    expect(res.deltaMinutes).toBeGreaterThan(60);
  });

  it('77. Correct date transition: midnight crossing increments localDisplayDate', () => {
    const aq: RawHourlyStream = {
      time: ['2026-11-23T23:00:00Z', '2026-11-24T01:00:00Z'],
      pm2_5: [70, 75],
    };
    const joined = alignHourlyForecasts(aq, null, {
      cityName: 'London',
      timezone: 'UTC',
      evaluationTime: new Date('2026-11-23T22:00:00Z'),
    });

    expect(joined[0].localDisplayDate).not.toBe(joined[1].localDisplayDate);
  });

  it('78. Correct timeline selection identity: validAtUtc is guaranteed unique across all hours', () => {
    const aq: RawHourlyStream = {
      time: ['2026-11-23T10:00:00Z', '2026-11-23T11:00:00Z'],
      pm2_5: [50, 60],
    };
    const joined = alignHourlyForecasts(aq, null, {
      cityName: 'Delhi',
      evaluationTime: new Date('2026-11-23T09:00:00Z'),
    });

    const keys = joined.map((j) => j.validAtUtc);
    const uniqueKeys = new Set(keys);
    expect(uniqueKeys.size).toBe(keys.length);
  });

  it('79. toHourlyAtmosphericPoints maps validAtUtc and preserves uniqueness for React keys', () => {
    const aq: RawHourlyStream = {
      time: ['2026-11-23T10:00:00Z', '2026-11-23T11:00:00Z'],
      pm2_5: [50, 60],
    };
    const joined = alignHourlyForecasts(aq, null, {
      cityName: 'Delhi',
      evaluationTime: new Date('2026-11-23T09:00:00Z'),
    });
    const points = toHourlyAtmosphericPoints(joined);

    expect(points[0].validAtUtc).toBe('2026-11-23T10:00:00.000Z');
    expect(points[0].validAtUtc).not.toBe(points[1].validAtUtc);
  });

  it('80. Modeled earlier hour not labeled observation: sourceAttribution specifies numerical model', () => {
    const aq: RawHourlyStream = {
      time: ['2026-11-23T08:00:00Z'],
      pm2_5: [72],
    };
    const joined = alignHourlyForecasts(aq, null, {
      cityName: 'Delhi',
      evaluationTime: new Date('2026-11-23T12:00:00Z'), // evaluationTime is in the future
    });
    const points = toHourlyAtmosphericPoints(joined);

    expect(points[0].sourceAttribution).toContain('Atmospheric');
    expect(points[0].isForecast).toBe(false); // Past hour
  });
});
