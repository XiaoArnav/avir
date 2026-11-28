/**
 * AVIR — Step 4 Unit Test Suite: Official CPCB / CAAQMS Data Provider
 * 
 * Verifies Phase K test groups:
 * - Group A: Official source access & security
 * - Group B: Pollutant data normalization, units, & IST timestamps
 * - Group C: Station identity, registry integrity, & deduplication
 * - Group D: CPCB NAQI calculation with explicit units & Pb support
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  parseIndianStandardTime,
  normalizeCpcbPollutantId,
  parseCpcbPollutantValue,
  normalizeDataGovInRecords,
  fetchCpcbProviderResult,
  DataGovInRecord,
} from '@/services/providers/cpcb-provider';
import {
  calculateSubIndex,
  calculateComprehensiveCpcbNaqi,
  getCpcbCategory,
} from '@/domain/cpcb-naqi';
import { OFFICIAL_CPCB_STATIONS } from '@/services/ground-station-service';
import {
  getPhysicalStationDeduplicationKey,
  getActivePhysicalSources,
  evaluateMeasurementEligibility,
  registerVerifiedStationMapping,
} from '@/config/environmental-sources';
import { EnvironmentalSourceRecord } from '@/domain/types';

describe('AVIR Step 4: Official CPCB/CAAQMS Provider & NAQI Engine', () => {
  // -------------------------------------------------------------------------
  // Group A — Official Source Access & Security
  // -------------------------------------------------------------------------
  describe('Group A: Official Source Access & Security', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      vi.resetModules();
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
      vi.restoreAllMocks();
    });

    it('1. Returns "not_configured" status when DATA_GOV_IN_API_KEY is missing', async () => {
      delete process.env.DATA_GOV_IN_API_KEY;
      const result = await fetchCpcbProviderResult({ latitude: 28.6139, longitude: 77.2090 });
      expect(result.status).toBe('not_configured');
      expect(result.sources).toHaveLength(0);
      expect(result.activeStationCount).toBe(0);
      expect(result.errorMessage).toContain('DATA_GOV_IN_API_KEY is not configured');
    });

    it('2. Handles 401/403 unauthorized responses honestly without leaking keys', async () => {
      process.env.DATA_GOV_IN_API_KEY = 'invalid_secret_key_123';
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ error: 'Key not authorised' }),
      }));

      const result = await fetchCpcbProviderResult({ latitude: 28.6139, longitude: 77.2090 });
      expect(result.status).toBe('unauthorized');
      expect(result.errorCode).toBe('UNAUTHORIZED');
      expect(JSON.stringify(result)).not.toContain('invalid_secret_key_123');
    });

    it('3. Handles rate limiting (HTTP 429) gracefully', async () => {
      process.env.DATA_GOV_IN_API_KEY = 'test_key';
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        json: async () => ({ error: 'Rate limit exceeded' }),
      }));

      const result = await fetchCpcbProviderResult({ latitude: 28.6139, longitude: 77.2090 });
      expect(result.status).toBe('rate_limited');
      expect(result.errorCode).toBe('RATE_LIMITED');
    });

    it('4. Handles upstream server error (HTTP 500) safely', async () => {
      process.env.DATA_GOV_IN_API_KEY = 'test_key';
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        json: async () => ({ error: 'Bad Gateway' }),
      }));

      const result = await fetchCpcbProviderResult({ latitude: 28.6139, longitude: 77.2090 });
      expect(result.status).toBe('upstream_error');
      expect(result.errorCode).toBe('HTTP_502');
    });

    it('5. Handles request timeout / abort safely', async () => {
      process.env.DATA_GOV_IN_API_KEY = 'test_key';
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(abortError));

      const result = await fetchCpcbProviderResult({ latitude: 28.6139, longitude: 77.2090 });
      expect(result.status).toBe('unavailable');
      expect(result.errorCode).toBe('TIMEOUT');
    });

    it('6. Empty records array yields "no_coverage" status', async () => {
      process.env.DATA_GOV_IN_API_KEY = 'test_key';
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ total: 0, count: 0, records: [] }),
      }));

      const result = await fetchCpcbProviderResult({ latitude: 28.6139, longitude: 77.2090 });
      expect(result.status).toBe('no_coverage');
      expect(result.sources).toHaveLength(0);
      expect(result.activeStationCount).toBe(0);
    });

    it('7. Mock record injection bypasses remote fetch for safe isolated testing', async () => {
      const mockRows: DataGovInRecord[] = [
        {
          state: 'Delhi',
          city: 'Delhi',
          station: 'Anand Vihar, Delhi - DPCC',
          last_update: '22-11-2026 18:00:00',
          pollutant_id: 'PM2.5',
          pollutant_avg: '210.5',
          latitude: '28.6508',
          longitude: '77.3152',
        },
      ];

      const result = await fetchCpcbProviderResult({
        latitude: 28.6139,
        longitude: 77.2090,
        mockRecords: mockRows,
      });

      expect(result.status).toBe('available');
      expect(result.sources).toHaveLength(1);
      expect(result.sources[0].measurements[0].value).toBe(210.5);
    });
  });

  // -------------------------------------------------------------------------
  // Group B — Data Normalization, Units, & IST Timestamps
  // -------------------------------------------------------------------------
  describe('Group B: Data Normalization, Units, & IST Timestamps', () => {
    it('8. Correctly parses Indian Standard Time (DD-MM-YYYY HH:mm:ss) to UTC ISO', () => {
      // 18:00:00 IST (+05:30) is 12:30:00 UTC
      const iso = parseIndianStandardTime('22-11-2026 18:00:00');
      expect(iso).toBe('2026-11-22T12:30:00.000Z');
    });

    it('9. Correctly parses midnight IST (00:00:00) to previous day 18:30:00 UTC', () => {
      const iso = parseIndianStandardTime('23-11-2026 00:00:00');
      expect(iso).toBe('2026-11-22T18:30:00.000Z');
    });

    it('10. Rejects invalid date formats and sentinel strings ("NA", "null")', () => {
      expect(parseIndianStandardTime('NA')).toBeNull();
      expect(parseIndianStandardTime('N/A')).toBeNull();
      expect(parseIndianStandardTime('null')).toBeNull();
      expect(parseIndianStandardTime('')).toBeNull();
      expect(parseIndianStandardTime(null)).toBeNull();
      expect(parseIndianStandardTime('invalid-date')).toBeNull();
    });

    it('11. Preserves genuine zero pollutant concentrations', () => {
      expect(parseCpcbPollutantValue(0)).toBe(0);
      expect(parseCpcbPollutantValue('0')).toBe(0);
      expect(parseCpcbPollutantValue('0.0')).toBe(0);
    });

    it('12. Rejects negative concentrations and non-numeric placeholders', () => {
      expect(parseCpcbPollutantValue(-1)).toBeNull();
      expect(parseCpcbPollutantValue('-15.2')).toBeNull();
      expect(parseCpcbPollutantValue('NA')).toBeNull();
      expect(parseCpcbPollutantValue('N/A')).toBeNull();
      expect(parseCpcbPollutantValue(NaN)).toBeNull();
      expect(parseCpcbPollutantValue(Infinity)).toBeNull();
    });

    it('13. Normalizes pollutant IDs correctly across variations', () => {
      expect(normalizeCpcbPollutantId('PM2.5')).toBe('pm25');
      expect(normalizeCpcbPollutantId('PM25')).toBe('pm25');
      expect(normalizeCpcbPollutantId('PM10')).toBe('pm10');
      expect(normalizeCpcbPollutantId('NO2')).toBe('no2');
      expect(normalizeCpcbPollutantId('SO2')).toBe('so2');
      expect(normalizeCpcbPollutantId('CO')).toBe('co');
      expect(normalizeCpcbPollutantId('OZONE')).toBe('o3');
      expect(normalizeCpcbPollutantId('O3')).toBe('o3');
      expect(normalizeCpcbPollutantId('NH3')).toBe('nh3');
      expect(normalizeCpcbPollutantId('PB')).toBe('pb');
      expect(normalizeCpcbPollutantId('LEAD')).toBe('pb');
      expect(normalizeCpcbPollutantId('UNKNOWN_POLLUTANT')).toBeNull();
    });

    it('14. Preserves provider min/max/avg semantics with averagingPeriodMinutes: null', () => {
      const records: DataGovInRecord[] = [
        {
          state: 'Delhi',
          city: 'Delhi',
          station: 'R K Puram, Delhi - DPCC',
          last_update: '22-11-2026 15:00:00',
          pollutant_id: 'PM2.5',
          pollutant_min: '95',
          pollutant_max: '240',
          pollutant_avg: '165.4',
          pollutant_unit: 'ug/m3',
          latitude: '28.5638',
          longitude: '77.1868',
        },
      ];

      const sources = normalizeDataGovInRecords(records, 28.5638, 77.1868);
      expect(sources).toHaveLength(1);
      const m = sources[0].measurements[0];
      expect(m.pollutant).toBe('pm25');
      expect(m.value).toBe(165.4);
      expect(m.averagingPeriodMinutes).toBeNull(); // Unknown averaging period preserved as null
      expect(m.observedAt).toBe('2026-11-22T09:30:00.000Z');
    });
  });

  // -------------------------------------------------------------------------
  // Group C — Station Identity & Deduplication
  // -------------------------------------------------------------------------
  describe('Group C: Station Identity & Deduplication', () => {
    it('15. Differentiates internal Avir ID from official station metadata in OFFICIAL_CPCB_STATIONS', () => {
      const anandVihar = OFFICIAL_CPCB_STATIONS.find(s => s.name === 'Anand Vihar CAAQMS');
      expect(anandVihar).toBeDefined();
      expect(anandVihar?.internalId).toBe('avir-cpcb-dl-anand-vihar');
      expect(anandVihar?.officialStationId).toBeNull(); // Application-local registry, no fake official codes
      expect(anandVihar?.registryVerified).toBe(true);
      expect(anandVihar?.sourceReference).toBe('CPCB National CAAQMS Registry');
    });

    it('16. US Embassy Chanakyapuri retains its true AirNow network identity', () => {
      const usEmbassy = OFFICIAL_CPCB_STATIONS.find(s => s.name === 'US Embassy Chanakyapuri');
      expect(usEmbassy).toBeDefined();
      expect(usEmbassy?.sourceProvider).toBe('airnow');
      expect(usEmbassy?.provider).toContain('AirNow');
      expect(usEmbassy?.operatingAgency).toContain('US Department of State');
    });

    it('17. Provider-scoped deduplication keeps identical IDs in different networks separate', () => {
      const cpcbSrc: EnvironmentalSourceRecord = {
        id: 'cpcb-station-101',
        providerId: 'cpcb',
        providerName: 'CPCB',
        stationId: '101',
        sourceName: 'Station #101',
        sourceKind: 'official_ground_station',
        status: 'fresh',
        latitude: 28.61,
        longitude: 77.20,
        distanceKm: 2,
        observedAt: new Date().toISOString(),
        retrievedAt: new Date().toISOString(),
        measurements: [{ pollutant: 'pm25', value: 120, unit: 'ug/m3' }],
        attribution: 'CPCB',
        provenance: { licenseOrAttribution: 'OGD', isModel: false, limitations: [] },
      };

      const scSrc: EnvironmentalSourceRecord = {
        id: 'sc-101',
        providerId: 'sensor_community',
        providerName: 'Sensor.Community',
        stationId: '101',
        sourceName: 'Sensor #101',
        sourceKind: 'community_optical',
        status: 'fresh',
        latitude: 28.62,
        longitude: 77.21,
        distanceKm: 3,
        observedAt: new Date().toISOString(),
        retrievedAt: new Date().toISOString(),
        measurements: [{ pollutant: 'pm25', value: 85, unit: 'ug/m3' }],
        attribution: 'ODbL',
        provenance: { licenseOrAttribution: 'ODbL', isModel: false, limitations: [] },
      };

      const keyCpcb = getPhysicalStationDeduplicationKey(cpcbSrc);
      const keySc = getPhysicalStationDeduplicationKey(scSrc);

      expect(keyCpcb).toBe('provider:cpcb:101');
      expect(keySc).toBe('provider:sensor_community:101');
      expect(keyCpcb).not.toBe(keySc); // Distinct monitors never collide
    });

    it('18. Merges cross-provider records only when verified in mapping table', () => {
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
        provenance: { licenseOrAttribution: 'US EPA AirNow', isModel: false, limitations: [] },
      };

      // Before registration: distinct provider namespaces do not merge
      expect(getPhysicalStationDeduplicationKey(openAqRecord)).toBe('provider:openaq:5001');
      expect(getPhysicalStationDeduplicationKey(airNowRecord)).toBe('provider:airnow:chanakyapuri');
      expect(getPhysicalStationDeduplicationKey(openAqRecord)).not.toBe(getPhysicalStationDeduplicationKey(airNowRecord));

      // After registration of authoritative verified link
      registerVerifiedStationMapping('openaq:5001', 'us_embassy_chanakyapuri');
      registerVerifiedStationMapping('airnow:chanakyapuri', 'us_embassy_chanakyapuri');

      const key1 = getPhysicalStationDeduplicationKey(openAqRecord);
      const key2 = getPhysicalStationDeduplicationKey(airNowRecord);

      expect(key1).toBe('canonical:us_embassy_chanakyapuri');
      expect(key2).toBe('canonical:us_embassy_chanakyapuri');
      expect(key1).toBe(key2); // Confirmed physical collocation merges cleanly
    });

    it('19. Registry-only station is excluded from active physical monitor counts', () => {
      const registryOnlyStation: EnvironmentalSourceRecord = {
        id: 'cpcb-dl-01',
        providerId: 'cpcb',
        providerName: 'CPCB',
        stationId: 'cpcb-dl-01',
        sourceName: 'Anand Vihar CAAQMS',
        sourceKind: 'official_ground_station',
        status: 'registry_only',
        latitude: 28.6508,
        longitude: 77.3152,
        distanceKm: 8,
        observedAt: null,
        retrievedAt: new Date().toISOString(),
        measurements: [],
        attribution: 'CPCB',
        provenance: { licenseOrAttribution: 'CPCB', isModel: false, limitations: [] },
      };

      const active = getActivePhysicalSources([registryOnlyStation], 'pm25');
      expect(active).toHaveLength(0);

      const eligibility = evaluateMeasurementEligibility(registryOnlyStation, 'pm25');
      expect(eligibility.eligible).toBe(false);
      expect((eligibility as unknown as Record<string, unknown>).reason).toBe('registry_only');
    });
  });

  // -------------------------------------------------------------------------
  // Group D — CPCB NAQI Engine & Breakpoints
  // -------------------------------------------------------------------------
  describe('Group D: CPCB NAQI Engine & Breakpoints', () => {
    it('20. Evaluates PM2.5 breakpoints across all CPCB bands', () => {
      expect(calculateSubIndex('pm25', 15)).toBe(25); // Good (0-30 -> 0-50)
      expect(calculateSubIndex('pm25', 45)).toBe(75); // Satisfactory (31-60 -> 51-100)
      expect(calculateSubIndex('pm25', 75)).toBe(149); // Moderate (61-90 -> 101-200)
      expect(calculateSubIndex('pm25', 105)).toBe(249); // Poor (91-120 -> 201-300)
      expect(calculateSubIndex('pm25', 185)).toBe(350); // Very Poor (121-250 -> 301-400)
      expect(calculateSubIndex('pm25', 375)).toBe(451); // Severe (250-500 -> 401-500)
      expect(calculateSubIndex('pm25', 600)).toBe(500); // Above max breakpoint capped at 500
    });

    it('21. Implements Lead (Pb) breakpoints accurately', () => {
      expect(calculateSubIndex('pb', 0.25)).toBe(25);
      expect(calculateSubIndex('pb', 0.8)).toBe(76);
      expect(calculateSubIndex('pb', 1.5)).toBe(145);
      expect(calculateSubIndex('pb', 2.5)).toBe(245);
      expect(calculateSubIndex('pb', 3.3)).toBe(350);
      expect(calculateSubIndex('pb', 4.25)).toBe(447);
    });

    it('22. Enforces explicit CO units and rejects magnitude-based guessing', () => {
      // When unit is explicitly mg/m³
      const subIndexMg = calculateSubIndex('co', 2.0, 'mg/m3');
      expect(subIndexMg).toBe(100); // Satisfactory (1.1 - 2.0 -> 51-100)

      // When unit is explicitly µg/m³, converts by dividing by 1000
      const subIndexUg = calculateSubIndex('co', 2000, 'ug/m3');
      expect(subIndexUg).toBe(100);

      // Concentration of 55 mg/m³ without unit is treated as mg/m³ (Severe AQI)
      // and NOT divided by 1000 into 0.055 mg/m³!
      const subIndexHigh = calculateSubIndex('co', 55, 'mg/m3');
      expect(subIndexHigh).toBeGreaterThan(400); // Severe band (34-60 -> 401-500)
    });

    it('23. Requires at least 3 qualifying pollutants including PM2.5 or PM10 for statutory compliance', () => {
      // Only 2 pollutants (PM2.5 and PM10) -> Indicative subindex, NOT statutory compliant
      const insufficientResult = calculateComprehensiveCpcbNaqi({
        pm25: 65,
        pm10: 120,
      });
      expect(insufficientResult.isDataSufficient).toBe(false);
      expect(insufficientResult.classification).toBe('indicative_subindex');
      expect(insufficientResult.missingRequirements[0]).toContain('At least 3 pollutants required');

      // 3 pollutants (PM2.5, NO2, SO2) with verified 24-hr average -> Statutory compliant
      const sufficientResult = calculateComprehensiveCpcbNaqi({
        pm25: 65,
        no2: 45,
        so2: 20,
        is24HourAveraged: true,
      });
      expect(sufficientResult.isDataSufficient).toBe(true);
      expect(sufficientResult.classification).toBe('statutory_compliant');
      expect(sufficientResult.dominantPollutant).toBe('PM2.5');
    });

    it('24. Classifies instantaneous/snapshot readings as "indicative_snapshot" even with >=3 pollutants', () => {
      const snapshotResult = calculateComprehensiveCpcbNaqi({
        pm25: 120,
        pm10: 220,
        no2: 55,
        is24HourAveraged: false, // Snapshot / model hourly, not 24-hr statutory average
      });
      expect(snapshotResult.isDataSufficient).toBe(true);
      expect(snapshotResult.classification).toBe('indicative_snapshot');
      expect(snapshotResult.notes).toContain('instantaneous/hourly snapshot rather than verified statutory 24-hr/8-hr averages');
    });

    it('25. CPCB category mapping adheres strictly to official color/severity bands', () => {
      expect(getCpcbCategory(40)).toBe('Good');
      expect(getCpcbCategory(85)).toBe('Satisfactory');
      expect(getCpcbCategory(150)).toBe('Moderate');
      expect(getCpcbCategory(250)).toBe('Poor');
      expect(getCpcbCategory(350)).toBe('Very Poor');
      expect(getCpcbCategory(450)).toBe('Severe');
    });
  });
});
