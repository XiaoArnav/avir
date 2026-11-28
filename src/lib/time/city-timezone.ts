/**
 * Canonical City Timezone & Timestamp Normalization Engine
 * Handles IANA timezones, UTC conversions, DST transitions, fractional offsets,
 * and midnight boundaries without browser-locale bleed.
 */

export interface NormalizedTime {
  /** Unambiguous ISO 8601 UTC instant (e.g. '2026-11-23T10:00:00.000Z') */
  utcIso: string;
  /** Epoch milliseconds */
  epochMs: number;
  /** Valid IANA timezone identifier (e.g. 'Asia/Kolkata') */
  timezone: string;
  /** Local year */
  year: number;
  /** Local month (1-12) */
  month: number;
  /** Local day of month (1-31) */
  day: number;
  /** Local clock hour (0-23) */
  hour: number;
  /** Local minute (0-59) */
  minute: number;
  /** Formatted local ISO-like string without Z (e.g. '2026-11-23T15:30:00') */
  localIso: string;
  /** Formatted 12h display string (e.g. '3:30 PM') */
  display12h: string;
  /** Formatted 24h display string (e.g. '15:30') */
  display24h: string;
  /** Formatted date label (e.g. 'Mon, 23 Nov') */
  displayDate: string;
  /** Formatted full label with timezone abbreviation (e.g. '23 Nov, 15:30 IST') */
  displayFull: string;
  /** UTC offset string (e.g. '+05:30', '-05:00', '+00:00') */
  offsetString: string;
  /** Offset in minutes from UTC (e.g. +330 for IST) */
  offsetMinutes: number;
}

/**
 * Standard IANA timezone map for common cities or fallback mapping.
 */
export const KNOWN_CITY_TIMEZONES: Record<string, string> = {
  delhi: 'Asia/Kolkata',
  delhincr: 'Asia/Kolkata',
  'delhi-ncr': 'Asia/Kolkata',
  newdelhi: 'Asia/Kolkata',
  mumbai: 'Asia/Kolkata',
  bengaluru: 'Asia/Kolkata',
  bangalore: 'Asia/Kolkata',
  kolkata: 'Asia/Kolkata',
  calcutta: 'Asia/Kolkata',
  chennai: 'Asia/Kolkata',
  madras: 'Asia/Kolkata',
  hyderabad: 'Asia/Kolkata',
  kanpur: 'Asia/Kolkata',
  patna: 'Asia/Kolkata',
  lucknow: 'Asia/Kolkata',
  pune: 'Asia/Kolkata',
  kathmandu: 'Asia/Kathmandu',
  london: 'Europe/London',
  newyork: 'America/New_York',
  losangeles: 'America/Los_Angeles',
  tokyo: 'Asia/Tokyo',
  sydney: 'Australia/Sydney',
  auckland: 'Pacific/Auckland',
  honolulu: 'Pacific/Honolulu',
  paris: 'Europe/Paris',
  berlin: 'Europe/Berlin',
  dubai: 'Asia/Dubai',
  singapore: 'Asia/Singapore',
  bangkok: 'Asia/Bangkok',
  beijing: 'Asia/Shanghai',
};

/**
 * Resolves a canonical IANA timezone identifier from city metadata or timezone string.
 */
export function resolveCityTimezone(
  cityName?: string | null,
  explicitTz?: string | null
): string {
  if (explicitTz && isValidIanaTimezone(explicitTz)) {
    return explicitTz;
  }

  if (cityName) {
    const clean = cityName.toLowerCase().replace(/[^a-z]/g, '');
    if (KNOWN_CITY_TIMEZONES[clean]) {
      return KNOWN_CITY_TIMEZONES[clean];
    }
  }

  // Fallback to UTC if timezone cannot be determined
  return 'UTC';
}

/**
 * Validates whether a string is a recognized IANA timezone identifier.
 */
export function isValidIanaTimezone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * Normalizes an instant (ISO string, epoch ms, or Date) in a specified IANA timezone.
 */
export function normalizeTimeInTimezone(
  input: string | number | Date,
  timezone: string
): NormalizedTime {
  const validTz = isValidIanaTimezone(timezone) ? timezone : 'UTC';
  
  let dateObj: Date;
  if (typeof input === 'string') {
    // If the input is an ISO string without offset (e.g. '2026-11-23T10:00'),
    // we must treat it carefully. If it has no Z or +/- offset, parse in the context of the timezone or UTC.
    if (!input.includes('Z') && !input.match(/[+-]\d{2}:?\d{2}$/)) {
      // Offset-free string from Open-Meteo with timezone parameter
      // We parse as UTC to establish an epoch instant, or if Open-Meteo returned local time, construct Date
      dateObj = parseLocalIsoInTimezone(input, validTz);
    } else {
      dateObj = new Date(input);
    }
  } else if (typeof input === 'number') {
    // Handle both second and millisecond timestamps
    const ms = input < 10000000000 ? input * 1000 : input;
    dateObj = new Date(ms);
  } else {
    dateObj = input;
  }

  if (isNaN(dateObj.getTime())) {
    throw new Error(`Invalid date/time input: ${String(input)}`);
  }

  const epochMs = dateObj.getTime();
  const utcIso = dateObj.toISOString();

  // Extract local parts using Intl.DateTimeFormat in the target timezone
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: validTz,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: false,
  });

  const parts = dtf.formatToParts(dateObj);
  const partMap: Record<string, string> = {};
  for (const p of parts) {
    partMap[p.type] = p.value;
  }

  const year = parseInt(partMap.year, 10);
  const month = parseInt(partMap.month, 10);
  const day = parseInt(partMap.day, 10);
  let hour = parseInt(partMap.hour, 10);
  if (hour === 24) hour = 0; // en-US hour24 formatting quirk
  const minute = parseInt(partMap.minute, 10);

  // Compute exact UTC offset in minutes for this instant in this timezone
  // Compare UTC hour vs local hour
  const utcYear = dateObj.getUTCFullYear();
  const utcMonth = dateObj.getUTCMonth() + 1;
  const utcDay = dateObj.getUTCDate();
  const utcHour = dateObj.getUTCHours();
  const utcMinute = dateObj.getUTCMinutes();

  // Difference in minutes
  const localDateUtcProxy = Date.UTC(year, month - 1, day, hour, minute);
  const actualUtcMs = Date.UTC(utcYear, utcMonth - 1, utcDay, utcHour, utcMinute);
  const offsetMinutes = Math.round((localDateUtcProxy - actualUtcMs) / (60 * 1000));

  const sign = offsetMinutes >= 0 ? '+' : '-';
  const absOffset = Math.abs(offsetMinutes);
  const offH = String(Math.floor(absOffset / 60)).padStart(2, '0');
  const offM = String(absOffset % 60).padStart(2, '0');
  const offsetString = `${sign}${offH}:${offM}`;

  const pad2 = (n: number) => String(n).padStart(2, '0');
  const localIso = `${year}-${pad2(month)}-${pad2(day)}T${pad2(hour)}:${pad2(minute)}:00`;

  // Display strings
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const display12h = `${hour12}:${pad2(minute)} ${ampm}`;
  const display24h = `${pad2(hour)}:${pad2(minute)}`;

  // Formatted date
  const dateDtf = new Intl.DateTimeFormat('en-IN', {
    timeZone: validTz,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
  const displayDate = dateDtf.format(dateObj);

  // Formatted tz abbreviation
  const tzDtf = new Intl.DateTimeFormat('en-US', {
    timeZone: validTz,
    timeZoneName: 'short',
  });
  const tzPart = tzDtf.formatToParts(dateObj).find((p) => p.type === 'timeZoneName')?.value || offsetString;
  const displayFull = `${displayDate}, ${display24h} ${tzPart}`;

  return {
    utcIso,
    epochMs,
    timezone: validTz,
    year,
    month,
    day,
    hour,
    minute,
    localIso,
    display12h,
    display24h,
    displayDate,
    displayFull,
    offsetString,
    offsetMinutes,
  };
}

/**
 * Parses an offset-free local time string (e.g. '2026-11-23T15:00') as interpreted in a given IANA timezone.
 * Avoids using browser-local timezone!
 */
export function parseLocalIsoInTimezone(localIsoStr: string, timezone: string): Date {
  const match = localIsoStr.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!match) {
    const d = new Date(localIsoStr);
    if (!isNaN(d.getTime())) return d;
    throw new Error(`Unparseable date string: "${localIsoStr}"`);
  }

  const [, y, m, d, h, min, s] = match;
  const year = parseInt(y, 10);
  const month = parseInt(m, 10) - 1;
  const day = parseInt(d, 10);
  const hour = parseInt(h, 10);
  const minute = parseInt(min, 10);
  const second = s ? parseInt(s, 10) : 0;

  // Approximate UTC time by treating numbers as UTC
  let targetUtc = Date.UTC(year, month, day, hour, minute, second);

  // Iteratively compute offset to converge on exact instant (handles DST and fractional offsets)
  for (let iter = 0; iter < 3; iter++) {
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      hour12: false,
    });
    const parts = dtf.formatToParts(new Date(targetUtc));
    const pMap: Record<string, string> = {};
    for (const p of parts) pMap[p.type] = p.value;

    let localH = parseInt(pMap.hour, 10);
    if (localH === 24) localH = 0;
    const localM = parseInt(pMap.month, 10) - 1;
    const localD = parseInt(pMap.day, 10);
    const localMin = parseInt(pMap.minute, 10);
    const localSec = parseInt(pMap.second, 10);

    const actualLocalMs = Date.UTC(parseInt(pMap.year, 10), localM, localD, localH, localMin, localSec);
    const desiredLocalMs = Date.UTC(year, month, day, hour, minute, second);
    const delta = desiredLocalMs - actualLocalMs;

    if (delta === 0) break;
    targetUtc += delta;
  }

  return new Date(targetUtc);
}
