import React from 'react';
import ReactDOMServer from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import {
  SatelliteComparisonSlider,
  applySliderKeyAction,
  computeSliderPercentFromPointer,
  deriveInitialLoadStatus,
  formatAvailabilityBadge,
  reconcileSlotLoadStatus,
  resolveComparisonBannerState,
} from '@/components/environment/SatelliteComparisonSlider';
import { buildSatelliteComparison } from '@/services/environment/satellite-imagery-service';

describe('Phase 6 Integration: SatelliteComparisonSlider Component', () => {
  const refNow = new Date('2026-11-25T05:00:00Z');
  const sampleComparison = buildSatelliteComparison({
    city: 'Delhi NCR',
    latitude: 28.6139,
    longitude: 77.209,
    dateA: '2026-11-01',
    dateB: '2026-11-20',
    productA: 'VIIRS',
    productB: 'HLS_S30',
    referenceNow: refNow,
  });

  it('18-19, 22-24. renders full-frame aligned clip-path imagery at 0%, 25%, 50%, 75%, 100% with accessibility, mixed attribution, and disclaimer', () => {
    for (const pos of [0, 25, 50, 75, 100]) {
      const html = ReactDOMServer.renderToString(
        <SatelliteComparisonSlider comparison={sampleComparison} initialPosition={pos} />
      );

      // Header and requested dates preserved verbatim
      expect(html).toContain('NASA SATELLITE IMAGERY COMPARISON');
      expect(html).toContain('Delhi NCR');
      expect(html).toContain('2026-11-01');
      expect(html).toContain('2026-11-20');

      // Identical full-frame clip-path alignment without containerRef.current.clientWidth scaling
      expect(html).toContain(`clip-path:inset(0 ${100 - pos}% 0 0)`);
      expect(html).toContain(`left:${pos}%`);
      expect(html).not.toContain('max-w-none');

      // Accessibility attributes & responsive pointer styling
      expect(html).toContain('role="slider"');
      expect(html).toContain('aria-label="Satellite imagery before and after comparison slider"');
      expect(html).toContain(`aria-valuenow="${pos}"`);
      expect(html).toContain('aria-valuemin="0"');
      expect(html).toContain('aria-valuemax="100"');
      expect(html).toContain('aria-valuetext=');
      expect(html).toContain('touch-none');

      // Both image layers & attributions present without falsely claiming verified acquisition date
      expect(html).toContain('wvs.earthdata.nasa.gov/api/v1/snapshot');
      expect(html).toContain('TIME=2026-11-01');
      expect(html).toContain('TIME=2026-11-20');
      expect(html).toContain('NASA EOSDIS Global Imagery Browse Services (GIBS)');
      expect(html).toContain('NASA / USGS Harmonized Landsat Sentinel-2');
      expect(html).toContain('375m I-band');
      expect(html).toContain('30m MGRS native');
      expect(html).toContain('Actual acquisition date: Unverified');
      expect(html).toContain('PM2.5, PM10, AQI');
    }
  });

  it('15-17. renders honest unavailable notice with failed date when a slot is unavailable without faking imagery', () => {
    const unavailableSlotComparison = buildSatelliteComparison({
      city: 'Delhi NCR',
      latitude: 28.6139,
      longitude: 77.209,
      dateA: '2022-04-10',
      dateB: '2026-11-20',
      productA: 'VIIRS',
      productB: 'VIIRS',
      referenceNow: refNow,
    });

    const html = ReactDOMServer.renderToString(
      <SatelliteComparisonSlider comparison={unavailableSlotComparison} />
    );

    expect(html).toContain('data-testid="slot-a-fallback"');
    expect(html).toContain('SLOT A IMAGERY UNAVAILABLE');
    expect(html).toContain('Requested Date: 2022-04-10');
    expect(html).toContain('Comparison incomplete — Slot A (2022-04-10) unavailable.');
    expect(html).not.toContain('TIME=2022-04-10');
    expect(html).toContain('TIME=2026-11-20');
  });

  it('Issue 2 UI labels: distinguishes global_date_listed from verified_regional, availability unknown, failed, and unavailable states', () => {
    expect(deriveInitialLoadStatus(sampleComparison.slotA)).toBe('loading');
    expect(
      deriveInitialLoadStatus({ ...sampleComparison.slotA, availability: 'unavailable', imageUrl: null })
    ).toBe('unavailable');

    const unverifiedLoaded = resolveComparisonBannerState(
      sampleComparison.slotA,
      sampleComparison.slotB,
      'loaded',
      'loaded'
    );
    expect(unverifiedLoaded.hasFailure).toBe(false);
    expect(unverifiedLoaded.bothLoaded).toBe(true);
    expect(unverifiedLoaded.message).toContain('remain unverified');
    expect(formatAvailabilityBadge('unverified', 'loaded').label).toBe('AVAILABILITY UNKNOWN');

    const globalListedComparison = buildSatelliteComparison({
      city: 'Delhi NCR',
      latitude: 28.6139,
      longitude: 77.209,
      dateA: '2026-11-01',
      dateB: '2026-11-20',
      availabilityA: 'global_date_listed',
      availabilityB: 'global_date_listed',
      referenceNow: refNow,
    });
    const globalListedBanner = resolveComparisonBannerState(
      globalListedComparison.slotA,
      globalListedComparison.slotB,
      'loaded',
      'loaded'
    );
    expect(globalListedBanner.message).toContain('global layer dates listed in NASA GIBS');
    expect(globalListedBanner.message).toContain('local swath coverage and acquisition dates over this city remain unverified');
    expect(formatAvailabilityBadge('global_date_listed', 'loaded').label).toBe('GLOBAL LAYER DATE LISTED');

    const regionalComparison = buildSatelliteComparison({
      city: 'Delhi NCR',
      latitude: 28.6139,
      longitude: 77.209,
      dateA: '2026-11-01',
      dateB: '2026-11-20',
      availabilityA: 'verified_regional',
      availabilityB: 'verified_regional',
      verifiedDateA: '2026-11-01',
      verifiedDateB: '2026-11-20',
      referenceNow: refNow,
    });
    const regionalBanner = resolveComparisonBannerState(
      regionalComparison.slotA,
      regionalComparison.slotB,
      'loaded',
      'loaded'
    );
    expect(regionalBanner.message).toContain('regional observations loaded and verified');
    expect(formatAvailabilityBadge('verified_regional', 'loaded').label).toBe('REGIONAL COVERAGE VERIFIED');

    const failedSlotB = resolveComparisonBannerState(
      sampleComparison.slotA,
      sampleComparison.slotB,
      'loaded',
      'failed'
    );
    expect(failedSlotB.hasFailure).toBe(true);
    expect(failedSlotB.bothLoaded).toBe(false);
    expect(failedSlotB.message).toContain('Slot B (2026-11-20) failed');
    expect(formatAvailabilityBadge('unverified', 'failed').label).toBe('IMAGE LOAD FAILED');
  });

  it('19-22. computes bounded slider positions across pointer/touch moves, viewport resizing, and keyboard navigation', () => {
    expect(computeSliderPercentFromPointer(100, { left: 100, width: 800 })).toBe(0);
    expect(computeSliderPercentFromPointer(300, { left: 100, width: 800 })).toBe(25);
    expect(computeSliderPercentFromPointer(500, { left: 100, width: 800 })).toBe(50);
    expect(computeSliderPercentFromPointer(700, { left: 100, width: 800 })).toBe(75);
    expect(computeSliderPercentFromPointer(900, { left: 100, width: 800 })).toBe(100);
    expect(computeSliderPercentFromPointer(180, { left: 20, width: 320 })).toBe(50);

    expect(computeSliderPercentFromPointer(0, { left: 100, width: 800 })).toBe(0);
    expect(computeSliderPercentFromPointer(1200, { left: 100, width: 800 })).toBe(100);
    expect(computeSliderPercentFromPointer(150, { left: 0, width: 0 })).toBeNull();

    expect(applySliderKeyAction(50, 'ArrowLeft')).toEqual({ nextPct: 45, handled: true });
    expect(applySliderKeyAction(0, 'ArrowLeft')).toEqual({ nextPct: 0, handled: true });
    expect(applySliderKeyAction(50, 'ArrowRight')).toEqual({ nextPct: 55, handled: true });
    expect(applySliderKeyAction(100, 'ArrowRight')).toEqual({ nextPct: 100, handled: true });
    expect(applySliderKeyAction(42, 'Home')).toEqual({ nextPct: 0, handled: true });
    expect(applySliderKeyAction(42, 'End')).toEqual({ nextPct: 100, handled: true });
    expect(applySliderKeyAction(42, 'Tab')).toEqual({ nextPct: 42, handled: false });
  });

  it('preserves loaded status when slot availability upgrades from unverified to verified_regional on unchanged imageUrl', () => {
    const upgradedSlot = {
      ...sampleComparison.slotA,
      availability: 'verified_regional' as const,
      verifiedAcquisitionDate: '2026-11-01',
    };

    // Case 1: DOM img already finished loading
    expect(
      reconcileSlotLoadStatus(upgradedSlot, upgradedSlot.imageUrl, 'loading', {
        complete: true,
        naturalWidth: 800,
        getAttribute: (name) => (name === 'src' ? upgradedSlot.imageUrl : null),
      })
    ).toBe('loaded');

    // Case 2: State was already loaded with identical imageUrl before DOM ref check
    expect(
      reconcileSlotLoadStatus(upgradedSlot, upgradedSlot.imageUrl, 'loaded', null)
    ).toBe('loaded');

    // Case 3: Slot transitions to unavailable (e.g. Data-Present: false)
    expect(
      reconcileSlotLoadStatus(
        { ...upgradedSlot, availability: 'unavailable', imageUrl: null },
        upgradedSlot.imageUrl,
        'loaded',
        null
      )
    ).toBe('unavailable');

    // Case 4: URL genuinely changed (city switched) -> transitions cleanly back to loading
    expect(
      reconcileSlotLoadStatus(
        { ...upgradedSlot, imageUrl: 'https://wvs.earthdata.nasa.gov/api/v1/snapshot?TIME=2026-11-19' },
        upgradedSlot.imageUrl,
        'loaded',
        null
      )
    ).toBe('loading');
  });
});
