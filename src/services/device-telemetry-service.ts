/**
 * Hardware Device Telemetry Connector
 * Supports open-source air monitors from the master blueprint:
 * - AirGradient ONE / Open Air (ESP32-C3)
 * - Project Vaayu (India DIY Monitor)
 * - CanAirIO (WebSerial / BLE)
 *
 * Provides two connection paths:
 * 1. WebSerial API: Direct USB connection via browser (Chrome/Edge/Opera) with zero drivers.
 * 2. Local Wi-Fi API: HTTP fetch to AirGradient Webserver / ESPHome local endpoint.
 */

import { GroundStationMetadata } from '@/domain/types';

export type DeviceConnectionState =
  | 'unsupported'           // Browser lacks WebSerial or is in an insecure context
  | 'idle'                  // Not connected, ready for connection attempt
  | 'requesting_permission' // Native permission dialog open (awaiting user selection)
  | 'opening_connection'   // Port chosen, opening serial connection at baud rate
  | 'connected_awaiting_data' // Port open, serial read loop active, awaiting first packet
  | 'receiving_data'        // Actively receiving valid packets
  | 'disconnected'          // Cleanly disconnected
  | 'error';                // Connection or read error

export interface DeviceTelemetryPacket {
  pm25: number | null;
  pm10: number | null;
  co2?: number | null;
  temperature?: number | null;
  humidity?: number | null;
  rawJson?: any;
  observedAt: string | null;  // Authentic device-reported observation timestamp
  receivedAt: string;         // Local system reception timestamp
  timestamp: string;          // Backward-compatible alias (observedAt || receivedAt)
  source: 'webserial' | 'local_wifi';
}

export type DevicePacketListener = (packet: DeviceTelemetryPacket) => void;
export type DeviceStatusListener = (state: DeviceConnectionState, error?: string | null) => void;

export class HardwareDeviceService {
  private activePort: any = null;
  private reader: any = null;
  private isReading = false;
  private connectionState: DeviceConnectionState = 'idle';
  private lastErrorMessage: string | null = null;
  private packetListeners: Set<DevicePacketListener> = new Set();
  private statusListeners: Set<DeviceStatusListener> = new Set();
  private lastPacket: DeviceTelemetryPacket | null = null;
  private activeSource: 'webserial' | 'local_wifi' | null = null;

  /**
   * Checks whether the current browser supports the WebSerial API.
   * Requires both navigator.serial support and a secure context (HTTPS / localhost).
   */
  isWebSerialSupported(): boolean {
    if (typeof navigator === 'undefined' || typeof window === 'undefined') return false;
    const hasSerial = 'serial' in navigator && typeof (navigator as any).serial?.requestPort === 'function';
    const isSecure = window.isSecureContext !== false;
    return hasSerial && isSecure;
  }

  /**
   * Returns current hardware connection state.
   */
  getConnectionState(): DeviceConnectionState {
    if (!this.isWebSerialSupported() && this.activeSource === 'webserial') {
      return 'unsupported';
    }
    return this.connectionState;
  }

  /**
   * Returns whether a device is actively connected.
   */
  isConnected(): boolean {
    return this.connectionState === 'receiving_data' || this.connectionState === 'connected_awaiting_data';
  }

  /**
   * Returns the latest received packet, if any.
   */
  getLastPacket(): DeviceTelemetryPacket | null {
    return this.lastPacket;
  }

  /**
   * Returns the active source type, if any.
   */
  getActiveSource(): 'webserial' | 'local_wifi' | null {
    return this.activeSource;
  }

  /**
   * Connects to an ESP32 monitor via WebSerial over USB.
   * Triggered strictly upon explicit user interaction (click).
   */
  async connectUsbDevice(baudRate = 115200): Promise<{ success: boolean; cancelled?: boolean; error?: string }> {
    if (!this.isWebSerialSupported()) {
      const err = 'WebSerial is not supported in this browser or context. Please use Chrome, Edge, or Opera over HTTPS.';
      this.setConnectionState('unsupported', err);
      return { success: false, error: err };
    }

    // Clean up any existing connection first
    if (this.isReading || this.activePort) {
      await this.disconnectUsbDevice();
    }

    this.lastErrorMessage = null;
    this.setConnectionState('requesting_permission');

    try {
      const nav = navigator as any;
      const port = await nav.serial.requestPort();
      this.activePort = port;

      this.setConnectionState('opening_connection');
      await this.activePort.open({ baudRate });

      this.activeSource = 'webserial';
      this.isReading = true;
      this.setConnectionState('connected_awaiting_data');
      this.startSerialReadLoop();
      return { success: true };
    } catch (err: any) {
      const errorName = err?.name || '';
      const errorMsg = err?.message || String(err);

      // Check if user cancelled port selection (not a fatal error)
      if (errorName === 'NotFoundError' || errorMsg.includes('No port selected') || errorMsg.includes('User cancelled')) {
        this.setConnectionState('idle');
        return { success: false, cancelled: true };
      }

      this.setConnectionState('error', errorMsg);
      console.warn('WebSerial connection error:', errorMsg);
      return { success: false, error: errorMsg };
    }
  }

  /**
   * Disconnects active USB serial monitor and safely closes streams.
   */
  async disconnectUsbDevice(): Promise<void> {
    this.isReading = false;

    if (this.reader) {
      try {
        await this.reader.cancel();
      } catch {
        // Safe reader cancellation
      }
      try {
        if (typeof this.reader.releaseLock === 'function') {
          this.reader.releaseLock();
        }
      } catch {
        // Safe release
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

    if (this.activeSource === 'webserial') {
      this.activeSource = null;
      this.lastPacket = null;
    }

    this.setConnectionState('disconnected');
  }

  /**
   * Universal disconnect for any active connection (USB or Wi-Fi).
   */
  async disconnect(): Promise<void> {
    await this.disconnectUsbDevice();
    this.activeSource = null;
    this.lastPacket = null;
    this.setConnectionState('disconnected');
  }

  /**
   * Validates local device IP or hostname format.
   */
  validateDeviceAddress(address: string): { valid: boolean; cleanAddress: string; error?: string } {
    const trimmed = address.trim().replace(/^https?:\/\//i, '').replace(/\/.*$/, '');
    if (!trimmed) {
      return { valid: false, cleanAddress: '', error: 'Device address cannot be empty.' };
    }

    // IPv4 check: e.g. 192.168.1.50 or 10.0.0.5 with optional port
    const ipv4Regex = /^([0-9]{1,3}\.){3}[0-9]{1,3}(:[0-9]{1,5})?$/;
    // Local hostname check: e.g. airgradient.local, esp32.local with optional port
    const localHostRegex = /^[a-zA-Z0-9_\-]+\.local(:[0-9]{1,5})?$/i;

    if (!ipv4Regex.test(trimmed) && !localHostRegex.test(trimmed)) {
      return {
        valid: false,
        cleanAddress: trimmed,
        error: 'Invalid device address format. Enter a valid IPv4 address (e.g. 192.168.1.50) or .local hostname (e.g. airgradient.local).',
      };
    }

    return { valid: true, cleanAddress: trimmed };
  }

  /**
   * Reads from an AirGradient Webserver or ESPHome node over local Wi-Fi.
   * Format: http://<ip-address>/measures/current
   */
  async fetchLocalWifiDevice(
    ipAddress: string,
    signal?: AbortSignal
  ): Promise<{ packet: DeviceTelemetryPacket | null; error?: string }> {
    const validation = this.validateDeviceAddress(ipAddress);
    if (!validation.valid) {
      this.setConnectionState('error', validation.error);
      return { packet: null, error: validation.error };
    }

    const cleanHost = validation.cleanAddress;
    const url = `http://${cleanHost}/measures/current`;

    this.setConnectionState('opening_connection');

    try {
      const res = await fetch(url, { signal });
      if (!res.ok) {
        const errorMsg = `Air monitor returned HTTP ${res.status} (${res.statusText || 'Error'}).`;
        this.setConnectionState('error', errorMsg);
        return { packet: null, error: errorMsg };
      }

      const data = await res.json();
      const packet = this.parseTelemetryPayload(data, 'local_wifi');

      if (!packet) {
        const errorMsg = 'Response from device did not contain valid air quality measurements.';
        this.setConnectionState('error', errorMsg);
        return { packet: null, error: errorMsg };
      }

      this.lastPacket = packet;
      this.activeSource = 'local_wifi';
      this.setConnectionState('receiving_data');
      this.notifyPacketListeners(packet);
      return { packet };
    } catch (err: any) {
      const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:';
      const isFailedFetch = err?.name === 'TypeError' || err?.message?.includes('Failed to fetch');
      let friendlyError = err?.message || 'Connection failed.';

      if (isHttps && isFailedFetch) {
        friendlyError = `Direct browser request to http://${cleanHost} was blocked. Because Avir is served over HTTPS, modern browsers restrict mixed HTTP requests to local networks (CORS / Mixed Content). Connect via USB WebSerial for instant zero-friction connectivity.`;
      } else if (err?.name === 'AbortError') {
        friendlyError = 'Request timed out or was cancelled.';
      }

      this.setConnectionState('error', friendlyError);
      console.warn(`Local Wi-Fi air monitor fetch failed for ${cleanHost}:`, friendlyError);
      return { packet: null, error: friendlyError };
    }
  }

  /**
   * Normalizes heterogeneous JSON telemetry payloads from AirGradient, Vaayu, and CanAirIO.
   * Enforces strict physical bounds and zero-fabrication validation.
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

    // Strict non-negative physical validation for PM2.5 (0 to 2000 µg/m³)
    const pm25 =
      typeof pm25Raw === 'number' && Number.isFinite(pm25Raw) && pm25Raw >= 0 && pm25Raw <= 2000
        ? Math.round(pm25Raw * 10) / 10
        : null;

    // Strict non-negative physical validation for PM10 (0 to 5000 µg/m³)
    // CRITICAL: PM10 is never replaced with PM2.5 when missing
    const pm10 =
      typeof pm10Raw === 'number' && Number.isFinite(pm10Raw) && pm10Raw >= 0 && pm10Raw <= 5000
        ? Math.round(pm10Raw * 10) / 10
        : null;

    // CO2 range check (300 to 10000 ppm)
    const co2 =
      typeof co2Raw === 'number' && Number.isFinite(co2Raw) && co2Raw >= 300 && co2Raw <= 10000
        ? Math.round(co2Raw)
        : null;

    // Plausible ambient temperature range (-40°C to 85°C)
    const temperature =
      typeof tempRaw === 'number' && Number.isFinite(tempRaw) && tempRaw >= -40 && tempRaw <= 85
        ? Math.round(tempRaw * 10) / 10
        : null;

    // Relative humidity range (0 to 100%)
    const humidity =
      typeof humRaw === 'number' && Number.isFinite(humRaw) && humRaw >= 0 && humRaw <= 100
        ? Math.round(humRaw)
        : null;

    // If no valid primary air metrics exist, reject packet
    if (pm25 === null && pm10 === null && co2 === null) return null;

    // Determine authentic device timestamp vs system reception time
    let observedAt: string | null = null;
    const rawTime = data.timestamp ?? data.time ?? data.datetime;
    if (rawTime && (typeof rawTime === 'string' || typeof rawTime === 'number')) {
      const parsed = new Date(rawTime);
      if (!isNaN(parsed.getTime()) && parsed.getFullYear() >= 2020) {
        observedAt = parsed.toISOString();
      }
    }

    const receivedAt = new Date().toISOString();

    return {
      pm25,
      pm10,
      co2,
      temperature,
      humidity,
      rawJson: data,
      observedAt,
      receivedAt,
      timestamp: observedAt || receivedAt,
      source,
    };
  }

  /**
   * Converts the latest connected hardware packet into Avir's GroundStationMetadata format.
   * Returns null if not actively connected.
   */
  getAsGroundStationMetadata(): GroundStationMetadata | null {
    if (!this.lastPacket || !this.isConnected()) return null;

    return {
      stationId: `user-dev-${this.lastPacket.source}`,
      stationName:
        this.lastPacket.source === 'webserial'
          ? 'My Connected USB Monitor (ESP32)'
          : 'My Local AirGradient Monitor',
      distanceKm: 0.0, // Colocated with user
      latitude: 0,
      longitude: 0,
      provider: 'User Hardware Monitor (BYOD)',
      stationType: 'user_device',
      lastUpdated: this.lastPacket.receivedAt,
      pm25: this.lastPacket.pm25,
      pm10: this.lastPacket.pm10,
      isCalibrated: false,
      stationState: 'live_observation',
      observedAt: this.lastPacket.observedAt,
      retrievedAt: this.lastPacket.receivedAt,
    };
  }

  /**
   * Subscribes to device telemetry packets.
   * Only dispatches immediately if a device is actively connected.
   */
  subscribe(listener: DevicePacketListener): () => void {
    this.packetListeners.add(listener);
    if (this.lastPacket && this.isConnected()) {
      listener(this.lastPacket);
    }
    return () => this.packetListeners.delete(listener);
  }

  /**
   * Subscribes to device connection state changes.
   */
  subscribeStatus(listener: DeviceStatusListener): () => void {
    this.statusListeners.add(listener);
    listener(this.getConnectionState(), this.lastErrorMessage);
    return () => this.statusListeners.delete(listener);
  }

  private setConnectionState(state: DeviceConnectionState, error: string | null = null): void {
    this.connectionState = state;
    this.lastErrorMessage = error;
    for (const listener of this.statusListeners) {
      try {
        listener(state, error);
      } catch (err) {
        console.error('Error in device status listener:', err);
      }
    }
  }

  private notifyPacketListeners(packet: DeviceTelemetryPacket): void {
    for (const listener of this.packetListeners) {
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
                  this.setConnectionState('receiving_data');
                  this.notifyPacketListeners(packet);
                }
              } catch {
                // Ignore partial JSON chunks
              }
            }
          }
        }
      }
    } catch (err: any) {
      console.warn('WebSerial stream closed or encountered error:', err?.message || err);
      if (this.isReading) {
        this.setConnectionState('error', err?.message || 'Device stream interrupted');
      }
    } finally {
      if (this.activeSource === 'webserial' && !this.isReading) {
        this.setConnectionState('disconnected');
      }
    }
  }
}

export const hardwareDeviceService = new HardwareDeviceService();
