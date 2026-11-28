/**
 * AVIR — Step 4 Integration Test Suite: Official CPCB/CAAQMS Ground Stations & UI
 * 
 * Verifies Phase K test groups:
 * - Group E: Application integration, canonical pipeline, route handling, and UI inspector
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import ReactDOMServer from 'react-dom/server';
import { NextRequest } from 'next/server';
import { GET as cpcbRouteHandler } from '@/app/api/telemetry/cpcb/route';
import { MultiSourceInspectorModal } from '@/components/MultiSourceInspectorModal';
import {
  EnvironmentalSourceRecord,
  AtmosphericMetrics,
} from '@/domain/types';
import {
  deduplicateEnvironmentalSources,
  compareEnvironmentalSources,
} from '@/domain/source-comparison';

describe('AVIR Step 4: Official Ground Station Integration & Inspector UI', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // Group E.1 — API Route Handler (/api/telemetry/cpcb)
  // -------------------------------------------------------------------------
  describe('Group E.1: /api/telemetry/cpcb API Route Handler', () => {
    it('26. Returns 400 when lat is provided without lon', async () => {
      const req = new NextRequest('http://localhost:3000/api/telemetry/cpcb?lat=28.6139');
      const res = await cpcbRouteHandler(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain('Both "lat" and "lon" query parameters must be provided together');
    });

    it('27. Returns 400 for invalid coordinates or non-numeric strings', async () => {
      const req = new NextRequest('http://localhost:3000/api/telemetry/cpcb?lat=95.0&lon=77.2090');
      const res = await cpcbRouteHandler(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain('Invalid latitude');
    });

    it('28. Returns 400 for radius exceeding maximum allowed bounds (50 km)', async () => {
      const req = new NextRequest('http://localhost:3000/api/telemetry/cpcb?lat=28.6139&lon=77.2090&radius=100');
      const res = await cpcbRouteHandler(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain('Invalid radius');
    });

    it('29. When unconfigured, returns 200 with status "not_configured" and Cache-Control headers', async () => {
      delete process.env.DATA_GOV_IN_API_KEY;
      const req = new NextRequest('http://localhost:3000/api/telemetry/cpcb?lat=28.6139&lon=77.2090');
      const res = await cpcbRouteHandler(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.provider).toBe('cpcb');
      expect(json.status).toBe('not_configured');
      expect(json.sources).toHaveLength(0);
      expect(json.activeStationCount).toBe(0);
      expect(res.headers.get('Cache-Control')).toContain('public, s-maxage=300');
    });
  });

  // -------------------------------------------------------------------------
  // Group E.2 — Canonical Pipeline Integration & Comparison Engine
  // -------------------------------------------------------------------------
  describe('Group E.2: Canonical Pipeline Integration & Comparison Engine', () => {
    it('30. Official government records integrate into allEnvironmentalSources and are classified correctly', () => {
      const officialStation: EnvironmentalSourceRecord = {
        id: 'cpcb-anand-vihar',
        providerId: 'cpcb',
        providerName: 'Central Pollution Control Board (CPCB)',
        stationId: 'Anand Vihar, Delhi - DPCC',
        sourceName: 'Anand Vihar, Delhi - DPCC (8.5km)',
        name: 'Anand Vihar, Delhi - DPCC',
        sourceKind: 'official_ground_station',
        status: 'fresh',
        latitude: 28.6508,
        longitude: 77.3152,
        distanceKm: 8.5,
        observedAt: new Date().toISOString(),
        retrievedAt: new Date().toISOString(),
        measurements: [
          { pollutant: 'pm25', value: 245, unit: 'ug/m3', averagingPeriodMinutes: 60, observedAt: new Date().toISOString() },
          { pollutant: 'pm10', value: 380, unit: 'ug/m3', averagingPeriodMinutes: 60, observedAt: new Date().toISOString() },
          { pollutant: 'no2', value: 65, unit: 'ug/m3', averagingPeriodMinutes: 60, observedAt: new Date().toISOString() },
        ],
        attribution: 'CPCB Open Data',
        provenance: { licenseOrAttribution: 'OGD', isModel: false, limitations: [] },
      };

      const modelRecord: EnvironmentalSourceRecord = {
        id: 'model-open-meteo-delhi',
        providerId: 'open_meteo',
        providerName: 'Open-Meteo',
        sourceName: 'Open-Meteo Atmospheric Grid',
        sourceKind: 'atmospheric_model',
        status: 'fresh',
        latitude: 28.6139,
        longitude: 77.2090,
        distanceKm: 0,
        observedAt: new Date().toISOString(),
        retrievedAt: new Date().toISOString(),
        validAt: new Date().toISOString(),
        measurements: [
          { pollutant: 'pm25', value: 160, unit: 'ug/m3', averagingPeriodMinutes: 60, validAt: new Date().toISOString() },
        ],
        attribution: 'Open-Meteo',
        provenance: { licenseOrAttribution: 'Open-Meteo', isModel: true, limitations: [] },
      };

      const combined = deduplicateEnvironmentalSources([modelRecord, officialStation]);
      expect(combined).toHaveLength(2);

      const officialFound = combined.find(s => s.sourceKind === 'official_ground_station');
      expect(officialFound).toBeDefined();
      expect(officialFound?.id).toBe('cpcb-anand-vihar');

      // Inter-source comparison produces Mode C (Comparable) between official ground monitor and regional model
      const comparison = compareEnvironmentalSources(combined, 'pm25');
      expect(comparison.mode).toBe('mode_c_comparable');
      expect(comparison.absoluteDifferenceUgM3).toBe(85); // 245 - 160 = 85
    });

    it('31. Failed or missing official ground data does not break model comparison (falls back to Mode A)', () => {
      const modelRecord: EnvironmentalSourceRecord = {
        id: 'model-open-meteo-delhi',
        providerId: 'open_meteo',
        providerName: 'Open-Meteo',
        sourceName: 'Open-Meteo Atmospheric Grid',
        sourceKind: 'atmospheric_model',
        status: 'fresh',
        latitude: 28.6139,
        longitude: 77.2090,
        distanceKm: 0,
        observedAt: new Date().toISOString(),
        retrievedAt: new Date().toISOString(),
        validAt: new Date().toISOString(),
        measurements: [
          { pollutant: 'pm25', value: 160, unit: 'ug/m3', averagingPeriodMinutes: 60, validAt: new Date().toISOString() },
        ],
        attribution: 'Open-Meteo',
        provenance: { licenseOrAttribution: 'Open-Meteo', isModel: true, limitations: [] },
      };

      const comparison = compareEnvironmentalSources([modelRecord], 'pm25');
      expect(comparison.mode).toBe('mode_a_single_source');
      expect(comparison.sourcesCompared).toHaveLength(1);
      expect(comparison.absoluteDifferenceUgM3).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Group E.3 — UI Inspector Modal Rendering
  // -------------------------------------------------------------------------
  describe('Group E.3: UI Inspector Modal Rendering & Integrity', () => {
    it('32. Renders Official Government Ground Monitoring subsection with real station values', () => {
      const nowIso = new Date().toISOString();
      const officialStation: EnvironmentalSourceRecord = {
        id: 'cpcb-ito-delhi',
        providerId: 'cpcb',
        providerName: 'CPCB',
        stationId: 'ITO Intersection CAAQMS',
        sourceName: 'ITO Intersection CAAQMS (4.2km)',
        name: 'ITO Intersection CAAQMS',
        sourceKind: 'official_ground_station',
        status: 'fresh',
        latitude: 28.6317,
        longitude: 77.2494,
        distanceKm: 4.2,
        observedAt: nowIso,
        retrievedAt: nowIso,
        measurements: [
          { pollutant: 'pm25', value: 215.4, unit: 'ug/m3', observedAt: nowIso },
          { pollutant: 'pm10', value: 340.2, unit: 'ug/m3', observedAt: nowIso },
        ],
        attribution: 'Central Pollution Control Board',
        provenance: {
          network: 'CPCB / DPCC',
          licenseOrAttribution: 'OGD Platform India',
          isModel: false,
          limitations: ['Official regulatory reference station'],
        },
      };

      const metrics: AtmosphericMetrics = {
        pm25: 215,
        pm10: 340,
        usAqi: 265,
        cpcbAqi: 375,
        cpcbStatus: 'indicative_snapshot',
        boundaryLayerHeight: 320,
        temperature: 18,
        humidity: 65,
        windSpeed: 4.5,
        isThermalInversionActive: false,
        isLive: true,
        status: 'success',
        provenance: 'observed',
        retrievedAt: nowIso,
        timezone: 'Asia/Kolkata',
        timestamp: nowIso,
      };

      const html = ReactDOMServer.renderToStaticMarkup(
        <MultiSourceInspectorModal
          isOpen={true}
          onClose={() => {}}
          cityName="Delhi"
          environmentalSources={[officialStation]}
          metrics={metrics}
        />
      );

      // Verifies UI contents
      expect(html).toContain('Official Government Ground Monitoring (CPCB / CAAQMS / State PCBs)');
      expect(html).toContain('ITO Intersection CAAQMS');
      expect(html).toContain('215.4 µg/m³ PM2.5');
      expect(html).toContain('340.2 µg/m³ PM10');
      expect(html).toContain('Indicative Snapshot');
      expect(html).toContain('CPCB / DPCC');
    });

    it('33. Renders honest "Registry Verified & Awaiting Continuous Stream" state for unstreamed registry monitors', () => {
      const registryStation: EnvironmentalSourceRecord = {
        id: 'cpcb-bkc-mumbai',
        providerId: 'cpcb',
        providerName: 'CPCB / MPCB',
        stationId: 'cpcb-mh-01',
        sourceName: 'Bandra Kurla Complex CAAQMS (6.1km)',
        name: 'Bandra Kurla Complex CAAQMS',
        sourceKind: 'official_ground_station',
        status: 'registry_only',
        latitude: 19.0664,
        longitude: 72.8687,
        distanceKm: 6.1,
        observedAt: null,
        retrievedAt: new Date().toISOString(),
        measurements: [],
        attribution: 'CPCB / MPCB',
        provenance: {
          network: 'Maharashtra Pollution Control Board',
          licenseOrAttribution: 'CPCB',
          isModel: false,
          limitations: ['Official regulatory reference station'],
        },
      };

      const html = ReactDOMServer.renderToStaticMarkup(
        <MultiSourceInspectorModal
          isOpen={true}
          onClose={() => {}}
          cityName="Mumbai"
          environmentalSources={[registryStation]}
          metrics={{
            pm25: 75,
            pm10: 120,
            usAqi: 161,
            boundaryLayerHeight: 450,
            temperature: 28,
            humidity: 70,
            windSpeed: 3.2,
            isThermalInversionActive: false,
        isLive: true,
        status: 'success',
            provenance: 'modeled_forecast',
            retrievedAt: new Date().toISOString(),
            timezone: 'Asia/Kolkata',
            timestamp: new Date().toISOString(),
          }}
        />
      );

      expect(html).toContain('Bandra Kurla Complex CAAQMS');
      expect(html).toContain('Registry Verified');
      expect(html).toContain('Awaiting Continuous Stream');
    });

    it('34. Renders "No Station in Range" message when no official ground monitors are available for city', () => {
      const modelOnly: EnvironmentalSourceRecord = {
        id: 'model-open-meteo',
        providerId: 'open_meteo',
        providerName: 'Open-Meteo',
        sourceName: 'Open-Meteo Regional Grid',
        sourceKind: 'atmospheric_model',
        status: 'fresh',
        latitude: 15.0,
        longitude: 65.0,
        distanceKm: 0,
        observedAt: new Date().toISOString(),
        retrievedAt: new Date().toISOString(),
        measurements: [{ pollutant: 'pm25', value: 45, unit: 'ug/m3' }],
        attribution: 'Open-Meteo',
        provenance: { licenseOrAttribution: 'Open-Meteo', isModel: true, limitations: [] },
      };

      const html = ReactDOMServer.renderToStaticMarkup(
        <MultiSourceInspectorModal
          isOpen={true}
          onClose={() => {}}
          cityName="Remote Location"
          environmentalSources={[modelOnly]}
          metrics={{
            pm25: 45,
            pm10: 80,
            usAqi: 124,
            boundaryLayerHeight: 600,
            temperature: 24,
            humidity: 45,
            windSpeed: 5.1,
            isThermalInversionActive: false,
        isLive: true,
        status: 'success',
            provenance: 'modeled_forecast',
            retrievedAt: new Date().toISOString(),
            timezone: 'Asia/Kolkata',
            timestamp: new Date().toISOString(),
          }}
        />
      );

      expect(html).toContain('No official CPCB / CAAQMS reference monitors located within 35 km');
    });
  });
});
