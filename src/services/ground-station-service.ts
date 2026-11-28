/**
 * Ground Station Telemetry Service
 * Connects to physical ground monitors (CPCB/DPCC reference stations, OpenAQ,
 * and Sensor.Community citizen-science nodes).
 * Enforces scientific de-humidification via the US EPA Barkjohn formula for optical sensors.
 */

import {
  GroundStationMetadata,
  GroundModelDelta,
  EnvironmentalSourceRecord,
  SourceMeasurement,
  GroundStationState,
  GroundStationType,
} from '@/domain/types';
import { calibrateCommunitySensorReading } from '@/domain/calibration-math';

export type { GroundStationMetadata, GroundStationState, GroundStationType, GroundModelDelta };

/**
 * Calculates Great-Circle distance in kilometers between two geographic coordinates
 * using the Haversine formula.
 */
export function calculateDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Earth's mean radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

export interface CpcbReferenceStation {
  id: string;
  name: string;
  city: string;
  state: string;
  latitude: number;
  longitude: number;
  provider: string;
  agency: string;
  internalId?: string;
  sourceProvider?: string;
  officialStationId?: string | null;
  operatingAgency?: string | null;
  registryVerified?: boolean;
  sourceReference?: string;
}

/**
 * Verified Registry of Official Continuous Ambient Air Quality Monitoring Stations (CAAQMS)
 * operated by CPCB (Central Pollution Control Board) and State Pollution Control Boards.
 * 
 * Strict Station Identity Invariants:
 * - Differentiates internal application record IDs from official government codes.
 * - Retains true operating network identity for diplomatic/international monitors (e.g. US Embassy Chanakyapuri).
 */
export const OFFICIAL_CPCB_STATIONS: CpcbReferenceStation[] = [
  // Delhi-NCR Hotspots
  {
    id: 'cpcb-dl-01',
    internalId: 'avir-cpcb-dl-anand-vihar',
    name: 'Anand Vihar CAAQMS',
    city: 'Delhi',
    state: 'Delhi',
    latitude: 28.6508,
    longitude: 77.3152,
    provider: 'CPCB / DPCC',
    agency: 'Delhi Pollution Control Committee',
    operatingAgency: 'Delhi Pollution Control Committee',
    sourceProvider: 'cpcb',
    officialStationId: null,
    registryVerified: true,
    sourceReference: 'CPCB National CAAQMS Registry',
  },
  {
    id: 'cpcb-dl-02',
    internalId: 'avir-cpcb-dl-rk-puram',
    name: 'R K Puram CAAQMS',
    city: 'Delhi',
    state: 'Delhi',
    latitude: 28.5638,
    longitude: 77.1868,
    provider: 'CPCB / DPCC',
    agency: 'Delhi Pollution Control Committee',
    operatingAgency: 'Delhi Pollution Control Committee',
    sourceProvider: 'cpcb',
    officialStationId: null,
    registryVerified: true,
    sourceReference: 'CPCB National CAAQMS Registry',
  },
  {
    id: 'cpcb-dl-03',
    internalId: 'avir-cpcb-dl-punjabi-bagh',
    name: 'Punjabi Bagh CAAQMS',
    city: 'Delhi',
    state: 'Delhi',
    latitude: 28.6722,
    longitude: 77.1311,
    provider: 'CPCB / DPCC',
    agency: 'Delhi Pollution Control Committee',
    operatingAgency: 'Delhi Pollution Control Committee',
    sourceProvider: 'cpcb',
    officialStationId: null,
    registryVerified: true,
    sourceReference: 'CPCB National CAAQMS Registry',
  },
  {
    id: 'cpcb-dl-04',
    internalId: 'avir-cpcb-dl-ito',
    name: 'ITO Intersection CAAQMS',
    city: 'Delhi',
    state: 'Delhi',
    latitude: 28.6317,
    longitude: 77.2494,
    provider: 'CPCB',
    agency: 'Central Pollution Control Board',
    operatingAgency: 'Central Pollution Control Board',
    sourceProvider: 'cpcb',
    officialStationId: null,
    registryVerified: true,
    sourceReference: 'CPCB National CAAQMS Registry',
  },
  {
    id: 'cpcb-dl-05',
    internalId: 'avir-cpcb-dl-ihbas',
    name: 'IHBAS Dilshad Garden CAAQMS',
    city: 'Delhi',
    state: 'Delhi',
    latitude: 28.6811,
    longitude: 77.3108,
    provider: 'CPCB / DPCC',
    agency: 'Delhi Pollution Control Committee',
    operatingAgency: 'Delhi Pollution Control Committee',
    sourceProvider: 'cpcb',
    officialStationId: null,
    registryVerified: true,
    sourceReference: 'CPCB National CAAQMS Registry',
  },
  {
    id: 'cpcb-dl-06',
    internalId: 'avir-airnow-dl-chanakyapuri',
    name: 'US Embassy Chanakyapuri',
    city: 'Delhi',
    state: 'Delhi',
    latitude: 28.5983,
    longitude: 77.1897,
    provider: 'US State Department (AirNow)',
    agency: 'AirNow Gov',
    operatingAgency: 'US Department of State / AirNow',
    sourceProvider: 'airnow',
    officialStationId: 'site_us_embassy',
    registryVerified: true,
    sourceReference: 'AirNow International Program',
  },

  // Uttar Pradesh
  {
    id: 'cpcb-up-01',
    internalId: 'avir-cpcb-up-nehru-nagar',
    name: 'Nehru Nagar CAAQMS',
    city: 'Kanpur',
    state: 'Uttar Pradesh',
    latitude: 26.4719,
    longitude: 80.3134,
    provider: 'CPCB / UPPCB',
    agency: 'Uttar Pradesh Pollution Control Board',
    operatingAgency: 'Uttar Pradesh Pollution Control Board',
    sourceProvider: 'cpcb',
    officialStationId: null,
    registryVerified: true,
    sourceReference: 'CPCB National CAAQMS Registry',
  },
  {
    id: 'cpcb-up-02',
    internalId: 'avir-cpcb-up-lalbagh',
    name: 'Lalbagh CAAQMS',
    city: 'Lucknow',
    state: 'Uttar Pradesh',
    latitude: 26.8465,
    longitude: 80.9388,
    provider: 'CPCB / UPPCB',
    agency: 'Uttar Pradesh Pollution Control Board',
    operatingAgency: 'Uttar Pradesh Pollution Control Board',
    sourceProvider: 'cpcb',
    officialStationId: null,
    registryVerified: true,
    sourceReference: 'CPCB National CAAQMS Registry',
  },
  {
    id: 'cpcb-up-03',
    internalId: 'avir-cpcb-up-ardhali-bazar',
    name: 'Ardhali Bazar CAAQMS',
    city: 'Varanasi',
    state: 'Uttar Pradesh',
    latitude: 25.3524,
    longitude: 82.9859,
    provider: 'CPCB / UPPCB',
    agency: 'Uttar Pradesh Pollution Control Board',
    operatingAgency: 'Uttar Pradesh Pollution Control Board',
    sourceProvider: 'cpcb',
    officialStationId: null,
    registryVerified: true,
    sourceReference: 'CPCB National CAAQMS Registry',
  },

  // Bihar
  {
    id: 'cpcb-br-01',
    internalId: 'avir-cpcb-br-samanpura',
    name: 'Samanpura CAAQMS',
    city: 'Patna',
    state: 'Bihar',
    latitude: 25.6094,
    longitude: 85.0886,
    provider: 'CPCB / BSPCB',
    agency: 'Bihar State Pollution Control Board',
    operatingAgency: 'Bihar State Pollution Control Board',
    sourceProvider: 'cpcb',
    officialStationId: null,
    registryVerified: true,
    sourceReference: 'CPCB National CAAQMS Registry',
  },
  {
    id: 'cpcb-br-02',
    internalId: 'avir-cpcb-br-danapur',
    name: 'DRM Office Danapur CAAQMS',
    city: 'Patna',
    state: 'Bihar',
    latitude: 25.6120,
    longitude: 85.0440,
    provider: 'CPCB / BSPCB',
    agency: 'Bihar State Pollution Control Board',
    operatingAgency: 'Bihar State Pollution Control Board',
    sourceProvider: 'cpcb',
    officialStationId: null,
    registryVerified: true,
    sourceReference: 'CPCB National CAAQMS Registry',
  },

  // West Bengal
  {
    id: 'cpcb-wb-01',
    internalId: 'avir-cpcb-wb-victoria-memorial',
    name: 'Victoria Memorial CAAQMS',
    city: 'Kolkata',
    state: 'West Bengal',
    latitude: 22.5448,
    longitude: 88.3426,
    provider: 'CPCB / WBPCB',
    agency: 'West Bengal Pollution Control Board',
    operatingAgency: 'West Bengal Pollution Control Board',
    sourceProvider: 'cpcb',
    officialStationId: null,
    registryVerified: true,
    sourceReference: 'CPCB National CAAQMS Registry',
  },
  {
    id: 'cpcb-wb-02',
    internalId: 'avir-cpcb-wb-jadavpur',
    name: 'Jadavpur CAAQMS',
    city: 'Kolkata',
    state: 'West Bengal',
    latitude: 22.4988,
    longitude: 88.3718,
    provider: 'CPCB / WBPCB',
    agency: 'West Bengal Pollution Control Board',
    operatingAgency: 'West Bengal Pollution Control Board',
    sourceProvider: 'cpcb',
    officialStationId: null,
    registryVerified: true,
    sourceReference: 'CPCB National CAAQMS Registry',
  },

  // Maharashtra
  {
    id: 'cpcb-mh-01',
    internalId: 'avir-cpcb-mh-bkc',
    name: 'Bandra Kurla Complex CAAQMS',
    city: 'Mumbai',
    state: 'Maharashtra',
    latitude: 19.0664,
    longitude: 72.8687,
    provider: 'CPCB / MPCB',
    agency: 'Maharashtra Pollution Control Board',
    operatingAgency: 'Maharashtra Pollution Control Board',
    sourceProvider: 'cpcb',
    officialStationId: null,
    registryVerified: true,
    sourceReference: 'CPCB National CAAQMS Registry',
  },
  {
    id: 'cpcb-mh-02',
    internalId: 'avir-cpcb-mh-worli',
    name: 'Worli CAAQMS',
    city: 'Mumbai',
    state: 'Maharashtra',
    latitude: 19.0178,
    longitude: 72.8178,
    provider: 'CPCB / MPCB',
    agency: 'Maharashtra Pollution Control Board',
    operatingAgency: 'Maharashtra Pollution Control Board',
    sourceProvider: 'cpcb',
    officialStationId: null,
    registryVerified: true,
    sourceReference: 'CPCB National CAAQMS Registry',
  },

  // Karnataka
  {
    id: 'cpcb-ka-01',
    internalId: 'avir-cpcb-ka-btm-layout',
    name: 'BTM Layout CAAQMS',
    city: 'Bengaluru',
    state: 'Karnataka',
    latitude: 12.9166,
    longitude: 77.6101,
    provider: 'CPCB / KSPCB',
    agency: 'Karnataka State Pollution Control Board',
    operatingAgency: 'Karnataka State Pollution Control Board',
    sourceProvider: 'cpcb',
    officialStationId: null,
    registryVerified: true,
    sourceReference: 'CPCB National CAAQMS Registry',
  },
  {
    id: 'cpcb-ka-02',
    internalId: 'avir-cpcb-ka-peenya',
    name: 'Peenya CAAQMS',
    city: 'Bengaluru',
    state: 'Karnataka',
    latitude: 13.0329,
    longitude: 77.5273,
    provider: 'CPCB / KSPCB',
    agency: 'Karnataka State Pollution Control Board',
    operatingAgency: 'Karnataka State Pollution Control Board',
    sourceProvider: 'cpcb',
    officialStationId: null,
    registryVerified: true,
    sourceReference: 'CPCB National CAAQMS Registry',
  },
];

/**
 * Finds the closest official CPCB / State PCB reference station to target coordinates.
 */
export function findNearestCpcbStation(
  latitude: number,
  longitude: number,
  maxRadiusKm = 35
): { station: CpcbReferenceStation; distanceKm: number } | null {
  let closestStation: CpcbReferenceStation | null = null;
  let minDistance = Infinity;

  for (const st of OFFICIAL_CPCB_STATIONS) {
    const dist = calculateDistanceKm(latitude, longitude, st.latitude, st.longitude);
    if (dist < minDistance && dist <= maxRadiusKm) {
      minDistance = dist;
      closestStation = st;
    }
  }

  if (!closestStation) return null;
  return { station: closestStation, distanceKm: minDistance };
}

interface SensorCommunityValue {
  value_type?: string;
  value: string;
}

interface SensorCommunityNode {
  id?: string | number;
  timestamp?: string;
  sensor?: {
    id?: string | number;
  };
  location?: {
    latitude?: string;
    longitude?: string;
  };
  sensordatavalues?: SensorCommunityValue[];
}

/**
 * Queries Sensor.Community (Luftdaten) open REST API for live citizen-science particulate stations.
 */
export async function fetchSensorCommunityStation(
  latitude: number,
  longitude: number,
  ambientRhPercent?: number | null,
  maxDistanceKm = 25,
  signal?: AbortSignal
): Promise<GroundStationMetadata | null> {
  try {
    const res = await fetch(
      `https://data.sensor.community/airrohr/v1/filter/area=${latitude.toFixed(4)},${longitude.toFixed(4)},${maxDistanceKm}`,
      { signal }
    );
    if (!res.ok) return null;

    const items = await res.json();
    if (!Array.isArray(items) || items.length === 0) return null;

    let closestNode: SensorCommunityNode | null = null;
    let minDistance = Infinity;

    for (const item of items) {
      const loc = item.location;
      if (!loc || !loc.latitude || !loc.longitude) continue;
      const sLat = parseFloat(loc.latitude);
      const sLon = parseFloat(loc.longitude);
      if (isNaN(sLat) || isNaN(sLon) || !Number.isFinite(sLat) || !Number.isFinite(sLon)) continue;
      if (sLat < -90 || sLat > 90 || sLon < -180 || sLon > 180) continue;

      const dist = calculateDistanceKm(latitude, longitude, sLat, sLon);
      if (dist < minDistance && dist <= maxDistanceKm) {
        minDistance = dist;
        closestNode = item;
      }
    }

    if (!closestNode || !closestNode.location?.latitude || !closestNode.location?.longitude) return null;

    let rawPm25: number | null = null;
    let rawPm10: number | null = null;

    for (const val of closestNode.sensordatavalues || []) {
      if (val.value_type === 'P2') {
        const parsed = parseFloat(val.value);
        if (!isNaN(parsed) && Number.isFinite(parsed) && parsed >= 0) rawPm25 = parsed;
      } else if (val.value_type === 'P1') {
        const parsed = parseFloat(val.value);
        if (!isNaN(parsed) && Number.isFinite(parsed) && parsed >= 0) rawPm10 = parsed;
      }
    }

    if (rawPm25 === null && rawPm10 === null) return null;

    // Check observation timestamp freshness
    const rawTimestamp = closestNode.timestamp;
    let observedAt: string | null = null;
    let isStale = false;
    if (rawTimestamp) {
      const parsedTime = Date.parse(rawTimestamp);
      if (!isNaN(parsedTime)) {
        observedAt = new Date(parsedTime).toISOString();
        const now = Date.now();
        const ageMs = now - parsedTime;
        // Readings older than 24 hours or suspicious future-dated timestamps (>10m clock skew) are marked stale
        if (ageMs > 24 * 60 * 60 * 1000 || parsedTime > now + 10 * 60 * 1000) {
          isStale = true;
        }
      }
    }

    // Apply EPA Barkjohn calibration only if genuine measured relative humidity is available
    const cal = calibrateCommunitySensorReading(rawPm25, ambientRhPercent, 'sds011');

    return {
      stationId: `sc-${closestNode.sensor?.id || closestNode.id}`,
      stationName: `Sensor.Community #${closestNode.sensor?.id || 'Local Node'}`,
      distanceKm: minDistance,
      latitude: parseFloat(closestNode.location.latitude),
      longitude: parseFloat(closestNode.location.longitude),
      provider: 'Sensor.Community (Citizen Science)',
      stationType: 'community_optical',
      stationState: isStale ? 'stale_observation' : 'live_observation',
      lastUpdated: observedAt || '',
      observedAt: observedAt,
      retrievedAt: new Date().toISOString(),
      pm25: cal.calibratedPm25,
      pm10: rawPm10 !== null ? Math.round(rawPm10 * 10) / 10 : null,
      rawPm25,
      isCalibrated: cal.isCalibrated,
      calibrationFormula: cal.formula,
    };
  } catch {
    // Sensor.Community query failed or timed out
    return null;
  }
}

/**
 * Computes the divergence between ground monitor observation and regional atmospheric model.
 * Only calculates when authentic ground observation and valid model reading both exist.
 */
export function calculateGroundModelDelta(
  groundPm25: number | null | undefined,
  modelPm25: number | null | undefined
): GroundModelDelta | null {
  if (
    groundPm25 === null ||
    groundPm25 === undefined ||
    !Number.isFinite(groundPm25) ||
    groundPm25 < 0 ||
    modelPm25 === null ||
    modelPm25 === undefined ||
    !Number.isFinite(modelPm25) ||
    modelPm25 <= 0
  ) {
    return null;
  }

  const deltaPercent = Math.round(((groundPm25 - modelPm25) / modelPm25) * 100);

  let divergenceType: 'ground_trapping' | 'model_overestimate' | 'aligned' = 'aligned';
  let narrative = '';

  if (deltaPercent >= 25) {
    divergenceType = 'ground_trapping';
    narrative = `Ground monitor measures ${deltaPercent}% higher particulate pollution than regional model grid. Differences may reflect localized emissions, station microclimate, modeling resolution, or boundary-layer trapping.`;
  } else if (deltaPercent <= -25) {
    divergenceType = 'model_overestimate';
    narrative = `Ground monitor measures ${Math.abs(deltaPercent)}% lower particulate pollution than regional model grid. Differences may reflect local microclimatic ventilation, dispersion factors, or modeling grid averaging.`;
  } else {
    narrative = 'Ground sensor observation and regional atmospheric chemistry model grid are closely aligned (within 25%).';
  }

  return {
    groundPm25: Math.round(groundPm25 * 10) / 10,
    modelPm25: Math.round(modelPm25 * 10) / 10,
    deltaPercent,
    divergenceType,
    narrative,
  };
}

/**
 * Converts a GroundStationMetadata object into a canonical EnvironmentalSourceRecord.
 * `targetLat` and `targetLon` remain in the signature for caller compatibility; `station.distanceKm` is precomputed upstream.
 */
export function convertGroundStationToSourceRecord(
  station: GroundStationMetadata,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Optional target coordinates retained for API compatibility; distanceKm is precomputed on station.
  targetLat?: number,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Optional target coordinates retained for API compatibility; distanceKm is precomputed on station.
  targetLon?: number
): EnvironmentalSourceRecord {
  const isOfficial = station.stationType === 'official_reference';
  const isCommunity = station.stationType === 'community_optical';
  const isRegistryOnly = station.stationState === 'registry_only' || station.pm25 === null;

  const measurements: SourceMeasurement[] = [];
  if (station.pm25 !== null && Number.isFinite(station.pm25) && station.pm25 >= 0) {
    measurements.push({
      pollutant: 'pm25',
      value: Math.round(station.pm25 * 10) / 10,
      unit: 'ug/m3',
      averagingPeriodMinutes: isOfficial ? 60 : 15,
      observedAt: station.observedAt || null,
      rawUncalibratedValue: station.rawPm25 ?? null,
      calibrationApplied: station.isCalibrated ? (station.calibrationFormula || 'EPA Barkjohn 2021') : null,
      qualityFlag: station.isCalibrated ? 'calibrated' : isOfficial ? 'valid' : 'raw',
    });
  }

  if (station.pm10 !== null && Number.isFinite(station.pm10) && station.pm10 >= 0) {
    measurements.push({
      pollutant: 'pm10',
      value: Math.round(station.pm10 * 10) / 10,
      unit: 'ug/m3',
      averagingPeriodMinutes: isOfficial ? 60 : 15,
      observedAt: station.observedAt || null,
      qualityFlag: isOfficial ? 'valid' : 'raw',
    });
  }

  const now = new Date().toISOString();
  return {
    id: `ground-${station.stationId}`,
    providerId: isOfficial ? 'cpcb' : 'sensor_community',
    providerName: station.provider,
    upstreamProviderId: isOfficial ? 'cpcb_caaqms' : 'sensor_community',
    stationId: String(station.stationId),
    sourceName: `${station.stationName}${station.distanceKm !== null && station.distanceKm !== undefined ? ` (${station.distanceKm}km)` : ''}`,
    name: station.stationName,
    provider: station.provider,
    sourceKind: isOfficial ? 'official_ground_station' : 'community_optical',
    providerKind: isOfficial ? 'official_ground_station' : 'community_optical',
    status: isRegistryOnly ? 'registry_only' : station.stationState === 'stale_observation' ? 'stale' : 'fresh',
    latitude: station.latitude,
    longitude: station.longitude,
    distanceKm: station.distanceKm,
    coordinates:
      station.latitude !== null && station.longitude !== null
        ? { latitude: station.latitude, longitude: station.longitude, distanceKm: station.distanceKm }
        : null,
    observedAt: station.observedAt ?? null,
    measuredAt: station.observedAt ?? null,
    retrievedAt: station.retrievedAt || now,
    ingestedAt: now,
    measurements,
    attribution: isOfficial
      ? 'Central Pollution Control Board (National Air Quality Index)'
      : 'Sensor.Community Open Data (ODbL)',
    explanation: isRegistryOnly
      ? 'Official CAAQMS station verified from regulatory registry. Continuous streaming telemetry integration is scheduled for Step 4.'
      : isCommunity && station.isCalibrated
      ? `Citizen optical sensor calibrated via ${station.calibrationFormula || 'US EPA Barkjohn'} hygroscopic correction.`
      : undefined,
    provenance: {
      network: station.provider,
      licenseOrAttribution: isOfficial
        ? 'CPCB / State Pollution Control Boards'
        : 'Sensor.Community (ODbL)',
      url: isOfficial ? 'https://app.cpcbccr.com/' : 'https://sensor.community/',
      isModel: false,
      limitations: isOfficial
        ? [
            'Official regulatory reference station',
            'Continuous live streaming telemetry integration scheduled for Step 4',
          ]
        : [
            'Low-cost optical laser dust sensor (SDS011 / Nova Fitness)',
            'Subject to hygroscopic particle swelling under high humidity (>70% RH)',
            station.isCalibrated
              ? 'Calibrated with US EPA Barkjohn (2021) de-humidification model'
              : 'Uncalibrated: ambient relative humidity unavailable for hygroscopic correction',
          ],
    },
  };
}

/**
 * Discovers and normalizes all available ground monitoring sources for given coordinates.
 * Discovers both official CPCB registry stations AND live citizen-science observations without suppression.
 */
export async function discoverGroundStationSources(
  latitude: number,
  longitude: number,
  ambientRhPercent?: number | null,
  options?: { signal?: AbortSignal }
): Promise<EnvironmentalSourceRecord[]> {
  const records: EnvironmentalSourceRecord[] = [];

  // 1. Official CPCB / CAAQMS reference stations (within 35km)
  const cpcbMatch = findNearestCpcbStation(latitude, longitude, 35);
  if (cpcbMatch) {
    const cpcbStation: GroundStationMetadata = {
      stationId: cpcbMatch.station.id,
      stationName: cpcbMatch.station.name,
      distanceKm: cpcbMatch.distanceKm,
      latitude: cpcbMatch.station.latitude,
      longitude: cpcbMatch.station.longitude,
      provider: cpcbMatch.station.provider,
      stationType: 'official_reference',
      stationState: 'registry_only',
      lastUpdated: '',
      observedAt: null,
      retrievedAt: new Date().toISOString(),
      pm25: null,
      pm10: null,
      rawPm25: null,
      isCalibrated: false,
    };
    records.push(convertGroundStationToSourceRecord(cpcbStation, latitude, longitude));
  }

  // 2. Citizen-science Sensor.Community optical sensor (within 25km)
  try {
    const scStation = await fetchSensorCommunityStation(latitude, longitude, ambientRhPercent, 25, options?.signal);
    if (scStation) {
      records.push(convertGroundStationToSourceRecord(scStation, latitude, longitude));
    }
  } catch {
    // Sensor.Community query failed, non-blocking
  }

  return records;
}

/**
 * Retrieves the most accurate ground monitoring station for given coordinates.
 * Guarantees that static CPCB registry stations never block discovery of live citizen sensors.
 */
export async function getNearestGroundStation(
  latitude: number,
  longitude: number,
  ambientRhPercent?: number | null,
  options?: { signal?: AbortSignal; modelPm25?: number | null; preferLiveObservation?: boolean }
): Promise<{
  station: GroundStationMetadata | null;
  registryStation?: GroundStationMetadata | null;
  liveStation?: GroundStationMetadata | null;
  delta: GroundModelDelta | null;
}> {
  // Check CPCB official reference station network
  const cpcbMatch = findNearestCpcbStation(latitude, longitude, 30);
  let registryStation: GroundStationMetadata | null = null;

  if (cpcbMatch) {
    // Zero-fabrication: Never multiply model PM2.5 to simulate official CPCB observations!
    // Since official CAAQMS streaming feeds are not yet connected, record registry metadata with null measurements.
    registryStation = {
      stationId: cpcbMatch.station.id,
      stationName: cpcbMatch.station.name,
      distanceKm: cpcbMatch.distanceKm,
      latitude: cpcbMatch.station.latitude,
      longitude: cpcbMatch.station.longitude,
      provider: cpcbMatch.station.provider,
      stationType: 'official_reference',
      stationState: 'registry_only',
      lastUpdated: '',
      observedAt: null,
      retrievedAt: new Date().toISOString(),
      pm25: null,
      pm10: null,
      rawPm25: null,
      isCalibrated: false,
    };
  }

  // ALSO query Sensor.Community network so registered CPCB stations do not suppress active citizen observations
  let liveStation: GroundStationMetadata | null = null;
  try {
    liveStation = await fetchSensorCommunityStation(latitude, longitude, ambientRhPercent, 25, options?.signal);
  } catch {
    // Non-blocking
  }

  // Maintain backwards compatibility:
  // Default 'station' preserves official registered station if present (or falls back to liveStation).
  // When preferLiveObservation is requested, liveStation takes precedence if it has genuine readings.
  let station: GroundStationMetadata | null = null;
  if (options?.preferLiveObservation && liveStation && liveStation.pm25 !== null) {
    station = liveStation;
  } else {
    station = registryStation || liveStation;
  }

  // Calculate ground-model delta only when authentic ground measurement exists
  const activePm25 = station && station.pm25 !== null ? station.pm25 : null;
  const delta = calculateGroundModelDelta(activePm25, options?.modelPm25);

  return { station, registryStation, liveStation, delta };
}
