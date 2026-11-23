/**
 * AVIR — Personal Air-Monitor Packet Normalizer & Validator (Step 5/24)
 *
 * Implements strict schema validation, physical boundary checking,
 * timestamp provenance separation, privacy-safe diagnostics,
 * and centralized scientific calibration gating.
 */

import {
  DeviceProfile,
  DeviceTransportType,
  DeviceIdentityStatus,
  detectDeviceProfile,
  VERIFIED_DEVICE_PROFILES,
} from './device-profiles';
import {
  DeviceCalibrationStatus,
  evaluateSensorCalibrationEligibility,
} from '@/domain/calibration-math';

export type PacketQuality =
  | 'valid'
  | 'partial'
  | 'invalid'
  | 'unsupported_protocol';

export interface VerifiedDevicePacket {
  sessionId: string;
  deviceId: string | null;
  profile: DeviceProfile;
  transport: DeviceTransportType;
  identityStatus: DeviceIdentityStatus;
  quality: PacketQuality;

  // Concentrations & physical metrics
  pm25: number | null;
  pm10: number | null;
  co2: number | null;
  temperature: number | null;
  humidity: number | null;

  units: {
    pm25: string;
    pm10: string;
    co2: string;
    temperature: string;
    humidity: string;
  };

  // Timestamp integrity: strictly distinct
  observedAt: string | null; // Device observation time (null if hardware did not supply an RTC time)
  receivedAt: string;        // System reception time in ISO UTC
  timestamp: string;         // Backward-compatible alias (observedAt || receivedAt)

  // Status & validation
  validationStatus: 'valid' | 'partial' | 'rejected';
  validationErrors: string[];

  // Calibration provenance
  rawPm25: number | null;
  calibratedPm25: number | null;
  calibrationApplied: boolean;
  calibrationFormula: string | null;
  calibrationStatus: DeviceCalibrationStatus;

  // Privacy-safe allowlisted diagnostic snippet (max 200 chars, zero secrets)
  diagnosticSnippet?: string;
}

export interface NormalizePacketOptions {
  sessionId: string;
  transport: DeviceTransportType;
  currentTime?: Date;
  profileOverride?: DeviceProfile;
  userSelectedProfileId?: string;
}

/**
 * Masks private hardware identifiers (e.g. MAC addresses or long serials)
 * to avoid exposing private hardware addresses in public UI state.
 */
export function sanitizeDeviceId(rawId: unknown): string | null {
  if (rawId === null || rawId === undefined) return null;
  const str = String(rawId).trim();
  if (str.length === 0) return null;

  // If MAC address (e.g. AA:BB:CC:DD:EE:FF or aa:bb:cc:dd:ee:ff)
  if (/^([0-9a-fA-F]{2}[:-]){5}[0-9a-fA-F]{2}$/.test(str)) {
    return `${str.slice(0, 5)}...${str.slice(-2)}`;
  }
  // If long serial number (> 8 chars), mask middle
  if (str.length > 8) {
    return `${str.slice(0, 4)}...${str.slice(-4)}`;
  }
  return str;
}

/**
 * Normalizes and validates any incoming JSON device frame.
 * Enforces zero-fabrication: invalid readings produce null, never synthetic numbers.
 */
export function normalizeDevicePacket(
  raw: unknown,
  options: NormalizePacketOptions
): VerifiedDevicePacket | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }

  const payload = raw as Record<string, unknown>;
  const now = options.currentTime || new Date();
  const receivedAt = now.toISOString();
  const validationErrors: string[] = [];

  // 1. Establish device profile and typed identity status
  const profile =
    options.profileOverride ||
    detectDeviceProfile(payload, options.transport, options.userSelectedProfileId);

  // 2. Extract device ID with privacy masking (do not expose raw MAC addresses)
  let deviceId: string | null = null;
  const rawId = payload.serialno ?? payload.deviceId ?? payload.device_id ?? payload.id ?? payload.mac;
  if (rawId !== undefined && rawId !== null) {
    deviceId = sanitizeDeviceId(rawId);
  }

  // 3. Detect and reconcile conflicting pollutant keys
  // AirGradient: pm02, pm10, rco2, atmp, rhum
  // CanAirIO: pm25, pm10, co2, temp, hum
  // Vaayu: pm2_5, pm10, temperature, humidity
  let rawPm25: unknown = undefined;
  if ('pm02' in payload && 'pm25' in payload) {
    const v1 = Number(payload.pm02);
    const v2 = Number(payload.pm25);
    if (Number.isFinite(v1) && Number.isFinite(v2) && Math.abs(v1 - v2) > 2) {
      validationErrors.push(`Conflicting PM2.5 fields: pm02=${v1} vs pm25=${v2}. Prioritizing protocol primary pm02.`);
    }
    rawPm25 = payload.pm02;
  } else {
    rawPm25 = payload.pm02 ?? payload.pm25 ?? payload.pm2_5 ?? payload.pm_2_5;
  }

  const rawPm10 = payload.pm10 ?? payload.pm_10;
  const rawCo2 = payload.rco2 ?? payload.co2;
  const rawTemp = payload.atmp ?? payload.temp ?? payload.temperature ?? payload.temp_f;
  const rawHum = payload.rhum ?? payload.hum ?? payload.humidity;

  // 4. Strict Physical Bounds Validation
  // PM2.5: 0 to 2000 µg/m³
  let pm25: number | null = null;
  if (rawPm25 !== undefined && rawPm25 !== null) {
    // Reject booleans, arrays, or empty string
    if (typeof rawPm25 === 'boolean' || Array.isArray(rawPm25) || rawPm25 === '') {
      validationErrors.push(`Invalid non-numeric PM2.5 format rejected: ${String(rawPm25)}`);
    } else {
      const val = typeof rawPm25 === 'string' ? Number(rawPm25.trim()) : Number(rawPm25);
      if (typeof val === 'number' && Number.isFinite(val)) {
        if (val < 0) {
          validationErrors.push(`Negative PM2.5 concentration rejected: ${val}`);
        } else if (val > 2000) {
          validationErrors.push(`PM2.5 concentration exceeds sensor saturation boundary (2000 µg/m³): ${val}`);
        } else {
          pm25 = Math.round(val * 10) / 10;
        }
      } else {
        validationErrors.push(`Non-numeric PM2.5 rejected: ${String(rawPm25)}`);
      }
    }
  }

  // PM10: 0 to 5000 µg/m³. CRITICAL: Never replace missing PM10 with PM2.5
  let pm10: number | null = null;
  if (rawPm10 !== undefined && rawPm10 !== null) {
    if (typeof rawPm10 === 'boolean' || Array.isArray(rawPm10) || rawPm10 === '') {
      validationErrors.push(`Invalid non-numeric PM10 format rejected: ${String(rawPm10)}`);
    } else {
      const val = typeof rawPm10 === 'string' ? Number(rawPm10.trim()) : Number(rawPm10);
      if (typeof val === 'number' && Number.isFinite(val)) {
        if (val < 0) {
          validationErrors.push(`Negative PM10 concentration rejected: ${val}`);
        } else if (val > 5000) {
          validationErrors.push(`PM10 concentration exceeds physical limit (5000 µg/m³): ${val}`);
        } else {
          pm10 = Math.round(val * 10) / 10;
        }
      } else {
        validationErrors.push(`Non-numeric PM10 rejected: ${String(rawPm10)}`);
      }
    }
  }

  // CO2: 300 to 10000 ppm
  let co2: number | null = null;
  if (rawCo2 !== undefined && rawCo2 !== null) {
    if (typeof rawCo2 === 'boolean' || Array.isArray(rawCo2) || rawCo2 === '') {
      validationErrors.push(`Invalid non-numeric CO2 format rejected: ${String(rawCo2)}`);
    } else {
      const val = typeof rawCo2 === 'string' ? Number(rawCo2.trim()) : Number(rawCo2);
      if (typeof val === 'number' && Number.isFinite(val)) {
        if (val < 300 || val > 10000) {
          validationErrors.push(`CO2 reading out of plausible physical range [300-10000 ppm]: ${val}`);
        } else {
          co2 = Math.round(val);
        }
      } else {
        validationErrors.push(`Non-numeric CO2 rejected: ${String(rawCo2)}`);
      }
    }
  }

  // Temperature: -40 to 85 °C (with Fahrenheit unit conversion if explicitly flagged)
  let temperature: number | null = null;
  let tempUnit = 'celsius';
  if (rawTemp !== undefined && rawTemp !== null) {
    if (typeof rawTemp === 'boolean' || Array.isArray(rawTemp) || rawTemp === '') {
      validationErrors.push(`Invalid non-numeric temperature format rejected: ${String(rawTemp)}`);
    } else {
      let val = typeof rawTemp === 'string' ? Number(rawTemp.trim()) : Number(rawTemp);
      if (typeof val === 'number' && Number.isFinite(val)) {
        // Check if input is explicitly Fahrenheit
        const isFahrenheit =
          'temp_f' in payload ||
          payload.temp_unit === 'F' ||
          payload.temperature_unit === 'F';

        if (isFahrenheit) {
          val = ((val - 32) * 5) / 9; // Convert to Celsius
        }

        if (val < -40 || val > 85) {
          validationErrors.push(`Ambient temperature out of operational range [-40 to 85°C]: ${val}`);
        } else {
          temperature = Math.round(val * 10) / 10;
        }
      } else {
        validationErrors.push(`Non-numeric temperature rejected: ${String(rawTemp)}`);
      }
    }
  }

  // Relative humidity: 0 to 100%
  let humidity: number | null = null;
  if (rawHum !== undefined && rawHum !== null) {
    if (typeof rawHum === 'boolean' || Array.isArray(rawHum) || rawHum === '') {
      validationErrors.push(`Invalid non-numeric humidity format rejected: ${String(rawHum)}`);
    } else {
      const val = typeof rawHum === 'string' ? Number(rawHum.trim()) : Number(rawHum);
      if (typeof val === 'number' && Number.isFinite(val)) {
        if (val < 0 || val > 100) {
          validationErrors.push(`Relative humidity out of valid percentage range [0-100%]: ${val}`);
        } else {
          humidity = Math.round(val);
        }
      } else {
        validationErrors.push(`Non-numeric humidity rejected: ${String(rawHum)}`);
      }
    }
  }

  // 5. Reject payload if it contains NO valid air quality readings
  if (pm25 === null && pm10 === null && co2 === null) {
    return null;
  }

  // 6. Timestamp Integrity: Device observation time vs System reception time
  let observedAt: string | null = null;
  const rawTime = payload.timestamp ?? payload.time ?? payload.datetime ?? payload.recorded_at;
  if (rawTime !== undefined && rawTime !== null) {
    let parsedDate: Date | null = null;
    if (typeof rawTime === 'number') {
      parsedDate = new Date(rawTime > 1e11 ? rawTime : rawTime * 1000);
    } else if (typeof rawTime === 'string' && rawTime.trim().length > 0) {
      parsedDate = new Date(rawTime.trim());
    }

    if (parsedDate && !isNaN(parsedDate.getTime()) && parsedDate.getFullYear() >= 2020) {
      // Check clock skew: reject future dates outside 5-minute allowance
      const futureThreshold = now.getTime() + 5 * 60 * 1000;
      if (parsedDate.getTime() > futureThreshold) {
        validationErrors.push(`Device timestamp is suspiciously in the future: ${parsedDate.toISOString()}`);
        observedAt = null;
      } else {
        observedAt = parsedDate.toISOString();
      }
    } else {
      validationErrors.push(`Invalid device timestamp rejected: ${String(rawTime)}`);
      observedAt = null;
    }
  }

  // 7. Centralized Scientific Calibration Gating
  const calibrationEvaluation = evaluateSensorCalibrationEligibility({
    sensorModel: profile.sensorModel,
    isFirmwareCompensated: profile.firmwareCompensated,
    hasLocalRelativeHumidity: humidity !== null,
    relativeHumidityPercent: humidity,
    rawPm25: pm25,
    rhMeasuredAt: observedAt || receivedAt,
    pmMeasuredAt: observedAt || receivedAt,
    units: {
      pm25: 'ug/m3',
      humidity: 'percent',
    },
    identityStatus: profile.identityStatus,
  });

  const calibrationStatus: DeviceCalibrationStatus = {
    eligible: calibrationEvaluation.eligible,
    applied: calibrationEvaluation.applied,
    rawValue: pm25,
    correctedValue: calibrationEvaluation.calibratedPm25,
    methodId: calibrationEvaluation.methodId,
    sourceReference: calibrationEvaluation.sourceReference,
    reason: calibrationEvaluation.reason || null,
  };

  // 8. Overall validation status and typed PacketQuality
  const validationStatus: 'valid' | 'partial' | 'rejected' =
    validationErrors.length === 0 ? 'valid' : 'partial';

  let quality: PacketQuality = 'valid';
  if (validationErrors.length > 0) {
    quality = 'partial';
  }

  // 9. Privacy-Safe Allowlisted Diagnostic Snippet (Zero secret leakage)
  let diagnosticSnippet: string | undefined;
  try {
    const safeDiag: Record<string, unknown> = {};
    const SENSITIVE_PATTERNS = [
      'mac', 'pass', 'key', 'token', 'secret', 'ssid', 'bssid', 'serial', 'auth', 'cred', 'user'
    ];

    for (const [k, v] of Object.entries(payload)) {
      const lower = k.toLowerCase();
      const isSensitive = SENSITIVE_PATTERNS.some((pattern) => lower.includes(pattern));
      if (isSensitive) continue;

      if (
        typeof v === 'number' ||
        typeof v === 'boolean' ||
        (typeof v === 'string' && v.length <= 32)
      ) {
        safeDiag[k] = v;
      }
    }
    const safeStr = JSON.stringify(safeDiag);
    diagnosticSnippet = safeStr.length > 200 ? safeStr.slice(0, 197) + '...' : safeStr;
  } catch {
    diagnosticSnippet = undefined;
  }

  return {
    sessionId: options.sessionId,
    deviceId,
    profile,
    transport: options.transport,
    identityStatus: profile.identityStatus,
    quality,
    pm25,
    pm10,
    co2,
    temperature,
    humidity,
    units: {
      pm25: 'ug/m3',
      pm10: 'ug/m3',
      co2: 'ppm',
      temperature: tempUnit,
      humidity: 'percent',
    },
    observedAt,
    receivedAt,
    timestamp: observedAt || receivedAt,
    validationStatus,
    validationErrors,
    rawPm25: pm25,
    calibratedPm25: calibrationEvaluation.calibratedPm25,
    calibrationApplied: calibrationEvaluation.applied,
    calibrationFormula: calibrationEvaluation.formulaName,
    calibrationStatus,
    diagnosticSnippet,
  };
}
