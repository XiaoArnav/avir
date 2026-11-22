/**
 * AVIR — Hardware Device Telemetry Connector (Step 5/24)
 *
 * Provides production-grade connectivity for real personal air monitors:
 * 1. WebSerial API: Direct USB hardware connectivity via browser (Chrome, Edge, Opera)
 * 2. Local Wi-Fi API: Continuous safe polling to local endpoints (e.g. AirGradient /measures/current)
 *
 * Invariants:
 * - Zero fabrication: Only real incoming packets produce measurements.
 * - No default (0, 0) coordinates: Unlocated monitors preserve null coordinates.
 * - Strict separation of device observation time (observedAt) vs reception time (receivedAt).
 * - Bounded buffers and safe stream lifecycle to prevent memory leaks or hung readers.
 * - Non-overlapping cancellable polling sessions.
 */

import { GroundStationMetadata, EnvironmentalSourceRecord, SourceMeasurement } from '@/domain/types';
import {
  DeviceProfile,
  DeviceTransportType,
  VERIFIED_DEVICE_PROFILES,
} from './devices/device-profiles';
import {
  VerifiedDevicePacket,
  normalizeDevicePacket,
} from './devices/normalize-device-packet';
import {
  validateDeviceAddress,
  ValidatedDeviceAddress,
} from './devices/wifi-address-validator';

export type DeviceConnectionState =
  | 'unsupported'             // Browser lacks WebSerial or is in an insecure context
  | 'idle'                    // Not connected, ready for connection attempt
  | 'requesting_permission'   // Native permission dialog open (awaiting user selection)
  | 'opening_connection'     // Port chosen, opening serial connection or starting Wi-Fi
  | 'connected_awaiting_data' // Port open / Wi-Fi initialised, awaiting first valid packet
  | 'receiving_data'          // Actively receiving valid packets
  | 'stale'                   // Connected, but no new valid packet received within freshness window
  | 'disconnected'            // Cleanly disconnected
  | 'error';                  // Connection or read/fetch error

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

  // Step 5 Additions
  profile?: DeviceProfile;
  deviceId?: string | null;
  verifiedPacket?: VerifiedDevicePacket;
  rawPm25?: number | null;
  calibratedPm25?: number | null;
  calibrationApplied?: boolean;
  calibrationFormula?: string | null;
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
  private activeProfile?: DeviceProfile;
  private sessionId = '';

  // USB physical disconnection listener handle
  private serialDisconnectHandler: ((event: any) => void) | null = null;

  // Wi-Fi polling state
  private wifiAbortController: AbortController | null = null;
  private wifiPollTimer: any = null;
  private isWifiPolling = false;
  private activeWifiHost = '';

  // Stale detection watchdog
  private staleWatchdogTimer: any = null;
  private readonly STALE_THRESHOLD_MS = 30000; // 30 seconds without new packet = stale

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
    return (
      this.connectionState === 'receiving_data' ||
      this.connectionState === 'connected_awaiting_data' ||
      this.connectionState === 'stale'
    );
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
   * Returns the active device profile, if identified.
   */
  getActiveProfile(): DeviceProfile | undefined {
    return this.activeProfile || this.lastPacket?.profile;
  }

  /**
   * Connects to an air monitor via WebSerial over USB.
   * Triggered strictly upon explicit user interaction (click).
   */
  async connectUsbDevice(
    baudRate = 115200,
    profileId?: string
  ): Promise<{ success: boolean; cancelled?: boolean; error?: string }> {
    if (!this.isWebSerialSupported()) {
      const err = 'WebSerial is not supported in this browser or context. Please use Chrome, Edge, or Opera over HTTPS.';
      this.setConnectionState('unsupported', err);
      return { success: false, error: err };
    }

    // Clean up any existing connection first
    await this.disconnect();

    this.lastErrorMessage = null;
    this.setConnectionState('requesting_permission');

    try {
      const nav = navigator as any;
      const port = await nav.serial.requestPort();
      this.activePort = port;

      this.setConnectionState('opening_connection');
      await this.activePort.open({ baudRate });

      this.activeSource = 'webserial';
      this.activeProfile = profileId ? VERIFIED_DEVICE_PROFILES[profileId] : undefined;
      this.sessionId = `serial-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      this.isReading = true;
      this.setConnectionState('connected_awaiting_data');

      // Register native physical disconnect listener
      this.attachSerialDisconnectListener();

      // Start serial read loop
      this.startSerialReadLoop();
      return { success: true };
    } catch (err: any) {
      const errorName = err?.name || '';
      const errorMsg = err?.message || String(err);

      // Check if user cancelled port selection (not a fatal error)
      if (
        errorName === 'NotFoundError' ||
        errorMsg.includes('No port selected') ||
        errorMsg.includes('User cancelled')
      ) {
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
    this.stopStaleWatchdog();

    // Detach physical disconnect listener
    this.detachSerialDisconnectListener();

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
        // Safe lock release
      }
      this.reader = null;
    }

    if (this.activePort) {
      try {
        await this.activePort.close();
      } catch {
        // Safe port close
      }
      this.activePort = null;
    }

    if (this.activeSource === 'webserial') {
      this.activeSource = null;
      this.lastPacket = null;
      this.activeProfile = undefined;
    }

    this.setConnectionState('disconnected');
  }

  /**
   * Universal disconnect for any active connection (USB or Wi-Fi).
   */
  async disconnect(): Promise<void> {
    this.stopStaleWatchdog();
    this.stopLocalWifiMonitoring();
    await this.disconnectUsbDevice();
    this.activeSource = null;
    this.lastPacket = null;
    this.activeProfile = undefined;
    this.setConnectionState('disconnected');
  }

  /**
   * Validates local device IP or hostname format using strict network boundaries.
   */
  validateDeviceAddress(address: string): { valid: boolean; cleanAddress: string; error?: string } {
    const res = validateDeviceAddress(address);
    return {
      valid: res.valid,
      cleanAddress: res.cleanHost,
      error: res.error,
    };
  }

  /**
   * Starts a continuous, cancellable polling session for a local Wi-Fi monitor.
   * Respects browser Local Network Access, CORS, and request timeout boundaries.
   */
  async startLocalWifiMonitoring(
    ipAddress: string,
    intervalMs = 10000,
    profileId?: string
  ): Promise<{ packet: DeviceTelemetryPacket | null; error?: string }> {
    const validation = validateDeviceAddress(ipAddress);
    if (!validation.valid) {
      this.setConnectionState('error', validation.error);
      return { packet: null, error: validation.error };
    }

    // Clean up any existing connection first
    await this.disconnect();

    this.activeSource = 'local_wifi';
    this.activeWifiHost = validation.cleanHost;
    this.activeProfile = profileId ? VERIFIED_DEVICE_PROFILES[profileId] : undefined;
    this.sessionId = `wifi-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    this.setConnectionState('opening_connection');

    // Create fresh AbortController for this polling session
    this.wifiAbortController = new AbortController();

    // Perform first fetch
    const firstResult = await this.pollWifiEndpoint(validation.url, this.wifiAbortController.signal);

    if (firstResult.error) {
      this.setConnectionState('error', firstResult.error);
      return { packet: null, error: firstResult.error };
    }

    // Start repeating polling session
    this.isWifiPolling = true;
    this.scheduleNextWifiPoll(validation.url, intervalMs);

    return { packet: firstResult.packet };
  }

  /**
   * Stops active Wi-Fi polling session and cleans up resources.
   */
  stopLocalWifiMonitoring(): void {
    this.isWifiPolling = false;
    this.stopStaleWatchdog();

    if (this.wifiPollTimer) {
      clearTimeout(this.wifiPollTimer);
      this.wifiPollTimer = null;
    }

    if (this.wifiAbortController) {
      try {
        this.wifiAbortController.abort();
      } catch {
        // Safe abort
      }
      this.wifiAbortController = null;
    }

    if (this.activeSource === 'local_wifi') {
      this.activeSource = null;
      this.lastPacket = null;
      this.activeProfile = undefined;
    }

    this.setConnectionState('disconnected');
  }

  /**
   * Backward-compatible fetch method for local Wi-Fi device.
   * Executes continuous monitoring session or one-shot request.
   */
  async fetchLocalWifiDevice(
    ipAddress: string,
    signal?: AbortSignal
  ): Promise<{ packet: DeviceTelemetryPacket | null; error?: string }> {
    return this.startLocalWifiMonitoring(ipAddress, 10000);
  }

  /**
   * Normalizes heterogeneous JSON telemetry payloads into canonical packet contract.
   * Enforces zero-fabrication validation and scientific calibration gating.
   */
  parseTelemetryPayload(data: any, source: 'webserial' | 'local_wifi'): DeviceTelemetryPacket | null {
    const verified = normalizeDevicePacket(data, {
      sessionId: this.sessionId || `session-${Date.now()}`,
      transport: source,
      profileOverride: this.activeProfile,
    });

    if (!verified) return null;

    return this.toDeviceTelemetryPacket(verified, data, source);
  }

  /**
   * Converts the latest connected hardware packet into Avir's GroundStationMetadata format.
   * Coordinates are strictly null when unlocated (no Gulf of Guinea (0,0) fabrication).
   */
  getAsGroundStationMetadata(): GroundStationMetadata | null {
    if (!this.lastPacket || !this.isConnected()) return null;

    const profile = this.lastPacket.profile || this.activeProfile;
    const defaultStationName =
      this.lastPacket.source === 'webserial'
        ? 'My Connected USB Monitor (ESP32)'
        : 'My Local Air Monitor';

    const stationName =
      this.lastPacket.source === 'webserial'
        ? profile?.name && profile.name !== 'Generic Serial Air Monitor'
          ? `My Connected USB Monitor (${profile.name})`
          : 'My Connected USB Monitor (ESP32)'
        : profile?.name || defaultStationName;

    const provider = profile?.manufacturer
      ? `${profile.manufacturer} (${profile.model || 'Personal Monitor'})`
      : 'User Hardware Monitor (BYOD)';

    return {
      stationId: this.lastPacket.deviceId
        ? `user-dev-${this.lastPacket.deviceId}`
        : `user-dev-${this.lastPacket.source}`,
      stationName,
      distanceKm: null, // Strictly null: personal monitor is not geographically registered
      latitude: null,   // Strictly null: no false (0, 0) coordinates
      longitude: null,  // Strictly null: no false (0, 0) coordinates
      provider,
      stationType: 'user_device',
      stationState: this.connectionState === 'stale' ? 'stale_observation' : 'live_observation',
      lastUpdated: this.lastPacket.receivedAt,
      observedAt: this.lastPacket.observedAt,
      retrievedAt: this.lastPacket.receivedAt,
      pm25: this.lastPacket.pm25,
      pm10: this.lastPacket.pm10,
      rawPm25: this.lastPacket.rawPm25 ?? this.lastPacket.pm25,
      isCalibrated: Boolean(this.lastPacket.calibrationApplied),
      calibrationFormula: this.lastPacket.calibrationFormula || undefined,
    };
  }

  /**
   * Converts active hardware packet into canonical EnvironmentalSourceRecord.
   * Excludes unverified coordinates and preserves user_hardware sourceKind.
   */
  getAsEnvironmentalSource(): EnvironmentalSourceRecord | null {
    if (!this.lastPacket || !this.isConnected()) return null;

    const metadata = this.getAsGroundStationMetadata();
    if (!metadata) return null;

    const measurements: SourceMeasurement[] = [];

    if (this.lastPacket.pm25 !== null) {
      measurements.push({
        pollutant: 'pm25',
        value: this.lastPacket.calibratedPm25 ?? this.lastPacket.pm25,
        unit: 'ug/m3',
        observedAt: this.lastPacket.observedAt,
        receivedAt: this.lastPacket.receivedAt,
        rawUncalibratedValue: this.lastPacket.rawPm25,
        calibrationApplied: this.lastPacket.calibrationFormula || null,
        qualityFlag: this.lastPacket.calibrationApplied ? 'calibrated' : 'raw',
      });
    }

    if (this.lastPacket.pm10 !== null) {
      measurements.push({
        pollutant: 'pm10',
        value: this.lastPacket.pm10,
        unit: 'ug/m3',
        observedAt: this.lastPacket.observedAt,
        receivedAt: this.lastPacket.receivedAt,
        qualityFlag: 'raw',
      });
    }

    return {
      id: String(metadata.stationId),
      providerId: 'user_hardware',
      providerName: metadata.provider,
      stationId: String(metadata.stationId),
      sourceName: metadata.stationName,
      sourceKind: 'user_hardware',
      status: this.connectionState === 'stale' ? 'stale' : 'fresh',
      latitude: null,
      longitude: null,
      distanceKm: null,
      coordinates: null,
      observedAt: this.lastPacket.observedAt,
      retrievedAt: this.lastPacket.receivedAt,
      measurements,
      attribution: 'User Personal Air Quality Monitor',
      provenance: {
        network: 'Direct Hardware Telemetry',
        licenseOrAttribution: 'Personal Sensor Data',
        isModel: false,
        limitations: [
          'Personal low-cost optical sensor observation.',
          'Not collocated with regulatory reference station.',
          'Coordinates unconfigured.',
        ],
      },
    };
  }

  /**
   * Subscribes to device telemetry packets.
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

  private toDeviceTelemetryPacket(
    verified: VerifiedDevicePacket,
    rawJson: any,
    source: 'webserial' | 'local_wifi'
  ): DeviceTelemetryPacket {
    return {
      pm25: verified.pm25,
      pm10: verified.pm10,
      co2: verified.co2,
      temperature: verified.temperature,
      humidity: verified.humidity,
      rawJson,
      observedAt: verified.observedAt,
      receivedAt: verified.receivedAt,
      timestamp: verified.timestamp,
      source,
      profile: verified.profile,
      deviceId: verified.deviceId,
      verifiedPacket: verified,
      rawPm25: verified.rawPm25,
      calibratedPm25: verified.calibratedPm25,
      calibrationApplied: verified.calibrationApplied,
      calibrationFormula: verified.calibrationFormula,
    };
  }

  private resetStaleWatchdog(): void {
    this.stopStaleWatchdog();
    this.staleWatchdogTimer = setTimeout(() => {
      if (this.isConnected()) {
        this.setConnectionState('stale');
      }
    }, this.STALE_THRESHOLD_MS);
  }

  private stopStaleWatchdog(): void {
    if (this.staleWatchdogTimer) {
      clearTimeout(this.staleWatchdogTimer);
      this.staleWatchdogTimer = null;
    }
  }

  private attachSerialDisconnectListener(): void {
    if (
      typeof navigator !== 'undefined' &&
      (navigator as any).serial &&
      typeof (navigator as any).serial.addEventListener === 'function'
    ) {
      this.detachSerialDisconnectListener();
      this.serialDisconnectHandler = (event: any) => {
        if (this.activePort && (event?.port === this.activePort || !event?.port)) {
          console.warn('Physical serial device disconnected by OS / cable removal.');
          this.setConnectionState('disconnected');
          this.disconnect();
        }
      };
      try {
        (navigator as any).serial.addEventListener('disconnect', this.serialDisconnectHandler);
      } catch {
        // Safe attach
      }
    }
  }

  private detachSerialDisconnectListener(): void {
    if (
      this.serialDisconnectHandler &&
      typeof navigator !== 'undefined' &&
      (navigator as any).serial &&
      typeof (navigator as any).serial.removeEventListener === 'function'
    ) {
      try {
        (navigator as any).serial.removeEventListener('disconnect', this.serialDisconnectHandler);
      } catch {
        // Safe detach
      }
      this.serialDisconnectHandler = null;
    }
  }

  private async pollWifiEndpoint(
    url: string,
    signal?: AbortSignal
  ): Promise<{ packet: DeviceTelemetryPacket | null; error?: string }> {
    try {
      // Create request with 5000ms timeout
      const fetchController = new AbortController();
      const timeoutId = setTimeout(() => fetchController.abort(), 5000);

      const combinedSignal = signal;
      const onAbort = () => fetchController.abort();
      if (combinedSignal) {
        combinedSignal.addEventListener('abort', onAbort);
      }

      let res: Response;
      try {
        res = await fetch(url, { signal: fetchController.signal });
      } finally {
        clearTimeout(timeoutId);
        if (combinedSignal) {
          combinedSignal.removeEventListener('abort', onAbort);
        }
      }

      if (!res.ok) {
        const errorMsg = `Air monitor returned HTTP ${res.status} (${res.statusText || 'Error'}).`;
        return { packet: null, error: errorMsg };
      }

      const data = await res.json();
      const packet = this.parseTelemetryPayload(data, 'local_wifi');

      if (!packet) {
        const errorMsg = 'Response from device did not contain valid air quality measurements.';
        return { packet: null, error: errorMsg };
      }

      this.lastPacket = packet;
      this.setConnectionState('receiving_data');
      this.resetStaleWatchdog();
      this.notifyPacketListeners(packet);
      return { packet };
    } catch (err: any) {
      const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:';
      const isFailedFetch = err?.name === 'TypeError' || err?.message?.includes('Failed to fetch');
      let friendlyError = err?.message || 'Connection failed.';

      if (isHttps && isFailedFetch) {
        friendlyError = `Direct browser request to ${this.activeWifiHost} was blocked. Because Avir is served over HTTPS, modern browsers restrict mixed HTTP requests to local networks (CORS / Mixed Content). Connect via USB WebSerial for instant zero-friction connectivity.`;
      } else if (err?.name === 'AbortError') {
        friendlyError = 'Request timed out or was cancelled.';
      }

      return { packet: null, error: friendlyError };
    }
  }

  private scheduleNextWifiPoll(url: string, intervalMs: number): void {
    if (!this.isWifiPolling || !this.wifiAbortController) return;

    this.wifiPollTimer = setTimeout(async () => {
      if (!this.isWifiPolling || !this.wifiAbortController) return;

      const result = await this.pollWifiEndpoint(url, this.wifiAbortController.signal);
      if (result.error && this.isWifiPolling) {
        // If consecutive errors happen, don't immediately drop; stale watchdog handles freshness
        console.warn(`Wi-Fi poll failure for ${this.activeWifiHost}:`, result.error);
      }

      // Schedule subsequent poll
      if (this.isWifiPolling) {
        this.scheduleNextWifiPoll(url, intervalMs);
      }
    }, intervalMs);
  }

  private async startSerialReadLoop(): Promise<void> {
    if (!this.activePort || !this.activePort.readable) return;

    try {
      if (typeof (window as any)?.TextDecoderStream === 'function') {
        const textDecoder = new (window as any).TextDecoderStream();
        this.activePort.readable.pipeTo(textDecoder.writable);
        this.reader = textDecoder.readable.getReader();
      } else if (typeof this.activePort.readable.getReader === 'function') {
        this.reader = this.activePort.readable.getReader();
      } else {
        // Readable stream not available in this test environment
        return;
      }

      let buffer = '';
      const MAX_BUFFER_SIZE = 16384; // 16 KB bounded buffer

      while (this.isReading) {
        const { value, done } = await this.reader.read();
        if (done) break;
        if (value) {
          buffer += value;

          // Prevent unbounded buffer accumulation if device sends line without newline
          if (buffer.length > MAX_BUFFER_SIZE) {
            buffer = buffer.slice(-4096);
          }

          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.length === 0 || trimmed.length > 2048) continue; // bounded frame size

            if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
              try {
                const parsed = JSON.parse(trimmed);
                const packet = this.parseTelemetryPayload(parsed, 'webserial');
                if (packet) {
                  this.lastPacket = packet;
                  this.setConnectionState('receiving_data');
                  this.resetStaleWatchdog();
                  this.notifyPacketListeners(packet);
                }
              } catch {
                // Ignore partial JSON chunks without terminating read loop
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
