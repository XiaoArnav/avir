import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FirstVisitLocationModal } from '@/components/location/FirstVisitLocationModal';
import { PREDEFINED_INDIAN_CITIES } from '@/services/telemetry-service';

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
  querySelectorAll(): MockElement[] {
    return [];
  }
  querySelector(): MockElement | null {
    return null;
  }
}

function getReactProps(el: MockElement): Record<string, unknown> {
  for (const key of Object.keys(el)) {
    if (key.startsWith('__reactProps$')) {
      return (el as unknown as Record<string, Record<string, unknown>>)[key] || {};
    }
  }
  return {};
}

function clickElement(el: MockElement): void {
  const props = getReactProps(el);
  if (typeof props.onClick === 'function') {
    (props.onClick as (e: unknown) => void)({
      type: 'click',
      target: el,
      currentTarget: el,
      preventDefault: () => {},
      stopPropagation: () => {},
    });
    return;
  }
  throw new Error(`No React onClick handler found on <${el.tagName}> (${el.textContent})`);
}

function changeInputValue(el: MockElement, nextValue: string): void {
  el.value = nextValue;
  const props = getReactProps(el);
  if (typeof props.onChange === 'function') {
    (props.onChange as (e: unknown) => void)({
      type: 'change',
      target: { value: nextValue },
      currentTarget: { value: nextValue },
    });
    return;
  }
  throw new Error(`No React onChange handler found on <${el.tagName}>`);
}

function setupEnvironment() {
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

  const container = doc.createElement('div');
  doc.body.appendChild(container);
  return { container, storage };
}

async function selectBengaluru(container: MockElement): Promise<void> {
  const searchInput = container.findAll((el) => el.tagName === 'INPUT')[0];
  expect(searchInput).toBeDefined();
  await React.act(async () => {
    changeInputValue(searchInput, 'Bengaluru');
  });
  const bengaluruBtn = container
    .findAll((el) => el.tagName === 'BUTTON' && el.textContent.trim() === 'Bengaluru')[0];
  expect(bengaluruBtn).toBeDefined();
  await React.act(async () => {
    clickElement(bengaluruBtn);
  });
}

describe('FirstVisitLocationModal — GPS vs Manual/Dismiss Race Conditions (Issue 1)', () => {
  let root: Root | null = null;
  let container: MockElement;
  let storage: Map<string, string>;

  beforeEach(() => {
    vi.useFakeTimers();
    const env = setupEnvironment();
    container = env.container;
    storage = env.storage;
  });

  afterEach(() => {
    if (root) {
      React.act(() => {
        root?.unmount();
      });
      root = null;
    }
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('ignores late getCurrentPosition callback after user manually selects Bengaluru and preserves GPS privacy', async () => {
    let geoSuccess: ((pos: GeolocationPosition) => void) | null = null;
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: {
        geolocation: {
          getCurrentPosition: vi.fn((success: (pos: GeolocationPosition) => void) => {
            geoSuccess = success;
          }),
        },
      },
    });
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ name: 'Seattle', countryCode: 'US' }), { status: 200 }));
    globalThis.fetch = fetchMock;

    const onSelectCity = vi.fn();
    const onClose = vi.fn();
    root = createRoot(container as unknown as Element);

    await React.act(async () => {
      root!.render(
        React.createElement(FirstVisitLocationModal, {
          isOpen: true,
          onClose,
          onSelectCity,
        })
      );
    });

    const gpsBtn = container.findAll((el) => el.tagName === 'BUTTON' && el.textContent.includes('Use my current location'))[0];
    await React.act(async () => {
      clickElement(gpsBtn);
    });
    expect(geoSuccess).not.toBeNull();

    await selectBengaluru(container);
    expect(onSelectCity).toHaveBeenCalledTimes(1);
    expect(onSelectCity.mock.calls[0][0].name).toBe('Bengaluru');
    expect(onSelectCity.mock.calls[0][1]).toBe('manual_predefined');

    // Simulate late GPS callback arriving after manual selection
    await React.act(async () => {
      geoSuccess!({
        coords: { latitude: 47.6062, longitude: -122.3321 } as GeolocationCoordinates,
        timestamp: Date.now(),
        toJSON: () => ({}),
      });
      await Promise.resolve();
      await Promise.resolve();
      vi.advanceTimersByTime(500);
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(onSelectCity).toHaveBeenCalledTimes(1);
    const savedCity = JSON.parse(storage.get('avir_selected_city_v1') || 'null');
    expect(savedCity?.name).toBe('Bengaluru');
  });

  it('aborts and ignores delayed /api/geo/reverse response after manual Bengaluru selection', async () => {
    let resolveReverse: (res: Response) => void = () => {};
    let capturedSignal: AbortSignal | null | undefined;

    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: {
        geolocation: {
          getCurrentPosition: vi.fn((success: (pos: GeolocationPosition) => void) => {
            success({
              coords: { latitude: 47.6062, longitude: -122.3321 } as GeolocationCoordinates,
              timestamp: Date.now(),
              toJSON: () => ({}),
            });
          }),
        },
      },
    });

    // Fetch deliberately stays pending until explicitly resolved (simulates slow upstream ignoring abort)
    globalThis.fetch = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      capturedSignal = init?.signal;
      return new Promise<Response>((resolve) => {
        resolveReverse = resolve;
      });
    });

    const onSelectCity = vi.fn();
    const onClose = vi.fn();
    root = createRoot(container as unknown as Element);

    await React.act(async () => {
      root!.render(
        React.createElement(FirstVisitLocationModal, {
          isOpen: true,
          onClose,
          onSelectCity,
        })
      );
    });

    const gpsBtn = container.findAll((el) => el.tagName === 'BUTTON' && el.textContent.includes('Use my current location'))[0];
    await React.act(async () => {
      clickElement(gpsBtn);
    });

    await selectBengaluru(container);
    expect(capturedSignal?.aborted).toBe(true);
    expect(onSelectCity).toHaveBeenCalledTimes(1);
    expect(onSelectCity.mock.calls[0][0].name).toBe('Bengaluru');

    await React.act(async () => {
      resolveReverse(
        new Response(
          JSON.stringify({
            id: 'seattle',
            name: 'Seattle',
            country: 'United States',
            countryCode: 'US',
            latitude: 47.606,
            longitude: -122.332,
          }),
          { status: 200 }
        )
      );
      await Promise.resolve();
      await Promise.resolve();
      vi.advanceTimersByTime(500);
    });

    expect(onSelectCity).toHaveBeenCalledTimes(1);
    expect(JSON.parse(storage.get('avir_selected_city_v1') || 'null')?.name).toBe('Bengaluru');
  });

  it('cancels pending 400 ms GPS selection timer when user selects a manual city before it fires', async () => {
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: {
        geolocation: {
          getCurrentPosition: vi.fn((success: (pos: GeolocationPosition) => void) => {
            success({
              coords: { latitude: 47.6062, longitude: -122.3321 } as GeolocationCoordinates,
              timestamp: Date.now(),
              toJSON: () => ({}),
            });
          }),
        },
      },
    });
    globalThis.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          id: 'seattle',
          name: 'Seattle',
          country: 'United States',
          countryCode: 'US',
          latitude: 47.606,
          longitude: -122.332,
        }),
        { status: 200 }
      )
    );

    const onSelectCity = vi.fn();
    const onClose = vi.fn();
    root = createRoot(container as unknown as Element);

    await React.act(async () => {
      root!.render(
        React.createElement(FirstVisitLocationModal, {
          isOpen: true,
          onClose,
          onSelectCity,
        })
      );
    });

    const gpsBtn = container.findAll((el) => el.tagName === 'BUTTON' && el.textContent.includes('Use my current location'))[0];
    await React.act(async () => {
      clickElement(gpsBtn);
      await Promise.resolve();
      await Promise.resolve();
    });

    // Advance halfway through the 400ms timer window, then pick Bengaluru manually
    await React.act(async () => {
      vi.advanceTimersByTime(200);
    });
    await selectBengaluru(container);
    expect(onSelectCity).toHaveBeenCalledTimes(1);
    expect(onSelectCity.mock.calls[0][0].name).toBe('Bengaluru');

    await React.act(async () => {
      vi.advanceTimersByTime(500);
    });

    expect(onSelectCity).toHaveBeenCalledTimes(1);
    expect(onSelectCity.mock.calls[0][0].name).toBe('Bengaluru');
  });

  it('invalidates pending GPS work on Explore without location, X dismiss, and external modal close', async () => {
    let resolveReverse: (res: Response) => void = () => {};
    let capturedSignal: AbortSignal | null | undefined;

    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: {
        geolocation: {
          getCurrentPosition: vi.fn((success: (pos: GeolocationPosition) => void) => {
            success({
              coords: { latitude: 47.6062, longitude: -122.3321 } as GeolocationCoordinates,
              timestamp: Date.now(),
              toJSON: () => ({}),
            });
          }),
        },
      },
    });
    globalThis.fetch = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      capturedSignal = init?.signal;
      return new Promise<Response>((resolve) => {
        resolveReverse = resolve;
      });
    });

    const onSelectCity = vi.fn();
    const onClose = vi.fn();
    root = createRoot(container as unknown as Element);

    // Case A: "Explore without location" invalidates pending reverse-geocoding
    await React.act(async () => {
      root!.render(
        React.createElement(FirstVisitLocationModal, {
          isOpen: true,
          onClose,
          onSelectCity,
        })
      );
    });
    await React.act(async () => {
      clickElement(container.findAll((el) => el.tagName === 'BUTTON' && el.textContent.includes('Use my current location'))[0]);
    });
    await React.act(async () => {
      clickElement(container.findAll((el) => el.tagName === 'BUTTON' && el.textContent.includes('Explore without location'))[0]);
    });
    expect(capturedSignal?.aborted).toBe(true);
    expect(onSelectCity).toHaveBeenCalledTimes(1);
    expect(onSelectCity.mock.calls[0][0]).toEqual(PREDEFINED_INDIAN_CITIES[0]);

    await React.act(async () => {
      resolveReverse(new Response(JSON.stringify({ name: 'Seattle', countryCode: 'US' }), { status: 200 }));
      await Promise.resolve();
      vi.advanceTimersByTime(500);
    });
    expect(onSelectCity).toHaveBeenCalledTimes(1);
    expect(storage.get('avir_selected_city_v1')).toBeUndefined();

    // Case B: Closing dialog externally (isOpen -> false) cancels pending reverse-geocoding & 400ms timer
    onSelectCity.mockClear();
    globalThis.fetch = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      capturedSignal = init?.signal;
      return new Promise<Response>((resolve) => {
        resolveReverse = resolve;
      });
    });
    await React.act(async () => {
      clickElement(container.findAll((el) => el.tagName === 'BUTTON' && el.textContent.includes('Use my current location'))[0]);
    });
    await React.act(async () => {
      root!.render(
        React.createElement(FirstVisitLocationModal, {
          isOpen: false,
          onClose,
          onSelectCity,
        })
      );
    });
    expect(capturedSignal?.aborted).toBe(true);
    await React.act(async () => {
      resolveReverse(new Response(JSON.stringify({ name: 'Seattle', countryCode: 'US' }), { status: 200 }));
      await Promise.resolve();
      vi.advanceTimersByTime(500);
    });
    expect(onSelectCity).not.toHaveBeenCalled();

    // Case C: Clicking X ("Dismiss location selection") during active 400ms timer cancels delayed GPS callback
    onSelectCity.mockClear();
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ name: 'Seattle', countryCode: 'US' }), { status: 200 })
    );
    await React.act(async () => {
      root!.render(
        React.createElement(FirstVisitLocationModal, {
          isOpen: true,
          onClose,
          onSelectCity,
        })
      );
    });
    await React.act(async () => {
      clickElement(container.findAll((el) => el.tagName === 'BUTTON' && el.textContent.includes('Use my current location'))[0]);
      await Promise.resolve();
      await Promise.resolve();
    });
    await React.act(async () => {
      vi.advanceTimersByTime(150);
      const dismissBtn = container.findAll(
        (el) => el.tagName === 'BUTTON' && el.getAttribute('aria-label') === 'Dismiss location selection'
      )[0];
      expect(dismissBtn).toBeDefined();
      clickElement(dismissBtn);
    });
    expect(onSelectCity).toHaveBeenCalledTimes(1);
    expect(onSelectCity.mock.calls[0][0]).toEqual(PREDEFINED_INDIAN_CITIES[0]);
    await React.act(async () => {
      vi.advanceTimersByTime(500);
    });
    expect(onSelectCity).toHaveBeenCalledTimes(1);
  });
});
