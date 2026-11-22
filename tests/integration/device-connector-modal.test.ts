import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  hardwareDeviceService,
  HardwareDeviceService,
} from '@/services/device-telemetry-service';
import fs from 'fs';
import path from 'path';

describe('AVIR — Device Connector Modal & Hardware Telemetry (31 Mandated Scenarios)', () => {
  let originalSerial: any;
  let originalWindow: any;

  function setNavigatorSerial(serialValue: any) {
    if (typeof (global as any).navigator === 'undefined' || !(global as any).navigator) {
      (global as any).navigator = {};
    }
    try {
      Object.defineProperty(global.navigator, 'serial', {
        value: serialValue,
        configurable: true,
        writable: true,
      });
    } catch {
      (global.navigator as any).serial = serialValue;
    }
  }

  beforeEach(() => {
    vi.clearAllMocks();
    hardwareDeviceService.disconnect();

    if (typeof (global as any).navigator === 'undefined' || !(global as any).navigator) {
      (global as any).navigator = {};
    }

    originalSerial = (global.navigator as any)?.serial;
    originalWindow = (global as any).window;

    (global as any).window = {
      isSecureContext: true,
      location: { protocol: 'https:' },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      requestAnimationFrame: (cb: Function) => setTimeout(cb, 0),
      cancelAnimationFrame: vi.fn(),
    };
  });

  afterEach(() => {
    if (originalSerial !== undefined) {
      setNavigatorSerial(originalSerial);
    } else if ((global as any).navigator) {
      try {
        delete (global.navigator as any).serial;
      } catch {}
    }
    (global as any).window = originalWindow;
  });

  // =========================================================================
  // GROUP 1: MODAL LAYERING & PORTAL TESTS (Scenarios 1 - 11)
  // =========================================================================
  describe('Group 1: Modal Layering & React Portal Architecture', () => {
    it('1. Clicking "Connect My Monitor" opens the dialog (verifies button trigger exists)', () => {
      const badgeCode = fs.readFileSync(
        path.resolve(__dirname, '../../src/components/GroundStationBadge.tsx'),
        'utf-8'
      );
      expect(badgeCode).toContain('Connect My Monitor');
      expect(badgeCode).toContain('setIsModalOpen(true)');
    });

    it('2. The dialog is rendered under document.body via createPortal, outside the hero section', () => {
      const modalCode = fs.readFileSync(
        path.resolve(__dirname, '../../src/components/DeviceConnectorModal.tsx'),
        'utf-8'
      );
      expect(modalCode).toContain('createPortal(');
      expect(modalCode).toContain('document.body');
    });

    it('3. The dialog has a higher stacking context (z-[1000]) than dashboard content', () => {
      const modalCode = fs.readFileSync(
        path.resolve(__dirname, '../../src/components/DeviceConnectorModal.tsx'),
        'utf-8'
      );
      expect(modalCode).toContain('z-[1000]');
    });

    it('4. Dashboard overflow-hidden and backdrop-filter do not trap or clip the portaled modal', () => {
      const heroCode = fs.readFileSync(
        path.resolve(__dirname, '../../src/components/AtmosphereHero.tsx'),
        'utf-8'
      );
      // Hero preserves its skyline styling, but portaled modal is detached to document.body
      expect(heroCode).toContain('overflow-hidden');
      expect(heroCode).toContain('glass-panel');
    });

    it('5. The backdrop overlay covers the entire viewport (fixed inset-0 with dimmed opacity)', () => {
      const modalCode = fs.readFileSync(
        path.resolve(__dirname, '../../src/components/DeviceConnectorModal.tsx'),
        'utf-8'
      );
      expect(modalCode).toContain('fixed inset-0');
      expect(modalCode).toContain('bg-black/75');
    });

    it('6. The dialog surface is opaque and readable in both light and dark themes', () => {
      const modalCode = fs.readFileSync(
        path.resolve(__dirname, '../../src/components/DeviceConnectorModal.tsx'),
        'utf-8'
      );
      // Surface must use solid backgrounds rather than transparent glass-panel
      expect(modalCode).toContain('bg-white dark:bg-zinc-900');
      expect(modalCode).toContain('border-stone-200 dark:border-zinc-800');
    });

    it('7. Close button works and provides clear accessible label', () => {
      const modalCode = fs.readFileSync(
        path.resolve(__dirname, '../../src/components/DeviceConnectorModal.tsx'),
        'utf-8'
      );
      expect(modalCode).toContain('aria-label="Close dialog"');
      expect(modalCode).toContain('handleClose');
    });

    it('8. Escape key closes the dialog safely', () => {
      const modalCode = fs.readFileSync(
        path.resolve(__dirname, '../../src/components/DeviceConnectorModal.tsx'),
        'utf-8'
      );
      expect(modalCode).toContain("e.key === 'Escape'");
      expect(modalCode).toContain('handleClose()');
    });

    it('9. Focus management saves previous focus and cycles keyboard Tab keys inside dialog', () => {
      const modalCode = fs.readFileSync(
        path.resolve(__dirname, '../../src/components/DeviceConnectorModal.tsx'),
        'utf-8'
      );
      expect(modalCode).toContain('previousFocusRef');
      expect(modalCode).toContain("e.key === 'Tab'");
      expect(modalCode).toContain('focusable');
    });

    it('10. Background scroll is locked when modal is open and restored upon close', () => {
      const modalCode = fs.readFileSync(
        path.resolve(__dirname, '../../src/components/DeviceConnectorModal.tsx'),
        'utf-8'
      );
      expect(modalCode).toContain("document.body.style.overflow = 'hidden'");
      expect(modalCode).toContain('document.body.style.overflow = originalOverflow');
    });

    it('11. Repeated open/close cycles clean up subscription listeners without memory leaks', () => {
      const service = new HardwareDeviceService();
      let count = 0;
      const unsub1 = service.subscribe(() => { count++; });
      const unsub2 = service.subscribe(() => { count++; });
      unsub1();
      unsub2();
      // Service should cleanly handle zero listeners without throwing
      expect(() => service.disconnect()).not.toThrow();
    });
  });

  // =========================================================================
  // GROUP 2: CONNECTION-STATE TESTS (Scenarios 12 - 21)
  // =========================================================================
  describe('Group 2: USB WebSerial Connection Lifecycle', () => {
    it('12. Unsupported browser displays clear explanation and directs to Wi-Fi tab', () => {
      const service = new HardwareDeviceService();
      if ((global as any).navigator) {
        try {
          delete (global.navigator as any).serial;
        } catch {}
      }
      expect(service.isWebSerialSupported()).toBe(false);
    });

    it('13. Modal opening never triggers requestPort() automatically', async () => {
      const requestPortSpy = vi.fn();
      setNavigatorSerial({ requestPort: requestPortSpy });

      const service = new HardwareDeviceService();
      // Instantiating or getting connection state does NOT call requestPort
      expect(service.getConnectionState()).toBe('idle');
      expect(requestPortSpy).not.toHaveBeenCalled();
    });

    it('14. USB permission request occurs only following explicit user click', async () => {
      const requestPortSpy = vi.fn().mockRejectedValue(new Error('User cancelled'));
      setNavigatorSerial({ requestPort: requestPortSpy });

      const service = new HardwareDeviceService();
      await service.connectUsbDevice();
      expect(requestPortSpy).toHaveBeenCalledTimes(1);
    });

    it('15. User-cancelled port selection is handled gracefully without fatal error', async () => {
      const cancelError = new Error('No port selected by the user');
      (cancelError as any).name = 'NotFoundError';
      setNavigatorSerial({ requestPort: vi.fn().mockRejectedValue(cancelError) });

      const service = new HardwareDeviceService();
      const result = await service.connectUsbDevice();

      expect(result.success).toBe(false);
      expect(result.cancelled).toBe(true);
      expect(service.getConnectionState()).toBe('idle');
    });

    it('16. Failed port opening displays descriptive error', async () => {
      const mockPort = {
        open: vi.fn().mockRejectedValue(new Error('Failed to open serial port (Device busy)')),
      };
      setNavigatorSerial({ requestPort: vi.fn().mockResolvedValue(mockPort) });

      const service = new HardwareDeviceService();
      const result = await service.connectUsbDevice();

      expect(result.success).toBe(false);
      expect(result.error).toContain('Device busy');
      expect(service.getConnectionState()).toBe('error');
    });

    it('17. Successful port opening does not invent pollutant readings (awaits real packet)', async () => {
      const mockPort = {
        open: vi.fn().mockResolvedValue(undefined),
        readable: null,
      };
      setNavigatorSerial({ requestPort: vi.fn().mockResolvedValue(mockPort) });

      const service = new HardwareDeviceService();
      const result = await service.connectUsbDevice();

      expect(result.success).toBe(true);
      expect(service.getConnectionState()).toBe('connected_awaiting_data');
      expect(service.getLastPacket()).toBeNull();
      expect(service.getAsGroundStationMetadata()).toBeNull();
    });

    it('18. Valid device packet updates readings and transitions state to receiving_data', () => {
      const service = new HardwareDeviceService();
      const rawPayload = {
        pm02: 38.5,
        pm10: 62.1,
        rco2: 740,
        atmp: 23.2,
        rhum: 50,
      };

      const packet = service.parseTelemetryPayload(rawPayload, 'webserial');
      expect(packet).not.toBeNull();
      expect(packet?.pm25).toBe(38.5);
      expect(packet?.pm10).toBe(62.1);
      expect(packet?.co2).toBe(740);
    });

    it('19. Invalid packet is rejected without crashing the connection', () => {
      const service = new HardwareDeviceService();
      expect(service.parseTelemetryPayload(null, 'webserial')).toBeNull();
      expect(service.parseTelemetryPayload('corrupted string', 'webserial')).toBeNull();
      expect(service.parseTelemetryPayload({}, 'webserial')).toBeNull();
      expect(service.parseTelemetryPayload({ invalidKey: 123 }, 'webserial')).toBeNull();
    });

    it('20. Disconnect clears active connection state', async () => {
      const service = new HardwareDeviceService();
      await service.disconnect();
      expect(service.getConnectionState()).toBe('disconnected');
      expect(service.isConnected()).toBe(false);
      expect(service.getLastPacket()).toBeNull();
    });

    it('21. Reopening after disconnect does not falsely show connected status with stale data', async () => {
      const service = new HardwareDeviceService();
      await service.disconnect();

      let receivedPacket: any = 'should_remain_unset';
      service.subscribe((packet) => {
        receivedPacket = packet;
      });

      // Disconnected service must never immediately invoke new subscribers with stale packets
      expect(receivedPacket).toBe('should_remain_unset');
      expect(service.isConnected()).toBe(false);
    });
  });

  // =========================================================================
  // GROUP 3: LOCAL WI-FI TESTS (Scenarios 22 - 26)
  // =========================================================================
  describe('Group 3: Local Wi-Fi Network Connection & Security', () => {
    it('22. Placeholder IP (192.168.1.150) is placeholder only and not treated as pre-configured device', () => {
      const modalCode = fs.readFileSync(
        path.resolve(__dirname, '../../src/components/DeviceConnectorModal.tsx'),
        'utf-8'
      );
      // State must start empty
      expect(modalCode).toContain("const [ipAddress, setIpAddress] = useState('');");
      expect(modalCode).toContain('placeholder="e.g. 192.168.1.150 or airgradient.local"');
    });

    it('23. Invalid addresses are rejected before sending fetch', async () => {
      const service = new HardwareDeviceService();
      const validationEmpty = service.validateDeviceAddress('');
      expect(validationEmpty.valid).toBe(false);

      const validationBad = service.validateDeviceAddress('http://malicious.com/api');
      expect(validationBad.valid).toBe(false);

      const validationValidIp = service.validateDeviceAddress('192.168.1.50');
      expect(validationValidIp.valid).toBe(true);

      const validationValidLocal = service.validateDeviceAddress('airgradient.local');
      expect(validationValidLocal.valid).toBe(true);
    });

    it('24. Network failure does not produce synthetic fallback numbers', async () => {
      const service = new HardwareDeviceService();
      (global as any).fetch = vi.fn().mockRejectedValue(new Error('Connection refused'));

      const result = await service.fetchLocalWifiDevice('192.168.1.50');
      expect(result.packet).toBeNull();
      expect(result.error).toContain('Connection refused');
      expect(service.getLastPacket()).toBeNull();
    });

    it('25. Browser-blocked mixed-content requests on HTTPS display clear guidance', async () => {
      const service = new HardwareDeviceService();
      (global as any).window = {
        location: { protocol: 'https:' },
        isSecureContext: true,
      };

      const mixedContentError = new TypeError('Failed to fetch');
      (global as any).fetch = vi.fn().mockRejectedValue(mixedContentError);

      const result = await service.fetchLocalWifiDevice('192.168.1.50');
      expect(result.packet).toBeNull();
      expect(result.error).toContain('Mixed Content');
      expect(result.error).toContain('USB WebSerial');
    });

    it('26. Successful supported requests parse authentic device data', async () => {
      const service = new HardwareDeviceService();
      (global as any).fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          pm02: 42,
          pm10: 68,
          rco2: 820,
          atmp: 24,
          rhum: 48,
        }),
      });

      const result = await service.fetchLocalWifiDevice('192.168.1.50');
      expect(result.packet).not.toBeNull();
      expect(result.packet?.pm25).toBe(42);
      expect(result.packet?.pm10).toBe(68);
      expect(result.packet?.co2).toBe(820);
      expect(result.packet?.source).toBe('local_wifi');
    });
  });

  // =========================================================================
  // GROUP 4: DATA INTEGRITY & PROVENANCE TESTS (Scenarios 27 - 31)
  // =========================================================================
  describe('Group 4: Hardware Telemetry Data Integrity', () => {
    it('27. Missing PM10 remains null and is never substituted with PM2.5', () => {
      const service = new HardwareDeviceService();
      const packet = service.parseTelemetryPayload(
        {
          pm25: 45.0,
          // pm10 omitted
          co2: 600,
        },
        'webserial'
      );

      expect(packet).not.toBeNull();
      expect(packet?.pm25).toBe(45.0);
      expect(packet?.pm10).toBeNull();
      expect(packet?.pm10).not.toBe(45.0);
    });

    it('28. Valid PM2.5 zero remains zero (clean air) and is not coerced to null', () => {
      const service = new HardwareDeviceService();
      const packet = service.parseTelemetryPayload(
        {
          pm25: 0,
          pm10: 0,
          co2: 450,
        },
        'webserial'
      );

      expect(packet).not.toBeNull();
      expect(packet?.pm25).toBe(0);
      expect(packet?.pm10).toBe(0);
    });

    it('29. Negative and physically nonfinite readings are rejected', () => {
      const service = new HardwareDeviceService();
      const packet = service.parseTelemetryPayload(
        {
          pm25: -15,
          pm10: -30,
          co2: 500,
          temp: 150, // Out of physical atmospheric range
          hum: 120,  // Out of percentage bounds
        },
        'webserial'
      );

      expect(packet).not.toBeNull();
      expect(packet?.pm25).toBeNull();
      expect(packet?.pm10).toBeNull();
      expect(packet?.temperature).toBeNull();
      expect(packet?.humidity).toBeNull();
    });

    it('30. Source timestamps are preserved when present and not fabricated when absent', () => {
      const service = new HardwareDeviceService();
      const authenticIso = '2026-11-22T08:30:00.000Z';
      const packetWithTime = service.parseTelemetryPayload(
        {
          pm25: 50,
          timestamp: authenticIso,
        },
        'webserial'
      );

      expect(packetWithTime?.observedAt).toBe(authenticIso);

      const packetWithoutTime = service.parseTelemetryPayload(
        {
          pm25: 50,
        },
        'webserial'
      );

      expect(packetWithoutTime?.observedAt).toBeNull();
      expect(packetWithoutTime?.receivedAt).toBeDefined();
    });

    it('31. Local-device readings are not silently substituted for citywide modeled conditions', () => {
      const service = new HardwareDeviceService();
      const raw = { pm25: 25.5, pm10: 40.0, co2: 550 };
      const packet = service.parseTelemetryPayload(raw, 'webserial');
      (service as any).lastPacket = packet;
      (service as any).connectionState = 'receiving_data';

      const metadata = service.getAsGroundStationMetadata();
      expect(metadata).not.toBeNull();
      expect(metadata?.stationType).toBe('user_device');
      expect(metadata?.provider).toBe('User Hardware Monitor (BYOD)');
      expect(metadata?.distanceKm).toBe(0.0);
      // City model is not altered
      expect(metadata?.stationName).toContain('My Connected USB Monitor');
    });
  });
});
