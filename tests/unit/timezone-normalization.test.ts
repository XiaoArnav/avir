import { describe, it, expect } from 'vitest';
import {
  normalizeTimeInTimezone,
  resolveCityTimezone,
  isValidIanaTimezone,
  parseLocalIsoInTimezone,
} from '@/lib/time/city-timezone';

describe('Phase A — Group C: Timezone Normalization & DST Integrity (41-60)', () => {
  it('41. India (Asia/Kolkata) correctly evaluates UTC+05:30 offset', () => {
    const norm = normalizeTimeInTimezone('2026-11-23T10:00:00.000Z', 'Asia/Kolkata');
    expect(norm.offsetString).toBe('+05:30');
    expect(norm.offsetMinutes).toBe(330);
    expect(norm.hour).toBe(15);
    expect(norm.minute).toBe(30);
    expect(norm.display24h).toBe('15:30');
  });

  it('42. Nepal (Asia/Kathmandu) correctly evaluates fractional UTC+05:45 offset', () => {
    const norm = normalizeTimeInTimezone('2026-11-23T10:00:00.000Z', 'Asia/Kathmandu');
    expect(norm.offsetString).toBe('+05:45');
    expect(norm.offsetMinutes).toBe(345);
    expect(norm.hour).toBe(15);
    expect(norm.minute).toBe(45);
    expect(norm.display24h).toBe('15:45');
  });

  it('43. Japan (Asia/Tokyo) correctly evaluates UTC+09:00 with no DST', () => {
    const norm = normalizeTimeInTimezone('2026-11-23T10:00:00.000Z', 'Asia/Tokyo');
    expect(norm.offsetString).toBe('+09:00');
    expect(norm.offsetMinutes).toBe(540);
    expect(norm.hour).toBe(19);
    expect(norm.minute).toBe(0);
    expect(norm.display24h).toBe('19:00');
  });

  it('44. London winter (Europe/London) evaluates UTC+00:00 GMT', () => {
    const norm = normalizeTimeInTimezone('2026-01-15T12:00:00.000Z', 'Europe/London');
    expect(norm.offsetString).toBe('+00:00');
    expect(norm.offsetMinutes).toBe(0);
    expect(norm.hour).toBe(12);
    expect(norm.minute).toBe(0);
  });

  it('45. London summer (Europe/London) evaluates UTC+01:00 BST', () => {
    const norm = normalizeTimeInTimezone('2026-07-15T12:00:00.000Z', 'Europe/London');
    expect(norm.offsetString).toBe('+01:00');
    expect(norm.offsetMinutes).toBe(60);
    expect(norm.hour).toBe(13);
    expect(norm.minute).toBe(0);
  });

  it('46. New York winter (America/New_York) evaluates UTC-05:00 EST', () => {
    const norm = normalizeTimeInTimezone('2026-01-15T17:00:00.000Z', 'America/New_York');
    expect(norm.offsetString).toBe('-05:00');
    expect(norm.offsetMinutes).toBe(-300);
    expect(norm.hour).toBe(12);
  });

  it('47. New York summer (America/New_York) evaluates UTC-04:00 EDT', () => {
    const norm = normalizeTimeInTimezone('2026-07-15T16:00:00.000Z', 'America/New_York');
    expect(norm.offsetString).toBe('-04:00');
    expect(norm.offsetMinutes).toBe(-240);
    expect(norm.hour).toBe(12);
  });

  it('48. Sydney timezone (Australia/Sydney) evaluates correct southern hemisphere offset', () => {
    // July is Australian winter (+10:00 AEST)
    const winter = normalizeTimeInTimezone('2026-07-15T00:00:00.000Z', 'Australia/Sydney');
    expect(winter.offsetString).toBe('+10:00');
    expect(winter.hour).toBe(10);

    // December is Australian summer (+11:00 AEDT)
    const summer = normalizeTimeInTimezone('2026-12-15T00:00:00.000Z', 'Australia/Sydney');
    expect(summer.offsetString).toBe('+11:00');
    expect(summer.hour).toBe(11);
  });

  it('49. Midnight crossing transitions local day and resets clock hour to 00:00', () => {
    const beforeMidnight = normalizeTimeInTimezone('2026-11-23T18:29:00.000Z', 'Asia/Kolkata');
    const afterMidnight = normalizeTimeInTimezone('2026-11-23T18:31:00.000Z', 'Asia/Kolkata');

    expect(beforeMidnight.day).toBe(23);
    expect(beforeMidnight.hour).toBe(23);
    expect(beforeMidnight.minute).toBe(59);

    expect(afterMidnight.day).toBe(24);
    expect(afterMidnight.hour).toBe(0);
    expect(afterMidnight.minute).toBe(1);
    expect(afterMidnight.display24h).toBe('00:01');
  });

  it('50. International Date Line boundaries (Auckland vs Honolulu) differ by date', () => {
    const instant = '2026-11-23T23:00:00.000Z';
    const auckland = normalizeTimeInTimezone(instant, 'Pacific/Auckland'); // UTC+13 (summer)
    const honolulu = normalizeTimeInTimezone(instant, 'Pacific/Honolulu'); // UTC-10

    // Honolulu is still on Nov 23; Auckland is on Nov 24
    expect(honolulu.day).toBe(23);
    expect(honolulu.hour).toBe(13);

    expect(auckland.day).toBe(24);
    expect(auckland.hour).toBe(12);
  });

  it('51. DST forward transition in New York does not crash and updates offset', () => {
    // US spring forward occurred on 2026-03-08 at 02:00 -> 03:00
    const beforeSpring = normalizeTimeInTimezone('2026-03-08T06:59:00.000Z', 'America/New_York');
    const afterSpring = normalizeTimeInTimezone('2026-03-08T07:01:00.000Z', 'America/New_York');

    expect(beforeSpring.offsetString).toBe('-05:00');
    expect(afterSpring.offsetString).toBe('-04:00');
  });

  it('52. DST backward transition in London updates offset from +01:00 to +00:00', () => {
    // London fall back occurred on 2026-10-25 at 02:00 -> 01:00
    const beforeFall = normalizeTimeInTimezone('2026-10-25T00:59:00.000Z', 'Europe/London');
    const afterFall = normalizeTimeInTimezone('2026-10-25T02:01:00.000Z', 'Europe/London');

    expect(beforeFall.offsetString).toBe('+01:00');
    expect(afterFall.offsetString).toBe('+00:00');
  });

  it('53. Repeated local hour during fall-back receives distinct unambiguous UTC instants', () => {
    // 01:30 BST (UTC 00:30) vs 01:30 GMT (UTC 01:30)
    const instant1 = normalizeTimeInTimezone('2026-10-25T00:30:00.000Z', 'Europe/London');
    const instant2 = normalizeTimeInTimezone('2026-10-25T01:30:00.000Z', 'Europe/London');

    expect(instant1.hour).toBe(1);
    expect(instant2.hour).toBe(1);
    expect(instant1.utcIso).not.toBe(instant2.utcIso);
  });

  it('54. Skipped local hour in spring forward parses safely to equivalent UTC instant', () => {
    const parsed = parseLocalIsoInTimezone('2026-03-08T02:30:00', 'America/New_York');
    expect(parsed).toBeInstanceOf(Date);
    expect(isNaN(parsed.getTime())).toBe(false);
  });

  it('55. Missing timezone defaults safely to UTC', () => {
    const tz = resolveCityTimezone(undefined, null);
    expect(tz).toBe('UTC');
    const norm = normalizeTimeInTimezone('2026-11-23T12:00:00.000Z', tz);
    expect(norm.offsetString).toBe('+00:00');
  });

  it('56. Invalid timezone string falls back safely to UTC without throwing', () => {
    expect(isValidIanaTimezone('Invalid/City_Timezone')).toBe(false);
    const norm = normalizeTimeInTimezone('2026-11-23T12:00:00.000Z', 'Invalid/City_Timezone');
    expect(norm.timezone).toBe('UTC');
    expect(norm.offsetString).toBe('+00:00');
  });

  it('57. Invalid date string throws descriptive error', () => {
    expect(() => normalizeTimeInTimezone('invalid-garbage-date', 'UTC')).toThrow();
  });

  it('58. Explicit UTC instant with Z preserves identical UTC representation', () => {
    const input = '2026-11-23T14:45:00.000Z';
    const norm = normalizeTimeInTimezone(input, 'Asia/Kolkata');
    expect(norm.utcIso).toBe(input);
  });

  it('59. Fractional UTC offsets are verified for Adelaide (+09:30)', () => {
    const norm = normalizeTimeInTimezone('2026-07-15T12:00:00.000Z', 'Australia/Adelaide');
    expect(norm.offsetString).toBe('+09:30');
    expect(norm.offsetMinutes).toBe(570);
  });

  it('60. Predefined Indian cities map to Asia/Kolkata canonically', () => {
    expect(resolveCityTimezone('Delhi')).toBe('Asia/Kolkata');
    expect(resolveCityTimezone('Delhi-NCR')).toBe('Asia/Kolkata');
    expect(resolveCityTimezone('Mumbai')).toBe('Asia/Kolkata');
    expect(resolveCityTimezone('Bengaluru')).toBe('Asia/Kolkata');
    expect(resolveCityTimezone('Patna')).toBe('Asia/Kolkata');
  });
});
