import React from 'react';
import ReactDOMServer from 'react-dom/server';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as getSourcesRoute } from '@/app/api/telemetry/sources/route';
import {
  OPENAQ_MIN_RADIUS_KM,
  OPENAQ_DEFAULT_RADIUS_KM,
  OPENAQ_MAX_RADIUS_KM,
  getActivePhysicalSources,
  getStalePhysicalSources,
  getRegistryOnlyStations,
  getAtmosphericModels,
  getUnconfiguredProviders,
  validateObservationTiming,
} from '@/config/environmental-sources';
import {
  parseOpenAqLocation,
  validateMeasurementValue,
  fetchOpenAqProviderResult,
  clearOpenAqCache,
  OpenAqLocationResult,
  OpenAqLatestMeasurementItem,
} from '@/services/providers/openaq-provider';
import {
  compareEnvironmentalSources,
  createOpenMeteoModelRecord,
  getSourceTimestamp,
  deduplicateEnvironmentalSources,
} from '@/domain/source-comparison';
import { MultiSourceInspectorModal } from '@/components/MultiSourceInspectorModal';
import { EnvironmentalSourceRecord } from '@/domain/types';

describe('AVIR STEP 03 FINAL PRODUCTION CLOSURE — Comprehensive Verification Gate', () => {
  const originalEnv = process.env.OPENAQ_API_KEY;

  beforeEach(() => {
    clearOpenAqCache();
    process.env.OPENAQ_API_KEY = 'test_secret_key_12345';
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env.OPENAQ_API_KEY = originalEnv;
    vi.restoreAllMocks();
  });

  // ==========================================
  // GROUP A: API CONTRACT & RADIUS CONSISTENCY
  // ==========================================
  describe('Group A: API Contract & Radius Consistency (1-10)', () => {
    it('1. Default and Maximum OpenAQ search radius is strictly 25 km', () => {
      expect(OPENAQ_DEFAULT_RADIUS_KM).toBe(25);
      expect(OPENAQ_MAX_RADIUS_KM).toBe(25);
      expect(OPENAQ_MIN_RADIUS_KM).toBe(1);
    });

    it('2. API route accepts valid query with coordinates and default 25km radius', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ results: [] }),
      } as unknown as Response);

      const req = new NextRequest('http://localhost:3000/api/telemetry/sources?lat=28.6139&lon=77.2090');
      const res = await getSourcesRoute(req);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.provider).toBe('openaq');
      expect(body.status).toBe('no_coverage');
      expect(body.activeCount).toBe(0);
    });

    it('3. API route accepts explicit valid radius up to 25 km', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ results: [] }),
      } as unknown as Response);

      const req = new NextRequest('http://localhost:3000/api/telemetry/sources?lat=28.6139&lon=77.2090&radius=25');
      const res = await getSourcesRoute(req);
      expect(res.status).toBe(200);
    });

    it('4. API route rejects radius exceeding 25 km (e.g. radius=35) with HTTP 400', async () => {
      const req = new NextRequest('http://localhost:3000/api/telemetry/sources?lat=28.6139&lon=77.2090&radius=35');
      const res = await getSourcesRoute(req);
      expect(res.status).toBe(400);

      const body = await res.json();
      expect(body.error).toContain('Invalid radius');
      expect(body.error).toContain('25 km');
    });

    it('5. API route rejects malformed non-numeric radius (e.g. radius=25abc) with HTTP 400', async () => {
      const req = new NextRequest('http://localhost:3000/api/telemetry/sources?lat=28.6139&lon=77.2090&radius=25abc');
      const res = await getSourcesRoute(req);
      expect(res.status).toBe(400);

      const body = await res.json();
      expect(body.error).toContain('Invalid radius');
    });

    it('6. API route rejects malformed non-numeric latitude (e.g. lat=28.61foo) with HTTP 400', async () => {
      const req = new NextRequest('http://localhost:3000/api/telemetry/sources?lat=28.61foo&lon=77.2090');
      const res = await getSourcesRoute(req);
      expect(res.status).toBe(400);

      const body = await res.json();
      expect(body.error).toContain('Invalid latitude');
    });

    it('7. API route rejects missing latitude or longitude with HTTP 400', async () => {
      const req = new NextRequest('http://localhost:3000/api/telemetry/sources?lat=28.6139');
      const res = await getSourcesRoute(req);
      expect(res.status).toBe(400);

      const body = await res.json();
      expect(body.error).toContain('Missing required query parameters');
    });

    it('8. API route rejects out-of-bounds latitude (>90 or <-90) with HTTP 400', async () => {
      const req = new NextRequest('http://localhost:3000/api/telemetry/sources?lat=95.5&lon=77.2090');
      const res = await getSourcesRoute(req);
      expect(res.status).toBe(400);
    });

    it('9. API route error responses do not leak secrets or internal stack traces', async () => {
      // Simulate unexpected server crash inside GET handler
      const req = {
        get url() {
          throw new Error('Database password was leaked in stack trace: supersecret');
        },
      } as unknown as NextRequest;

      const res = await getSourcesRoute(req);
      expect(res.status).toBe(500);

      const body = await res.json();
      expect(body.error).not.toContain('supersecret');
      expect(body.error).toBe('Internal server error while resolving environmental sources.');
    });

    it('10. API route sets public Cache-Control headers for performance', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ results: [] }),
      } as unknown as Response);

      const req = new NextRequest('http://localhost:3000/api/telemetry/sources?lat=28.6139&lon=77.2090');
      const res = await getSourcesRoute(req);
      expect(res.headers.get('Cache-Control')).toContain('s-maxage=300');
      expect(res.headers.get('Cache-Control')).toContain('stale-while-revalidate=600');
    });
  });

  // ==========================================
  // GROUP B: OPENAQ PAYLOAD & TIMESTAMP SEMANTICS
  // ==========================================
  describe('Group B: OpenAQ Payload & Timestamp Semantics (11-20)', () => {
    const mockLocation: OpenAqLocationResult = {
      id: 7001,
      name: 'Anand Vihar CAAQMS',
      provider: { name: 'CPCB' },
      isMonitor: true,
      coordinates: { latitude: 28.65, longitude: 77.30 },
      sensors: [
        { id: 201, name: 'PM2.5 Sensor', parameter: { id: 2, name: 'pm25', units: 'µg/m³' } },
        { id: 202, name: 'PM10 Sensor', parameter: { id: 1, name: 'pm10', units: 'µg/m³' } },
      ],
      datetimeLast: { utc: '2026-11-22T08:00:00Z', local: '2026-11-22T13:30:00+05:30' },
    };

    it('11. Actual v3 measurement maps sensorsId to sensor parameter and unit correctly', () => {
      const latestItems: OpenAqLatestMeasurementItem[] = [
        { sensorsId: 201, value: 168.4, datetime: { utc: '2026-11-22T08:00:00Z' } },
      ];

      const record = parseOpenAqLocation(mockLocation, 28.65, 77.30, latestItems);
      expect(record).not.toBeNull();
      expect(record?.measurements.length).toBe(1);
      expect(record?.measurements[0].pollutant).toBe('pm25');
      expect(record?.measurements[0].unit).toBe('ug/m3');
      expect(record?.measurements[0].value).toBe(168.4);
    });

    it('12. Station datetimeLast CANNOT replace missing measurement timestamp', () => {
      // Measurement item has NO datetime property
      const latestItemsWithoutTime: OpenAqLatestMeasurementItem[] = [
        { sensorsId: 201, value: 168.4 },
      ];

      const record = parseOpenAqLocation(mockLocation, 28.65, 77.30, latestItemsWithoutTime);
      expect(record).not.toBeNull();
      expect(record?.measurements[0].observedAt).toBeNull();
      // Record observedAt must NOT be populated by station datetimeLast
      expect(record?.observedAt).toBeNull();
    });

    it('13. One pollutant timestamp cannot establish freshness for another pollutant', () => {
      const latestItemsMixed: OpenAqLatestMeasurementItem[] = [
        { sensorsId: 201, value: 120.0 }, // PM2.5 has NO timestamp
        { sensorsId: 202, value: 240.0, datetime: { utc: '2026-11-22T08:00:00Z' } }, // PM10 has timestamp
      ];

      const record = parseOpenAqLocation(mockLocation, 28.65, 77.30, latestItemsMixed);
      const pm25 = record?.measurements.find(m => m.pollutant === 'pm25');
      const pm10 = record?.measurements.find(m => m.pollutant === 'pm10');

      expect(pm25?.observedAt).toBeNull();
      expect(pm10?.observedAt).toBe('2026-11-22T08:00:00Z');

      // Evaluating timestamp for PM2.5 specifically returns missing timestamp error
      const timing = getSourceTimestamp(record!, pm25);
      expect(timing.timeStr).toBeNull();
      expect(timing.error).toBe('Missing measurement timestamp or valid time');
    });

    it('14. Missing units do not default to ug/m3', () => {
      const locNoUnits: OpenAqLocationResult = {
        id: 7002,
        name: 'No Unit Station',
        sensors: [{ id: 301, parameter: { id: 2, name: 'pm25', units: '' } }],
      };
      const items: OpenAqLatestMeasurementItem[] = [{ sensorsId: 301, value: 80 }];
      const record = parseOpenAqLocation(locNoUnits, 28.65, 77.30, items);
      expect(record?.measurements.length).toBe(0);
    });

    it('15. Valid zero reading is preserved as 0 µg/m³ (not missing)', () => {
      const validated = validateMeasurementValue(0, 'pm25', 'ug/m3', '2026-11-22T08:00:00Z');
      expect(validated?.value).toBe(0);
    });

    it('16. Negative values are rejected', () => {
      const validated = validateMeasurementValue(-10, 'pm25', 'ug/m3');
      expect(validated).toBeNull();
    });

    it('17. Unknown averaging periods remain null without guessing 60 minutes', () => {
      const validated = validateMeasurementValue(55, 'pm25', 'ug/m3', '2026-11-22T08:00:00Z', null);
      expect(validated?.averagingPeriodMinutes).toBeNull();
    });

    it('18. Explicit interval averaging period (e.g. "01:00:00") is converted accurately to 60m', () => {
      const itemsWithInterval: OpenAqLatestMeasurementItem[] = [
        {
          sensorsId: 201,
          value: 110,
          datetime: { utc: '2026-11-22T08:00:00Z' },
          period: { interval: '01:00:00' },
        },
      ];
      const record = parseOpenAqLocation(mockLocation, 28.65, 77.30, itemsWithInterval);
      expect(record?.measurements[0].averagingPeriodMinutes).toBe(60);
    });

    it('19. Official monitor is classified as official_ground_station when isMonitor is true', () => {
      const record = parseOpenAqLocation(mockLocation, 28.65, 77.30, []);
      expect(record?.sourceKind).toBe('official_ground_station');
    });

    it('20. Citizen optical monitor is classified as community_optical when isMonitor is false', () => {
      const communityLoc: OpenAqLocationResult = {
        ...mockLocation,
        isMonitor: false,
      };
      const record = parseOpenAqLocation(communityLoc, 28.65, 77.30, []);
      expect(record?.sourceKind).toBe('community_optical');
    });
  });

  // ==========================================
  // GROUP C: SOURCE SELECTORS & ACCURATE COUNTS
  // ==========================================
  describe('Group C: Source Selectors & Accurate Counts (21-30)', () => {
    const validObsTime = new Date().toISOString();

    const activeMonitor: EnvironmentalSourceRecord = {
      id: 'active-1',
      providerId: 'openaq',
      providerName: 'OpenAQ',
      sourceName: 'Active Monitor',
      sourceKind: 'physical_observation',
      status: 'fresh',
      latitude: 28.61,
      longitude: 77.21,
      distanceKm: 3,
      observedAt: validObsTime,
      retrievedAt: validObsTime,
      measurements: [{ pollutant: 'pm25', value: 85, unit: 'ug/m3', observedAt: validObsTime }],
      attribution: 'OpenAQ',
      provenance: { licenseOrAttribution: 'CC BY 4.0', isModel: false, limitations: [] },
    };

    const staleMonitor: EnvironmentalSourceRecord = {
      ...activeMonitor,
      id: 'stale-1',
      sourceName: 'Stale Monitor',
      status: 'stale',
      observedAt: new Date(Date.now() - 36 * 3600 * 1000).toISOString(),
      measurements: [
        {
          pollutant: 'pm25',
          value: 85,
          unit: 'ug/m3',
          observedAt: new Date(Date.now() - 36 * 3600 * 1000).toISOString(),
        },
      ],
    };

    const registryOnlyStation: EnvironmentalSourceRecord = {
      ...activeMonitor,
      id: 'registry-1',
      sourceName: 'Registry Only',
      status: 'registry_only',
      measurements: [],
    };

    const unconfiguredDiagnostic: EnvironmentalSourceRecord = {
      ...activeMonitor,
      id: 'openaq-unconfigured',
      sourceName: 'Unconfigured Record',
      status: 'not_configured',
      measurements: [],
    };

    const atmosphericModel: EnvironmentalSourceRecord = {
      ...activeMonitor,
      id: 'open-meteo-atmospheric-model',
      sourceName: 'Atmospheric Model',
      sourceKind: 'atmospheric_model',
      observedAt: null,
      validAt: validObsTime,
    };

    it('21. getActivePhysicalSources includes fresh valid physical monitors', () => {
      const active = getActivePhysicalSources([activeMonitor], 'pm25');
      expect(active.length).toBe(1);
      expect(active[0].id).toBe('active-1');
    });

    it('22. getActivePhysicalSources excludes stale physical monitors (>24h)', () => {
      const active = getActivePhysicalSources([staleMonitor], 'pm25');
      expect(active.length).toBe(0);
    });

    it('23. getActivePhysicalSources excludes registry-only stations', () => {
      const active = getActivePhysicalSources([registryOnlyStation], 'pm25');
      expect(active.length).toBe(0);
    });

    it('24. getActivePhysicalSources excludes unconfigured diagnostic records', () => {
      const active = getActivePhysicalSources([unconfiguredDiagnostic], 'pm25');
      expect(active.length).toBe(0);
    });

    it('25. getActivePhysicalSources excludes numerical atmospheric models', () => {
      const active = getActivePhysicalSources([atmosphericModel], 'pm25');
      expect(active.length).toBe(0);
    });

    it('26. getActivePhysicalSources excludes sources with missing target pollutant', () => {
      const monitorPm10Only: EnvironmentalSourceRecord = {
        ...activeMonitor,
        id: 'pm10-only',
        measurements: [{ pollutant: 'pm10', value: 120, unit: 'ug/m3', observedAt: validObsTime }],
      };
      const active = getActivePhysicalSources([monitorPm10Only], 'pm25');
      expect(active.length).toBe(0);
    });

    it('27. getStalePhysicalSources correctly extracts stale monitors', () => {
      const stale = getStalePhysicalSources([activeMonitor, staleMonitor], 'pm25');
      expect(stale.length).toBe(1);
      expect(stale[0].id).toBe('stale-1');
    });

    it('28. getRegistryOnlyStations correctly extracts registry verified monitors', () => {
      const reg = getRegistryOnlyStations([activeMonitor, registryOnlyStation]);
      expect(reg.length).toBe(1);
      expect(reg[0].id).toBe('registry-1');
    });

    it('29. getAtmosphericModels correctly extracts models', () => {
      const models = getAtmosphericModels([activeMonitor, atmosphericModel]);
      expect(models.length).toBe(1);
      expect(models[0].id).toBe('open-meteo-atmospheric-model');
    });

    it('30. Duplicate upstream stations are counted only once', () => {
      const dup1: EnvironmentalSourceRecord = {
        ...activeMonitor,
        id: 'feed-1',
        upstreamProviderId: 'cpcb',
        stationId: 'station-delhi-01',
      };
      const dup2: EnvironmentalSourceRecord = {
        ...activeMonitor,
        id: 'feed-2',
        upstreamProviderId: 'cpcb',
        stationId: 'station-delhi-01', // Identical hardware reported via secondary aggregator
      };

      const active = getActivePhysicalSources([dup1, dup2], 'pm25');
      expect(active.length).toBe(1);
    });
  });

  // ==========================================
  // GROUP D: COMPARISON INTEGRITY & PARITY
  // ==========================================
  describe('Group D: Comparison Integrity & Parity (31-40)', () => {
    const timestamp = '2026-11-22T08:00:00Z';
    const refNow = new Date('2026-11-22T09:00:00Z').getTime();
    const model = createOpenMeteoModelRecord({
      pm25: 120,
      timestamp,
      latitude: 28.61,
      longitude: 77.21,
    });

    it('31. Unsupported anchor units (e.g. ppm) block comparison', () => {
      const anchorPpm: EnvironmentalSourceRecord = {
        id: 'anchor-ppm',
        providerId: 'p',
        providerName: 'P',
        sourceName: 'PPM Sensor',
        sourceKind: 'physical_observation',
        status: 'fresh',
        latitude: 28.61,
        longitude: 77.21,
        distanceKm: 1,
        observedAt: timestamp,
        retrievedAt: timestamp,
        measurements: [{ pollutant: 'pm25', value: 0.12, unit: 'ppm', observedAt: timestamp, averagingPeriodMinutes: 60 }],
        attribution: 'P',
        provenance: { licenseOrAttribution: 'P', isModel: false, limitations: [] },
      };

      const groundUgM3: EnvironmentalSourceRecord = {
        ...anchorPpm,
        id: 'ground-ugm3',
        sourceName: 'µg/m³ Sensor',
        measurements: [{ pollutant: 'pm25', value: 120, unit: 'ug/m3', observedAt: timestamp, averagingPeriodMinutes: 60 }],
      };

      const result = compareEnvironmentalSources([anchorPpm, groundUgM3], 'pm25', refNow);
      expect(result.mode).toBe('mode_b_incompatible');
      expect(result.incompatibilityReasons?.some(r => r.includes('Unsupported anchor unit'))).toBe(true);
    });

    it('32. Exactly 1 source yields Mode A with zero artificial spread or consensus', () => {
      const result = compareEnvironmentalSources([model], 'pm25', refNow);
      expect(result.mode).toBe('mode_a_single_source');
      expect(result.status).toBe('insufficient_sources');
      expect(result.absoluteDifferenceUgM3).toBeNull();
    });

    it('33. Two comparable independent sources yield Mode C with accurate absolute difference', () => {
      const groundStation: EnvironmentalSourceRecord = {
        id: 'ground-valid',
        providerId: 'openaq',
        providerName: 'OpenAQ',
        sourceName: 'Ground Monitor',
        sourceKind: 'physical_observation',
        status: 'fresh',
        latitude: 28.62,
        longitude: 77.22,
        distanceKm: 2,
        observedAt: timestamp,
        retrievedAt: timestamp,
        measurements: [{ pollutant: 'pm25', value: 145, unit: 'ug/m3', observedAt: timestamp, averagingPeriodMinutes: 60 }],
        attribution: 'OpenAQ',
        provenance: { licenseOrAttribution: 'OpenAQ', isModel: false, limitations: [] },
      };

      const result = compareEnvironmentalSources([model, groundStation], 'pm25', refNow);
      expect(result.mode).toBe('mode_c_comparable');
      expect(result.absoluteDifferenceUgM3).toBe(25); // 145 - 120
      expect(result.summary).toContain('differ by 25 µg/m³');
    });

    it('34. Three eligible comparable sources accurately describe 3 sources (never "Two comparable sources")', () => {
      const ground1: EnvironmentalSourceRecord = {
        id: 'ground-1',
        providerId: 'openaq',
        providerName: 'OpenAQ',
        sourceName: 'Ground Station Alpha',
        sourceKind: 'physical_observation',
        status: 'fresh',
        latitude: 28.62,
        longitude: 77.22,
        distanceKm: 2,
        observedAt: timestamp,
        retrievedAt: timestamp,
        measurements: [{ pollutant: 'pm25', value: 130, unit: 'ug/m3', observedAt: timestamp, averagingPeriodMinutes: 60 }],
        attribution: 'OpenAQ',
        provenance: { licenseOrAttribution: 'OpenAQ', isModel: false, limitations: [] },
      };

      const ground2: EnvironmentalSourceRecord = {
        id: 'ground-2',
        providerId: 'cpcb',
        providerName: 'CPCB',
        sourceName: 'Ground Station Beta',
        sourceKind: 'official_ground_station',
        status: 'fresh',
        latitude: 28.63,
        longitude: 77.23,
        distanceKm: 4,
        observedAt: timestamp,
        retrievedAt: timestamp,
        measurements: [{ pollutant: 'pm25', value: 140, unit: 'ug/m3', observedAt: timestamp, averagingPeriodMinutes: 60 }],
        attribution: 'CPCB',
        provenance: { licenseOrAttribution: 'CPCB', isModel: false, limitations: [] },
      };

      const result = compareEnvironmentalSources([model, ground1, ground2], 'pm25', refNow);
      expect(result.mode).toBe('mode_c_comparable');
      expect(result.eligibleSourceIds.length).toBe(3);
      expect(result.summary).toContain('3 comparable PM2.5 sources are available');
      expect(result.summary).not.toContain('Two comparable');
      expect(result.minConcentration).toBe(120);
      expect(result.maxConcentration).toBe(140);
      expect(result.absoluteDifferenceUgM3).toBe(20);
    });

    it('35. Divergence reasoning employs neutral scientific formulation without unsupported causal claims', () => {
      const highGround: EnvironmentalSourceRecord = {
        id: 'high-ground',
        providerId: 'openaq',
        providerName: 'OpenAQ',
        sourceName: 'High Ground Station',
        sourceKind: 'physical_observation',
        status: 'fresh',
        latitude: 28.62,
        longitude: 77.22,
        distanceKm: 2,
        observedAt: timestamp,
        retrievedAt: timestamp,
        measurements: [{ pollutant: 'pm25', value: 240, unit: 'ug/m3', observedAt: timestamp, averagingPeriodMinutes: 60 }],
        attribution: 'OpenAQ',
        provenance: { licenseOrAttribution: 'OpenAQ', isModel: false, limitations: [] },
      };

      const result = compareEnvironmentalSources([model, highGround], 'pm25', refNow);
      expect(result.divergenceReason).toContain('Possible reasons include differing geographic sampling locations');
      expect(result.divergenceReason).toContain('instrument sensing principles');
    });
  });

  // ==========================================
  // GROUP E: SOURCE INSPECTOR UI STATES
  // ==========================================
  describe('Group E: Source Inspector UI States (36-40)', () => {
    it('36. Inspector displays "0 currently available ground observations" when no active physical stations exist', () => {
      const html = ReactDOMServer.renderToString(
        <MultiSourceInspectorModal
          isOpen={true}
          onClose={() => {}}
          cityName="Delhi-NCR"
          environmentalSources={[]}
          metrics={null}
        />
      );

      expect(html).toContain('0 currently available ground observations');
    });

    it('37. Inspector displays honest "PM2.5 concentration unavailable." when model PM2.5 is null (never 150)', () => {
      const modelNullPm25: EnvironmentalSourceRecord = {
        id: 'model-null',
        providerId: 'open-meteo',
        providerName: 'Open-Meteo',
        sourceName: 'Model Null',
        sourceKind: 'atmospheric_model',
        status: 'fresh',
        latitude: 28.61,
        longitude: 77.21,
        distanceKm: 0,
        observedAt: null,
        validAt: '2026-11-22T08:00:00Z',
        retrievedAt: '2026-11-22T08:00:00Z',
        measurements: [],
        attribution: 'Open-Meteo',
        provenance: { licenseOrAttribution: 'CC BY 4.0', isModel: true, limitations: [] },
      };

      const html = ReactDOMServer.renderToString(
        <MultiSourceInspectorModal
          isOpen={true}
          onClose={() => {}}
          cityName="Delhi-NCR"
          environmentalSources={[modelNullPm25]}
          metrics={{ pm25: null } as any}
        />
      );

      expect(html).not.toContain('150');
      expect(html).toContain('PM2.5 concentration unavailable.');
    });

    it('38. Inspector displays Mode A notice when only single primary provider is active', () => {
      const singleModel = createOpenMeteoModelRecord({
        pm25: 110,
        timestamp: '2026-11-22T08:00:00Z',
        latitude: 28.61,
        longitude: 77.21,
      });

      const comparison = compareEnvironmentalSources([singleModel], 'pm25');

      const html = ReactDOMServer.renderToString(
        <MultiSourceInspectorModal
          isOpen={true}
          onClose={() => {}}
          cityName="Delhi-NCR"
          environmentalSources={[singleModel]}
          sourceComparison={comparison}
        />
      );

      expect(html).toContain('Mode A • Single Primary Provider Active');
      expect(html).toContain('Avir never synthesizes artificial consensus agreements');
    });

    it('39. Inspector has accessible modal attributes (role="dialog", aria-modal="true")', () => {
      const html = ReactDOMServer.renderToString(
        <MultiSourceInspectorModal
          isOpen={true}
          onClose={() => {}}
          cityName="Delhi-NCR"
          environmentalSources={[]}
        />
      );

      expect(html).toContain('role="dialog"');
      expect(html).toContain('aria-modal="true"');
      expect(html).toContain('aria-labelledby="modal-sources-title"');
    });

    it('40. Modal unmounts cleanly and returns null when isOpen is false', () => {
      const html = ReactDOMServer.renderToString(
        <MultiSourceInspectorModal
          isOpen={false}
          onClose={() => {}}
          cityName="Delhi-NCR"
          environmentalSources={[]}
        />
      );

      expect(html).toBe('');
    });
  });
});
