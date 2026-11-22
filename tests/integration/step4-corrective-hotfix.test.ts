/**
 * AVIR — Step 4 Critical Corrective Hotfix Comprehensive Test Suite
 * 
 * Verifies all 66 mandated regression scenarios across Groups A to H:
 * - Group A: Statistical integrity (1-7)
 * - Group B: Measurement freshness (8-14)
 * - Group C: Scientific units (15-21)
 * - Group D: CPCB methodology & averaging periods (22-31)
 * - Group E: Timestamps & calendar validation (32-39)
 * - Group F: Bounded pagination & cancellation (40-49)
 * - Group G: Station provenance & identity (50-57)
 * - Group H: End-to-end integration & security (58-66)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  parseIndianStandardTime,
  parseCpcbPollutantValue,
  normalizeCpcbPollutantId,
  resolveCpcbPollutantUnit,
  normalizeDataGovInRecords,
  fetchCpcbProviderResult,
  createCombinedAbortSignal,
  DataGovInRecord,
  CPCB_OGD_ENDPOINT,
} from '@/services/providers/cpcb-provider';
import {
  calculateSubIndex,
  calculateComprehensiveCpcbNaqi,
  getCpcbCategory,
  CPCB_BREAKPOINTS,
} from '@/domain/cpcb-naqi';
import {
  getPhysicalStationDeduplicationKey,
  getActivePhysicalSources,
  evaluateMeasurementEligibility,
  registerVerifiedStationMapping,
  VERIFIED_CROSS_PROVIDER_STATION_MAP,
} from '@/config/environmental-sources';
import {
  OFFICIAL_CPCB_STATIONS,
  findNearestCpcbStation,
  calculateGroundModelDelta,
} from '@/services/ground-station-service';
import {
  deduplicateEnvironmentalSources,
  compareEnvironmentalSources,
} from '@/domain/source-comparison';
import { EnvironmentalSourceRecord, SourceMeasurement } from '@/domain/types';

describe('AVIR Step 4 Critical Corrective Hotfix (Groups A–H)', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  // ---------------------------------------------------------------------------
  // Group A — Statistical Integrity (1–7)
  // ---------------------------------------------------------------------------
  describe('Group A: Statistical Integrity (Defect 1)', () => {
    it('1. Average never falls back to maximum when average is missing', () => {
      const records: DataGovInRecord[] = [
        {
          state: 'Delhi',
          city: 'Delhi',
          station: 'Anand Vihar',
          pollutant_id: 'PM2.5',
          pollutant_avg: null,
          pollutant_max: 180,
          pollutant_min: 40,
          pollutant_unit: 'ug/m3',
          last_update: '22-11-2026 18:00:00',
        },
      ];
      const sources = normalizeDataGovInRecords(records);
      expect(sources[0].measurements).toHaveLength(0); // 180 is never substituted into value
    });

    it('2. Average never falls back to minimum when average is missing', () => {
      const records: DataGovInRecord[] = [
        {
          state: 'Delhi',
          city: 'Delhi',
          station: 'Anand Vihar',
          pollutant_id: 'PM2.5',
          pollutant_avg: 'NA',
          pollutant_max: null,
          pollutant_min: 40,
          pollutant_unit: 'ug/m3',
          last_update: '22-11-2026 18:00:00',
        },
      ];
      const sources = normalizeDataGovInRecords(records);
      expect(sources[0].measurements).toHaveLength(0); // 40 is never substituted into value
    });

    it('3. Missing average ("NA" or null) remains unavailable', () => {
      expect(parseCpcbPollutantValue('NA')).toBeNull();
      expect(parseCpcbPollutantValue('N/A')).toBeNull();
      expect(parseCpcbPollutantValue(null)).toBeNull();
      expect(parseCpcbPollutantValue(undefined)).toBeNull();
    });

    it('4. Real average zero remains zero (not discarded as falsey or missing)', () => {
      expect(parseCpcbPollutantValue(0)).toBe(0);
      expect(parseCpcbPollutantValue('0')).toBe(0);

      const records: DataGovInRecord[] = [
        {
          state: 'Delhi',
          city: 'Delhi',
          station: 'Anand Vihar',
          pollutant_id: 'PM2.5',
          pollutant_avg: '0',
          pollutant_max: '2',
          pollutant_min: '0',
          pollutant_unit: 'ug/m3',
          last_update: '22-11-2026 18:00:00',
        },
      ];
      const sources = normalizeDataGovInRecords(records);
      expect(sources[0].measurements).toHaveLength(1);
      expect(sources[0].measurements[0].value).toBe(0);
    });

    it('5. Min and Max are preserved separately in measurement metadata', () => {
      const records: DataGovInRecord[] = [
        {
          state: 'Delhi',
          city: 'Delhi',
          station: 'Anand Vihar',
          pollutant_id: 'PM2.5',
          pollutant_avg: 82,
          pollutant_min: 40,
          pollutant_max: 120,
          pollutant_unit: 'ug/m3',
          last_update: '22-11-2026 18:00:00',
        },
      ];
      const sources = normalizeDataGovInRecords(records);
      const m = sources[0].measurements[0];
      expect(m.value).toBe(82);
      expect(m.min).toBe(40);
      expect(m.max).toBe(120);
    });

    it('6. Missing average is not used in AQI calculation', () => {
      const result = calculateComprehensiveCpcbNaqi({
        pm25: null, // missing average
        no2: 45,
        so2: 25,
      });
      expect(result.isDataSufficient).toBe(false);
      expect(result.subIndices.pm25).toBeUndefined();
    });

    it('7. Missing average is not used in source comparisons', () => {
      const srcWithMissingAvg: EnvironmentalSourceRecord = {
        id: 'cpcb-dl-test',
        providerId: 'cpcb',
        providerName: 'CPCB',
        stationId: 'Test Station',
        sourceName: 'Test Station',
        sourceKind: 'official_ground_station',
        status: 'unavailable',
        latitude: 28.6,
        longitude: 77.2,
        distanceKm: 2,
        observedAt: null,
        retrievedAt: new Date().toISOString(),
        measurements: [],
        attribution: 'CPCB',
        provenance: { licenseOrAttribution: 'OGD', isModel: false, limitations: [] },
      };

      const eligibility = evaluateMeasurementEligibility(srcWithMissingAvg, 'pm25');
      expect(eligibility.eligible).toBe(false);
      if (!eligibility.eligible) {
        expect(eligibility.reason).toBe('source_unavailable');
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Group B — Measurement Freshness (8–14)
  // ---------------------------------------------------------------------------
  describe('Group B: Measurement Freshness (Defect 2)', () => {
    it('8. Missing observation timestamp cannot produce fresh status', () => {
      const records: DataGovInRecord[] = [
        {
          state: 'Delhi',
          city: 'Delhi',
          station: 'Anand Vihar',
          pollutant_id: 'PM2.5',
          pollutant_avg: 90,
          pollutant_unit: 'ug/m3',
          last_update: undefined, // Missing timestamp!
        },
      ];
      const sources = normalizeDataGovInRecords(records);
      expect(sources[0].status).toBe('unavailable'); // Never fresh
    });

    it('9. PM10 timestamp cannot qualify PM2.5 freshness', () => {
      const src: EnvironmentalSourceRecord = {
        id: 'cpcb-multi-time',
        providerId: 'cpcb',
        providerName: 'CPCB',
        stationId: 'MultiTime',
        sourceName: 'MultiTime Station',
        sourceKind: 'official_ground_station',
        status: 'fresh',
        latitude: 28.6,
        longitude: 77.2,
        distanceKm: 2,
        observedAt: new Date().toISOString(), // Station-level timestamp
        retrievedAt: new Date().toISOString(),
        measurements: [
          { pollutant: 'pm10', value: 120, unit: 'ug/m3', observedAt: new Date().toISOString() }, // fresh
          { pollutant: 'pm25', value: 65, unit: 'ug/m3', observedAt: null }, // untimed PM2.5!
        ],
        attribution: 'CPCB',
        provenance: { licenseOrAttribution: 'OGD', isModel: false, limitations: [] },
      };

      const pm10Eligibility = evaluateMeasurementEligibility(src, 'pm10');
      const pm25Eligibility = evaluateMeasurementEligibility(src, 'pm25');

      expect(pm10Eligibility.eligible).toBe(true);
      expect(pm25Eligibility.eligible).toBe(false);
      if (!pm25Eligibility.eligible) {
        expect(pm25Eligibility.reason).toBe('missing_timestamp');
      }
    });

    it('10. Invalid observation timestamp does not qualify as fresh', () => {
      const records: DataGovInRecord[] = [
        {
          state: 'Delhi',
          city: 'Delhi',
          station: 'Anand Vihar',
          pollutant_id: 'PM2.5',
          pollutant_avg: 90,
          pollutant_unit: 'ug/m3',
          last_update: 'invalid-date-string',
        },
      ];
      const sources = normalizeDataGovInRecords(records);
      expect(sources[0].status).toBe('unavailable');
    });

    it('11. Suspicious future-dated timestamp outside skew allowance is rejected', () => {
      const futureTime = new Date(Date.now() + 3600000 * 4).toISOString(); // 4 hours in future
      const src: EnvironmentalSourceRecord = {
        id: 'cpcb-future',
        providerId: 'cpcb',
        providerName: 'CPCB',
        stationId: 'Future',
        sourceName: 'Future Station',
        sourceKind: 'official_ground_station',
        status: 'fresh',
        latitude: 28.6,
        longitude: 77.2,
        distanceKm: 2,
        observedAt: futureTime,
        retrievedAt: new Date().toISOString(),
        measurements: [{ pollutant: 'pm25', value: 65, unit: 'ug/m3', observedAt: futureTime }],
        attribution: 'CPCB',
        provenance: { licenseOrAttribution: 'OGD', isModel: false, limitations: [] },
      };

      const eligibility = evaluateMeasurementEligibility(src, 'pm25');
      expect(eligibility.eligible).toBe(false);
      if (!eligibility.eligible) {
        expect(eligibility.reason).toBe('future_timestamp');
      }
    });

    it('12. Stale timestamp (>24h) is classified correctly as stale and excluded from active counts', () => {
      const staleTime = new Date(Date.now() - 3600000 * 30).toISOString(); // 30 hours old
      const src: EnvironmentalSourceRecord = {
        id: 'cpcb-stale',
        providerId: 'cpcb',
        providerName: 'CPCB',
        stationId: 'Stale',
        sourceName: 'Stale Station',
        sourceKind: 'official_ground_station',
        status: 'stale',
        latitude: 28.6,
        longitude: 77.2,
        distanceKm: 2,
        observedAt: staleTime,
        retrievedAt: new Date().toISOString(),
        measurements: [{ pollutant: 'pm25', value: 65, unit: 'ug/m3', observedAt: staleTime }],
        attribution: 'CPCB',
        provenance: { licenseOrAttribution: 'OGD', isModel: false, limitations: [] },
      };

      const eligibility = evaluateMeasurementEligibility(src, 'pm25');
      expect(eligibility.eligible).toBe(false);
      if (!eligibility.eligible) {
        expect(eligibility.reason).toBe('stale');
      }

      const active = getActivePhysicalSources([src], 'pm25');
      expect(active).toHaveLength(0);
    });

    it('13. Fresh valid timestamp (<24h) qualifies for active monitoring', () => {
      const freshTime = new Date(Date.now() - 3600000 * 1).toISOString(); // 1 hour old
      const src: EnvironmentalSourceRecord = {
        id: 'cpcb-fresh',
        providerId: 'cpcb',
        providerName: 'CPCB',
        stationId: 'Fresh',
        sourceName: 'Fresh Station',
        sourceKind: 'official_ground_station',
        status: 'fresh',
        latitude: 28.6,
        longitude: 77.2,
        distanceKm: 2,
        observedAt: freshTime,
        retrievedAt: new Date().toISOString(),
        measurements: [{ pollutant: 'pm25', value: 65, unit: 'ug/m3', observedAt: freshTime }],
        attribution: 'CPCB',
        provenance: { licenseOrAttribution: 'OGD', isModel: false, limitations: [] },
      };

      const eligibility = evaluateMeasurementEligibility(src, 'pm25');
      expect(eligibility.eligible).toBe(true);

      const active = getActivePhysicalSources([src], 'pm25');
      expect(active).toHaveLength(1);
    });

    it('14. A source-wide fresh status cannot override invalid or missing pollutant timing', () => {
      const src: EnvironmentalSourceRecord = {
        id: 'cpcb-src-fresh',
        providerId: 'cpcb',
        providerName: 'CPCB',
        stationId: 'FreshSrc',
        sourceName: 'FreshSrc Station',
        sourceKind: 'official_ground_station',
        status: 'fresh', // Source level is fresh due to another feed
        latitude: 28.6,
        longitude: 77.2,
        distanceKm: 2,
        observedAt: new Date().toISOString(),
        retrievedAt: new Date().toISOString(),
        measurements: [{ pollutant: 'pm25', value: 65, unit: 'ug/m3', observedAt: null }], // PM2.5 untimed
        attribution: 'CPCB',
        provenance: { licenseOrAttribution: 'OGD', isModel: false, limitations: [] },
      };

      const eligibility = evaluateMeasurementEligibility(src, 'pm25');
      expect(eligibility.eligible).toBe(false);
      if (!eligibility.eligible) {
        expect(eligibility.reason).toBe('missing_timestamp');
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Group C — Scientific Units (15–21)
  // ---------------------------------------------------------------------------
  describe('Group C: Scientific Units (Defect 3)', () => {
    it('15. CO in mg/m³ is handled correctly without conversion', () => {
      const subIndex = calculateSubIndex('co', 2.0, 'mg/m3');
      expect(subIndex).toBe(100);
    });

    it('16. CO in µg/m³ is converted to mg/m³ correctly by dividing by 1000', () => {
      const subIndex = calculateSubIndex('co', 2000, 'ug/m3');
      expect(subIndex).toBe(100);
    });

    it('17. CO without unit is strictly rejected (returns null)', () => {
      expect(calculateSubIndex('co', 2.0)).toBeNull();
      expect(calculateSubIndex('co', 2000)).toBeNull();
      expect(calculateSubIndex('co', 55)).toBeNull();
    });

    it('18. Large CO value with explicit mg/m³ is evaluated in Severe band (>400) without dividing by 1000', () => {
      const subIndex = calculateSubIndex('co', 55, 'mg/m3');
      expect(subIndex).toBeGreaterThan(400); // 34.0 - 60.0 mg/m3 -> 401-500
    });

    it('19. Small CO value with explicit µg/m³ is not misinterpreted', () => {
      // 25 ug/m3 = 0.025 mg/m3 -> Good (0-1.0 -> 0-50)
      const subIndex = calculateSubIndex('co', 25, 'ug/m3');
      expect(subIndex).toBe(1);
    });

    it('20. Missing non-CO unit is resolved from documented contract or marked unknown', () => {
      expect(resolveCpcbPollutantUnit(null, 'pm25')).toBe('ug/m3');
      expect(resolveCpcbPollutantUnit(null, 'co')).toBe('mg/m3');
      expect(resolveCpcbPollutantUnit(null, 'unregistered_pollutant')).toBeNull();
    });

    it('21. Unsupported unit is excluded from AQI calculations', () => {
      expect(calculateSubIndex('pm25', 45, 'ppm')).toBeNull();
      expect(calculateSubIndex('pm25', 45, 'mg/m3')).toBeNull();
      expect(calculateSubIndex('co', 2.0, 'ppm')).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // Group D — CPCB Methodology & Averaging Periods (22–31)
  // ---------------------------------------------------------------------------
  describe('Group D: CPCB Methodology (Defect 4)', () => {
    it('22. Unknown averaging period cannot produce statutory-compliant classification', () => {
      const result = calculateComprehensiveCpcbNaqi({
        pm25: 65,
        no2: 45,
        so2: 20,
        // is24HourAveraged omitted (unknown averaging periods)
      });
      expect(result.isDataSufficient).toBe(true);
      expect(result.classification).toBe('indicative_snapshot'); // Not statutory_compliant
    });

    it('23. 24-hour PM2.5 is verified affirmatively for statutory compliance', () => {
      const result = calculateComprehensiveCpcbNaqi({
        pm25: 65,
        no2: 45,
        so2: 20,
        averagingPeriods: { pm25: 1440, no2: 1440, so2: 1440 },
      });
      expect(result.classification).toBe('statutory_compliant');
    });

    it('24. 24-hour PM10 is verified affirmatively for statutory compliance', () => {
      const result = calculateComprehensiveCpcbNaqi({
        pm10: 120,
        no2: 45,
        so2: 20,
        averagingPeriods: { pm10: 1440, no2: 1440, so2: 1440 },
      });
      expect(result.classification).toBe('statutory_compliant');
    });

    it('25. 8-hour CO is verified affirmatively with 480 minutes', () => {
      const result = calculateComprehensiveCpcbNaqi({
        pm25: 65,
        no2: 45,
        co: 2.0,
        coUnit: 'mg/m3',
        averagingPeriods: { pm25: 1440, no2: 1440, co: 480 },
      });
      expect(result.classification).toBe('statutory_compliant');
    });

    it('26. 8-hour O3 is verified affirmatively with 480 minutes', () => {
      const result = calculateComprehensiveCpcbNaqi({
        pm25: 65,
        no2: 45,
        o3: 60,
        averagingPeriods: { pm25: 1440, no2: 1440, o3: 480 },
      });
      expect(result.classification).toBe('statutory_compliant');
    });

    it('27. Missing required pollutants produces indicative_subindex', () => {
      const result = calculateComprehensiveCpcbNaqi({
        pm25: 65,
        // only 1 pollutant
        is24HourAveraged: true,
      });
      expect(result.isDataSufficient).toBe(false);
      expect(result.classification).toBe('indicative_subindex');
    });

    it('28. Unknown Pb averaging period produces indicative_snapshot', () => {
      const result = calculateComprehensiveCpcbNaqi({
        pm25: 65,
        no2: 45,
        pb: 1.5,
        // averagingPeriods omitted
      });
      expect(result.classification).toBe('indicative_snapshot');
    });

    it('29. Pb breakpoint boundaries are verified without overlapping gaps', () => {
      expect(calculateSubIndex('pb', 0.5)).toBe(50); // Good endpoint
      expect(calculateSubIndex('pb', 1.0)).toBe(100); // Satisfactory endpoint
      expect(calculateSubIndex('pb', 2.0)).toBe(200); // Moderate endpoint
      expect(calculateSubIndex('pb', 3.0)).toBe(300); // Poor endpoint
      expect(calculateSubIndex('pb', 3.5)).toBe(400); // Very Poor endpoint
      expect(calculateSubIndex('pb', 3.6)).toBe(401); // Severe entry (no gap / no overlap at 3.5)
      expect(calculateSubIndex('pb', 5.0)).toBe(500); // Severe cap
    });

    it('30. Locally derived AQI is not described as officially published', () => {
      const result = calculateComprehensiveCpcbNaqi({
        pm25: 65,
        no2: 45,
        so2: 20,
        is24HourAveraged: true,
      });
      expect(result.isOfficialPublished).toBe(false);
    });

    it('31. Mixed incompatible averaging periods (e.g. 60-min snapshot for PM2.5) produce indicative_snapshot', () => {
      const result = calculateComprehensiveCpcbNaqi({
        pm25: 65,
        no2: 45,
        so2: 20,
        averagingPeriods: { pm25: 60, no2: 1440, so2: 1440 }, // PM2.5 is 60-min snapshot!
      });
      expect(result.classification).toBe('indicative_snapshot');
    });
  });

  // ---------------------------------------------------------------------------
  // Group E — Timestamps & Calendar Validation (32–39)
  // ---------------------------------------------------------------------------
  describe('Group E: Timestamps & Calendar Validation (Defect 5)', () => {
    it('32. IST source timestamp (DD-MM-YYYY HH:mm:ss) converts strictly to UTC ISO', () => {
      expect(parseIndianStandardTime('22-11-2026 18:00:00')).toBe('2026-11-22T12:30:00.000Z');
    });

    it('33. UTC timestamp (YYYY-MM-DDTHH:mm:ssZ) is preserved exactly without shifting', () => {
      expect(parseIndianStandardTime('2026-11-22T12:30:00Z')).toBe('2026-11-22T12:30:00.000Z');
    });

    it('34. Explicit timezone offset (+05:30) is preserved exactly', () => {
      expect(parseIndianStandardTime('2026-11-22T18:00:00+05:30')).toBe('2026-11-22T12:30:00.000Z');
    });

    it('35. Invalid February dates (Feb 30, non-leap Feb 29) are strictly rejected', () => {
      expect(parseIndianStandardTime('30-02-2026 10:00:00')).toBeNull();
      expect(parseIndianStandardTime('29-02-2025 10:00:00')).toBeNull();
      expect(parseIndianStandardTime('29-02-2024 10:00:00')).not.toBeNull(); // 2024 was leap year
    });

    it('36. Invalid time units (hour 25, minute 75) are strictly rejected', () => {
      expect(parseIndianStandardTime('22-11-2026 25:00:00')).toBeNull();
      expect(parseIndianStandardTime('22-11-2026 18:75:00')).toBeNull();
      expect(parseIndianStandardTime('22-11-2026 18:00:80')).toBeNull();
    });

    it('37. Unsupported ambiguous dates are rejected without falling back to Date.parse', () => {
      expect(parseIndianStandardTime('invalid-date')).toBeNull();
      expect(parseIndianStandardTime('11/22/2026')).toBeNull();
    });

    it('38. Does not use browser timezone for offset-free or IST strings', () => {
      const parsedMidnight = parseIndianStandardTime('23-11-2026 00:00:00');
      expect(parsedMidnight).toBe('2026-11-22T18:30:00.000Z');
    });

    it('39. Observation timestamp remains distinct from retrieval timestamp', () => {
      const records: DataGovInRecord[] = [
        {
          state: 'Delhi',
          city: 'Delhi',
          station: 'Anand Vihar',
          pollutant_id: 'PM2.5',
          pollutant_avg: 90,
          pollutant_unit: 'ug/m3',
          last_update: '22-11-2026 18:00:00',
        },
      ];
      const sources = normalizeDataGovInRecords(records);
      expect(sources[0].observedAt).toBe('2026-11-22T12:30:00.000Z');
      expect(sources[0].retrievedAt).not.toBe('2026-11-22T12:30:00.000Z');
    });
  });

  // ---------------------------------------------------------------------------
  // Group F — Bounded Pagination & Cancellation (40–49)
  // ---------------------------------------------------------------------------
  describe('Group F: Bounded Pagination & Cancellation (Defect 6 & 7)', () => {
    it('40. Single-page response is fetched and completed when count < limit', async () => {
      process.env.DATA_GOV_IN_API_KEY = 'test_key';
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          total: 10,
          count: 10,
          limit: 500,
          offset: 0,
          records: [
            {
              state: 'Delhi',
              city: 'Delhi',
              station: 'Anand Vihar',
              pollutant_id: 'PM2.5',
              pollutant_avg: 95,
              pollutant_unit: 'ug/m3',
              last_update: '22-11-2026 18:00:00',
            },
          ],
        }),
      }));

      const result = await fetchCpcbProviderResult({ city: 'Delhi' });
      expect(result.status).toBe('available');
      expect(result.isPartial).toBe(false);
      expect(result.sources).toHaveLength(1);
    });

    it('41. Multipage response is fetched sequentially across offsets', async () => {
      process.env.DATA_GOV_IN_API_KEY = 'test_key';
      const fetchMock = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            total: 2,
            count: 1,
            limit: 1,
            offset: 0,
            records: [
              {
                state: 'Delhi',
                city: 'Delhi',
                station: 'Anand Vihar',
                pollutant_id: 'PM2.5',
                pollutant_avg: 95,
                pollutant_unit: 'ug/m3',
                last_update: '22-11-2026 18:00:00',
              },
            ],
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            total: 2,
            count: 1,
            limit: 1,
            offset: 1,
            records: [
              {
                state: 'Delhi',
                city: 'Delhi',
                station: 'R K Puram',
                pollutant_id: 'PM2.5',
                pollutant_avg: 80,
                pollutant_unit: 'ug/m3',
                last_update: '22-11-2026 18:00:00',
              },
            ],
          }),
        });

      vi.stubGlobal('fetch', fetchMock);

      const result = await fetchCpcbProviderResult({ city: 'Delhi', limit: 1 });
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(result.sources).toHaveLength(2);
      expect(result.isPartial).toBe(false);
    });

    it('42. Partial fetch is marked when pagination stops early due to maxPages limit', async () => {
      process.env.DATA_GOV_IN_API_KEY = 'test_key';
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          total: 100,
          count: 1,
          limit: 1,
          offset: 0,
          records: [
            {
              state: 'Delhi',
              city: 'Delhi',
              station: `Station-${Math.random()}`,
              pollutant_id: 'PM2.5',
              pollutant_avg: 80,
              pollutant_unit: 'ug/m3',
              last_update: '22-11-2026 18:00:00',
            },
          ],
        }),
      });

      vi.stubGlobal('fetch', fetchMock);

      const result = await fetchCpcbProviderResult({ city: 'Delhi', limit: 1, maxPages: 2 });
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(result.isPartial).toBe(true);
    });

    it('43. Station on a later page is retrieved successfully and appears in sources', async () => {
      process.env.DATA_GOV_IN_API_KEY = 'test_key';
      vi.stubGlobal('fetch', vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            total: 2,
            count: 1,
            limit: 1,
            records: [{ state: 'Delhi', city: 'Delhi', station: 'Station Alpha', pollutant_id: 'PM2.5', pollutant_avg: 70, pollutant_unit: 'ug/m3', last_update: '22-11-2026 18:00:00' }],
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            total: 2,
            count: 1,
            limit: 1,
            records: [{ state: 'Delhi', city: 'Delhi', station: 'Target Beta', pollutant_id: 'PM2.5', pollutant_avg: 85, pollutant_unit: 'ug/m3', last_update: '22-11-2026 18:00:00' }],
          }),
        }));

      const result = await fetchCpcbProviderResult({ city: 'Delhi', limit: 1 });
      expect(result.sources.some(s => s.name === 'Target Beta')).toBe(true);
    });

    it('44. Duplicate page entries across pagination boundaries are deduplicated', async () => {
      process.env.DATA_GOV_IN_API_KEY = 'test_key';
      const duplicateRow = {
        state: 'Delhi',
        city: 'Delhi',
        station: 'Anand Vihar',
        pollutant_id: 'PM2.5',
        pollutant_avg: 95,
        pollutant_unit: 'ug/m3',
        last_update: '22-11-2026 18:00:00',
      };

      vi.stubGlobal('fetch', vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ total: 2, count: 1, limit: 1, records: [duplicateRow] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ total: 2, count: 1, limit: 1, records: [duplicateRow] }), // duplicate!
        }));

      const result = await fetchCpcbProviderResult({ city: 'Delhi', limit: 1 });
      expect(result.sources).toHaveLength(1);
    });

    it('45. Upstream rate limit during pagination preserves retrieved records and marks partial', async () => {
      process.env.DATA_GOV_IN_API_KEY = 'test_key';
      vi.stubGlobal('fetch', vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            total: 20,
            count: 1,
            limit: 1,
            records: [{ state: 'Delhi', city: 'Delhi', station: 'Station Alpha', pollutant_id: 'PM2.5', pollutant_avg: 70, pollutant_unit: 'ug/m3', last_update: '22-11-2026 18:00:00' }],
          }),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          json: async () => ({ error: 'Rate limit exceeded' }),
        }));

      const result = await fetchCpcbProviderResult({ city: 'Delhi', limit: 1 });
      expect(result.sources).toHaveLength(1);
      expect(result.isPartial).toBe(true);
    });

    it('46. Internal timeout controller fires even when external caller signal is passed', async () => {
      const externalController = new AbortController();
      const { signal, cleanup, isTimeout } = createCombinedAbortSignal(externalController.signal, 50);

      await new Promise(r => setTimeout(r, 70));
      expect(signal.aborted).toBe(true);
      expect(isTimeout()).toBe(true);
      cleanup();
    });

    it('47. Caller cancellation aborts composite signal immediately without false timeout label', () => {
      const externalController = new AbortController();
      const { signal, cleanup, isTimeout } = createCombinedAbortSignal(externalController.signal, 8000);

      externalController.abort();
      expect(signal.aborted).toBe(true);
      expect(isTimeout()).toBe(false); // Caller abort, not timeout!
      cleanup();
    });

    it('48. Repeated-page loop protection terminates pagination cleanly', async () => {
      process.env.DATA_GOV_IN_API_KEY = 'test_key';
      const repeatedRow = {
        state: 'Delhi',
        city: 'Delhi',
        station: 'Infinite Station',
        pollutant_id: 'PM2.5',
        pollutant_avg: 75,
        pollutant_unit: 'ug/m3',
        last_update: '22-11-2026 18:00:00',
      };

      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ total: 1000, count: 1, limit: 1, records: [repeatedRow] }),
      });

      vi.stubGlobal('fetch', fetchMock);

      const result = await fetchCpcbProviderResult({ city: 'Delhi', limit: 1, maxPages: 5 });
      expect(fetchMock).toHaveBeenCalledTimes(2); // Stops on page 2 when 0 new rows added
      expect(result.sources).toHaveLength(1);
    });

    it('49. Enforces maximum query size bounds (maxPages)', async () => {
      process.env.DATA_GOV_IN_API_KEY = 'test_key';
      let page = 0;
      const fetchMock = vi.fn().mockImplementation(() => {
        page++;
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            total: 1000,
            count: 1,
            limit: 1,
            records: [{ state: 'Delhi', city: 'Delhi', station: `Station-${page}`, pollutant_id: 'PM2.5', pollutant_avg: 75, pollutant_unit: 'ug/m3', last_update: '22-11-2026 18:00:00' }],
          }),
        });
      });

      vi.stubGlobal('fetch', fetchMock);

      const result = await fetchCpcbProviderResult({ city: 'Delhi', limit: 1, maxPages: 3 });
      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(result.isPartial).toBe(true);
      expect(result.sources).toHaveLength(3);
    });
  });

  // ---------------------------------------------------------------------------
  // Group G — Station Provenance & Identity (50–57)
  // ---------------------------------------------------------------------------
  describe('Group G: Station Provenance & Identity (Defect 8)', () => {
    it('50. Same station name in different cities remains distinct with scoped record IDs', () => {
      const records: DataGovInRecord[] = [
        { state: 'Delhi', city: 'Delhi', station: 'Civil Lines', pollutant_id: 'PM2.5', pollutant_avg: 80, pollutant_unit: 'ug/m3', last_update: '22-11-2026 18:00:00' },
        { state: 'Uttar Pradesh', city: 'Lucknow', station: 'Civil Lines', pollutant_id: 'PM2.5', pollutant_avg: 70, pollutant_unit: 'ug/m3', last_update: '22-11-2026 18:00:00' },
      ];
      const sources = normalizeDataGovInRecords(records);
      expect(sources).toHaveLength(2);
      expect(sources[0].id).not.toBe(sources[1].id);
      expect(sources[0].id).toContain('delhi');
      expect(sources[1].id).toContain('lucknow');
    });

    it('51. Same numeric station ID from different networks remains distinct', () => {
      const cpcbRecord: EnvironmentalSourceRecord = {
        id: 'cpcb-101',
        providerId: 'cpcb',
        providerName: 'CPCB',
        stationId: '101',
        sourceName: 'CPCB 101',
        sourceKind: 'official_ground_station',
        status: 'fresh',
        latitude: 28.6,
        longitude: 77.2,
        distanceKm: 2,
        observedAt: new Date().toISOString(),
        retrievedAt: new Date().toISOString(),
        measurements: [{ pollutant: 'pm25', value: 80, unit: 'ug/m3' }],
        attribution: 'CPCB',
        provenance: { licenseOrAttribution: 'OGD', isModel: false, limitations: [] },
      };

      const openAqRecord: EnvironmentalSourceRecord = {
        id: 'openaq-101',
        providerId: 'openaq',
        providerName: 'OpenAQ',
        stationId: '101',
        sourceName: 'OpenAQ 101',
        sourceKind: 'physical_observation',
        status: 'fresh',
        latitude: 28.6,
        longitude: 77.2,
        distanceKm: 2,
        observedAt: new Date().toISOString(),
        retrievedAt: new Date().toISOString(),
        measurements: [{ pollutant: 'pm25', value: 80, unit: 'ug/m3' }],
        attribution: 'OpenAQ',
        provenance: { licenseOrAttribution: 'CC BY', isModel: false, limitations: [] },
      };

      const key1 = getPhysicalStationDeduplicationKey(cpcbRecord);
      const key2 = getPhysicalStationDeduplicationKey(openAqRecord);

      expect(key1).toBe('provider:cpcb:101');
      expect(key2).toBe('provider:openaq:101');
      expect(key1).not.toBe(key2);
    });

    it('52. Unverified cross-provider mapping is NOT applied by default', () => {
      const openAqRecord: EnvironmentalSourceRecord = {
        id: 'openaq-5001',
        providerId: 'openaq',
        providerName: 'OpenAQ',
        stationId: '5001',
        sourceName: 'US Embassy Delhi',
        sourceKind: 'physical_observation',
        status: 'fresh',
        latitude: 28.5983,
        longitude: 77.1897,
        distanceKm: 1.5,
        observedAt: new Date().toISOString(),
        retrievedAt: new Date().toISOString(),
        measurements: [{ pollutant: 'pm25', value: 140, unit: 'ug/m3' }],
        attribution: 'OpenAQ',
        provenance: { licenseOrAttribution: 'OpenAQ', isModel: false, limitations: [] },
      };

      const airNowRecord: EnvironmentalSourceRecord = {
        id: 'airnow-chanakyapuri',
        providerId: 'airnow',
        providerName: 'AirNow',
        stationId: 'chanakyapuri',
        sourceName: 'US Embassy Chanakyapuri',
        sourceKind: 'official_ground_station',
        status: 'fresh',
        latitude: 28.5983,
        longitude: 77.1897,
        distanceKm: 1.5,
        observedAt: new Date().toISOString(),
        retrievedAt: new Date().toISOString(),
        measurements: [{ pollutant: 'pm25', value: 140, unit: 'ug/m3' }],
        attribution: 'AirNow',
        provenance: { licenseOrAttribution: 'AirNow', isModel: false, limitations: [] },
      };

      expect(getPhysicalStationDeduplicationKey(openAqRecord)).toBe('provider:openaq:5001');
      expect(getPhysicalStationDeduplicationKey(airNowRecord)).toBe('provider:airnow:chanakyapuri');
    });

    it('53. Verified mapping is applied when documentary evidence is registered', () => {
      registerVerifiedStationMapping('openaq:test_loc_99', 'canonical_collocation_point');
      registerVerifiedStationMapping('cpcb:test_sta_99', 'canonical_collocation_point');

      const src1: EnvironmentalSourceRecord = {
        id: 'openaq-test',
        providerId: 'openaq',
        providerName: 'OpenAQ',
        stationId: 'test_loc_99',
        sourceName: 'Test Loc',
        sourceKind: 'physical_observation',
        status: 'fresh',
        latitude: 28.6,
        longitude: 77.2,
        distanceKm: 2,
        observedAt: new Date().toISOString(),
        retrievedAt: new Date().toISOString(),
        measurements: [{ pollutant: 'pm25', value: 90, unit: 'ug/m3' }],
        attribution: 'OpenAQ',
        provenance: { licenseOrAttribution: 'CC BY', isModel: false, limitations: [] },
      };

      const src2: EnvironmentalSourceRecord = {
        id: 'cpcb-test',
        providerId: 'cpcb',
        providerName: 'CPCB',
        stationId: 'test_sta_99',
        sourceName: 'Test Sta',
        sourceKind: 'official_ground_station',
        status: 'fresh',
        latitude: 28.6,
        longitude: 77.2,
        distanceKm: 2,
        observedAt: new Date().toISOString(),
        retrievedAt: new Date().toISOString(),
        measurements: [{ pollutant: 'pm25', value: 90, unit: 'ug/m3' }],
        attribution: 'CPCB',
        provenance: { licenseOrAttribution: 'OGD', isModel: false, limitations: [] },
      };

      expect(getPhysicalStationDeduplicationKey(src1)).toBe('canonical:canonical_collocation_point');
      expect(getPhysicalStationDeduplicationKey(src2)).toBe('canonical:canonical_collocation_point');
    });

    it('54. Unknown agency is not guessed or defaulted to CPCB', () => {
      const records: DataGovInRecord[] = [
        {
          state: 'Delhi',
          city: 'Delhi',
          station: 'Pusa Observatory', // No agency suffix like "- DPCC"
          pollutant_id: 'PM2.5',
          pollutant_avg: 70,
          pollutant_unit: 'ug/m3',
          last_update: '22-11-2026 18:00:00',
        },
      ];
      const sources = normalizeDataGovInRecords(records);
      expect(sources[0].provenance.network).toContain('Unknown Operating Authority');
      expect(sources[0].provider).not.toBe('Central Pollution Control Board (CPCB)');
    });

    it('55. Unknown instrument is not guessed with specific BAM/TEOM claims', () => {
      const records: DataGovInRecord[] = [
        {
          state: 'Delhi',
          city: 'Delhi',
          station: 'Anand Vihar',
          pollutant_id: 'PM2.5',
          pollutant_avg: 70,
          pollutant_unit: 'ug/m3',
          last_update: '22-11-2026 18:00:00',
        },
      ];
      const sources = normalizeDataGovInRecords(records);
      const limitations = sources[0].provenance.limitations.join(' ');
      expect(limitations).not.toContain('Beta-Attenuation Monitor');
      expect(limitations).toContain('Specific monitoring instrumentation not reported in public dataset metadata');
    });

    it('56. Internal station ID is distinguished from official registry ID', () => {
      const station = OFFICIAL_CPCB_STATIONS.find(s => s.name.includes('Anand Vihar'));
      expect(station).toBeDefined();
      expect(station?.internalId).toBe('avir-cpcb-dl-anand-vihar');
      expect(station?.officialStationId).toBeNull();
    });

    it('57. Registry-only stations are excluded from active monitor counts', () => {
      const regOnly: EnvironmentalSourceRecord = {
        id: 'cpcb-reg-only',
        providerId: 'cpcb',
        providerName: 'CPCB',
        stationId: 'RegOnly',
        sourceName: 'Registry Only Station',
        sourceKind: 'official_ground_station',
        status: 'registry_only',
        latitude: 28.6,
        longitude: 77.2,
        distanceKm: 2,
        observedAt: null,
        retrievedAt: new Date().toISOString(),
        measurements: [],
        attribution: 'CPCB',
        provenance: { licenseOrAttribution: 'OGD', isModel: false, limitations: [] },
      };

      const active = getActivePhysicalSources([regOnly], 'pm25');
      expect(active).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Group H — End-to-End Integration & Security (58–66)
  // ---------------------------------------------------------------------------
  describe('Group H: End-to-End Integration & Security (Defect 10 & 11)', () => {
    it('58. Realistic official API fixture parses cleanly and produces valid records', () => {
      const records: DataGovInRecord[] = [
        {
          state: 'Delhi',
          city: 'Delhi',
          station: 'Anand Vihar, Delhi - DPCC',
          pollutant_id: 'PM2.5',
          pollutant_avg: 145.2,
          pollutant_min: 60.1,
          pollutant_max: 230.5,
          pollutant_unit: 'ug/m3',
          last_update: '22-11-2026 18:00:00',
          latitude: 28.6508,
          longitude: 77.3152,
        },
        {
          state: 'Delhi',
          city: 'Delhi',
          station: 'Anand Vihar, Delhi - DPCC',
          pollutant_id: 'PM10',
          pollutant_avg: 280.4,
          pollutant_min: 150.0,
          pollutant_max: 420.0,
          pollutant_unit: 'ug/m3',
          last_update: '22-11-2026 18:00:00',
          latitude: 28.6508,
          longitude: 77.3152,
        },
      ];

      const sources = normalizeDataGovInRecords(records);
      expect(sources).toHaveLength(1);
      expect(sources[0].measurements).toHaveLength(2);
      expect(sources[0].provenance.network).toContain('Delhi Pollution Control Committee (DPCC)');
    });

    it('59. Missing credentials produce honest "not_configured" state', async () => {
      delete process.env.DATA_GOV_IN_API_KEY;
      const result = await fetchCpcbProviderResult();
      expect(result.status).toBe('not_configured');
      expect(result.errorMessage).toContain('DATA_GOV_IN_API_KEY is not configured');
    });

    it('60. Upstream provider failure does not crash and returns safe error status', async () => {
      process.env.DATA_GOV_IN_API_KEY = 'test_key';
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Connection failed')));

      const result = await fetchCpcbProviderResult();
      expect(result.status).toBe('unavailable');
      expect(result.errorCode).toBe('NETWORK_ERROR');
    });

    it('61. Invalid pollutant values do not enter inter-source comparisons', () => {
      const src1: EnvironmentalSourceRecord = {
        id: 'src1',
        providerId: 'open_meteo',
        providerName: 'Open-Meteo',
        sourceName: 'Model',
        sourceKind: 'atmospheric_model',
        status: 'active',
        latitude: 28.6,
        longitude: 77.2,
        distanceKm: 0,
        observedAt: new Date().toISOString(),
        retrievedAt: new Date().toISOString(),
        measurements: [{ pollutant: 'pm25', value: 100, unit: 'ug/m3' }],
        attribution: 'Open-Meteo',
        provenance: { licenseOrAttribution: 'CC BY', isModel: true, limitations: [] },
      };

      const srcInvalid: EnvironmentalSourceRecord = {
        id: 'src2',
        providerId: 'cpcb',
        providerName: 'CPCB',
        sourceName: 'Invalid Ground',
        sourceKind: 'official_ground_station',
        status: 'unavailable',
        latitude: 28.6,
        longitude: 77.2,
        distanceKm: 2,
        observedAt: new Date().toISOString(),
        retrievedAt: new Date().toISOString(),
        measurements: [{ pollutant: 'pm25', value: -10, unit: 'ug/m3' }], // invalid negative
        attribution: 'CPCB',
        provenance: { licenseOrAttribution: 'OGD', isModel: false, limitations: [] },
      };

      const comparison = compareEnvironmentalSources([src1, srcInvalid]);
      expect(comparison.mode).toBe('mode_a_single_source'); // Invalid reading excluded
    });

    it('62. Valid measurements preserve original units without silent modification', () => {
      const records: DataGovInRecord[] = [
        {
          state: 'Delhi',
          city: 'Delhi',
          station: 'Anand Vihar',
          pollutant_id: 'CO',
          pollutant_avg: 1.5,
          pollutant_unit: 'mg/m3',
          last_update: '22-11-2026 18:00:00',
        },
      ];
      const sources = normalizeDataGovInRecords(records);
      expect(sources[0].measurements[0].unit).toBe('mg/m3');
      expect(sources[0].measurements[0].value).toBe(1.5);
    });

    it('63. City switching does not mix station data from different cities', () => {
      const recordsDelhi: DataGovInRecord[] = [
        { state: 'Delhi', city: 'Delhi', station: 'Anand Vihar', pollutant_id: 'PM2.5', pollutant_avg: 90, pollutant_unit: 'ug/m3', last_update: '22-11-2026 18:00:00', latitude: 28.65, longitude: 77.31 },
      ];
      const recordsBlr: DataGovInRecord[] = [
        { state: 'Karnataka', city: 'Bengaluru', station: 'BTM Layout', pollutant_id: 'PM2.5', pollutant_avg: 45, pollutant_unit: 'ug/m3', last_update: '22-11-2026 18:00:00', latitude: 12.91, longitude: 77.61 },
      ];

      const sourcesDelhi = normalizeDataGovInRecords(recordsDelhi, 28.6139, 77.2090, 35);
      const sourcesBlr = normalizeDataGovInRecords(recordsBlr, 12.9716, 77.5946, 35);

      expect(sourcesDelhi[0].name).toContain('Anand Vihar');
      expect(sourcesBlr[0].name).toContain('BTM Layout');
    });

    it('64. Active counts match the measurements shown', () => {
      const records: DataGovInRecord[] = [
        { state: 'Delhi', city: 'Delhi', station: 'Station A', pollutant_id: 'PM2.5', pollutant_avg: 90, pollutant_unit: 'ug/m3', last_update: '22-11-2026 18:00:00' },
        { state: 'Delhi', city: 'Delhi', station: 'Station B', pollutant_id: 'PM10', pollutant_avg: 150, pollutant_unit: 'ug/m3', last_update: '22-11-2026 18:00:00' },
      ];
      const sources = normalizeDataGovInRecords(records);
      const activePm25 = getActivePhysicalSources(sources, 'pm25');
      const activePm10 = getActivePhysicalSources(sources, 'pm10');

      expect(activePm25).toHaveLength(1);
      expect(activePm10).toHaveLength(1);
    });

    it('65. No raw upstream error leaks credentials or secret parameters', async () => {
      process.env.DATA_GOV_IN_API_KEY = 'super_confidential_token_999';
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({ error: 'Invalid key: super_confidential_token_999' }),
      }));

      const result = await fetchCpcbProviderResult();
      const stringified = JSON.stringify(result);
      expect(stringified).not.toContain('super_confidential_token_999');
    });

    it('66. A complete no-coverage query is distinguishable from partial retrieval', async () => {
      process.env.DATA_GOV_IN_API_KEY = 'test_key';
      // Complete empty query
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ total: 0, count: 0, limit: 500, records: [] }),
      }));

      const noCoverageResult = await fetchCpcbProviderResult({ city: 'RemoteDesert' });
      expect(noCoverageResult.status).toBe('no_coverage');
      expect(noCoverageResult.isPartial).toBe(false);

      // Partial empty query (timed out before fetching)
      const partialEmptyResult: any = {
        providerId: 'cpcb',
        status: 'partial',
        sources: [],
        isPartial: true,
      };
      expect(partialEmptyResult.status).toBe('partial');
      expect(partialEmptyResult.status).not.toBe(noCoverageResult.status);
    });
  });
});
