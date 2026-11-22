/**
 * Hardware Device Telemetry Connector
 * Supports open-source air monitors from the master blueprint:
 * - AirGradient ONE / Open Air (ESP32-C3)
 * - Project Vaayu (India DIY Monitor)
 * - CanAirIO (WebSerial / BLE)
 *
 * Provides two connection paths:
 * 1. WebSerial API: Direct USB connection via browser (Chrome/Edge) with zero drivers.
 * 2. Local Wi-Fi API: HTTP fetch to AirGradient Webserver / ESPHome local endpoint.
 */

import { GroundStationMetadata } from '@/domain/types';

export interface DeviceTelemetryPacket {
  pm25: number | null;
  pm10: number | null;
  co2?: number | null;
  temperature?: number | null;
  humidity?: number | null;
  rawJson?: any;
  timestamp: string;
  source: 'webserial' | 'local_wifi';
}

type DevicePacketListener = (packet: DeviceTelemetryPacket) => void;

class HardwareDeviceService {
  private activePort: any = null;
  private reader: any = null;
  private isReading = false;
  private listeners: Set<DevicePacketListener> = new Set();
  private lastPacket: DeviceTelemetryPacket | null = null;

  /**
   * Checks whether the current browser supports the WebSerial API.
   */
  isWebSerialSupported(): boolean {
    return typeof navigator !== 'undefined' && 'serial' in navigator;
  }

  /**
   * Connects to an ESP32 monitor via WebSerial over USB.
   */
  async connectUsbDevice(baudRate = 115200): Promise<boolean> {
    if (!this.isWebSerialSupported()) {
      throw new Error('WebSerial is not supported in this browser. Please use Chrome, Edge, or Opera.');
    }

    try {
      const nav = navigator as any;
      this.activePort = await nav.serial.requestPort();
      await this.activePort.open({ baudRate });

      this.isReading = true;
      this.startSerialReadLoop();
      return true;
    } catch (err: any) {
      console.warn('WebSerial connection failed or was cancelled by user:', err?.message || err);
      return false;
    }
  }

  /**
   * Disconnects active USB serial monitor.
   */
  async disconnectUsbDevice(): Promise<void> {
    this.isReading = false;
    if (this.reader) {
      try {
        await this.reader.cancel();
      } catch {
        // Reader release
      }
      this.reader = null;
    }
    if (this.activePort) {
      try {
        await this.activePort.close();
      } catch {
        // Port close
      }
      this.activePort = null;
    }
  }

  /**
   * Reads from an AirGradient Webserver or ESPHome node over local Wi-Fi.
   * Format: http://<ip-address>/measures/current
   */
  async fetchLocalWifiDevice(ipAddress: string, signal?: AbortSignal): Promise<DeviceTelemetryPacket | null> {
    const cleanIp = ipAddress.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    const url = `http://${cleanIp}/measures/current`;

    try {
      const res = await fetch(url, { signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();
      const packet = this.parseTelemetryPayload(data, 'local_wifi');
      if (packet) {
        this.lastPacket = packet;
        this.notifyListeners(packet);
      }
      return packet;
    } catch (err: any) {
      console.warn(`Local Wi-Fi air monitor fetch failed for ${cleanIp}:`, err?.message || err);
      return null;
    }
  }

  /**
   * Normalizes heterogeneous JSON telemetry payloads from AirGradient, Vaayu, and CanAirIO.
   */
  parseTelemetryPayload(data: any, source: 'webserial' | 'local_wifi'): DeviceTelemetryPacket | null {
    if (!data || typeof data !== 'object') return null;

    // AirGradient format: { pm02: 45, pm10: 65, rco2: 850, atmp: 23.5, rhum: 55 }
    // CanAirIO format: { pm25: 45, pm10: 65, co2: 850, temp: 23.5, hum: 55 }
    // Project Vaayu format: { pm2_5: 45, pm10: 65, temperature: 23.5, humidity: 55 }

    const pm25Raw = data.pm02 ?? data.pm25 ?? data.pm2_5 ?? data.pm_2_5;
    const pm10Raw = data.pm10 ?? data.pm_10;
    const co2Raw = data.rco2 ?? data.co2;
    const tempRaw = data.atmp ?? data.temp ?? data.temperature;
    const humRaw = data.rhum ?? data.hum ?? data.humidity;

    const pm25 = typeof pm25Raw === 'number' && Number.isFinite(pm25Raw) ? Math.round(pm25Raw * 10) / 10 : null;
    const pm10 = typeof pm10Raw === 'number' && Number.isFinite(pm10Raw) ? Math.round(pm10Raw * 10) / 10 : null;
    const co2 = typeof co2Raw === 'number' && Number.isFinite(co2Raw) ? Math.round(co2Raw) : null;
    const temperature = typeof tempRaw === 'number' && Number.isFinite(tempRaw) ? Math.round(tempRaw * 10) / 10 : null;
    const humidity = typeof humRaw === 'number' && Number.isFinite(humRaw) ? Math.round(humRaw) : null;

    if (pm25 === null && pm10 === null && co2 === null) return null;

    return {
      pm25,
      pm10,
      co2,
      temperature,
      humidity,
      rawJson: data,
      timestamp: new Date().toISOString(),
      source,
    };
  }

  /**
   * Converts the latest connected hardware packet into Avir's GroundStationMetadata format.
   */
  getAsGroundStationMetadata(): GroundStationMetadata | null {
    if (!this.lastPacket) return null;

    return {
      stationId: `user-dev-${this.lastPacket.source}`,
      stationName: this.lastPacket.source === 'webserial' ? 'My Connected USB Monitor (ESP32)' : 'My Local AirGradient Monitor',
      distanceKm: 0.0, // Colocated with user
      latitude: 0,
      longitude: 0,
      provider: 'User Hardware Monitor (BYOD)',
      stationType: 'user_device',
      lastUpdated: this.lastPacket.timestamp,
      pm25: this.lastPacket.pm25,
      pm10: this.lastPacket.pm10,
      isCalibrated: false,
    };
  }

  subscribe(listener: DevicePacketListener): () => void {
    this.listeners.add(listener);
    if (this.lastPacket) listener(this.lastPacket);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(packet: DeviceTelemetryPacket): void {
    for (const listener of this.listeners) {
      try {
        listener(packet);
      } catch (err) {
        console.error('Error in device packet listener:', err);
      }
    }
  }

  private async startSerialReadLoop(): Promise<void> {
    if (!this.activePort || !this.activePort.readable) return;

    try {
      const textDecoder = new (window as any).TextDecoderStream();
      this.activePort.readable.pipeTo(textDecoder.writable);
      this.reader = textDecoder.readable.getReader();

      let buffer = '';
      while (this.isReading) {
        const { value, done } = await this.reader.read();
        if (done) break;
        if (value) {
          buffer += value;
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
              try {
                const parsed = JSON.parse(trimmed);
                const packet = this.parseTelemetryPayload(parsed, 'webserial');
                if (packet) {
                  this.lastPacket = packet;
                  this.notifyListeners(packet);
                }
              } catch {
                // Ignore partial JSON chunks
              }
            }
          }
        }
      }
    } catch (err) {
      console.warn('WebSerial stream closed or encountered error:', err);
    }
  }
}

export const hardwareDeviceService = new HardwareDeviceService();
