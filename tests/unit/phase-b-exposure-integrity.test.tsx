import { describe, it, expect } from 'vitest';
import React from 'react';
import ReactDOMServer from 'react-dom/server';
import { RoutineBuilder } from '@/components/RoutineBuilder';
import {
  calculateDailyScheduleExposure,
  calculateActivityInhaledMass,
} from '@/services/exposure/exposure-engine';
import { createDefaultSchedule } from '@/services/routines/routine-manager';

describe('Phase B Critical Regression Suite: Exposure Integrity (C02)', () => {
  it('C02: RoutineBuilder renders honest "Exposure estimate unavailable" when PM2.5 is null (never 50 µg/m³)', () => {
    const html = ReactDOMServer.renderToString(
      <RoutineBuilder currentPm25={null} isOptimizing={false} />
    );

    // Must NOT contain 50 µg/m³ fallback or fabricated mass
    expect(html).not.toContain('50 µg/m³');
    expect(html).toContain('Exposure estimate unavailable');
    expect(html).toContain('A valid PM2.5 measurement or forecast is required');
  });

  it('RoutineBuilder rejects negative or NaN PM2.5 safely without fabricating exposure', () => {
    const htmlNegative = ReactDOMServer.renderToString(
      <RoutineBuilder currentPm25={-30} isOptimizing={false} />
    );
    expect(htmlNegative).toContain('Exposure estimate unavailable');

    const htmlNaN = ReactDOMServer.renderToString(
      <RoutineBuilder currentPm25={NaN} isOptimizing={false} />
    );
    expect(htmlNaN).toContain('Exposure estimate unavailable');
  });

  it('RoutineBuilder accurately displays genuine zero PM2.5 without treating it as unavailable', () => {
    const htmlZero = ReactDOMServer.renderToString(
      <RoutineBuilder currentPm25={0} isOptimizing={false} />
    );
    expect(htmlZero).not.toContain('Exposure estimate unavailable');
    expect(htmlZero).toContain('>0</span><span class="font-mono text-ink-muted dark:text-zinc-400">µg PM2.5</span>');
    expect(htmlZero).toContain('0 µg');
  });

  it('Exposure engine returns typed unavailable result when ambient PM2.5 is null or invalid', () => {
    const schedule = createDefaultSchedule();
    const resultNull = calculateDailyScheduleExposure(schedule, null as any);
    expect(resultNull.status).toBe('unavailable');
    expect((resultNull as any).totalInhaledMassUg).toBeNull();

    const resultNegative = calculateDailyScheduleExposure(schedule, -10);
    expect(resultNegative.status).toBe('unavailable');
  });
});
