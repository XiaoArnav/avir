import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { AtmosphericMetrics, LocationSelectionSource, RecommendationPlan } from '@/domain/types';
import type { GeocodedLocation } from '@/services/telemetry-service';
import type { SourcePreference } from '@/services/source-control/source-control-types';

const capturedEarthProps: {
  currentCity: GeocodedLocation | null;
  metrics: AtmosphericMetrics | null;
  isLoading: boolean;
  onSelectCity: ((loc: GeocodedLocation, source?: LocationSelectionSource) => void) | null;
  onRefreshTelemetry: (() => void) | null;
  onUpdateSourcePreference: ((pref: SourcePreference) => void) | null;
} = {
  currentCity: null,
  metrics: null,
  isLoading: true,
  onSelectCity: null,
  onRefreshTelemetry: null,
  onUpdateSourcePreference: null,
};

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (err: unknown) => void;
}

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const telemetryCalls: Array<{
  latitude: number;
  longitude: number;
  cityName?: string;
  signal?: AbortSignal;
  forceRefresh?: boolean;
  deferred: Deferred<AtmosphericMetrics>;
}> = [];

const planMock = vi.fn(async () => ({
  summary: 'Mock plan',
  advisories: [],
  schedule: [],
  impactMetrics: { totalInhaledBaselineUg: 100, totalInhaledOptimizedUg: 60 },
  timestamp: '2026-11-28T10:00:00Z',
}) as unknown as RecommendationPlan);

vi.mock('@vercel/analytics/react', () => ({
  Analytics: () => null,
}));

const MockEarthCommandCenter = (props: {
  currentCity: GeocodedLocation;
  metrics: AtmosphericMetrics | null;
  isLoading: boolean;
  onSelectCity: (loc: GeocodedLocation, source?: LocationSelectionSource) => void;
  onRefreshTelemetry: () => void;
  onUpdateSourcePreference: (pref: SourcePreference) => void;
}) => {
  capturedEarthProps.currentCity = props.currentCity;
  capturedEarthProps.metrics = props.metrics;
  capturedEarthProps.isLoading = props.isLoading;
  capturedEarthProps.onSelectCity = props.onSelectCity;
  capturedEarthProps.onRefreshTelemetry = props.onRefreshTelemetry;
  capturedEarthProps.onUpdateSourcePreference = props.onUpdateSourcePreference;
  return React.createElement('div', {
    'data-testid': 'mock-earth-command-center',
    'data-city': props.currentCity.name,
    'data-aqi': props.metrics?.usAqi ?? 'null',
    'data-loading': String(props.isLoading),
  });
};

vi.mock('@/components/home/EarthCommandCenter', () => ({
  EarthCommandCenter: MockEarthCommandCenter,
}));

vi.mock('next/dynamic', () => ({
  default: (loader: () => Promise<unknown>) => {
    if (loader.toString().includes('EarthCommandCenter')) {
      return MockEarthCommandCenter;
    }
    return function MockDynamicComponent() {
      return null;
    };
  },
}));

vi.mock('@/services/telemetry-service', async () => {
  const actual = await vi.importActual<typeof import('@/services/telemetry-service')>('@/services/telemetry-service');
  return {
    ...actual,
    fetchLiveAtmosphericMetrics: vi.fn((latitude: number, longitude: number, options?: { signal?: AbortSignal; cityName?: string; forceRefresh?: boolean }) => {
      const deferred = createDeferred<AtmosphericMetrics>();
      telemetryCalls.push({
        latitude,
        longitude,
        cityName: options?.cityName,
        signal: options?.signal,
        forceRefresh: options?.forceRefresh,
        deferred,
      });
      // Notice: this deferred promise intentionally does NOT reject when signal aborts,
      // verifying coordinator generation guards prevent late previous-city resolution!
      return deferred.promise;
    }),
  };
});

vi.mock('@/services/ai-assistant-service', async () => {
  const actual = await vi.importActual<typeof import('@/services/ai-assistant-service')>('@/services/ai-assistant-service');
  return {
    ...actual,
    generateAirQualityPlan: (...args: unknown[]) => planMock(...(args as [])),
  };
});

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
  id = '';
  className = '';

  get options(): MockElement[] {
    return [];
  }
  getContext(): null {
    return null;
  }

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
    if (child.parentNode) {
      const oldIdx = child.parentNode.childNodes.indexOf(child);
      if (oldIdx >= 0) child.parentNode.childNodes.splice(oldIdx, 1);
    }
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
    if (k === 'id') this.id = String(v);
    if (k === 'class') this.className = String(v);
  }

  getAttribute(k: string): string | null {
    return Object.prototype.hasOwnProperty.call(this.attributes, k) ? this.attributes[k] : null;
  }

  removeAttribute(k: string): void {
    delete this.attributes[k];
  }

  addEventListener(): void {}
  removeEventListener(): void {}
  focus(): void {}
  blur(): void {}
  scrollIntoView(): void {}
  getBoundingClientRect() {
    return { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}) };
  }
  classList = {
    add: () => {},
    remove: () => {},
    toggle: () => {},
    contains: () => false,
  };
  contains(other: MockNode | null): boolean {
    let cur = other;
    while (cur) {
      if (cur === this) return true;
      cur = cur.parentNode;
    }
    return false;
  }

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
  focus(): void {}
  blur(): void {}
  scrollIntoView(): void {}
  getBoundingClientRect() {
    return { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}) };
  }
  classList = {
    add: () => {},
    remove: () => {},
    toggle: () => {},
    contains: () => false,
  };
  querySelectorAll(): MockElement[] {
    return [];
  }
  querySelector(): MockElement | null {
    return null;
  }
}

function makeMetrics(usAqi: number, pm25: number): AtmosphericMetrics {
  return {
    status: 'success',
    provenance: 'modeled_forecast',
    timestamp: '2026-11-28T10:00:00Z',
    retrievedAt: '2026-11-28T10:01:00Z',
    timezone: 'Asia/Kolkata',
    usAqi,
    pm25,
    pm10: pm25 + 25,
    boundaryLayerHeight: 750,
    isThermalInversionActive: false,
    isLive: true,
    temperature: 24,
    humidity: 52,
    windSpeed: 10,
    windDirection: 270,
    environmentalSources: [],
    hourlyForecast: [],
  };
}

function installDomEnv() {
  const doc = new MockDocument();
  const storage = new Map<string, string>();
  const g = globalThis as unknown as Record<string, unknown>;
  g.document = doc;
  g.window = globalThis;
  g.HTMLElement = MockElement;
  g.Element = MockElement;
  g.Node = MockNode;
  g.HTMLIFrameElement = class HTMLIFrameElement extends MockElement {};
  g.SVGElement = class SVGElement extends MockElement {};
  g.IS_REACT_ACT_ENVIRONMENT = true;
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { userAgent: 'node-test' },
  });
  g.localStorage = {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => {
      storage.set(k, String(v));
    },
    removeItem: (k: string) => {
      storage.delete(k);
    },
    clear: () => storage.clear(),
  };
  g.requestAnimationFrame = (cb: (t: number) => void) => setTimeout(() => cb(Date.now()), 0) as unknown as number;
  g.cancelAnimationFrame = (id: number) => clearTimeout(id);
  const windowListeners: Record<string, Array<(ev: unknown) => void>> = {};
  g.addEventListener = (type: string, fn: (ev: unknown) => void) => {
    if (!windowListeners[type]) windowListeners[type] = [];
    windowListeners[type].push(fn);
  };
  g.removeEventListener = (type: string, fn: (ev: unknown) => void) => {
    if (!windowListeners[type]) return;
    windowListeners[type] = windowListeners[type].filter((f) => f !== fn);
  };
  g.dispatchEvent = (ev: { type: string }) => {
    for (const fn of windowListeners[ev.type] || []) fn(ev);
    return true;
  };
  g.matchMedia = () => ({
    matches: false,
    media: '',
    addEventListener: () => {},
    removeEventListener: () => {},
  });
  g.fetch = vi.fn(async () => new Response(JSON.stringify({}), { status: 200 }));
  const container = doc.createElement('div');
  doc.body.appendChild(container);
  return { container };
}

describe('Home — Immediate Previous-City Telemetry Invalidation on City Switch (Issue 2)', () => {
  let root: Root | null = null;
  let container: MockElement;

  beforeEach(() => {
    telemetryCalls.length = 0;
    planMock.mockClear();
    const env = installDomEnv();
    container = env.container;
  });

  afterEach(() => {
    if (root) {
      React.act(() => {
        root?.unmount();
      });
      root = null;
    }
    vi.restoreAllMocks();
  });

  it('rejects late Delhi response that resolves right after handleCitySelect(Bengaluru) before effect cleanup runs', async () => {
    const Home = (await import('@/app/page')).default;
    const { PREDEFINED_INDIAN_CITIES } = await import('@/services/telemetry-service');
    const bengaluru = PREDEFINED_INDIAN_CITIES.find((c) => c.name === 'Bengaluru')!;
    expect(bengaluru).toBeDefined();

    root = createRoot(container as unknown as Element);

    await React.act(async () => {
      root!.render(React.createElement(Home));
    });

    const delhiCall = telemetryCalls.find((c) => c.cityName === 'Delhi-NCR');
    expect(delhiCall).toBeDefined();

    const delhiMetrics = makeMetrics(249, 199);
    const bengaluruMetrics = makeMetrics(63, 18);

    // Switch city to Bengaluru AND resolve the pending Delhi telemetry promise BEFORE React commits effect cleanup!
    await React.act(async () => {
      capturedEarthProps.onSelectCity!(bengaluru, 'manual_predefined');
      // Synchronously after handleCitySelect returns (before React runs useEffect cleanup),
      // the Delhi request resolves without honoring AbortSignal.
      delhiCall!.deferred.resolve(delhiMetrics);
      await Promise.resolve();
      await Promise.resolve();
    });

    // Critical assertion: Delhi's signal must already have been aborted by handleCitySelect,
    // Delhi's response (249 AQI / 199 PM2.5) must NOT overwrite Bengaluru's loading metrics,
    // and plan generation must NOT run on stale Delhi metrics.
    expect(delhiCall!.signal?.aborted).toBe(true);
    expect(capturedEarthProps.currentCity?.name).toBe('Bengaluru');
    expect(capturedEarthProps.isLoading).toBe(true);
    expect(capturedEarthProps.metrics).toBeNull();
    expect(planMock).not.toHaveBeenCalled();

    const statusRegion = container.findAll((el) => el.getAttribute('role') === 'status')[0];
    expect(statusRegion?.textContent).toContain('Loading live air quality measurements for Bengaluru');
    expect(statusRegion?.textContent).not.toContain('249');

    // Now allow Bengaluru's own telemetry request to complete normally.
    const bengaluruCall = telemetryCalls.find((c) => c.cityName === 'Bengaluru');
    expect(bengaluruCall).toBeDefined();
    expect(bengaluruCall!.signal?.aborted).toBe(false);

    await React.act(async () => {
      bengaluruCall!.deferred.resolve(bengaluruMetrics);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(capturedEarthProps.currentCity?.name).toBe('Bengaluru');
    expect(capturedEarthProps.isLoading).toBe(false);
    expect(capturedEarthProps.metrics?.usAqi).toBe(63);
    expect(capturedEarthProps.metrics?.pm25).toBe(18);
    expect(statusRegion?.textContent).toContain('Air quality data updated for Bengaluru');

    // Verify manual refresh still works on Bengaluru cleanly afterwards
    await React.act(async () => {
      capturedEarthProps.onRefreshTelemetry!();
    });
    const refreshCall = telemetryCalls.find((c) => c.cityName === 'Bengaluru' && c.forceRefresh === true);
    expect(refreshCall).toBeDefined();
    await React.act(async () => {
      refreshCall!.deferred.resolve(makeMetrics(58, 15));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(capturedEarthProps.metrics?.usAqi).toBe(58);
    expect(capturedEarthProps.isLoading).toBe(false);
  });
});
