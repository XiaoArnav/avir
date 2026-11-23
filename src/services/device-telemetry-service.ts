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
 * - Non-overlapping cancellable polling sessions with strict session generation tokens.
 * - Exponential backoff on Wi-Fi poll failures.
 * - Streaming TextDecoder to prevent chunk concatenation bugs.
 */

import { GroundStationMetadata, EnvironmentalSourceRecord, SourceMeasurement } from '@/domain/types';
import {
  DeviceProfile,
  DeviceTransportType,
  DeviceIdentityStatus,
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
import { DeviceCalibrationStatus } from '@/domain/calibration-math';

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
  identityStatus?: DeviceIdentityStatus;
  verifiedPacket?: VerifiedDevicePacket;
  rawPm25?: number | null;
  calibratedPm25?: number | null;
  calibrationApplied?: boolean;
  calibrationFormula?: string | null;
  calibrationStatus?: DeviceCalibrationStatus;
  diagnosticSnippet?: string;
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
  private sessionGeneration = 0; // Monotonic counter for session isolation

  // USB physical disconnection listener handle
  private serialDisconnectHandler: ((event: any) => void) | null = null;

  // Wi-Fi polling state
  private wifiAbortController: AbortController | null = null;
  private wifiPollTimer: any = null;
  private isWifiPolling = false;
  private activeWifiHost = '';
  private consecutiveWifiFailures = 0;

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
   * Checks if a transport channel (USB port or Wi-Fi poller) is currently open.
   */
  isTransportOpen(): boolean {
    return Boolean(
      this.activePort ||
      (this.activeSource === 'local_wifi' && (this.isWifiPolling || this.wifiAbortController))
    );
  }

  /**
   * Checks if the device is currently receiving fresh, non-stale telemetry packets.
   */
  isReceivingFreshData(): boolean {
    return this.connectionState === 'receiving_data';
  }

  /**
   * Checks if any observation reading has been received during the active session.
   */
  hasLastKnownReading(): boolean {
    return this.lastPacket !== null;
  }

  /**
   * Returns whether a device transport is currently active.
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
   * Calls `navigator.serial.requestPort()` synchronously with user gesture to preserve activation.
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

    this.lastErrorMessage = null;
    this.setConnectionState('requesting_permission');

    let port: any;
    try {
      const nav = navigator as any;
      // Request port immediately to retain browser user activation
      port = await nav.serial.requestPort();
    } catch (err: any) {
      const errorName = err?.name || '';
      const errorMsg = err?.message || String(err);

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

    // Port granted: Clean up previous session safely
    await this.disconnect();

    try {
      this.setConnectionState('opening_connection');
      await port.open({ baudRate });

      this.activePort = port;
      this.activeSource = 'webserial';
      this.activeProfile = profileId ? VERIFIED_DEVICE_PROFILES[profileId] : undefined;
      const currentGen = ++this.sessionGeneration;
      this.sessionId = `serial-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      this.isReading = true;
      this.setConnectionState('connected_awaiting_data');

      // Register native physical disconnect listener
      this.attachSerialDisconnectListener();

      // Start serial read loop with current generation
      this.startSerialReadLoop(currentGen);
      return { success: true };
    } catch (err: any) {
      const errorMsg = err?.message || String(err);
      this.setConnectionState('error', errorMsg);
      console.warn('WebSerial port open error:', errorMsg);
      return { success: false, error: errorMsg };
    }
  }

  /**
   * Disconnects active USB serial monitor and safely closes streams.
   */
  async disconnectUsbDevice(): Promise<void> {
    this.isReading = false;
    this.stopStaleWatchdog();
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
    this.sessionGeneration++; // Invalidate any in-flight requests or timers
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
   * Respects browser Local Network Access, CORS, request timeout boundaries,
   * session tokens, and exponential backoff.
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

    const currentGen = ++this.sessionGeneration;
    this.activeSource = 'local_wifi';
    this.activeWifiHost = validation.cleanHost;
    this.activeProfile = profileId ? VERIFIED_DEVICE_PROFILES[profileId] : undefined;
    this.sessionId = `wifi-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    this.consecutiveWifiFailures = 0;
    this.setConnectionState('opening_connection');

    // Create fresh AbortController for this polling session
    this.wifiAbortController = new AbortController();

    // Start repeating polling session with exponential backoff support
    this.isWifiPolling = true;

    // Perform first fetch passing generation token
    const firstResult = await this.pollWifiEndpoint(validation.url, currentGen, this.wifiAbortController.signal);

    // If session was superseded or disconnected while waiting for first fetch, abort
    if (currentGen !== this.sessionGeneration || !this.isWifiPolling) {
      return { packet: null, error: 'Session cancelled' };
    }

    if (firstResult.error) {
      this.consecutiveWifiFailures = 1;
      this.setConnectionState('error', firstResult.error);
      // Schedule subsequent retry with 1st failure backoff: 15s
      this.scheduleNextWifiPoll(validation.url, currentGen, 15000);
      return { packet: null, error: firstResult.error };
    }

    this.consecutiveWifiFailures = 0;
    this.scheduleNextWifiPoll(validation.url, currentGen, intervalMs);

    return { packet: firstResult.packet };
  }

  /**
   * Stops active Wi-Fi polling session and cleans up resources.
   */
  stopLocalWifiMonitoring(): void {
    this.isWifiPolling = false;
    this.consecutiveWifiFailures = 0;
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
   * Enforces zero-fabrication validation, identity status, and scientific calibration gating.
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
        qualityFlag: this.connectionState === 'stale' ? 'suspect' : (this.lastPacket.calibrationApplied ? 'calibrated' : 'raw'),
      });
    }

    if (this.lastPacket.pm10 !== null) {
      measurements.push({
        pollutant: 'pm10',
        value: this.lastPacket.pm10,
        unit: 'ug/m3',
        observedAt: this.lastPacket.observedAt,
        receivedAt: this.lastPacket.receivedAt,
        qualityFlag: this.connectionState === 'stale' ? 'suspect' : 'raw',
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
      identityStatus: verified.identityStatus,
      verifiedPacket: verified,
      rawPm25: verified.rawPm25,
      calibratedPm25: verified.calibratedPm25,
      calibrationApplied: verified.calibrationApplied,
      calibrationFormula: verified.calibrationFormula,
      calibrationStatus: verified.calibrationStatus,
      diagnosticSnippet: verified.diagnosticSnippet,
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
    sessionGeneration: number,
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
        const fetchOptions: RequestInit = { signal: fetchController.signal };
        // Support Chromium Local Network Access targetAddressSpace hint when available
        try {
          (fetchOptions as any).targetAddressSpace = 'local';
        } catch {}

        res = await fetch(url, fetchOptions);
      } finally {
        clearTimeout(timeoutId);
        if (combinedSignal) {
          combinedSignal.removeEventListener('abort', onAbort);
        }
      }

      // Check session isolation: if session changed during fetch, discard
      if (sessionGeneration !== this.sessionGeneration || signal?.aborted) {
        return { packet: null, error: 'Session superseded or aborted' };
      }

      if (!res.ok) {
        const errorMsg = `Air monitor returned HTTP ${res.status} (${res.statusText || 'Error'}).`;
        return { packet: null, error: errorMsg };
      }

      const data = await res.json();

      // Re-verify session after parsing
      if (sessionGeneration !== this.sessionGeneration || signal?.aborted) {
        return { packet: null, error: 'Session superseded or aborted' };
      }

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
      if (sessionGeneration !== this.sessionGeneration || signal?.aborted) {
        return { packet: null, error: 'Session superseded or aborted' };
      }

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

  private scheduleNextWifiPoll(url: string, sessionGeneration: number, intervalMs: number): void {
    if (!this.isWifiPolling || !this.wifiAbortController || sessionGeneration !== this.sessionGeneration) return;

    this.wifiPollTimer = setTimeout(async () => {
      if (!this.isWifiPolling || !this.wifiAbortController || sessionGeneration !== this.sessionGeneration) return;

      const result = await this.pollWifiEndpoint(url, sessionGeneration, this.wifiAbortController.signal);
      if (sessionGeneration !== this.sessionGeneration || !this.isWifiPolling) return;

      let nextInterval = intervalMs;
      if (result.error) {
        this.consecutiveWifiFailures++;
        // Bounded exponential backoff policy:
        // 1 failure: 15 seconds
        // 2 failures: 30 seconds
        // 3+ failures: 60 seconds (capped)
        if (this.consecutiveWifiFailures === 1) {
          nextInterval = 15000;
        } else if (this.consecutiveWifiFailures === 2) {
          nextInterval = 30000;
        } else {
          nextInterval = 60000;
        }
        console.warn(`Wi-Fi poll failure for ${this.activeWifiHost} (consecutive: ${this.consecutiveWifiFailures}):`, result.error);
      } else {
        this.consecutiveWifiFailures = 0;
        nextInterval = 10000; // Reset to standard 10s interval on success
      }

      // Schedule subsequent poll
      if (this.isWifiPolling && sessionGeneration === this.sessionGeneration) {
        this.scheduleNextWifiPoll(url, sessionGeneration, nextInterval);
      }
    }, intervalMs);
  }

  private async startSerialReadLoop(sessionGeneration: number): Promise<void> {
    if (!this.activePort || !this.activePort.readable) return;

    try {
      const textDecoder = new TextDecoder('utf-8', { fatal: false });

      if (typeof this.activePort.readable.getReader === 'function') {
        this.reader = this.activePort.readable.getReader();
      } else {
        return;
      }

      let buffer = '';
      const MAX_BUFFER_SIZE = 16384; // 16 KB bounded buffer

      while (this.isReading && sessionGeneration === this.sessionGeneration) {
        const { value, done } = await this.reader.read();

        // Check if stream closed naturally by device or cable removal
        if (done) {
          break;
        }

        if (value) {
          // Decode Uint8Array chunk with streaming mode to support split UTF-8 sequences
          const chunkText = typeof value === 'string'
            ? value
            : textDecoder.decode(value, { stream: true });

          buffer += chunkText;

          // Prevent unbounded buffer accumulation
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
                if (sessionGeneration !== this.sessionGeneration || !this.isReading) return;

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

      // Clean stream termination: reached EOF/done
      if (this.isReading && sessionGeneration === this.sessionGeneration) {
        this.isReading = false;
        this.stopStaleWatchdog();
        this.detachSerialDisconnectListener();
        this.setConnectionState('disconnected');
      }
    } catch (err: any) {
      console.warn('WebSerial stream closed or encountered error:', err?.message || err);
      if (this.isReading && sessionGeneration === this.sessionGeneration) {
        this.isReading = false;
        this.stopStaleWatchdog();
        this.detachSerialDisconnectListener();
        this.setConnectionState('error', err?.message || 'Device stream interrupted');
      }
    } finally {
      if (sessionGeneration === this.sessionGeneration) {
        if (this.reader) {
          try {
            if (typeof this.reader.releaseLock === 'function') {
              this.reader.releaseLock();
            }
          } catch {}
          this.reader = null;
        }
      }
    }
  }
}

export const hardwareDeviceService = new HardwareDeviceService();
