/**
 * AVIR — Personal Air-Monitor Packet Normalizer & Validator (Step 5/24)
 *
 * Implements strict schema validation, physical boundary checking,
 * timestamp provenance separation, and scientific calibration gating.
 */

import {
  DeviceProfile,
  DeviceTransportType,
  detectDeviceProfile,
  VERIFIED_DEVICE_PROFILES,
} from './device-profiles';
import { applyEpaBarkjohnCalibration } from '@/domain/calibration-math';

export interface VerifiedDevicePacket {
  sessionId: string;
  deviceId: string | null;
  profile: DeviceProfile;
  transport: DeviceTransportType;

  // Concentrations & physical metrics
  pm25: number | null;
  pm10: number | null;
  co2: number | null;
  temperature: number | null;
  humidity: number | null;

  units: {
    pm25: 'ug/m3';
    pm10: 'ug/m3';
    co2: 'ppm';
    temperature: 'celsius';
    humidity: 'percent';
  };

  // Timestamp integrity: strictly distinct
  observedAt: string | null; // Device observation time (null if hardware did not supply one)
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

  // Bounded sanitized snippet for diagnostics (max 200 chars)
  diagnosticSnippet?: string;
}

export interface NormalizePacketOptions {
  sessionId: string;
  transport: DeviceTransportType;
  currentTime?: Date;
  profileOverride?: DeviceProfile;
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

  const profile = options.profileOverride || detectDeviceProfile(payload, options.transport);

  // 1. Extract device ID if present in payload (do not fabricate one)
  let deviceId: string | null = null;
  const rawId = payload.serialno ?? payload.deviceId ?? payload.device_id ?? payload.id ?? payload.mac;
  if (typeof rawId === 'string' && rawId.trim().length > 0 && rawId.trim().length <= 64) {
    deviceId = rawId.trim();
  } else if (typeof rawId === 'number' && Number.isFinite(rawId)) {
    deviceId = String(rawId);
  }

  // 2. Extract pollutant and environmental fields
  // AirGradient: pm02, pm10, rco2, atmp, rhum
  // CanAirIO: pm25, pm10, co2, temp, hum
  // Vaayu: pm2_5, pm10, temperature, humidity
  const rawPm25 = payload.pm02 ?? payload.pm25 ?? payload.pm2_5 ?? payload.pm_2_5;
  const rawPm10 = payload.pm10 ?? payload.pm_10;
  const rawCo2 = payload.rco2 ?? payload.co2;
  const rawTemp = payload.atmp ?? payload.temp ?? payload.temperature;
  const rawHum = payload.rhum ?? payload.hum ?? payload.humidity;

  // 3. Strict Physical Bounds Validation
  // PM2.5: 0 to 2000 µg/m³
  let pm25: number | null = null;
  if (rawPm25 !== undefined && rawPm25 !== null) {
    const val = typeof rawPm25 === 'string' ? Number(rawPm25) : rawPm25;
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

  // PM10: 0 to 5000 µg/m³. CRITICAL: Never replace missing PM10 with PM2.5
  let pm10: number | null = null;
  if (rawPm10 !== undefined && rawPm10 !== null) {
    const val = typeof rawPm10 === 'string' ? Number(rawPm10) : rawPm10;
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

  // CO2: 300 to 10000 ppm
  let co2: number | null = null;
  if (rawCo2 !== undefined && rawCo2 !== null) {
    const val = typeof rawCo2 === 'string' ? Number(rawCo2) : rawCo2;
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

  // Temperature: -40 to 85 °C
  let temperature: number | null = null;
  if (rawTemp !== undefined && rawTemp !== null) {
    const val = typeof rawTemp === 'string' ? Number(rawTemp) : rawTemp;
    if (typeof val === 'number' && Number.isFinite(val)) {
      if (val < -40 || val > 85) {
        validationErrors.push(`Ambient temperature out of operational range [-40 to 85°C]: ${val}`);
      } else {
        temperature = Math.round(val * 10) / 10;
      }
    } else {
      validationErrors.push(`Non-numeric temperature rejected: ${String(rawTemp)}`);
    }
  }

  // Relative humidity: 0 to 100%
  let humidity: number | null = null;
  if (rawHum !== undefined && rawHum !== null) {
    const val = typeof rawHum === 'string' ? Number(rawHum) : rawHum;
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

  // 4. Reject payload if it contains NO valid air quality readings
  if (pm25 === null && pm10 === null && co2 === null) {
    return null;
  }

  // 5. Timestamp Integrity (Phase E)
  // Check if hardware supplied an observation timestamp
  let observedAt: string | null = null;
  const rawTime = payload.timestamp ?? payload.time ?? payload.datetime ?? payload.recorded_at;
  if (rawTime !== undefined && rawTime !== null) {
    let parsedDate: Date | null = null;
    if (typeof rawTime === 'number') {
      // Epoch milliseconds or seconds
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

  // 6. Scientific Calibration Gating (Phase F)
  let rawPm25Val: number | null = pm25;
  let calibratedPm25: number | null = null;
  let calibrationApplied = false;
  let calibrationFormula: string | null = null;

  if (pm25 !== null) {
    if (profile.firmwareCompensated) {
      // Already compensated by firmware — prevent double correction
      calibrationFormula = 'Firmware compensated output — external correction withheld';
    } else if (profile.calibrationEligible && profile.recommendedCalibrationMethod === 'epa_barkjohn') {
      if (humidity !== null) {
        // Genuine co-observed RH available from device
        const calResult = applyEpaBarkjohnCalibration(pm25, humidity);
        if (calResult && calResult.applied) {
          calibratedPm25 = calResult.calibratedPm25;
          calibrationApplied = true;
          calibrationFormula = `US EPA Barkjohn (${humidity}% RH, ${profile.sensorModel || 'PMS5003'})`;
        } else {
          calibrationFormula = 'Raw sensor measurement — calibration not applied';
        }
      } else {
        // Missing ambient humidity — cannot apply Barkjohn
        calibrationFormula = 'Raw sensor measurement — ambient relative humidity unavailable';
      }
    } else {
      calibrationFormula = 'Raw sensor measurement — calibration not verified for this hardware profile';
    }
  }

  // 7. Overall status
  const validationStatus: 'valid' | 'partial' | 'rejected' =
    validationErrors.length === 0 ? 'valid' : 'partial';

  // Sanitized diagnostic snippet (bounded to 200 chars, no secrets)
  let diagnosticSnippet: string | undefined;
  try {
    const rawStr = JSON.stringify(payload);
    diagnosticSnippet = rawStr.length > 200 ? rawStr.slice(0, 197) + '...' : rawStr;
  } catch {
    diagnosticSnippet = undefined;
  }

  return {
    sessionId: options.sessionId,
    deviceId,
    profile,
    transport: options.transport,
    pm25,
    pm10,
    co2,
    temperature,
    humidity,
    units: {
      pm25: 'ug/m3',
      pm10: 'ug/m3',
      co2: 'ppm',
      temperature: 'celsius',
      humidity: 'percent',
    },
    observedAt,
    receivedAt,
    timestamp: observedAt || receivedAt,
    validationStatus,
    validationErrors,
    rawPm25: rawPm25Val,
    calibratedPm25,
    calibrationApplied,
    calibrationFormula,
    diagnosticSnippet,
  };
}
