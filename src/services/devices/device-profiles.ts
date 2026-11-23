/**
 * AVIR — Personal Air-Monitor Device Profiles (Step 5/24)
 *
 * Defines typed device profiles, sensor models, protocol mappings,
 * and scientific calibration eligibility for genuine personal air-quality monitors.
 *
 * Distinguishes strictly between:
 * - Verified device identity (authentic manufacturer proof)
 * - User-selected device profile (user explicitly designated profile, but hardware unverified)
 * - Protocol-compatible payload (schema matches e.g. pm02, but physical hardware unverified)
 * - Unknown physical device
 */

export type DeviceTransportType = 'webserial' | 'local_wifi';

export type DeviceIdentityStatus =
  | 'verified'              // Authentic manufacturer/firmware identity confirmed by hardware proof
  | 'user_selected'         // User explicitly picked this profile from dropdown in UI, hardware unverified
  | 'protocol_compatible'   // Payload matches known schema structure, physical model unverified
  | 'unknown';              // Unrecognized or generic device

export interface DeviceProfile {
  id: string;
  name: string;
  manufacturer: string | null;
  model: string | null;
  transports: DeviceTransportType[];
  protocolId: string;
  sensorModel: string | null;
  co2SensorModel?: string | null;
  tempHumSensorModel?: string | null;
  defaultBaudRate: number;
  supportedBaudRates: number[];
  wifiEndpointPath?: string;
  firmwareCompensated: boolean;
  calibrationEligible: boolean;
  recommendedCalibrationMethod?: 'epa_barkjohn' | 'none';
  verified: boolean;
  identityStatus: DeviceIdentityStatus;
  documentationUrl?: string;
  notes: string;
}

export const VERIFIED_DEVICE_PROFILES: Record<string, DeviceProfile> = {
  'airgradient-one': {
    id: 'airgradient-one',
    name: 'AirGradient ONE (I-9PSL)',
    manufacturer: 'AirGradient',
    model: 'ONE (I-9PSL)',
    transports: ['webserial', 'local_wifi'],
    protocolId: 'airgradient_v2',
    sensorModel: 'Plantower PMS5003',
    co2SensorModel: 'Senseair S8',
    tempHumSensorModel: 'Sensirion SHT40',
    defaultBaudRate: 115200,
    supportedBaudRates: [9600, 19200, 38400, 57600, 115200],
    wifiEndpointPath: '/measures/current',
    firmwareCompensated: false, // Emits raw sensor counts in standard local server mode
    calibrationEligible: true,
    recommendedCalibrationMethod: 'epa_barkjohn',
    verified: true,
    identityStatus: 'verified',
    documentationUrl: 'https://www.airgradient.com/documentation/kb/local-server',
    notes: 'Indoor monitor with PMS5003 optical particle sensor, Senseair S8 NDIR CO2 sensor, and SHT40.',
  },
  'airgradient-open-air': {
    id: 'airgradient-open-air',
    name: 'AirGradient Open Air (O-1PST)',
    manufacturer: 'AirGradient',
    model: 'Open Air (O-1PST)',
    transports: ['webserial', 'local_wifi'],
    protocolId: 'airgradient_v2',
    sensorModel: 'Dual Plantower PMS5003T',
    co2SensorModel: null,
    tempHumSensorModel: 'Sensirion SHT40',
    defaultBaudRate: 115200,
    supportedBaudRates: [9600, 19200, 38400, 57600, 115200],
    wifiEndpointPath: '/measures/current',
    firmwareCompensated: false,
    calibrationEligible: true,
    recommendedCalibrationMethod: 'epa_barkjohn',
    verified: true,
    identityStatus: 'verified',
    documentationUrl: 'https://www.airgradient.com/documentation/kb/local-server',
    notes: 'Outdoor ambient monitor with dual PMS5003T sensors for hardware cross-check.',
  },
  'project-vaayu': {
    id: 'project-vaayu',
    name: 'Project Vaayu Monitor',
    manufacturer: 'Project Vaayu',
    model: 'Vaayu Standard (India DIY)',
    transports: ['webserial'],
    protocolId: 'vaayu_json',
    sensorModel: 'Plantower PMS5003 / Nova SDS011',
    co2SensorModel: null,
    tempHumSensorModel: 'DHT22 / SHT31',
    defaultBaudRate: 115200,
    supportedBaudRates: [9600, 115200],
    firmwareCompensated: false,
    calibrationEligible: true,
    recommendedCalibrationMethod: 'epa_barkjohn',
    verified: true,
    identityStatus: 'verified',
    notes: 'Open-source Indian community monitor built for winter smog and localized dust monitoring.',
  },
  'canairio': {
    id: 'canairio',
    name: 'CanAirIO Citizen Science Monitor',
    manufacturer: 'CanAirIO',
    model: 'CanAirIO ESP32',
    transports: ['webserial'],
    protocolId: 'canairio_json',
    sensorModel: 'Sensirion SPS30 / Plantower PMS5003',
    co2SensorModel: null,
    tempHumSensorModel: 'AHT10 / BME280',
    defaultBaudRate: 115200,
    supportedBaudRates: [115200],
    firmwareCompensated: false,
    calibrationEligible: true,
    recommendedCalibrationMethod: 'epa_barkjohn',
    verified: true,
    identityStatus: 'verified',
    documentationUrl: 'https://canair.io/',
    notes: 'Citizen-science mobile and fixed air monitoring network using ESP32.',
  },
  'generic-serial': {
    id: 'generic-serial',
    name: 'Generic Serial Air Monitor',
    manufacturer: null,
    model: null,
    transports: ['webserial'],
    protocolId: 'generic_json',
    sensorModel: null,
    defaultBaudRate: 115200,
    supportedBaudRates: [9600, 19200, 38400, 57600, 115200],
    firmwareCompensated: false,
    calibrationEligible: false,
    recommendedCalibrationMethod: 'none',
    verified: false,
    identityStatus: 'unknown',
    notes: 'Unidentified custom hardware outputting standard JSON telemetry frames.',
  },
};

/**
 * Detects device profile and identity status from incoming payload and context.
 *
 * Enforces zero-fabrication:
 * - Matching JSON field names (e.g. `pm02`) proves only protocol compatibility.
 * - An authentic manufacturer identity requires affirmative vendor evidence (firmware string, authentic vendor model, or official MAC OUI prefix).
 * - A user-selected profile is marked `user_selected` unless verified by hardware evidence.
 */
export function detectDeviceProfile(
  payload: Record<string, unknown>,
  transport: DeviceTransportType,
  userSelectedProfileId?: string
): DeviceProfile {
  if (!payload || typeof payload !== 'object') {
    return { ...VERIFIED_DEVICE_PROFILES['generic-serial'], identityStatus: 'unknown' };
  }

  // Check for affirmative manufacturer evidence in payload
  const hasAirGradientProof =
    (typeof payload.firmware === 'string' && payload.firmware.toLowerCase().includes('airgradient')) ||
    payload.manufacturer === 'AirGradient' ||
    (payload.model === 'I-9PSL' || payload.model === 'O-1PST') ||
    (typeof payload.serialno === 'string' && payload.serialno.startsWith('AG-'));

  const hasVaayuProof =
    payload.device === 'vaayu' ||
    payload.source === 'vaayu' ||
    payload.project === 'vaayu' ||
    (typeof payload.firmware === 'string' && payload.firmware.toLowerCase().includes('vaayu'));

  const hasCanAirIOProof =
    payload.station === 'canairio' ||
    payload.app === 'canairio' ||
    payload.project === 'canairio' ||
    (typeof payload.firmware === 'string' && payload.firmware.toLowerCase().includes('canairio'));

  // 1. If user explicitly selected a profile
  if (userSelectedProfileId && VERIFIED_DEVICE_PROFILES[userSelectedProfileId]) {
    const baseProfile = VERIFIED_DEVICE_PROFILES[userSelectedProfileId];
    // If the payload ALSO contains manufacturer proof, it is verified; otherwise it is user_selected
    const isActuallyVerified =
      (userSelectedProfileId.startsWith('airgradient') && hasAirGradientProof) ||
      (userSelectedProfileId === 'project-vaayu' && hasVaayuProof) ||
      (userSelectedProfileId === 'canairio' && hasCanAirIOProof);

    return {
      ...baseProfile,
      verified: isActuallyVerified,
      identityStatus: isActuallyVerified ? 'verified' : 'user_selected',
      // Calibration is only eligible if either verified or user affirmatively designated verified profile
      calibrationEligible: isActuallyVerified || Boolean(baseProfile.sensorModel && !baseProfile.firmwareCompensated),
    };
  }

  // 2. Automated detection without user selection
  // AirGradient verified proof
  if (hasAirGradientProof) {
    if (payload.model === 'O-1PST' || payload.sensor === 'PMS5003T') {
      return { ...VERIFIED_DEVICE_PROFILES['airgradient-open-air'], identityStatus: 'verified' };
    }
    return { ...VERIFIED_DEVICE_PROFILES['airgradient-one'], identityStatus: 'verified' };
  }

  // Project Vaayu verified proof
  if (hasVaayuProof) {
    return { ...VERIFIED_DEVICE_PROFILES['project-vaayu'], identityStatus: 'verified' };
  }

  // CanAirIO verified proof
  if (hasCanAirIOProof) {
    return { ...VERIFIED_DEVICE_PROFILES['canairio'], identityStatus: 'verified' };
  }

  // 3. Protocol-compatible signatures (schema match WITHOUT manufacturer proof)
  // AirGradient JSON schema (pm02, or rco2 with atmp/rhum)
  if ('pm02' in payload || ('rco2' in payload && 'atmp' in payload)) {
    return {
      id: 'airgradient-compatible',
      name: 'AirGradient-Compatible Monitor (Unverified Hardware)',
      manufacturer: null,
      model: null,
      transports: ['webserial', 'local_wifi'],
      protocolId: 'airgradient_v2',
      sensorModel: null, // Physical sensor model unverified
      co2SensorModel: null,
      tempHumSensorModel: null,
      defaultBaudRate: 115200,
      supportedBaudRates: [9600, 19200, 38400, 57600, 115200],
      wifiEndpointPath: '/measures/current',
      firmwareCompensated: false,
      calibrationEligible: false, // Ineligible: unverified sensor model cannot receive Barkjohn
      recommendedCalibrationMethod: 'none',
      verified: false,
      identityStatus: 'protocol_compatible',
      notes: 'Payload conforms to AirGradient protocol schema, but physical hardware identity is unverified.',
    };
  }

  // Project Vaayu schema (pm2_5 or pm_2_5 with temperature/humidity)
  if ('pm2_5' in payload || 'pm_2_5' in payload) {
    return {
      id: 'vaayu-compatible',
      name: 'Vaayu-Compatible Monitor (Unverified Hardware)',
      manufacturer: null,
      model: null,
      transports: ['webserial'],
      protocolId: 'vaayu_json',
      sensorModel: null,
      co2SensorModel: null,
      tempHumSensorModel: null,
      defaultBaudRate: 115200,
      supportedBaudRates: [9600, 115200],
      firmwareCompensated: false,
      calibrationEligible: false,
      recommendedCalibrationMethod: 'none',
      verified: false,
      identityStatus: 'protocol_compatible',
      notes: 'Payload conforms to Project Vaayu JSON schema, but physical hardware is unverified.',
    };
  }

  // CanAirIO schema (pm25 with temp and hum)
  if ('pm25' in payload && 'temp' in payload && 'hum' in payload) {
    return {
      id: 'canairio-compatible',
      name: 'CanAirIO-Compatible Monitor (Unverified Hardware)',
      manufacturer: null,
      model: null,
      transports: ['webserial'],
      protocolId: 'canairio_json',
      sensorModel: null,
      co2SensorModel: null,
      tempHumSensorModel: null,
      defaultBaudRate: 115200,
      supportedBaudRates: [115200],
      firmwareCompensated: false,
      calibrationEligible: false,
      recommendedCalibrationMethod: 'none',
      verified: false,
      identityStatus: 'protocol_compatible',
      notes: 'Payload conforms to CanAirIO JSON schema, but physical hardware is unverified.',
    };
  }

  // Generic / unrecognized hardware
  return { ...VERIFIED_DEVICE_PROFILES['generic-serial'], identityStatus: 'unknown' };
}
