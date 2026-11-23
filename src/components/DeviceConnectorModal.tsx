'use client';

import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  hardwareDeviceService,
  DeviceTelemetryPacket,
  DeviceConnectionState,
} from '@/services/device-telemetry-service';
import {
  VERIFIED_DEVICE_PROFILES,
  DeviceProfile,
} from '@/services/devices/device-profiles';
import {
  Usb,
  Wifi,
  X,
  CheckCircle,
  AlertCircle,
  Cpu,
  RefreshCw,
  Info,
  Clock,
  Radio,
  MapPinOff,
  ChevronDown,
  ChevronUp,
  ShieldAlert,
} from 'lucide-react';

interface DeviceConnectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDeviceConnected?: (packet: DeviceTelemetryPacket) => void;
}

export function DeviceConnectorModal({
  isOpen,
  onClose,
  onDeviceConnected,
}: DeviceConnectorModalProps) {
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<'usb' | 'wifi'>('usb');
  const [selectedProfileId, setSelectedProfileId] = useState<string>('auto');
  const [ipAddress, setIpAddress] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionState, setConnectionState] = useState<DeviceConnectionState>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [latestPacket, setLatestPacket] = useState<DeviceTelemetryPacket | null>(null);
  const [showDiagnostics, setShowDiagnostics] = useState(false);

  const modalRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const onConnectedRef = useRef(onDeviceConnected);

  // Keep latest callback ref to prevent resubscription churn
  useEffect(() => {
    onConnectedRef.current = onDeviceConnected;
  }, [onDeviceConnected]);

  // Client-side hydration guard for createPortal
  useEffect(() => {
    setMounted(true);
  }, []);

  // Sync state and packets from service
  useEffect(() => {
    if (!isOpen) return;

    // Initialize with current service state
    setConnectionState(hardwareDeviceService.getConnectionState());
    setLatestPacket(hardwareDeviceService.getLastPacket());

    const unsubPacket = hardwareDeviceService.subscribe((packet) => {
      setLatestPacket(packet);
      if (onConnectedRef.current) {
        onConnectedRef.current(packet);
      }
    });

    const unsubStatus = hardwareDeviceService.subscribeStatus((state, error) => {
      setConnectionState(state);
      if (error) {
        setErrorMessage(error);
      }
    });

    return () => {
      unsubPacket();
      unsubStatus();
    };
  }, [isOpen]);

  // Focus management and body scroll locking
  useEffect(() => {
    if (!isOpen || !mounted) return;

    // Save previous active element for restoration
    previousFocusRef.current = document.activeElement as HTMLElement;

    // Lock body scroll
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Move initial focus into dialog
    const focusTimer = requestAnimationFrame(() => {
      closeButtonRef.current?.focus();
    });

    return () => {
      cancelAnimationFrame(focusTimer);
      document.body.style.overflow = originalOverflow;
      // Restore focus on close
      if (previousFocusRef.current && typeof previousFocusRef.current.focus === 'function') {
        previousFocusRef.current.focus();
      }
    };
  }, [isOpen, mounted]);

  // Keyboard navigation: Escape to close and Tab focus trap
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      handleClose();
      return;
    }

    if (e.key === 'Tab') {
      if (!modalRef.current) return;
      const focusable = modalRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
  };

  const handleClose = () => {
    setErrorMessage(null);
    setInfoMessage(null);
    onClose();
  };

  const isWebSerialSupported = hardwareDeviceService.isWebSerialSupported();
  const isConnected = hardwareDeviceService.isConnected() || connectionState === 'receiving_data';

  const handleConnectUsb = async () => {
    setIsConnecting(true);
    setErrorMessage(null);
    setInfoMessage(null);

    const profileId = selectedProfileId !== 'auto' ? selectedProfileId : undefined;

    try {
      const result = await hardwareDeviceService.connectUsbDevice(115200, profileId);
      if (result.cancelled) {
        setInfoMessage('Port selection was cancelled.');
      } else if (!result.success && result.error) {
        setErrorMessage(result.error);
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'USB serial connection failed.');
    } finally {
      setIsConnecting(false);
    }
  };

  const handleConnectWifi = async () => {
    if (!ipAddress.trim()) {
      setErrorMessage('Please enter your monitor IP address or .local hostname.');
      return;
    }

    setIsConnecting(true);
    setErrorMessage(null);
    setInfoMessage(null);

    const profileId = selectedProfileId !== 'auto' ? selectedProfileId : undefined;

    try {
      const result = await hardwareDeviceService.startLocalWifiMonitoring(ipAddress, 10000, profileId);
      if (result.error) {
        setErrorMessage(result.error);
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Wi-Fi connection failed.');
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    await hardwareDeviceService.disconnect();
    setLatestPacket(null);
    setErrorMessage(null);
    setInfoMessage('Device disconnected.');
  };

  if (!isOpen || !mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center p-4 sm:p-6 overflow-y-auto"
      onKeyDown={handleKeyDown}
    >
      {/* Dimmed backdrop overlay covering entire viewport */}
      <div
        className="fixed inset-0 bg-black/75 backdrop-blur-sm transition-opacity"
        onClick={handleClose}
        aria-hidden="true"
      />

      {/* High-contrast, solid dialog surface rendered outside dashboard */}
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="device-connector-title"
        aria-describedby="device-connector-desc"
        className="relative w-full max-w-lg my-auto rounded-2xl bg-white dark:bg-zinc-900 border border-stone-200 dark:border-zinc-800 shadow-2xl p-6 sm:p-7 text-ink dark:text-white max-h-[90vh] flex flex-col z-10 animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-stone-200 dark:border-zinc-800 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-100 dark:bg-emerald-950/80 border border-emerald-300 dark:border-emerald-800 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <h2 id="device-connector-title" className="text-base font-bold text-ink dark:text-white">
                Connect Hardware Air Monitor
              </h2>
              <p id="device-connector-desc" className="text-xs text-ink-muted dark:text-zinc-400">
                AirGradient ONE / Open Air, Project Vaayu, or CanAirIO
              </p>
            </div>
          </div>
          <button
            ref={closeButtonRef}
            onClick={handleClose}
            aria-label="Close dialog"
            className="p-1.5 rounded-lg text-ink-muted dark:text-zinc-400 hover:bg-stone-100 dark:hover:bg-zinc-800 transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex p-1 mt-5 rounded-xl bg-stone-100 dark:bg-zinc-800/90 border border-stone-200 dark:border-zinc-700/60 text-xs font-semibold shrink-0">
          <button
            type="button"
            onClick={() => {
              setActiveTab('usb');
              setErrorMessage(null);
              setInfoMessage(null);
            }}
            className={`flex-1 py-2 rounded-lg flex items-center justify-center gap-2 transition-all focus:outline-none focus:ring-2 focus:ring-emerald-500 ${
              activeTab === 'usb'
                ? 'bg-white dark:bg-zinc-900 text-ink dark:text-white shadow-sm border border-stone-200/80 dark:border-zinc-700'
                : 'text-ink-muted dark:text-zinc-400 hover:text-ink dark:hover:text-white'
            }`}
          >
            <Usb className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span>USB WebSerial</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('wifi');
              setErrorMessage(null);
              setInfoMessage(null);
            }}
            className={`flex-1 py-2 rounded-lg flex items-center justify-center gap-2 transition-all focus:outline-none focus:ring-2 focus:ring-emerald-500 ${
              activeTab === 'wifi'
                ? 'bg-white dark:bg-zinc-900 text-ink dark:text-white shadow-sm border border-stone-200/80 dark:border-zinc-700'
                : 'text-ink-muted dark:text-zinc-400 hover:text-ink dark:hover:text-white'
            }`}
          >
            <Wifi className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
            <span>Local Wi-Fi Network</span>
          </button>
        </div>

        {/* Optional Device Profile Selector */}
        <div className="mt-3.5 pt-1">
          <label
            htmlFor="device-profile-select"
            className="block text-[11px] font-mono uppercase tracking-wider text-ink-muted dark:text-zinc-400 font-medium mb-1"
          >
            Hardware Profile (Optional Selection)
          </label>
          <select
            id="device-profile-select"
            value={selectedProfileId}
            onChange={(e) => setSelectedProfileId(e.target.value)}
            disabled={isConnected}
            className="w-full px-3 py-2 rounded-xl bg-stone-50 dark:bg-zinc-800 border border-stone-300 dark:border-zinc-700 text-xs font-mono text-ink dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50"
          >
            <option value="auto">Auto-Detect from Telemetry Signature</option>
            <option value="airgradient-one">AirGradient ONE (I-9PSL) — PMS5003 / S8</option>
            <option value="airgradient-open-air">AirGradient Open Air (O-1PST) — Dual PMS5003T</option>
            <option value="project-vaayu">Project Vaayu Monitor (India DIY) — PMS5003 / SDS011</option>
            <option value="canairio">CanAirIO Citizen Science — SPS30 / PMS5003</option>
            <option value="generic-serial">Generic Serial JSON — Custom Optical Counter</option>
          </select>
        </div>

        {/* Scrollable Tab Content Body */}
        <div className="py-4 space-y-4 overflow-y-auto flex-1">
          {activeTab === 'usb' ? (
            <div className="space-y-3">
              <p className="text-xs text-ink-muted dark:text-zinc-300 leading-relaxed">
                Connect your personal monitor directly via USB. Reads verified newline-delimited JSON telemetry at 115200 baud with zero cloud telemetry.
              </p>

              {!isWebSerialSupported ? (
                <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="font-semibold">WebSerial Unsupported in This Browser</p>
                    <p className="text-[11px] leading-relaxed text-amber-700 dark:text-amber-400">
                      WebSerial requires a Chromium-based browser (Google Chrome, Microsoft Edge, Opera, Brave) in a secure HTTPS context. If you are on Firefox or Safari, please use the <strong>Local Wi-Fi Network</strong> tab.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="pt-1">
                  {!isConnected ? (
                    <button
                      type="button"
                      onClick={handleConnectUsb}
                      disabled={isConnecting}
                      className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs transition-all shadow-md active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    >
                      {isConnecting ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>Requesting Port in Browser...</span>
                        </>
                      ) : (
                        <>
                          <Usb className="w-4 h-4" />
                          <span>Select USB Serial Port (115200 baud)</span>
                        </>
                      )}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleDisconnect}
                      className="w-full py-2.5 rounded-xl bg-red-50 dark:bg-red-950/60 hover:bg-red-100 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800 font-semibold text-xs transition-all flex items-center justify-center gap-2 focus:outline-none focus:ring-2 focus:ring-red-500"
                    >
                      <span>Disconnect USB Monitor</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-ink-muted dark:text-zinc-300 leading-relaxed">
                Connect to an AirGradient ONE or compatible local Wi-Fi air monitor exposing an embedded HTTP server (e.g. <code>/measures/current</code>).
              </p>

              {/* HTTPS Mixed Content Notice */}
              <div className="p-3 rounded-xl bg-blue-50/80 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/60 text-xs text-blue-800 dark:text-blue-300 flex items-start gap-2.5">
                <Info className="w-4 h-4 shrink-0 mt-0.5 text-blue-600 dark:text-blue-400" />
                <div className="space-y-0.5 text-[11px] leading-relaxed">
                  <span className="font-semibold block">Browser Local Network Access:</span>
                  <span>
                    When visiting over HTTPS, modern browsers restrict mixed HTTP requests to private IP addresses. If your browser blocks local requests, grant local network permission or use the USB WebSerial tab.
                  </span>
                </div>
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="device-ip-input"
                  className="text-[11px] font-mono uppercase tracking-wider text-ink-muted dark:text-zinc-400 font-medium"
                >
                  Device Local IP or Hostname
                </label>
                <div className="flex gap-2">
                  <input
                    id="device-ip-input"
                    type="text"
                    value={ipAddress}
                    onChange={(e) => setIpAddress(e.target.value)}
                    placeholder="e.g. 192.168.1.150 or airgradient.local"
                    className="flex-1 px-3.5 py-2.5 rounded-xl bg-stone-50 dark:bg-zinc-800 border border-stone-300 dark:border-zinc-700 text-xs font-mono text-ink dark:text-white placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <button
                    type="button"
                    onClick={handleConnectWifi}
                    disabled={isConnecting || !ipAddress.trim()}
                    className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs transition-all shadow-md active:scale-95 disabled:opacity-50 flex items-center gap-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    {isConnecting ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Wifi className="w-3.5 h-3.5" />
                    )}
                    <span>{isConnected && hardwareDeviceService.getActiveSource() === 'local_wifi' ? 'Polling' : 'Connect'}</span>
                  </button>
                </div>
              </div>

              {isConnected && (
                <button
                  type="button"
                  onClick={handleDisconnect}
                  className="w-full py-2 rounded-xl bg-stone-100 hover:bg-stone-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-ink dark:text-white font-semibold text-xs border border-stone-200 dark:border-zinc-700 transition-colors"
                >
                  Clear Device Session
                </button>
              )}
            </div>
          )}

          {/* Info Notice */}
          {infoMessage && (
            <div className="p-3 rounded-xl bg-stone-100 dark:bg-zinc-800/80 border border-stone-200 dark:border-zinc-700 text-xs text-ink-muted dark:text-zinc-300 flex items-center gap-2">
              <Info className="w-4 h-4 shrink-0 text-stone-500" />
              <span>{infoMessage}</span>
            </div>
          )}

          {/* Error Message */}
          {errorMessage && (
            <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/60 text-xs text-red-700 dark:text-red-300 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span className="leading-relaxed">{errorMessage}</span>
            </div>
          )}

          {/* Connected but Awaiting Data State (Honest: Zero Synthetic Readings) */}
          {connectionState === 'connected_awaiting_data' && !latestPacket && (
            <div className="p-4 rounded-xl bg-cyan-50/70 dark:bg-cyan-950/30 border border-cyan-200 dark:border-cyan-800/60 text-xs text-cyan-900 dark:text-cyan-200 space-y-1.5 animate-pulse">
              <div className="flex items-center gap-2 font-semibold">
                <Radio className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
                <span>Device Port Open • Awaiting First Telemetry Frame</span>
              </div>
              <p className="text-[11px] text-cyan-800 dark:text-cyan-300 leading-relaxed">
                Hardware connection is established. Avir is awaiting raw sensor packets over the active data stream. Measurements will appear immediately upon receipt.
              </p>
            </div>
          )}

          {/* Live Streaming Packet Inspector */}
          {latestPacket && isConnected && (
            <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-1.5 text-xs">
                <span className="font-semibold text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
                  <CheckCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <span>
                    {latestPacket.profile?.name || 'Personal Air Monitor'}
                  </span>
                </span>
                <div className="flex items-center gap-1.5">
                  {/* Identity Status Badge */}
                  <span className={`font-mono text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider ${
                    latestPacket.identityStatus === 'verified'
                      ? 'bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300'
                      : latestPacket.identityStatus === 'user_selected'
                      ? 'bg-cyan-100 dark:bg-cyan-900/60 text-cyan-800 dark:text-cyan-300'
                      : 'bg-stone-200 dark:bg-zinc-800 text-stone-700 dark:text-zinc-300'
                  }`}>
                    {latestPacket.identityStatus === 'verified'
                      ? 'Verified Model'
                      : latestPacket.identityStatus === 'user_selected'
                      ? 'User Selected'
                      : 'Protocol Compatible'}
                  </span>

                  {/* Freshness Badge */}
                  <span className={`font-mono text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider ${
                    connectionState === 'stale'
                      ? 'bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-300'
                      : 'bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300'
                  }`}>
                    {connectionState === 'stale'
                      ? 'Stale (>30s)'
                      : latestPacket.source === 'webserial'
                      ? 'USB Live'
                      : 'Wi-Fi Live'}
                  </span>
                </div>
              </div>

              {/* Hardware & Calibration Metadata */}
              <div className="text-[11px] text-emerald-900 dark:text-emerald-300 flex flex-wrap gap-x-3 gap-y-1 font-mono">
                {latestPacket.deviceId && (
                  <span>Device ID: <strong>{latestPacket.deviceId}</strong></span>
                )}
                <span>Sensor: <strong>{latestPacket.profile?.sensorModel || 'Optical OPC (Unverified)'}</strong></span>
                {latestPacket.calibrationFormula && (
                  <span className="text-emerald-700 dark:text-emerald-400">
                    &bull; {latestPacket.calibrationFormula}
                  </span>
                )}
              </div>

              {/* Measurement Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center pt-1 font-mono">
                <div className="p-2 rounded-lg bg-white dark:bg-zinc-900 border border-emerald-200/60 dark:border-emerald-800/40">
                  <div className="text-[10px] text-ink-muted dark:text-zinc-400">PM2.5</div>
                  <div className="text-sm font-bold text-ink dark:text-white">
                    {latestPacket.pm25 !== null ? latestPacket.pm25 : '--'}
                  </div>
                  <div className="text-[9px] text-stone-500">µg/m³</div>
                </div>
                <div className="p-2 rounded-lg bg-white dark:bg-zinc-900 border border-emerald-200/60 dark:border-emerald-800/40">
                  <div className="text-[10px] text-ink-muted dark:text-zinc-400">PM10</div>
                  <div className="text-sm font-bold text-ink dark:text-white">
                    {latestPacket.pm10 !== null ? latestPacket.pm10 : '--'}
                  </div>
                  <div className="text-[9px] text-stone-500">µg/m³</div>
                </div>
                <div className="p-2 rounded-lg bg-white dark:bg-zinc-900 border border-emerald-200/60 dark:border-emerald-800/40">
                  <div className="text-[10px] text-ink-muted dark:text-zinc-400">CO2</div>
                  <div className="text-sm font-bold text-ink dark:text-white">
                    {latestPacket.co2 !== null && latestPacket.co2 !== undefined ? latestPacket.co2 : '--'}
                  </div>
                  <div className="text-[9px] text-stone-500">ppm</div>
                </div>
                <div className="p-2 rounded-lg bg-white dark:bg-zinc-900 border border-emerald-200/60 dark:border-emerald-800/40">
                  <div className="text-[10px] text-ink-muted dark:text-zinc-400">TEMP</div>
                  <div className="text-sm font-bold text-ink dark:text-white">
                    {latestPacket.temperature !== null && latestPacket.temperature !== undefined
                      ? `${latestPacket.temperature}°`
                      : '--'}
                  </div>
                  <div className="text-[9px] text-stone-500">°C</div>
                </div>
                <div className="p-2 rounded-lg bg-white dark:bg-zinc-900 border border-emerald-200/60 dark:border-emerald-800/40">
                  <div className="text-[10px] text-ink-muted dark:text-zinc-400">HUM</div>
                  <div className="text-sm font-bold text-ink dark:text-white">
                    {latestPacket.humidity !== null && latestPacket.humidity !== undefined
                      ? `${latestPacket.humidity}%`
                      : '--'}
                  </div>
                  <div className="text-[9px] text-stone-500">RH</div>
                </div>
              </div>

              {/* Timestamp distinction: observation vs reception */}
              <div className="text-[10px] text-emerald-800/90 dark:text-emerald-300/80 font-mono flex flex-wrap items-center justify-between gap-1 pt-1 border-t border-emerald-200/50 dark:border-emerald-800/40">
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                  <span>
                    {latestPacket.observedAt ? 'Device Observed Time:' : 'Reception Time (Device untimed):'}
                  </span>
                  <strong>
                    {new Date(latestPacket.observedAt || latestPacket.receivedAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })}
                  </strong>
                </span>
                <span className="flex items-center gap-1 text-[9px] text-stone-500 dark:text-zinc-400">
                  <MapPinOff className="w-3 h-3 text-stone-400" />
                  <span>Location: Unconfigured (Indoor / BYOD)</span>
                </span>
              </div>

              {/* Privacy-Safe Diagnostics Drawer Toggle */}
              {latestPacket.diagnosticSnippet && (
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={() => setShowDiagnostics(!showDiagnostics)}
                    className="flex items-center gap-1 text-[10px] font-mono text-emerald-700 dark:text-emerald-400 hover:underline"
                  >
                    <span>{showDiagnostics ? 'Hide Sanitized Diagnostics' : 'Show Sanitized Diagnostics'}</span>
                    {showDiagnostics ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  </button>
                  {showDiagnostics && (
                    <div className="mt-1.5 p-2 rounded-lg bg-stone-900 text-emerald-400 font-mono text-[9.5px] break-all border border-stone-800">
                      <code>{latestPacket.diagnosticSnippet}</code>
                      <p className="mt-1 text-[9px] text-stone-400 font-sans">
                        Diagnostic fields sanitized. Private passwords, Wi-Fi keys, and tokens are strictly excluded.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-4 border-t border-stone-200 dark:border-zinc-800 text-xs shrink-0">
          <span className="font-mono text-[11px] text-ink-muted dark:text-zinc-400">
            Zero cloud telemetry · 100% Client-side
          </span>
          <button
            type="button"
            onClick={handleClose}
            className="px-4 py-2 rounded-xl bg-ink hover:bg-stone-800 text-white dark:bg-white dark:hover:bg-zinc-200 dark:text-black font-semibold text-xs transition-all shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            Done
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
