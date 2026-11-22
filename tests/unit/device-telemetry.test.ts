import { describe, it, expect } from 'vitest';
import { hardwareDeviceService } from '@/services/device-telemetry-service';

describe('Hardware Device Telemetry Connector (BYOD)', () => {
  it('parses AirGradient ONE / Open Air JSON payload format', () => {
    const rawAirGradient = {
      pm02: 48,
      pm10: 72,
      rco2: 810,
      atmp: 24.5,
      rhum: 58,
    };

    const packet = hardwareDeviceService.parseTelemetryPayload(rawAirGradient, 'local_wifi');

    expect(packet).not.toBeNull();
    expect(packet?.pm25).toBe(48);
    expect(packet?.pm10).toBe(72);
    expect(packet?.co2).toBe(810);
    expect(packet?.temperature).toBe(24.5);
    expect(packet?.humidity).toBe(58);
    expect(packet?.source).toBe('local_wifi');
  });

  it('parses CanAirIO and Project Vaayu JSON payload formats', () => {
    const rawCanAirIo = {
      pm25: 55.4,
      pm10: 89.2,
      co2: 650,
      temp: 22.0,
      hum: 62,
    };

    const packet = hardwareDeviceService.parseTelemetryPayload(rawCanAirIo, 'webserial');

    expect(packet).not.toBeNull();
    expect(packet?.pm25).toBe(55.4);
    expect(packet?.pm10).toBe(89.2);
    expect(packet?.co2).toBe(650);
  });

  it('returns null for empty or non-telemetry payloads', () => {
    expect(hardwareDeviceService.parseTelemetryPayload({}, 'webserial')).toBeNull();
    expect(hardwareDeviceService.parseTelemetryPayload(null, 'webserial')).toBeNull();
    expect(hardwareDeviceService.parseTelemetryPayload({ foo: 'bar' }, 'local_wifi')).toBeNull();
  });
});
