/**
 * Avir World Geography & Regional Classification Service
 * Provides robust country code mapping, continent classification,
 * and geographic disambiguation without biased fallbacks.
 */

export type WorldRegion =
  | 'All'
  | 'Asia'
  | 'Europe'
  | 'Americas'
  | 'Middle East & Africa'
  | 'Oceania'
  | 'Other';

/**
 * ISO 3166-1 alpha-2 to World Region mapping
 */
const COUNTRY_CODE_TO_REGION: Record<string, Exclude<WorldRegion, 'All' | 'Other'>> = {
  // Asia
  IN: 'Asia',
  PK: 'Asia',
  BD: 'Asia',
  CN: 'Asia',
  JP: 'Asia',
  KR: 'Asia',
  TH: 'Asia',
  ID: 'Asia',
  VN: 'Asia',
  SG: 'Asia',
  MY: 'Asia',
  PH: 'Asia',
  MM: 'Asia',
  NP: 'Asia',
  LK: 'Asia',
  KH: 'Asia',
  LA: 'Asia',
  MN: 'Asia',
  TW: 'Asia',
  HK: 'Asia',
  AF: 'Asia',
  KZ: 'Asia',
  UZ: 'Asia',

  // Europe
  GB: 'Europe',
  UK: 'Europe', // common alias
  FR: 'Europe',
  DE: 'Europe',
  IT: 'Europe',
  ES: 'Europe',
  PL: 'Europe',
  NL: 'Europe',
  BE: 'Europe',
  SE: 'Europe',
  NO: 'Europe',
  FI: 'Europe',
  DK: 'Europe',
  CH: 'Europe',
  AT: 'Europe',
  IE: 'Europe',
  PT: 'Europe',
  GR: 'Europe',
  CZ: 'Europe',
  RO: 'Europe',
  HU: 'Europe',
  UA: 'Europe',
  BG: 'Europe',
  HR: 'Europe',
  SK: 'Europe',
  RS: 'Europe',
  IS: 'Europe',

  // Americas
  US: 'Americas',
  USA: 'Americas', // alias
  CA: 'Americas',
  MX: 'Americas',
  BR: 'Americas',
  AR: 'Americas',
  CL: 'Americas',
  CO: 'Americas',
  PE: 'Americas',
  VE: 'Americas',
  EC: 'Americas',
  GT: 'Americas',
  CU: 'Americas',
  BO: 'Americas',
  DO: 'Americas',
  CR: 'Americas',
  PA: 'Americas',
  UY: 'Americas',
  PY: 'Americas',
  JM: 'Americas',
  TT: 'Americas',

  // Middle East & Africa
  AE: 'Middle East & Africa',
  SA: 'Middle East & Africa',
  EG: 'Middle East & Africa',
  QA: 'Middle East & Africa',
  KW: 'Middle East & Africa',
  BH: 'Middle East & Africa',
  OM: 'Middle East & Africa',
  IL: 'Middle East & Africa',
  JO: 'Middle East & Africa',
  LB: 'Middle East & Africa',
  IQ: 'Middle East & Africa',
  IR: 'Middle East & Africa',
  TR: 'Middle East & Africa',
  ZA: 'Middle East & Africa',
  NG: 'Middle East & Africa',
  KE: 'Middle East & Africa',
  ET: 'Middle East & Africa',
  GH: 'Middle East & Africa',
  MA: 'Middle East & Africa',
  DZ: 'Middle East & Africa',
  TN: 'Middle East & Africa',
  TZ: 'Middle East & Africa',
  UG: 'Middle East & Africa',
  SN: 'Middle East & Africa',
  RW: 'Middle East & Africa',
  ZW: 'Middle East & Africa',

  // Oceania
  AU: 'Oceania',
  NZ: 'Oceania',
  FJ: 'Oceania',
  PG: 'Oceania',
};

/**
 * Country name to normalized code / region fallback dictionary
 */
const COUNTRY_NAME_TO_REGION: Array<{ pattern: RegExp; region: Exclude<WorldRegion, 'All' | 'Other'> }> = [
  { pattern: /united states|usa|america|canada|mexico|brazil|argentina|chile|colombia|peru|bolivia|uruguay|paraguay|ecuador|venezuela|guatemala|costa rica|panama/i, region: 'Americas' },
  { pattern: /united kingdom|great britain|england|scotland|wales|france|germany|italy|spain|poland|netherlands|belgium|sweden|norway|finland|denmark|switzerland|austria|ireland|portugal|greece|czech|romania|hungary|ukraine|iceland/i, region: 'Europe' },
  { pattern: /australia|new zealand|fiji|papua new guinea|samoa|tonga/i, region: 'Oceania' },
  { pattern: /united arab emirates|uae|saudi arabia|egypt|qatar|kuwait|bahrain|oman|israel|jordan|lebanon|iraq|iran|turkey|south africa|nigeria|kenya|ethiopia|ghana|morocco|algeria|tunisia|tanzania|uganda/i, region: 'Middle East & Africa' },
  { pattern: /india|pakistan|bangladesh|china|japan|korea|thailand|indonesia|vietnam|singapore|malaysia|philippines|myanmar|nepal|sri lanka|cambodia|laos|mongolia|taiwan|hong kong/i, region: 'Asia' },
];

/**
 * Classifies a geographic location into a valid WorldRegion based on country code or name.
 * Strictly avoids default-to-Asia bias: unknown locations resolve to 'Other'.
 */
export function classifyWorldRegion(country: string, countryCode?: string | null): WorldRegion {
  if (countryCode) {
    const code = countryCode.trim().toUpperCase();
    if (COUNTRY_CODE_TO_REGION[code]) {
      return COUNTRY_CODE_TO_REGION[code];
    }
  }

  if (country && country.trim().length > 0) {
    for (const entry of COUNTRY_NAME_TO_REGION) {
      if (entry.pattern.test(country)) {
        return entry.region;
      }
    }
  }

  return 'Other';
}

/**
 * Generates a stable, collision-free unique identifier for world cities.
 * Avoids name-only collisions (e.g. London UK vs London Ontario Canada).
 */
export function getStableCityId(city: {
  id?: number | string;
  cityId?: string;
  name: string;
  country: string;
  countryCode?: string | null;
  latitude: number;
  longitude: number;
}): string {
  if (city.cityId && typeof city.cityId === 'string' && city.cityId.length > 0) {
    return city.cityId;
  }
  const code = (city.countryCode || city.country || 'xx').toLowerCase().replace(/[^a-z0-9]/g, '');
  const name = city.name.toLowerCase().replace(/[^a-z0-9]/g, '');
  const lat = Math.round(city.latitude * 100);
  const lon = Math.round(city.longitude * 100);
  return `${code}-${name}-${lat}-${lon}`;
}
