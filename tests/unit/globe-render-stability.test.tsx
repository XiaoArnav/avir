import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { AtmosphericMetrics } from '@/domain/types';
import type { GeocodedLocation } from '@/services/telemetry-service';

const renderCounts = {
  avirGlobe: 0,
  globeControls: 0,
  cesiumGlobe: 0,
  threeGlobe: 0,
};

const capturedProps = {
  cesiumLatest: null as Record<string, unknown> | null,
  threeLatest: null as Record<string, unknown> | null,
  onSetActiveCityRefs: [] as unknown[],
  onSelectPointRefs: [] as unknown[],
  onClearInspectedPointRefs: [] as unknown[],
  onToggleStandardRefs: [] as unknown[],
  layersRefs: [] as unknown[],
};

vi.mock('@vercel/analytics/react', () => ({
  Analytics: () => null,
}));

vi.mock('next/dynamic', async () => {
  const actualDynamic = await vi.importActual<typeof import('next/dynamic')>('next/dynamic');
  return {
    default: (loader: () => Promise<unknown>, opts?: unknown) => {
      const loaderStr = loader.toString();
      if (loaderStr.includes('AvirCesiumGlobe')) {
        return function MockDynamicCesiumGlobe(props: Record<string, unknown>) {
          renderCounts.cesiumGlobe += 1;
          capturedProps.cesiumLatest = props;
          return React.createElement('div', {
            'data-testid': 'mock-cesium-globe',
            'data-city': String(props.activeCityName ?? ''),
            'data-theme': String(props.themeMode ?? ''),
            'data-standard': String(props.standard ?? ''),
          });
        };
      }
      if (loaderStr.includes('AvirGlobeCanvas')) {
        return function MockDynamicThreeGlobe(props: Record<string, unknown>) {
          renderCounts.threeGlobe += 1;
          capturedProps.threeLatest = props;
          return React.createElement('div', {
            'data-testid': 'mock-three-globe',
            'data-city': String(props.activeCityName ?? ''),
          });
        };
      }
      if (loaderStr.includes('SatelliteComparisonSlider')) {
        return function MockDynamicSatelliteSlider() {
          return React.createElement('div', { 'data-testid': 'mock-satellite-slider' });
        };
      }
      return (
        actualDynamic.default as (
          l: () => Promise<unknown>,
          o?: unknown
        ) => React.ComponentType<Record<string, unknown>>
      )(loader, opts);
    },
  };
});

vi.mock('@/components/globe/GlobeControls', async () => {
  const actual = await vi.importActual<typeof import('@/components/globe/GlobeControls')>(
    '@/components/globe/GlobeControls'
  );
  return {
    ...actual,
    GlobeControls: (props: import('@/components/globe/GlobeControls').GlobeControlsProps) => {
      renderCounts.globeControls += 1;
      capturedProps.layersRefs.push(props.layers);
      return React.createElement(actual.GlobeControls, props);
    },
  };
});

vi.mock('@/components/globe/AvirGlobe', async () => {
  const actual = await vi.importActual<typeof import('@/components/globe/AvirGlobe')>(
    '@/components/globe/AvirGlobe'
  );
  const WrappedAvirGlobe = (props: import('@/components/globe/AvirGlobe').AvirGlobeProps) => {
    renderCounts.avirGlobe += 1;
    capturedProps.onSetActiveCityRefs.push(props.onSetActiveCity);
    capturedProps.onSelectPointRefs.push(props.onSelectPoint);
    capturedProps.onClearInspectedPointRefs.push(props.onClearInspectedPoint);
    capturedProps.onToggleStandardRefs.push(props.onToggleStandard);
    return React.createElement(actual.AvirGlobe, props);
  };
  return {
    ...actual,
    AvirGlobe: WrappedAvirGlobe,
  };
});

class MockNode {
  nodeType: number;
  childNodes: MockNode[] = [];
  parentNode: MockNode | null = null;
  constructor(nodeType: number) {
    this.nodeType = nodeType;
  }
  get children(): MockElement[] {
    return this.childNodes.filter((n): n is MockElement => n.nodeType === 1);
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
  listeners: Record<string, Array<(ev: unknown) => void>> = {};
  id = '';
  className = '';
  type = '';
  disabled = false;
  value = '';

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

  addEventListener(type: string, fn: (ev: unknown) => void): void {
    if (!this.listeners[type]) this.listeners[type] = [];
    this.listeners[type].push(fn);
  }

  removeEventListener(type: string, fn: (ev: unknown) => void): void {
    if (!this.listeners[type]) return;
    this.listeners[type] = this.listeners[type].filter((f) => f !== fn);
  }

  contains(other: MockNode | null): boolean {
    let cur = other;
    while (cur) {
      if (cur === this) return true;
      cur = cur.parentNode;
    }
    return false;
  }

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

  querySelectorAll(): MockElement[] {
    return [];
  }
  querySelector(): MockElement | null {
    return null;
  }
}

class MockDocument {
  nodeType = 9;
  nodeName = '#document';
  activeElement: MockElement | null = null;
  defaultView = globalThis;
  listeners: Record<string, Array<(ev: unknown) => void>> = {};
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
  addEventListener(type: string, fn: (ev: unknown) => void): void {
    if (!this.listeners[type]) this.listeners[type] = [];
    this.listeners[type].push(fn);
  }
  removeEventListener(type: string, fn: (ev: unknown) => void): void {
    if (!this.listeners[type]) return;
    this.listeners[type] = this.listeners[type].filter((f) => f !== fn);
  }
  querySelectorAll(): MockElement[] {
    return [];
  }
  querySelector(): MockElement | null {
    return null;
  }
}

function clickElement(el: MockElement): void {
  for (const key of Object.keys(el)) {
    if (key.startsWith('__reactProps$')) {
      const props = (el as unknown as Record<string, Record<string, unknown>>)[key];
      if (props && typeof props.onClick === 'function') {
        (props.onClick as (e: unknown) => void)({
          type: 'click',
          target: el,
          currentTarget: el,
          preventDefault: () => {},
          stopPropagation: () => {},
        });
        return;
      }
    }
  }
  throw new Error(`No React onClick handler found on <${el.tagName}> (${el.textContent})`);
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
  g.matchMedia = () => ({
    matches: false,
    media: '',
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
  });
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
  g.IntersectionObserver = class IntersectionObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  g.getComputedStyle = () => ({
    getPropertyValue: () => '',
  });
  g.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };

  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (url.includes('/api/telemetry')) {
      return new Response(
        JSON.stringify({
          metrics: {
            status: 'success',
            provenance: 'observed',
            timestamp: '2026-11-28T09:00:00Z',
            retrievedAt: '2026-11-28T09:01:00Z',
            timezone: 'Asia/Kolkata',
            usAqi: 215,
            pm25: 165,
            pm10: 280,
            boundaryLayerHeight: 340,
            isThermalInversionActive: true,
            isLive: true,
            temperature: 19,
            humidity: 68,
            windSpeed: 3.4,
            windDirection: 280,
          },
          hourlyForecast: [],
          metadata: { source: 'mock' },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    if (url.includes('/api/ai/plan')) {
      return new Response(JSON.stringify({ plan: null, deterministicPlan: null }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ points: [], status: 'unavailable' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });
  g.fetch = fetchMock;

  const container = doc.createElement('div');
  doc.body.appendChild(container);
  return { doc, container, fetchMock };
}

function resetCounters() {
  renderCounts.avirGlobe = 0;
  renderCounts.globeControls = 0;
  renderCounts.cesiumGlobe = 0;
  renderCounts.threeGlobe = 0;
  capturedProps.cesiumLatest = null;
  capturedProps.threeLatest = null;
  capturedProps.onSetActiveCityRefs = [];
  capturedProps.onSelectPointRefs = [];
  capturedProps.onClearInspectedPointRefs = [];
  capturedProps.onToggleStandardRefs = [];
  capturedProps.layersRefs = [];
}

const delhiCity: GeocodedLocation = {
  id: 1273294,
  name: 'Delhi-NCR',
  admin1: 'Delhi',
  country: 'India',
  countryCode: 'IN',
  latitude: 28.6139,
  longitude: 77.209,
};

const tokyoCity: GeocodedLocation = {
  id: 1850147,
  name: 'Tokyo',
  admin1: 'Tokyo',
  country: 'Japan',
  countryCode: 'JP',
  latitude: 35.6762,
  longitude: 139.6503,
};

const sampleMetrics: AtmosphericMetrics = {
  status: 'success',
  provenance: 'observed',
  timestamp: '2026-11-28T09:00:00Z',
  retrievedAt: '2026-11-28T09:01:00Z',
  timezone: 'Asia/Kolkata',
  usAqi: 215,
  pm25: 165,
  pm10: 280,
  boundaryLayerHeight: 340,
  isThermalInversionActive: true,
  isLive: true,
  temperature: 19,
  humidity: 68,
  windSpeed: 3.4,
  windDirection: 280,
};

describe('Globe React Render Boundaries & Stability (Step 5)', () => {
  let root: Root | null = null;
  let container: MockElement;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    resetCounters();
    const env = installDomEnv();
    container = env.container;
    fetchMock = env.fetchMock;
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

  it('Test A: keeps AvirGlobe and WebGL children at 0 extra renders when EnvironmentalDetailsDrawer toggles in EarthCommandCenter', async () => {
    const { EarthCommandCenter } = await import('@/components/home/EarthCommandCenter');
    root = createRoot(container as unknown as Element);

    await React.act(async () => {
      root!.render(
        React.createElement(EarthCommandCenter, {
          currentCity: delhiCity,
          metrics: sampleMetrics,
          isLoading: false,
          onSelectCity: vi.fn(),
          onRefreshTelemetry: vi.fn(),
          onOpenExplainer: vi.fn(),
          onOpenShare: vi.fn(),
          onOpenMultiSource: vi.fn(),
          onOpenDailyPlan: vi.fn(),
        })
      );
    });

    const baselineAvir = renderCounts.avirGlobe;
    const baselineCesium = renderCounts.cesiumGlobe;
    const baselineControls = renderCounts.globeControls;

    for (let cycle = 0; cycle < 3; cycle += 1) {
      const openBtn = container.findAll(
        (el) => el.tagName === 'BUTTON' && el.textContent.includes('Environmental Details')
      )[0];
      expect(openBtn).toBeDefined();
      await React.act(async () => {
        clickElement(openBtn);
      });

      const closeBtn = container.findAll(
        (el) =>
          el.tagName === 'BUTTON' &&
          (el.getAttribute('aria-label')?.toLowerCase().includes('close') ||
            el.textContent.includes('Hide Details') ||
            el.textContent.includes('Close'))
      )[0];
      expect(closeBtn).toBeDefined();
      await React.act(async () => {
        clickElement(closeBtn);
      });
    }

    expect(renderCounts.avirGlobe - baselineAvir).toBe(0);
    expect(renderCounts.cesiumGlobe - baselineCesium).toBe(0);
    expect(renderCounts.globeControls - baselineControls).toBe(0);
  });

  it('Test B: keeps AvirGlobe, GlobeControls, and WebGL children at 0 extra renders and avoids duplicate fetches when Home modals toggle', async () => {
    const Home = (await import('@/app/page')).default;
    localStorage.setItem('avir_selected_city_v1', JSON.stringify(delhiCity));
    root = createRoot(container as unknown as Element);

    await React.act(async () => {
      root!.render(React.createElement(Home));
    });
    await React.act(async () => {
      await new Promise((r) => setTimeout(r, 30));
    });

    const baselineAvir = renderCounts.avirGlobe;
    const baselineCesium = renderCounts.cesiumGlobe;
    const baselineControls = renderCounts.globeControls;
    const baselineFetchCalls = fetchMock.mock.calls.length;

    const allButtons = container.findAll((el) => el.tagName === 'BUTTON');
    const settingsBtn = allButtons.find(
      (el) =>
        el.getAttribute('aria-label')?.toLowerCase().includes('settings') ||
        el.getAttribute('title')?.toLowerCase().includes('settings') ||
        el.textContent.includes('Settings')
    );
    const sourcesBtn = allButtons.find((el) =>
      el.getAttribute('aria-label')?.includes('Inspect Atmospheric Data Sources')
    );
    expect(settingsBtn).toBeDefined();
    expect(sourcesBtn).toBeDefined();

    await React.act(async () => {
      clickElement(settingsBtn!);
    });
    const closeSettingsBtn = container
      .findAll((el) => el.tagName === 'BUTTON')
      .find(
        (el) =>
          el.getAttribute('aria-label')?.toLowerCase().includes('close') ||
          el.textContent.trim() === 'Cancel' ||
          el.textContent.trim() === 'Done'
      );
    if (closeSettingsBtn) {
      await React.act(async () => {
        clickElement(closeSettingsBtn);
      });
    }

    await React.act(async () => {
      clickElement(sourcesBtn!);
    });
    const closeSourcesBtn = container
      .findAll((el) => el.tagName === 'BUTTON')
      .find(
        (el) =>
          el.getAttribute('aria-label')?.toLowerCase().includes('close') ||
          el.textContent.trim() === 'Close'
      );
    if (closeSourcesBtn) {
      await React.act(async () => {
        clickElement(closeSourcesBtn);
      });
    }

    expect(renderCounts.avirGlobe - baselineAvir).toBe(0);
    expect(renderCounts.cesiumGlobe - baselineCesium).toBe(0);
    expect(renderCounts.globeControls - baselineControls).toBe(0);
    expect(fetchMock.mock.calls.length).toBe(baselineFetchCalls);
    expect(new Set(capturedProps.onSetActiveCityRefs).size).toBe(1);
    expect(new Set(capturedProps.onSelectPointRefs).size).toBe(1);
    expect(new Set(capturedProps.onClearInspectedPointRefs).size).toBe(1);
    expect(new Set(capturedProps.onToggleStandardRefs).size).toBe(1);
  });

  it('Test C: still propagates legitimate city, AQI metrics, themeMode, and standard updates cleanly', async () => {
    const { EarthCommandCenter } = await import('@/components/home/EarthCommandCenter');
    const sharedProps = {
      currentCity: delhiCity,
      metrics: sampleMetrics,
      isLoading: false,
      themeMode: 'dark' as const,
      onSelectCity: vi.fn(),
      onRefreshTelemetry: vi.fn(),
      onOpenExplainer: vi.fn(),
      onOpenShare: vi.fn(),
      onOpenMultiSource: vi.fn(),
      onOpenDailyPlan: vi.fn(),
    };

    root = createRoot(container as unknown as Element);
    await React.act(async () => {
      root!.render(React.createElement(EarthCommandCenter, sharedProps));
    });
    expect(capturedProps.cesiumLatest?.activeCityName).toBe('Delhi-NCR');
    expect(capturedProps.cesiumLatest?.themeMode).toBe('dark');
    expect(capturedProps.cesiumLatest?.standard).toBe('cpcb');

    // 1. Metrics change (AQI / PM2.5 / validAtUtc) -> must re-render AvirGlobe
    const countBeforeMetrics = renderCounts.avirGlobe;
    await React.act(async () => {
      root!.render(
        React.createElement(EarthCommandCenter, {
          ...sharedProps,
          metrics: { ...sampleMetrics, usAqi: 295, pm25: 230, timestamp: '2026-11-28T10:00:00Z' },
        })
      );
    });
    expect(renderCounts.avirGlobe).toBe(countBeforeMetrics + 1);
    expect(capturedProps.cesiumLatest?.validAtUtc).toBe('2026-11-28T10:00:00Z');

    // 2. City change -> must re-render AvirGlobe and update activeCityName
    const countBeforeCity = renderCounts.avirGlobe;
    await React.act(async () => {
      root!.render(
        React.createElement(EarthCommandCenter, {
          ...sharedProps,
          currentCity: tokyoCity,
        })
      );
    });
    expect(renderCounts.avirGlobe).toBe(countBeforeCity + 1);
    expect(capturedProps.cesiumLatest?.activeCityName).toBe('Tokyo');

    // 3. Theme change -> must re-render AvirGlobe and update themeMode
    const countBeforeTheme = renderCounts.avirGlobe;
    await React.act(async () => {
      root!.render(
        React.createElement(EarthCommandCenter, {
          ...sharedProps,
          currentCity: tokyoCity,
          themeMode: 'light',
        })
      );
    });
    expect(renderCounts.avirGlobe).toBe(countBeforeTheme + 1);
    expect(capturedProps.cesiumLatest?.themeMode).toBe('light');

    // 4. Standard toggle button -> must propagate to GlobeControls & Cesium props
    const standardBtn = container.findAll(
      (el) => el.tagName === 'BUTTON' && (el.getAttribute('aria-label')?.includes('Toggle AQI standard') ?? false)
    )[0];
    expect(standardBtn).toBeDefined();
    await React.act(async () => {
      clickElement(standardBtn);
    });
    expect(capturedProps.cesiumLatest?.standard).toBe('epa');
  });

  it('Test D: skips unnecessary GlobeControls renders on Zoom camera actions while preserving engine and layer transitions', async () => {
    const { EarthCommandCenter } = await import('@/components/home/EarthCommandCenter');
    root = createRoot(container as unknown as Element);

    await React.act(async () => {
      root!.render(
        React.createElement(EarthCommandCenter, {
          currentCity: delhiCity,
          metrics: sampleMetrics,
          isLoading: false,
          onSelectCity: vi.fn(),
          onRefreshTelemetry: vi.fn(),
          onOpenExplainer: vi.fn(),
          onOpenShare: vi.fn(),
          onOpenMultiSource: vi.fn(),
          onOpenDailyPlan: vi.fn(),
        })
      );
    });

    const zoomInBtn = container.findAll(
      (el) => el.tagName === 'BUTTON' && el.getAttribute('aria-label') === 'Zoom In'
    )[0];
    const zoomOutBtn = container.findAll(
      (el) => el.tagName === 'BUTTON' && el.getAttribute('aria-label') === 'Zoom Out'
    )[0];
    const toggleEngineBtn = container.findAll(
      (el) => el.tagName === 'BUTTON' && (el.getAttribute('aria-label')?.includes('Toggle 3D Engine') ?? false)
    )[0];

    expect(zoomInBtn).toBeDefined();
    expect(zoomOutBtn).toBeDefined();
    expect(toggleEngineBtn).toBeDefined();

    // Camera zoom actions should update Cesium cameraAction WITHOUT re-rendering MemoizedGlobeControls
    const controlsBeforeZoom = renderCounts.globeControls;
    const layersBeforeZoom = capturedProps.layersRefs[capturedProps.layersRefs.length - 1];
    await React.act(async () => {
      clickElement(zoomInBtn);
    });
    await React.act(async () => {
      clickElement(zoomOutBtn);
    });
    expect(renderCounts.globeControls).toBe(controlsBeforeZoom);
    expect(new Set(capturedProps.layersRefs).size).toBe(1);
    expect(capturedProps.layersRefs[0]).toBe(layersBeforeZoom);

    // Engine switch Cesium -> Three -> Cesium preserves clean mounts/unmounts
    const threeBeforeSwitch = renderCounts.threeGlobe;
    const cesiumBeforeSwitch = renderCounts.cesiumGlobe;
    await React.act(async () => {
      clickElement(toggleEngineBtn);
    });
    expect(renderCounts.threeGlobe).toBe(threeBeforeSwitch + 1);
    expect(container.findAll((el) => el.getAttribute('data-testid') === 'mock-three-globe').length).toBe(1);

    await React.act(async () => {
      clickElement(toggleEngineBtn);
    });
    expect(renderCounts.cesiumGlobe).toBe(cesiumBeforeSwitch + 1);
    expect(container.findAll((el) => el.getAttribute('data-testid') === 'mock-cesium-globe').length).toBe(1);

    // Layer menu open -> toggle Fires layer updates activeLayers cleanly
    const layersMenuBtn = container.findAll(
      (el) => el.tagName === 'BUTTON' && el.getAttribute('aria-label') === 'Environmental Intelligence Layers'
    )[0];
    expect(layersMenuBtn).toBeDefined();
    await React.act(async () => {
      clickElement(layersMenuBtn);
    });
    const firesBtn = container.findAll(
      (el) => el.tagName === 'BUTTON' && el.getAttribute('aria-label') === 'Toggle Active Fires layer'
    )[0];
    expect(firesBtn).toBeDefined();
    await React.act(async () => {
      clickElement(firesBtn);
    });
    expect(capturedProps.cesiumLatest?.isFiresEnabled).toBe(true);
  });
});
