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

  it('distinguishes verified device identity from protocol compatible without manufacturer proof', () => {
    // Bare pm02 without firmware proof is protocol_compatible
    const unverifiedPacket = hardwareDeviceService.parseTelemetryPayload(
      { pm02: 45, rco2: 800 },
      'local_wifi'
    );
    expect(unverifiedPacket?.identityStatus).toBe('protocol_compatible');
    expect(unverifiedPacket?.profile?.verified).toBe(false);

    // With explicit firmware proof, identity becomes verified
    const verifiedPacket = hardwareDeviceService.parseTelemetryPayload(
      { pm02: 45, rco2: 800, firmware: 'AirGradient-ONE-3.1.4' },
      'local_wifi'
    );
    expect(verifiedPacket?.identityStatus).toBe('verified');
    expect(verifiedPacket?.profile?.verified).toBe(true);
    expect(verifiedPacket?.profile?.id).toBe('airgradient-one');
  });

  it('masks private device identifiers (MAC addresses and long serial numbers)', () => {
    const packet = hardwareDeviceService.parseTelemetryPayload(
      { pm02: 35, mac: 'AA:BB:CC:DD:EE:FF' },
      'local_wifi'
    );
    expect(packet?.deviceId).toBe('AA:BB...FF');
    expect(packet?.deviceId).not.toBe('AA:BB:CC:DD:EE:FF');
  });

  it('sanitizes diagnostic snippets by stripping sensitive passwords, tokens, and keys', () => {
    const maliciousPayload = {
      pm02: 42,
      mac: 'AA:BB:CC:DD:EE:FF',
      wifi_password: 'super-secret-password',
      api_key: 'sensitive-token-abc-123',
    };
    const packet = hardwareDeviceService.parseTelemetryPayload(maliciousPayload, 'local_wifi');

    expect(packet?.diagnosticSnippet).toBeDefined();
    expect(packet?.diagnosticSnippet).not.toContain('super-secret-password');
    expect(packet?.diagnosticSnippet).not.toContain('sensitive-token-abc-123');
    expect(packet?.diagnosticSnippet).not.toContain('AA:BB:CC:DD:EE:FF');
    expect(packet?.diagnosticSnippet).toContain('42');
  });

  it('converts Fahrenheit temperature inputs to Celsius cleanly', () => {
    const fahrPayload = {
      pm02: 30,
      temp: 77, // 77°F = 25°C
      temp_unit: 'F',
    };
    const packet = hardwareDeviceService.parseTelemetryPayload(fahrPayload, 'webserial');
    expect(packet?.temperature).toBeCloseTo(25.0, 1);
  });

  it('preserves observedAt as null when hardware device lacks an internal RTC clock', () => {
    const untimedPayload = { pm02: 28, rco2: 600 };
    const packet = hardwareDeviceService.parseTelemetryPayload(untimedPayload, 'local_wifi');
    expect(packet?.observedAt).toBeNull();
    expect(packet?.receivedAt).toBeDefined();
  });

  it('exposes honest connection state helpers (isTransportOpen, isReceivingFreshData, hasLastKnownReading)', () => {
    expect(hardwareDeviceService.isTransportOpen()).toBe(false);
    expect(hardwareDeviceService.isReceivingFreshData()).toBe(false);
    expect(hardwareDeviceService.hasLastKnownReading()).toBe(false);
  });
});
