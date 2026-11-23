/**
 * AVIR — CAQM GRAP Status Resolver & Jurisdiction Assessment Engine
 * Step 8: Production-Grade Regulatory Status Resolution for National Capital Region (NCR)
 */

import {
  RegulatoryOrder,
  OfficialGrapStatus,
  GrapStage,
  JurisdictionAssessment,
  JurisdictionStatus,
} from '@/domain/regulatory-orders';
import { officialOrderService } from './official-order-service';

export type { JurisdictionAssessment, JurisdictionStatus };

/**
 * Authoritative list of administrative districts comprising the National Capital Region (NCR)
 * under the National Capital Region Planning Board Act, 1985 and CAQM Act, 2021.
 */
const NCR_TERRITORIES = {
  DELHI: [
    'delhi',
    'delhi-ncr',
    'new delhi',
    'central delhi',
    'east delhi',
    'north delhi',
    'north east delhi',
    'north west delhi',
    'shahdara',
    'south delhi',
    'south east delhi',
    'south west delhi',
    'west delhi',
    'nct of delhi',
  ],
  HARYANA_NCR: [
    'gurugram',
    'gurgaon',
    'faridabad',
    'sonipat',
    'sonepat',
    'jhajjar',
    'panipat',
    'rohtak',
    'palwal',
    'rewari',
    'nuh',
    'mewat',
    'bhiwani',
    'charkhi dadri',
    'mahendragarh',
    'narnaul',
    'jind',
    'karnal',
  ],
  UP_NCR: [
    'noida',
    'greater noida',
    'gautam buddha nagar',
    'gautam budh nagar',
    'ghaziabad',
    'meerut',
    'baghpat',
    'hapur',
    'bulandshahr',
    'bulandshahr',
    'muzaffarnagar',
    'shamli',
  ],
  RAJASTHAN_NCR: [
    'alwar',
    'bharatpur',
  ],
};

const KNOWN_NON_NCR_METROS = [
  'mumbai',
  'bengaluru',
  'bangalore',
  'kolkata',
  'calcutta',
  'chennai',
  'madras',
  'hyderabad',
  'pune',
  'patna',
  'lucknow',
  'kanpur',
  'varanasi',
  'ahmedabad',
  'jaipur',
  'chandigarh',
  'bhopal',
  'indore',
  'coimbatore',
  'kochi',
  'thiruvananthapuram',
  'lahore',
  'beijing',
  'tokyo',
  'london',
  'new york',
];

const NON_NCR_STATES = new Set([
  'west bengal',
  'wb',
  'tamil nadu',
  'tn',
  'maharashtra',
  'mh',
  'karnataka',
  'ka',
  'kerala',
  'kl',
  'telangana',
  'ts',
  'andhra pradesh',
  'ap',
  'gujarat',
  'gj',
  'punjab',
  'pb',
  'bihar',
  'br',
  'odisha',
  'orissa',
  'assam',
  'madhya pradesh',
  'mp',
  'uttarakhand',
  'uk',
  'himachal pradesh',
  'hp',
  'jammu and kashmir',
  'j&k',
  'goa',
  'jharkhand',
  'chhattisgarh',
]);

function matchesDistrict(cityText: string, districtName: string): boolean {
  const normCity = cityText.trim().toLowerCase();
  const normDist = districtName.trim().toLowerCase();
  if (normCity === normDist) return true;
  const escaped = normDist.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
  const regex = new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i');
  return regex.test(normCity);
}


export interface LocationAssessmentParams {
  cityName?: string | null;
  admin1?: string | null;
  countryCode?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

/**
 * Assesses whether a location belongs strictly to the National Capital Region (NCR) jurisdiction.
 * Avoids crude rectangular lat/lon bounding boxes that falsely absorb non-NCR cities like Agra or Mathura.
 */
export function assessJurisdiction(params: LocationAssessmentParams): JurisdictionAssessment {
  const city = (params.cityName || '').trim().toLowerCase();
  const admin1 = (params.admin1 || '').trim().toLowerCase();
  const countryCode = (params.countryCode || '').trim().toUpperCase();

  // If country is specified and not India, strictly non-NCR
  if (countryCode && countryCode !== 'IN') {
    return {
      isNcr: false,
      status: 'not_applicable',
      confidence: 'high',
      regionName: params.cityName || 'International Location',
      details: 'Location is outside India; CAQM statutory regulations do not apply.',
    };
  }

  // If admin1 (state) is an unambiguous non-NCR state
  if (admin1 && NON_NCR_STATES.has(admin1)) {
    return {
      isNcr: false,
      status: 'not_applicable',
      confidence: 'high',
      regionName: params.cityName || 'Non-NCR Location',
      details: `State "${params.admin1}" is outside the National Capital Region (NCR); CAQM GRAP directives are not legally applicable.`,
    };
  }

  // Check known non-NCR metros first
  for (const nonNcr of KNOWN_NON_NCR_METROS) {
    if (matchesDistrict(city, nonNcr)) {
      return {
        isNcr: false,
        status: 'not_applicable',
        confidence: 'high',
        regionName: params.cityName || 'Non-NCR City',
        details: `${params.cityName || 'This city'} is located outside the National Capital Region (NCR); CAQM GRAP directives are not legally applicable.`,
      };
    }
  }

  // Check NCT of Delhi
  for (const name of NCR_TERRITORIES.DELHI) {
    if (matchesDistrict(city, name) || (admin1 === 'delhi' && matchesDistrict(city, name))) {
      return {
        isNcr: true,
        status: 'applicable',
        confidence: 'verified_official',
        regionName: 'NCT of Delhi (NCR Core)',
        matchedDistrict: name,
        details: 'NCT of Delhi falls under the primary statutory jurisdiction of CAQM.',
      };
    }
  }
  if (admin1 === 'delhi' && (city === '' || city === 'delhi' || city === 'new delhi')) {
    return {
      isNcr: true,
      status: 'applicable',
      confidence: 'verified_official',
      regionName: 'NCT of Delhi (NCR Core)',
      matchedDistrict: 'delhi',
      details: 'NCT of Delhi falls under the primary statutory jurisdiction of CAQM.',
    };
  }

  // Check Haryana NCR districts
  for (const dist of NCR_TERRITORIES.HARYANA_NCR) {
    if (matchesDistrict(city, dist)) {
      // Must not belong to an explicit non-Haryana state
      if (!admin1 || admin1.includes('haryana') || admin1 === 'delhi') {
        return {
          isNcr: true,
          status: 'applicable',
          confidence: 'verified_official',
          regionName: `${dist.toUpperCase()} (Haryana NCR)`,
          matchedDistrict: dist,
          details: `${dist.toUpperCase()} is a designated NCR district subject to CAQM statutory directives.`,
        };
      }
    }
  }

  // Check Uttar Pradesh NCR districts
  for (const dist of NCR_TERRITORIES.UP_NCR) {
    if (matchesDistrict(city, dist)) {
      if (!admin1 || admin1.includes('uttar pradesh') || admin1 === 'up') {
        return {
          isNcr: true,
          status: 'applicable',
          confidence: 'verified_official',
          regionName: `${dist.toUpperCase()} (Uttar Pradesh NCR)`,
          matchedDistrict: dist,
          details: `${dist.toUpperCase()} is a designated NCR district subject to CAQM statutory directives.`,
        };
      }
    }
  }

  // Check Rajasthan NCR districts
  for (const dist of NCR_TERRITORIES.RAJASTHAN_NCR) {
    if (matchesDistrict(city, dist)) {
      if (!admin1 || admin1.includes('rajasthan')) {
        return {
          isNcr: true,
          status: 'applicable',
          confidence: 'verified_official',
          regionName: `${dist.toUpperCase()} (Rajasthan NCR)`,
          matchedDistrict: dist,
          details: `${dist.toUpperCase()} is an NCR district subject to CAQM statutory directives.`,
        };
      }
    }
  }

  // Coordinates-based verification for NCR perimeter (28.2 to 28.9 N, 76.8 to 77.5 E)
  // Only applied if state is Delhi, Haryana, or UP
  if (
    params.latitude !== null &&
    params.latitude !== undefined &&
    params.longitude !== null &&
    params.longitude !== undefined &&
    Number.isFinite(params.latitude) &&
    Number.isFinite(params.longitude)
  ) {
    const lat = params.latitude;
    const lon = params.longitude;

    const inNcrCore = lat >= 28.2 && lat <= 28.9 && lon >= 76.8 && lon <= 77.5;
    if (inNcrCore && (admin1 === 'delhi' || admin1.includes('haryana') || admin1.includes('uttar pradesh'))) {
      return {
        isNcr: true,
        status: 'applicable',
        confidence: 'medium',
        regionName: params.cityName || 'NCR Territory (Coordinate Match)',
        details: 'Coordinates match the geographic National Capital Region; CAQM directives apply.',
      };
    }
  }

  // Unknown / Ambiguous location
  return {
    isNcr: false,
    status: 'unknown',
    confidence: 'unknown',
    regionName: params.cityName || 'Unverified Jurisdiction',
    details: 'Jurisdiction uncertain: could not verify whether coordinates or administrative territory fall within the statutory NCR boundary.',
  };
}

/**
 * Resolves the official, legally active CAQM GRAP status for a given location and timestamp.
 *
 * Enforces key regulatory rules:
 * 1. Legal activation requires an authentic CAQM invocation order.
 * 2. Revoking a higher stage (e.g. Stage III) leaves lower stages (Stage I & II) active unless explicitly revoked.
 * 3. Independent restrictions (e.g., DG set emission controls) survive stage revocations.
 * 4. Non-NCR locations return 'not_applicable'.
 * 5. Missing or unverifiable orders return 'unknown' with "Official status not verified".
 */
export function resolveOfficialGrapStatus(
  orders: RegulatoryOrder[] = officialOrderService.getOrders(),
  location: LocationAssessmentParams,
  atTime?: string,
  options?: { registryVerificationTime?: string | null; maxFreshnessHours?: number }
): OfficialGrapStatus {
  const checkTime = atTime ? new Date(atTime).getTime() : Date.now();
  const jurisdiction = assessJurisdiction(location);

  // Non-NCR locations
  if (!jurisdiction.isNcr && jurisdiction.confidence === 'high') {
    return {
      jurisdiction: jurisdiction.regionName,
      verification: 'not_applicable',
      highestActiveStage: null,
      activeStages: [],
      governingOrderIds: [],
      independentRestrictionOrderIds: [],
      effectiveAt: null,
      lastVerifiedAt: null,
      explanation: `CAQM Graded Response Action Plan (GRAP) orders are statutory regulations applicable exclusively within the National Capital Region (NCR). Not applicable to ${location.cityName || 'this location'}.`,
      independentRestrictions: [],
    };
  }

  if (jurisdiction.confidence === 'unknown') {
    return {
      jurisdiction: jurisdiction.regionName,
      verification: 'unknown',
      highestActiveStage: null,
      activeStages: [],
      governingOrderIds: [],
      independentRestrictionOrderIds: [],
      effectiveAt: null,
      lastVerifiedAt: null,
      explanation: 'Official regulatory status not verified: administrative boundary could not be confirmed as part of the National Capital Region.',
      independentRestrictions: [],
    };
  }

  // Check explicit registry verification freshness if specified
  if (options?.registryVerificationTime !== undefined) {
    if (options.registryVerificationTime === null) {
      return {
        jurisdiction: jurisdiction.regionName,
        verification: 'unknown',
        highestActiveStage: null,
        activeStages: [],
        governingOrderIds: [],
        independentRestrictionOrderIds: [],
        effectiveAt: null,
        lastVerifiedAt: null,
        explanation: 'Official regulatory status not verified: order registry verification timestamp is unavailable.',
        independentRestrictions: [],
      };
    }
    const regTimeMs = new Date(options.registryVerificationTime).getTime();
    const maxFreshnessMs = (options.maxFreshnessHours ?? 48) * 3600 * 1000;
    if (checkTime - regTimeMs > maxFreshnessMs) {
      return {
        jurisdiction: jurisdiction.regionName,
        verification: 'unknown',
        highestActiveStage: null,
        activeStages: [],
        governingOrderIds: [],
        independentRestrictionOrderIds: [],
        effectiveAt: null,
        lastVerifiedAt: options.registryVerificationTime,
        explanation: `Official regulatory status not verified: official order registry was last verified on ${options.registryVerificationTime} (stale, exceeds ${options.maxFreshnessHours ?? 48}-hour freshness threshold). Current CAQM gazette notifications must be verified.`,
        independentRestrictions: [],
      };
    }
  }

  // Filter orders verified by official authorities
  const verifiedOrders = orders.filter((o) => o.status === 'verified_official');

  if (verifiedOrders.length === 0) {
    return {
      jurisdiction: jurisdiction.regionName,
      verification: 'unknown',
      highestActiveStage: null,
      activeStages: [],
      governingOrderIds: [],
      independentRestrictionOrderIds: [],
      effectiveAt: null,
      lastVerifiedAt: null,
      explanation: 'Official status not verified: no authoritative CAQM gazette notifications available in registry.',
      independentRestrictions: [],
    };
  }

  // Track active stages and orders
  const activeStagesMap = new Map<GrapStage, { orderId: string; effectiveFrom: string }>();
  const governingOrderIds = new Set<string>();
  const independentRestrictionOrderIds = new Set<string>();
  const independentRestrictions: string[] = [];

  // Sort orders chronologically by effectiveFrom
  const sortedOrders = [...verifiedOrders].sort((a, b) => {
    const tA = a.effectiveFrom ? new Date(a.effectiveFrom).getTime() : 0;
    const tB = b.effectiveFrom ? new Date(b.effectiveFrom).getTime() : 0;
    return tA - tB;
  });

  for (const order of sortedOrders) {
    const effTime = order.effectiveFrom ? new Date(order.effectiveFrom).getTime() : 0;
    const expTime = order.effectiveUntil ? new Date(order.effectiveUntil).getTime() : Infinity;

    // Skip future orders not yet in effect at checkTime
    if (effTime > checkTime) continue;

    // Handle Independent Restrictions
    if (order.action === 'independent_restriction') {
      if (checkTime < expTime) {
        independentRestrictionOrderIds.add(order.id);
        independentRestrictions.push(order.title);
      }
      continue;
    }

    // Handle Stage Invocations
    if (order.action === 'invoke' && order.grapStage) {
      if (checkTime < expTime) {
        activeStagesMap.set(order.grapStage, {
          orderId: order.id,
          effectiveFrom: order.effectiveFrom || '',
        });
        governingOrderIds.add(order.id);
      } else {
        activeStagesMap.delete(order.grapStage);
        governingOrderIds.delete(order.id);
      }
    }

    // Handle Stage Revocations
    if (order.action === 'revoke' && order.grapStage) {
      // The revocation order is active if effTime <= checkTime < expTime
      if (checkTime >= effTime && checkTime < expTime) {
        activeStagesMap.delete(order.grapStage);
        governingOrderIds.add(order.id);

        // Remove the revoked invocation order from governing IDs
        for (const supersededId of order.supersedesOrderIds || []) {
          governingOrderIds.delete(supersededId);
        }
      }
    }
  }

  const activeStages = Array.from(activeStagesMap.keys()).sort((a, b) => a - b);
  const highestActiveStage = activeStages.length > 0 ? (Math.max(...activeStages) as GrapStage) : null;

  let explanation = '';
  if (highestActiveStage !== null) {
    const stageNames: Record<GrapStage, string> = {
      1: 'Stage-I (Poor Air Quality)',
      2: 'Stage-II (Very Poor Air Quality)',
      3: 'Stage-III (Severe Air Quality)',
      4: 'Stage-IV (Severe+ Air Quality)',
    };
    explanation = `CAQM Graded Response Action Plan ${stageNames[highestActiveStage]} is currently in statutory effect across the entire NCR.`;
    if (activeStages.length > 1) {
      explanation += ` Cumulative measures under stages ${activeStages.map((s) => `Stage-${s}`).join(', ')} apply simultaneously.`;
    }
  } else {
    explanation = 'No emergency CAQM GRAP stages are currently invoked in NCR based on verified official notices.';
  }

  // Find latest verified timestamp
  let latestVerification: string | null = null;
  for (const o of verifiedOrders) {
    if (o.verifiedAt && (!latestVerification || o.verifiedAt > latestVerification)) {
      latestVerification = o.verifiedAt;
    }
  }

  return {
    jurisdiction: jurisdiction.regionName,
    verification: 'verified',
    highestActiveStage,
    activeStages,
    governingOrderIds: Array.from(governingOrderIds),
    independentRestrictionOrderIds: Array.from(independentRestrictionOrderIds),
    effectiveAt: highestActiveStage !== null ? activeStagesMap.get(highestActiveStage)?.effectiveFrom || null : null,
    lastVerifiedAt: latestVerification,
    explanation,
    independentRestrictions,
  };
}

/**
 * Ergonomic resolver wrapper for GRAP status with structured parameters.
 */
export function resolveGrapStatus(params: {
  cityName?: string | null;
  admin1?: string | null;
  countryCode?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  currentAqi?: number | null;
  now?: Date;
  registryVerificationTime?: string | null;
  orders?: RegulatoryOrder[];
}): OfficialGrapStatus {
  const orders = params.orders || officialOrderService.getOrders();
  const atTime = params.now ? params.now.toISOString() : undefined;
  return resolveOfficialGrapStatus(
    orders,
    {
      cityName: params.cityName,
      admin1: params.admin1,
      countryCode: params.countryCode,
      latitude: params.latitude,
      longitude: params.longitude,
    },
    atTime,
    { registryVerificationTime: params.registryVerificationTime }
  );
}
