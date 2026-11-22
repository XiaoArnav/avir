/**
 * AVIR — Personal Air-Monitor Device Profiles (Step 5/24)
 *
 * Defines typed device profiles, sensor models, protocol mappings,
 * and scientific calibration eligibility for genuine personal air-quality monitors.
 *
 * Supported reference hardware:
 * 1. AirGradient ONE (I-9PSL) / Open Air (O-1PST) — ESP32-C3, Plantower PMS5003, Senseair S8, Sensirion SHT40
 * 2. Project Vaayu (India DIY Monitor) — ESP8266/ESP32, Plantower PMS5003 / Nova SDS011
 * 3. CanAirIO — ESP32 open-source citizen science air monitor
 * 4. Generic Serial JSON — Any compliant low-cost optical particulate counter emitting newline JSON
 */

export type DeviceTransportType = 'webserial' | 'local_wifi';

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
    notes: 'Unidentified custom hardware outputting standard JSON telemetry frames.',
  },
};

/**
 * Detects device profile from payload signature without falsely assuming manufacturer identity.
 */
export function detectDeviceProfile(
  payload: Record<string, unknown>,
  transport: DeviceTransportType
): DeviceProfile {
  if (!payload || typeof payload !== 'object') {
    return VERIFIED_DEVICE_PROFILES['generic-serial'];
  }

  // AirGradient signature: uses `pm02` and `rco2` or `atmp` / `rhum`
  if ('pm02' in payload || ('rco2' in payload && 'atmp' in payload)) {
    // If dual sensor or model field indicates outdoor:
    if (payload.model === 'O-1PST' || payload.sensor === 'PMS5003T') {
      return VERIFIED_DEVICE_PROFILES['airgradient-open-air'];
    }
    return VERIFIED_DEVICE_PROFILES['airgradient-one'];
  }

  // Project Vaayu signature: uses `pm2_5` or `pm_2_5` with `temperature` / `humidity`
  if ('pm2_5' in payload || 'pm_2_5' in payload || payload.device === 'vaayu' || payload.source === 'vaayu') {
    return VERIFIED_DEVICE_PROFILES['project-vaayu'];
  }

  // CanAirIO signature: uses `pm25` with `temp` / `hum` or explicit `canairio` tag
  if (
    payload.station === 'canairio' ||
    payload.app === 'canairio' ||
    ('pm25' in payload && 'temp' in payload && 'hum' in payload)
  ) {
    return VERIFIED_DEVICE_PROFILES['canairio'];
  }

  return VERIFIED_DEVICE_PROFILES['generic-serial'];
}
