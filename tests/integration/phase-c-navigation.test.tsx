import React from 'react';
import ReactDOMServer from 'react-dom/server';
import { describe, it, expect, vi } from 'vitest';
import { SegmentedTabs } from '@/components/SegmentedTabs';
import { CityPicker } from '@/components/CityPicker';

describe('AVIR Step 20: Responsive Navigation & Location UX (UX22, UX23, UX24, UX25, UX26, UX27, UX28, UX29, UX30)', () => {
  it('1. SegmentedTabs renders all 5 primary tabs with WAI-ARIA tablist and tab roles', () => {
    const handleChangeTab = vi.fn();
    const html = ReactDOMServer.renderToString(
      <SegmentedTabs
        activeTab="overview"
        onChangeTab={handleChangeTab}
        reductionPercentage={25}
      />
    );

    // Verify tablist role
    expect(html).toContain('role="tablist"');

    // Verify all 5 tab buttons exist with role="tab" and correct aria-controls
    expect(html).toContain('id="tab-overview"');
    expect(html).toContain('aria-controls="panel-overview"');
    expect(html).toContain('id="tab-world"');
    expect(html).toContain('aria-controls="panel-world"');
    expect(html).toContain('id="tab-routine"');
    expect(html).toContain('aria-controls="panel-routine"');
    expect(html).toContain('id="tab-iaq"');
    expect(html).toContain('aria-controls="panel-iaq"');
    expect(html).toContain('id="tab-rwa"');
    expect(html).toContain('aria-controls="panel-rwa"');

    // Verify active tab has aria-selected="true" and inactive tabs have aria-selected="false"
    expect(html).toContain('id="tab-overview" role="tab" aria-selected="true"');
    expect(html).toContain('id="tab-world" role="tab" aria-selected="false"');
  });

  it('2. SegmentedTabs eliminates misleading commercial pricing badge ₹2,950 and unqualified Live badge (UX25)', () => {
    const html = ReactDOMServer.renderToString(
      <SegmentedTabs
        activeTab="overview"
        onChangeTab={() => {}}
        reductionPercentage={35}
      />
    );

    // Ensure ₹2,950 is not hardcoded on IAQ tab
    expect(html).not.toContain('₹2,950');
    // Ensure unqualified "Live" badge is not on world tab
    expect(html).not.toContain('>Live<');
    // Ensure dose reduction badge is cleanly formatted when positive
    expect(html).toContain('-35% Dose');
  });

  it('3. CityPicker renders accessible search input with disambiguation cues and status indication', () => {
    const html = ReactDOMServer.renderToString(
      <CityPicker
        currentCity="Delhi"
        onSelectCity={() => {}}
        isLoading={false}
      />
    );

    // Verify search input has accessible attributes
    expect(html).toContain('role="combobox"');
    expect(html).toContain('aria-autocomplete="list"');
    expect(html).toContain('placeholder="Search any city (e.g. Lahore, Lucknow, Gurugram, Beijing, London)..."');

    // Verify active city confirmation stamp
    expect(html).toContain('Active:');
    expect(html).toContain('Delhi');
    expect(html).toContain('Open-Meteo High-Resolution Mesh');

    // Verify GPS detect button exists with accessible aria-label
    expect(html).toContain('aria-label="Detect current location via device GPS"');
  });

  it('4. CityPicker shows loading spinner state when location detection is active', () => {
    const html = ReactDOMServer.renderToString(
      <CityPicker
        currentCity="Bengaluru"
        onSelectCity={() => {}}
        isLoading={true}
      />
    );

    expect(html).toContain('Bengaluru');
    expect(html).toContain('animate-spin');
  });
});
