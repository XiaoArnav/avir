'use client';

import React, { useState, useEffect } from 'react';
import {
  hardwareDeviceService,
  DeviceTelemetryPacket,
} from '@/services/device-telemetry-service';
import {
  Usb,
  Wifi,
  X,
  Activity,
  CheckCircle,
  AlertCircle,
  Cpu,
  RefreshCw,
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
  const [activeTab, setActiveTab] = useState<'usb' | 'wifi'>('usb');
  const [ipAddress, setIpAddress] = useState('192.168.1.150');
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [latestPacket, setLatestPacket] = useState<DeviceTelemetryPacket | null>(null);

  const isWebSerialSupported = hardwareDeviceService.isWebSerialSupported();

  useEffect(() => {
    const unsubscribe = hardwareDeviceService.subscribe((packet) => {
      setLatestPacket(packet);
      setIsConnected(true);
      if (onDeviceConnected) {
        onDeviceConnected(packet);
      }
    });

    return () => unsubscribe();
  }, [onDeviceConnected]);

  if (!isOpen) return null;

  const handleConnectUsb = async () => {
    setIsConnecting(true);
    setErrorMessage(null);
    try {
      const ok = await hardwareDeviceService.connectUsbDevice(115200);
      if (!ok) {
        setErrorMessage('Connection cancelled or no device selected.');
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'USB connection failed.');
    } finally {
      setIsConnecting(false);
    }
  };

  const handleConnectWifi = async () => {
    setIsConnecting(true);
    setErrorMessage(null);
    try {
      const packet = await hardwareDeviceService.fetchLocalWifiDevice(ipAddress);
      if (packet) {
        setIsConnected(true);
      } else {
        setErrorMessage(`Unable to reach air monitor at ${ipAddress}. Ensure you are on the same Wi-Fi network.`);
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Wi-Fi connection failed.');
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    await hardwareDeviceService.disconnectUsbDevice();
    setIsConnected(false);
    setLatestPacket(null);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="device-connector-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div className="relative w-full max-w-lg overflow-hidden rounded-2xl glass-panel bg-stone-50 dark:bg-zinc-900 border border-stone-200 dark:border-zinc-800 shadow-2xl p-6 sm:p-7 text-ink dark:text-white">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-stone-200 dark:border-zinc-800">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-100 dark:bg-emerald-950/80 border border-emerald-300 dark:border-emerald-800 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <h2 id="device-connector-title" className="text-base font-bold text-ink dark:text-white">
                Connect Hardware Air Monitor
              </h2>
              <p className="text-xs text-ink-muted dark:text-zinc-400">
                AirGradient ONE, Project Vaayu, or CanAirIO (ESP32)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close modal"
            className="p-1.5 rounded-lg text-ink-muted dark:text-zinc-400 hover:bg-stone-200 dark:hover:bg-zinc-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex p-1 mt-5 rounded-xl bg-stone-200/80 dark:bg-zinc-800/80 border border-stone-300/50 dark:border-zinc-700/50 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setActiveTab('usb')}
            className={`flex-1 py-2 rounded-lg flex items-center justify-center gap-2 transition-all ${
              activeTab === 'usb'
                ? 'bg-white dark:bg-zinc-900 text-ink dark:text-white shadow-sm'
                : 'text-ink-muted dark:text-zinc-400 hover:text-ink dark:hover:text-white'
            }`}
          >
            <Usb className="w-3.5 h-3.5" />
            <span>USB WebSerial</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('wifi')}
            className={`flex-1 py-2 rounded-lg flex items-center justify-center gap-2 transition-all ${
              activeTab === 'wifi'
                ? 'bg-white dark:bg-zinc-900 text-ink dark:text-white shadow-sm'
                : 'text-ink-muted dark:text-zinc-400 hover:text-ink dark:hover:text-white'
            }`}
          >
            <Wifi className="w-3.5 h-3.5" />
            <span>Local Wi-Fi Network</span>
          </button>
        </div>

        {/* Tab Content */}
        <div className="py-5 space-y-4">
          {activeTab === 'usb' ? (
            <div className="space-y-3">
              <p className="text-xs text-ink-muted dark:text-zinc-400 leading-relaxed">
                Connect your ESP32-based air quality monitor (AirGradient ONE, CanAirIO, or Project Vaayu) directly to your computer using a USB-C data cable.
              </p>

              {!isWebSerialSupported ? (
                <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>
                    WebSerial is currently supported in Chromium browsers (Google Chrome, Microsoft Edge, Opera). If you are on Firefox or Safari, use the <strong>Local Wi-Fi Network</strong> tab.
                  </span>
                </div>
              ) : (
                <div className="pt-2">
                  {!isConnected ? (
                    <button
                      onClick={handleConnectUsb}
                      disabled={isConnecting}
                      className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs transition-all shadow-md active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {isConnecting ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>Requesting Port...</span>
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
                      onClick={handleDisconnect}
                      className="w-full py-2.5 rounded-xl bg-red-100 dark:bg-red-950/60 hover:bg-red-200 text-red-700 dark:text-red-300 border border-red-300 dark:border-red-800 font-semibold text-xs transition-all flex items-center justify-center gap-2"
                    >
                      <span>Disconnect USB Monitor</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-ink-muted dark:text-zinc-400 leading-relaxed">
                Enter the local IP address of your AirGradient monitor hosting the built-in webserver firmware or ESPHome.
              </p>

              <div className="space-y-1.5">
                <label className="text-[11px] font-mono uppercase tracking-wider text-ink-muted dark:text-zinc-400">
                  Device Local IP Address
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={ipAddress}
                    onChange={(e) => setIpAddress(e.target.value)}
                    placeholder="192.168.1.150"
                    className="flex-1 px-3.5 py-2.5 rounded-xl bg-white dark:bg-zinc-800 border border-stone-300 dark:border-zinc-700 text-xs font-mono text-ink dark:text-white placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <button
                    onClick={handleConnectWifi}
                    disabled={isConnecting || !ipAddress}
                    className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs transition-all shadow-md active:scale-95 disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {isConnecting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Wifi className="w-3.5 h-3.5" />}
                    <span>Fetch</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Error Message */}
          {errorMessage && (
            <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/60 text-xs text-red-700 dark:text-red-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Live Streaming Packet Inspector */}
          {latestPacket && (
            <div className="p-4 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span>Hardware Monitor Connected</span>
                </span>
                <span className="font-mono text-[10px] text-emerald-700 dark:text-emerald-400">
                  {latestPacket.source === 'webserial' ? 'USB Stream' : 'Local Wi-Fi'}
                </span>
              </div>

              <div className="grid grid-cols-4 gap-2 text-center pt-1 font-mono">
                <div className="p-2 rounded-lg bg-white/80 dark:bg-zinc-900/80 border border-emerald-200/60 dark:border-emerald-800/40">
                  <div className="text-[10px] text-ink-muted dark:text-zinc-400">PM2.5</div>
                  <div className="text-sm font-bold text-ink dark:text-white">{latestPacket.pm25 ?? '--'}</div>
                  <div className="text-[9px] text-stone-500">µg/m³</div>
                </div>
                <div className="p-2 rounded-lg bg-white/80 dark:bg-zinc-900/80 border border-emerald-200/60 dark:border-emerald-800/40">
                  <div className="text-[10px] text-ink-muted dark:text-zinc-400">PM10</div>
                  <div className="text-sm font-bold text-ink dark:text-white">{latestPacket.pm10 ?? '--'}</div>
                  <div className="text-[9px] text-stone-500">µg/m³</div>
                </div>
                <div className="p-2 rounded-lg bg-white/80 dark:bg-zinc-900/80 border border-emerald-200/60 dark:border-emerald-800/40">
                  <div className="text-[10px] text-ink-muted dark:text-zinc-400">CO2</div>
                  <div className="text-sm font-bold text-ink dark:text-white">{latestPacket.co2 ?? '--'}</div>
                  <div className="text-[9px] text-stone-500">ppm</div>
                </div>
                <div className="p-2 rounded-lg bg-white/80 dark:bg-zinc-900/80 border border-emerald-200/60 dark:border-emerald-800/40">
                  <div className="text-[10px] text-ink-muted dark:text-zinc-400">TEMP</div>
                  <div className="text-sm font-bold text-ink dark:text-white">{latestPacket.temperature ?? '--'}°</div>
                  <div className="text-[9px] text-stone-500">°C</div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-4 border-t border-stone-200 dark:border-zinc-800 text-xs">
          <span className="font-mono text-[11px] text-ink-muted dark:text-zinc-500">
            Zero cloud telemetry · 100% Client-side
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-ink hover:bg-stone-800 text-white dark:bg-white dark:hover:bg-zinc-200 dark:text-black font-semibold text-xs transition-all shadow-sm"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
