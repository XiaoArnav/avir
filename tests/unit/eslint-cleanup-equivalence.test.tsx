import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  estimateHepaLifespan,
  getSchoolSportsAdvisory,
} from '@/domain/advanced-air-math';
import {
  convertGroundStationToSourceRecord,
  type GroundStationMetadata,
} from '@/services/ground-station-service';
import { HardwareDeviceService } from '@/services/device-telemetry-service';
import { SatelliteComparisonSlider } from '@/components/environment/SatelliteComparisonSlider';
import { buildSatelliteComparison } from '@/services/environment/satellite-imagery-service';

// Minimal Node DOM helper for testing React client SatelliteComparisonSlider events
class MockNode {
  nodeType: number;
  childNodes: MockNode[] = [];
  parentNode: MockNode | null = null;
  constructor(nodeType: number) {
    this.nodeType = nodeType;
  }
  get textContent(): string {
    return this.childNodes.map((c) => c.textContent).join('');
  }
  set textContent(val: string) {
    this.childNodes = val ? [new MockTextNode(val)] : [];
  }
}

class MockTextNode extends MockNode {
  nodeValue: string;
  constructor(text: string) {
    super(3);
    this.nodeValue = text;
  }
  get textContent(): string {
    return this.nodeValue;
  }
  set textContent(val: string) {
    this.nodeValue = val;
  }
}

class MockElement extends MockNode {
  tagName: string;
  nodeName: string;
  namespaceURI = 'http://www.w3.org/1999/xhtml';
  ownerDocument: MockDocument;
  attributes: Record<string, string> = {};
  style: Record<string, string> = {};
  dataset: Record<string, string> = {};
  className = '';
  src = '';
  complete = false;
  naturalWidth = 0;

  constructor(tag: string, ownerDocument: MockDocument) {
    super(1);
    this.tagName = tag.toUpperCase();
    this.nodeName = this.tagName;
    this.ownerDocument = ownerDocument;
  }

  appendChild<T extends MockNode>(child: T): T {
    if (child.parentNode && child.parentNode !== this) {
      const idx = child.parentNode.childNodes.indexOf(child);
      if (idx >= 0) child.parentNode.childNodes.splice(idx, 1);
    }
    child.parentNode = this;
    this.childNodes.push(child);
    return child;
  }

  insertBefore<T extends MockNode>(child: T, refChild: MockNode | null): T {
    if (!refChild) return this.appendChild(child);
    child.parentNode = this;
    const idx = this.childNodes.indexOf(refChild);
    if (idx >= 0) this.childNodes.splice(idx, 0, child);
    else this.childNodes.push(child);
    return child;
  }

  removeChild<T extends MockNode>(child: T): T {
    const idx = this.childNodes.indexOf(child);
    if (idx >= 0) this.childNodes.splice(idx, 1);
    child.parentNode = null;
    return child;
  }

  setAttribute(k: string, v: string): void {
    this.attributes[k] = String(v);
    if (k === 'class') this.className = String(v);
    if (k === 'src') this.src = String(v);
  }

  getAttribute(k: string): string | null {
    return Object.prototype.hasOwnProperty.call(this.attributes, k) ? this.attributes[k] : null;
  }

  removeAttribute(k: string): void {
    delete this.attributes[k];
  }

  addEventListener(): void {}
  removeEventListener(): void {}
  contains(): boolean {
    return false;
  }
  getBoundingClientRect() {
    return { top: 0, left: 100, right: 900, bottom: 384, width: 800, height: 384, x: 100, y: 0, toJSON: () => ({}) };
  }
  setPointerCapture(): void {}
  hasPointerCapture(): boolean {
    return false;
  }
  releasePointerCapture(): void {}

  findAll(predicate: (el: MockElement) => boolean): MockElement[] {
    const out: MockElement[] = [];
    const visit = (node: MockNode) => {
      if (node instanceof MockElement) {
        if (predicate(node)) out.push(node);
        for (const c of node.childNodes) visit(c);
      }
    };
    for (const c of this.childNodes) visit(c);
    return out;
  }
}

class MockDocument {
  nodeType = 9;
  nodeName = '#document';
  activeElement: MockElement | null = null;
  defaultView = globalThis;
  body: MockElement;
  documentElement: MockElement;

  constructor() {
    this.body = new MockElement('body', this);
    this.documentElement = new MockElement('html', this);
    this.documentElement.appendChild(this.body);
  }

  createElement(tag: string): MockElement {
    return new MockElement(tag, this);
  }
  createElementNS(_ns: string, tag: string): MockElement {
    return new MockElement(tag, this);
  }
  createTextNode(text: string): MockTextNode {
    return new MockTextNode(text);
  }
  createComment(text: string): MockNode {
    const n = new MockNode(8);
    (n as unknown as { nodeValue: string }).nodeValue = text;
    return n;
  }
  addEventListener(): void {}
  removeEventListener(): void {}
}

function getReactProps(el: MockElement): Record<string, unknown> {
  for (const key of Object.keys(el)) {
    if (key.startsWith('__reactProps$')) {
      return (el as unknown as Record<string, Record<string, unknown>>)[key] || {};
    }
  }
  return {};
}

describe('Step 7 ESLint Cleanup Behavioral Equivalence Regression Suite', () => {
  describe('Phase 2: Advanced Air Math Exact Equivalence', () => {
    it('estimateHepaLifespan produces identical results across boundaries and dailyRunningHours arguments', () => {
      const inputs: Array<[number, number | undefined]> = [
        [0, undefined],
        [15, 8],
        [40, 12],
        [120, 12],
        [121, 16],
        [250, 24],
        [251, 24],
        [500, 12],
        [NaN, 12],
      ];

      const outputs = inputs.map(([pm25, hrs]) =>
        hrs === undefined ? estimateHepaLifespan(pm25) : estimateHepaLifespan(pm25, hrs)
      );

      expect(outputs).toEqual([
        {
          preFilterCleanDays: 30,
          mainHepaReplaceMonths: 12,
          estimatedRemainingPercent: 100,
          summary:
            'At current 15 µg/m³ ambient air, vacuum pre-filter mesh every 30 days; replace primary HEPA element in ~12 months.',
        },
        {
          preFilterCleanDays: 30,
          mainHepaReplaceMonths: 12,
          estimatedRemainingPercent: 100,
          summary:
            'At current 15 µg/m³ ambient air, vacuum pre-filter mesh every 30 days; replace primary HEPA element in ~12 months.',
        },
        {
          preFilterCleanDays: 30,
          mainHepaReplaceMonths: 12,
          estimatedRemainingPercent: 100,
          summary:
            'At current 40 µg/m³ ambient air, vacuum pre-filter mesh every 30 days; replace primary HEPA element in ~12 months.',
        },
        {
          preFilterCleanDays: 30,
          mainHepaReplaceMonths: 4,
          estimatedRemainingPercent: 33,
          summary:
            'At current 120 µg/m³ ambient air, vacuum pre-filter mesh every 30 days; replace primary HEPA element in ~4 months.',
        },
        {
          preFilterCleanDays: 14,
          mainHepaReplaceMonths: 4,
          estimatedRemainingPercent: 33,
          summary:
            'At current 121 µg/m³ ambient air, vacuum pre-filter mesh every 14 days; replace primary HEPA element in ~4 months.',
        },
        {
          preFilterCleanDays: 14,
          mainHepaReplaceMonths: 2.5,
          estimatedRemainingPercent: 21,
          summary:
            'At current 250 µg/m³ ambient air, vacuum pre-filter mesh every 14 days; replace primary HEPA element in ~2.5 months.',
        },
        {
          preFilterCleanDays: 7,
          mainHepaReplaceMonths: 2.5,
          estimatedRemainingPercent: 21,
          summary:
            'At current 251 µg/m³ ambient air, vacuum pre-filter mesh every 7 days; replace primary HEPA element in ~2.5 months.',
        },
        {
          preFilterCleanDays: 7,
          mainHepaReplaceMonths: 2.5,
          estimatedRemainingPercent: 21,
          summary:
            'At current 500 µg/m³ ambient air, vacuum pre-filter mesh every 7 days; replace primary HEPA element in ~2.5 months.',
        },
        {
          preFilterCleanDays: 30,
          mainHepaReplaceMonths: NaN,
          estimatedRemainingPercent: NaN,
          summary:
            'At current NaN µg/m³ ambient air, vacuum pre-filter mesh every 30 days; replace primary HEPA element in ~NaN months.',
        },
      ]);

      // Reserved dailyRunningHours preserves backward-compatible output independence
      expect(estimateHepaLifespan(180, 4)).toEqual(estimateHepaLifespan(180, 24));
    });

    it('getSchoolSportsAdvisory produces exact outputs across all AQI thresholds and PM2.5 inputs', () => {
      expect(getSchoolSportsAdvisory(0, 0).status).toBe('safe');
      expect(getSchoolSportsAdvisory(50, 12)).toEqual({
        status: 'safe',
        statusLabel: 'Safe for All School Outdoor Activities',
        morningAssemblyAction: 'Permitted Outdoors',
        highExertionSportsAction: 'Permitted',
        recessAction: 'Normal',
        pediatricVulnerabilityNote:
          'Clean atmospheric conditions; normal physical education schedules permitted.',
      });
      expect(getSchoolSportsAdvisory(51, 15).status).toBe('caution');
      expect(getSchoolSportsAdvisory(150, 60)).toEqual({
        status: 'caution',
        statusLabel: 'Moderate Air - Sensitive Children Monitor',
        morningAssemblyAction: 'Permitted Outdoors',
        highExertionSportsAction: 'Low Intensity Only',
        recessAction: 'Normal',
        pediatricVulnerabilityNote:
          'Children with known pediatric asthma should carry quick-relief inhalers.',
      });
      expect(getSchoolSportsAdvisory(151, 80).status).toBe('restricted');
      expect(getSchoolSportsAdvisory(250, 180)).toEqual({
        status: 'restricted',
        statusLabel: 'Unhealthy for Children - Outdoor Restrictions Active',
        morningAssemblyAction: 'Move Indoors / Cancel',
        highExertionSportsAction: 'Strictly Prohibited Outdoors',
        recessAction: 'Supervised Indoor Games',
        pediatricVulnerabilityNote:
          'Developing child alveolar tissue absorbs 50% more particulate matter per kg of body weight than adults.',
      });
      expect(getSchoolSportsAdvisory(251, 200)).toEqual({
        status: 'hazardous',
        statusLabel: 'Severe Smog Emergency - Total Outdoor Sports Ban',
        morningAssemblyAction: 'Move Indoors / Cancel',
        highExertionSportsAction: 'Strictly Prohibited Outdoors',
        recessAction: 'Enclosed Hall Only',
        pediatricVulnerabilityNote:
          'Direct threat of acute bronchospasm and systemic inflammation. Keep classroom windows closed and run air filtration.',
      });
      // Reserved pm25 parameter preserves AQI-only threshold behavior
      expect(getSchoolSportsAdvisory(200, 10)).toEqual(getSchoolSportsAdvisory(200, 500));
    });
  });

  describe('Phase 4: Ground Station Record Conversion Exact Equivalence', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-11-28T10:00:00.000Z'));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    const baseOfficial: GroundStationMetadata = {
      stationId: 'cpcb-101',
      stationName: 'Anand Vihar CPCB',
      distanceKm: 1.8,
      latitude: 28.6468,
      longitude: 77.3164,
      provider: 'CPCB CAAQMS',
      stationType: 'official_reference',
      stationState: 'live_observation',
      lastUpdated: '2026-11-28T09:30:00Z',
      observedAt: '2026-11-28T09:30:00Z',
      retrievedAt: '2026-11-28T09:35:00Z',
      pm25: 210.34,
      pm10: 345.67,
      isCalibrated: false,
    };

    it('matches exact SourceRecord outputs across official, community, registry-only, missing PM2.5, calibrated, uncalibrated, and optional coords', () => {
      // 1. Official ground station with optional targetLat/targetLon
      const officialWithCoords = convertGroundStationToSourceRecord(baseOfficial, 28.6139, 77.209);
      const officialWithoutCoords = convertGroundStationToSourceRecord(baseOfficial);
      expect(officialWithCoords).toEqual(officialWithoutCoords);
      expect(officialWithCoords.providerId).toBe('cpcb');
      expect(officialWithCoords.upstreamProviderId).toBe('cpcb_caaqms');
      expect(officialWithCoords.sourceKind).toBe('official_ground_station');
      expect(officialWithCoords.status).toBe('fresh');
      expect(officialWithCoords.measurements).toEqual([
        {
          pollutant: 'pm25',
          value: 210.3,
          unit: 'ug/m3',
          averagingPeriodMinutes: 60,
          observedAt: '2026-11-28T09:30:00Z',
          rawUncalibratedValue: null,
          calibrationApplied: null,
          qualityFlag: 'valid',
        },
        {
          pollutant: 'pm10',
          value: 345.7,
          unit: 'ug/m3',
          averagingPeriodMinutes: 60,
          observedAt: '2026-11-28T09:30:00Z',
          qualityFlag: 'valid',
        },
      ]);

      // 2 & 5. Community optical sensor (calibrated)
      const communityCalibrated: GroundStationMetadata = {
        ...baseOfficial,
        stationId: 'sc-202',
        stationName: 'Sensor.Community #202',
        provider: 'Sensor.Community',
        stationType: 'community_optical',
        rawPm25: 140,
        pm25: 92.4,
        pm10: 120.1,
        isCalibrated: true,
        calibrationFormula: 'EPA Barkjohn 2021',
      };
      const recCalibrated = convertGroundStationToSourceRecord(communityCalibrated, 28.6, 77.2);
      expect(recCalibrated.providerId).toBe('sensor_community');
      expect(recCalibrated.sourceKind).toBe('community_optical');
      expect(recCalibrated.measurements[0].qualityFlag).toBe('calibrated');
      expect(recCalibrated.measurements[0].calibrationApplied).toBe('EPA Barkjohn 2021');
      expect(recCalibrated.explanation).toContain('EPA Barkjohn 2021');

      // 6. Community optical sensor (uncalibrated)
      const recUncalibrated = convertGroundStationToSourceRecord({
        ...communityCalibrated,
        isCalibrated: false,
        calibrationFormula: undefined,
      });
      expect(recUncalibrated.measurements[0].qualityFlag).toBe('raw');
      expect(recUncalibrated.measurements[0].calibrationApplied).toBeNull();
      expect(recUncalibrated.explanation).toBeUndefined();

      // 3 & 4. Registry-only & missing PM2.5 observations
      const registryOnly: GroundStationMetadata = {
        ...baseOfficial,
        stationId: 'cpcb-reg-01',
        stationState: 'registry_only',
        pm25: null,
        pm10: null,
        observedAt: null,
        distanceKm: null,
      };
      const recRegistry = convertGroundStationToSourceRecord(registryOnly);
      expect(recRegistry.status).toBe('registry_only');
      expect(recRegistry.measurements).toEqual([]);
      expect(recRegistry.sourceName).toBe('Anand Vihar CPCB');
      expect(recRegistry.explanation).toContain('CAAQMS station verified');
      expect(recRegistry.ingestedAt).toBe('2026-11-28T10:00:00.000Z');
    });
  });

  describe('Phase 3: Device Telemetry fetchLocalWifiDevice Signature & Behavior Equivalence', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('preserves signature with optional AbortSignal and delegates to startLocalWifiMonitoring cleanly', async () => {
      const g = globalThis as unknown as { fetch: typeof fetch };
      const origFetch = g.fetch;
      g.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ pm25: 55, pm10: 90 }),
      }) as unknown as typeof fetch;

      try {
        const service = new HardwareDeviceService();
        const ac = new AbortController();
        ac.abort(); // Passed signal preserves API compatibility without altering monitoring lifecycle
        const res = await service.fetchLocalWifiDevice('192.168.1.42', ac.signal);
        expect(res.packet).not.toBeNull();
        expect(res.packet?.pm25).toBe(55);
        expect(res.packet?.source).toBe('local_wifi');
        await service.disconnect();
      } finally {
        g.fetch = origFetch;
      }
    });
  });

  describe('Phase 1: SatelliteComparisonSlider Interactive DOM & Event Equivalence', () => {
    let root: Root | null = null;
    let container: MockElement;
    const origDoc = (globalThis as unknown as Record<string, unknown>).document;
    const origWin = (globalThis as unknown as Record<string, unknown>).window;
    const origAct = (globalThis as unknown as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT;

    beforeEach(() => {
      const doc = new MockDocument();
      const g = globalThis as unknown as Record<string, unknown>;
      g.document = doc;
      g.window = globalThis;
      g.HTMLElement = MockElement;
      g.Element = MockElement;
      g.Node = MockNode;
      g.HTMLIFrameElement = class HTMLIFrameElement extends MockElement {};
      g.SVGElement = class SVGElement extends MockElement {};
      g.IS_REACT_ACT_ENVIRONMENT = true;
      g.addEventListener = () => {};
      g.removeEventListener = () => {};
      container = doc.createElement('div');
      doc.body.appendChild(container);
    });

    afterEach(() => {
      if (root) {
        React.act(() => {
          root?.unmount();
        });
        root = null;
      }
      const g = globalThis as unknown as Record<string, unknown>;
      g.document = origDoc;
      g.window = origWin;
      g.IS_REACT_ACT_ENVIRONMENT = origAct;
    });

    it('preserves native img rendering, clip-path geometry, load/error transitions, unavailable fallback, pointer dragging, and keyboard controls', async () => {
      const comparison = buildSatelliteComparison({
        city: 'Delhi NCR',
        latitude: 28.6139,
        longitude: 77.209,
        dateA: '2026-11-01',
        dateB: '2026-11-20',
        productA: 'VIIRS',
        productB: 'VIIRS',
        referenceNow: new Date('2026-11-25T05:00:00Z'),
      });

      root = createRoot(container as unknown as Element);
      await React.act(async () => {
        root!.render(React.createElement(SatelliteComparisonSlider, { comparison, initialPosition: 50 }));
      });

      // 1 & 3. Both native <img> elements render inside stacked aligned layers
      const imgs = container.findAll((el) => el.tagName === 'IMG');
      expect(imgs).toHaveLength(2);
      expect(imgs[0].getAttribute('src')).toBe(comparison.slotB.imageUrl);
      expect(imgs[1].getAttribute('src')).toBe(comparison.slotA.imageUrl);

      // 4. Initial clip-path at 50% and accessibility attributes preserved
      const viewport = container.findAll((el) => el.getAttribute('data-testid') === 'comparison-slider-viewport')[0];
      const layerA = container.findAll((el) => el.getAttribute('data-testid') === 'comparison-layer-a')[0];
      expect(layerA.style.clipPath).toBe('inset(0 50% 0 0)');
      expect(viewport.getAttribute('role')).toBe('slider');
      expect(viewport.getAttribute('aria-valuenow')).toBe('50');

      // 5. Loading indicators present while images load, cleared on onLoad
      expect(container.findAll((el) => el.getAttribute('data-testid') === 'slot-a-loading')).toHaveLength(1);
      expect(container.findAll((el) => el.getAttribute('data-testid') === 'slot-b-loading')).toHaveLength(1);

      await React.act(async () => {
        (getReactProps(imgs[0]).onLoad as () => void)();
        (getReactProps(imgs[1]).onLoad as () => void)();
      });
      expect(container.findAll((el) => el.getAttribute('data-testid') === 'slot-a-loading')).toHaveLength(0);
      expect(container.findAll((el) => el.getAttribute('data-testid') === 'slot-b-loading')).toHaveLength(0);

      // 2. Pointer drag moves divider and updates clip-path
      const vpProps = getReactProps(viewport);
      await React.act(async () => {
        (vpProps.onPointerDown as (e: unknown) => void)({
          pointerType: 'mouse',
          button: 0,
          pointerId: 1,
          clientX: 300,
          currentTarget: viewport,
        });
      });
      expect(viewport.getAttribute('aria-valuenow')).toBe('25');
      expect(layerA.style.clipPath).toBe('inset(0 75% 0 0)');

      await React.act(async () => {
        (vpProps.onPointerMove as (e: unknown) => void)({
          pointerId: 1,
          clientX: 700,
          currentTarget: viewport,
        });
      });
      expect(viewport.getAttribute('aria-valuenow')).toBe('75');
      expect(layerA.style.clipPath).toBe('inset(0 25% 0 0)');

      // 7. Keyboard navigation updates slider
      await React.act(async () => {
        (getReactProps(viewport).onKeyDown as (e: unknown) => void)({
          key: 'ArrowLeft',
          preventDefault: () => {},
        });
      });
      expect(viewport.getAttribute('aria-valuenow')).toBe('70');

      // 6. Failed image error triggers honest unavailable/failed fallback
      await React.act(async () => {
        (getReactProps(imgs[1]).onError as () => void)();
      });
      expect(container.findAll((el) => el.getAttribute('data-testid') === 'slot-a-fallback')).toHaveLength(1);
    });
  });
});
