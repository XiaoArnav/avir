'use client';

import React, { useState, useEffect } from 'react';
import { GroundStationMetadata, GroundModelDelta } from '@/domain/types';
import { DeviceConnectorModal } from '@/components/DeviceConnectorModal';
import {
  hardwareDeviceService,
  DeviceTelemetryPacket,
} from '@/services/device-telemetry-service';
import {
  MapPin,
  Cpu,
  Layers,
  ChevronDown,
  Info,
  ShieldCheck,
  Radio,
} from 'lucide-react';

interface GroundStationBadgeProps {
  station?: GroundStationMetadata | null;
  delta?: GroundModelDelta | null;
  onRefresh?: () => void;
}

export function GroundStationBadge({
  station,
  delta,
}: GroundStationBadgeProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [localDevice, setLocalDevice] = useState<DeviceTelemetryPacket | null>(null);
  const [isDeviceConnected, setIsDeviceConnected] = useState<boolean>(false);

  // Subscribe to live client-side hardware monitor telemetry
  useEffect(() => {
    setIsDeviceConnected(hardwareDeviceService.isConnected());
    setLocalDevice(hardwareDeviceService.getLastPacket());

    const unsubPacket = hardwareDeviceService.subscribe((packet) => {
      setLocalDevice(packet);
      setIsDeviceConnected(true);
    });

    const unsubStatus = hardwareDeviceService.subscribeStatus((state) => {
      const connected = state === 'receiving_data' || state === 'connected_awaiting_data';
      setIsDeviceConnected(connected);
      if (!connected) {
        setLocalDevice(null);
      }
    });

    return () => {
      unsubPacket();
      unsubStatus();
    };
  }, []);

  const isLiveObservation =
    station?.stationState === 'live_observation' &&
    typeof station.pm25 === 'number' &&
    Number.isFinite(station.pm25);

  const isRegistryOnly =
    !isLiveObservation && (station?.stationState === 'registry_only' || station?.pm25 === null);

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 pt-2 text-xs">
        {/* Physical Ground Station Pill (Official / Citizen Station) */}
        {station ? (
          <div className="relative group">
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/90 dark:bg-zinc-900/90 border border-stone-200 dark:border-zinc-800 text-ink dark:text-white shadow-sm hover:border-emerald-500/50 transition-all font-medium"
            >
              {isLiveObservation ? (
                <span className="flex h-2 w-2 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
              ) : (
                <span className="flex h-2 w-2 rounded-full bg-stone-400 dark:bg-zinc-600" />
              )}

              <span className="flex items-center gap-1 font-semibold">
                {station.stationType === 'official_reference' ? (
                  <ShieldCheck className={`w-3.5 h-3.5 ${isLiveObservation ? 'text-amber-500' : 'text-stone-400 dark:text-zinc-500'}`} />
                ) : station.stationType === 'user_device' ? (
                  <Cpu className="w-3.5 h-3.5 text-cyan-500" />
                ) : (
                  <Radio className={`w-3.5 h-3.5 ${isLiveObservation ? 'text-emerald-500' : 'text-stone-400 dark:text-zinc-500'}`} />
                )}
                <span>
                  {isRegistryOnly ? `Nearest registered station: ${station.stationName}` : station.stationName}
                </span>
              </span>

              <span className="font-mono text-[10px] text-ink-muted dark:text-zinc-400">
                {station.distanceKm !== null && station.distanceKm !== undefined
                  ? station.distanceKm > 0
                    ? `· ${station.distanceKm} km`
                    : '· Colocated'
                  : '· Location unconfigured'}
              </span>

              <span
                className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider ${
                  isRegistryOnly
                    ? 'bg-stone-100 dark:bg-zinc-800 text-stone-600 dark:text-zinc-400 border border-stone-300 dark:border-zinc-700'
                    : station.stationType === 'official_reference'
                    ? 'bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800'
                    : station.stationType === 'user_device'
                    ? 'bg-cyan-100 dark:bg-cyan-950/80 text-cyan-800 dark:text-cyan-300 border border-cyan-300 dark:border-cyan-800'
                    : station.isCalibrated
                    ? 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800'
                    : 'bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800'
                }`}
              >
                {isRegistryOnly
                  ? 'Live Readings Unavailable'
                  : station.stationType === 'official_reference'
                  ? 'CPCB Ground Reference'
                  : station.stationType === 'user_device'
                  ? 'My Monitor'
                  : station.isCalibrated
                  ? 'Citizen Node (EPA Calibrated)'
                  : 'Citizen Node (Uncalibrated)'}
              </span>

              <ChevronDown className={`w-3.5 h-3.5 text-ink-muted dark:text-zinc-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
            </button>
          </div>
        ) : (
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-stone-100 dark:bg-zinc-800/80 text-ink-muted dark:text-zinc-400 text-xs font-mono border border-stone-200 dark:border-zinc-700/60">
            <Layers className="w-3.5 h-3.5 text-stone-400" />
            <span>Regional Atmospheric Model (No ground station within 35 km)</span>
          </div>
        )}

        {/* Live Client-Side Connected Hardware Monitor Pill (When Active) */}
        {isDeviceConnected && localDevice && (
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-cyan-50 dark:bg-cyan-950/70 border border-cyan-200 dark:border-cyan-800 text-ink dark:text-white shadow-sm font-medium animate-in fade-in">
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-500 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
            </span>
            <span className="flex items-center gap-1 font-semibold text-cyan-800 dark:text-cyan-300">
              <Cpu className="w-3.5 h-3.5" />
              <span>{localDevice.source === 'webserial' ? 'My USB Monitor' : 'My Wi-Fi Monitor'}</span>
            </span>
            <span className="font-mono text-[10px] text-cyan-700 dark:text-cyan-400">
              PM2.5: {localDevice.pm25 !== null ? `${localDevice.pm25} µg/m³` : '--'}
              {localDevice.pm10 !== null ? ` · PM10: ${localDevice.pm10} µg/m³` : ''}
            </span>
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider bg-cyan-200 dark:bg-cyan-900 text-cyan-900 dark:text-cyan-200">
              Local Live
            </span>
          </div>
        )}

        {/* Ground-Model Divergence Delta Badge */}
        {delta && delta.divergenceType !== 'aligned' && (
          <div
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl border text-[11px] font-semibold ${
              delta.divergenceType === 'ground_trapping'
                ? 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-900/60 text-red-700 dark:text-red-300'
                : 'bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-900/60 text-blue-700 dark:text-blue-300'
            }`}
            title={delta.narrative}
          >
            <Info className="w-3.5 h-3.5 shrink-0" />
            <span>
              Ground reads {delta.deltaPercent > 0 ? `+${delta.deltaPercent}%` : `${delta.deltaPercent}%`} vs satellite model
            </span>
          </div>
        )}

        {/* Connect / Manage Hardware Button */}
        <button
          onClick={() => setIsModalOpen(true)}
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl font-medium transition-colors text-xs ml-auto border ${
            isDeviceConnected
              ? 'bg-cyan-50 hover:bg-cyan-100 dark:bg-cyan-950/50 dark:hover:bg-cyan-900/60 text-cyan-800 dark:text-cyan-300 border-cyan-300 dark:border-cyan-800'
              : 'bg-stone-100 hover:bg-stone-200 dark:bg-zinc-800/80 dark:hover:bg-zinc-700 text-ink dark:text-white border-stone-200 dark:border-zinc-700'
          }`}
        >
          <Cpu className={`w-3.5 h-3.5 ${isDeviceConnected ? 'text-cyan-500' : 'text-emerald-500'}`} />
          <span>{isDeviceConnected ? 'Manage My Monitor' : 'Connect My Monitor'}</span>
        </button>
      </div>

      {/* Expanded Station Telemetry Details Drawer */}
      {isExpanded && station && (
        <div className="mt-2.5 p-4 rounded-xl bg-white/95 dark:bg-zinc-900/95 border border-stone-200 dark:border-zinc-800 shadow-md text-xs space-y-2 animate-in fade-in duration-150">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-100 dark:border-zinc-800/80 pb-2">
            <div>
              <div className="font-bold text-ink dark:text-white flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-emerald-500" />
                <span>{station.stationName}</span>
              </div>
              <div className="text-[11px] text-ink-muted dark:text-zinc-400">
                Provider: {station.provider} · Station ID: {station.stationId}
              </div>
            </div>
            {station.isCalibrated && (
              <div className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400">
                ✓ {station.calibrationFormula}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 font-mono text-center">
            <div className="p-2 rounded-lg bg-stone-50 dark:bg-zinc-800/60 border border-stone-200/60 dark:border-zinc-700/60">
              <span className="text-[10px] text-ink-muted dark:text-zinc-400 block">Observed PM2.5</span>
              <span className="text-sm font-bold text-ink dark:text-white">{station.pm25 !== null && station.pm25 !== undefined ? `${station.pm25} µg/m³` : 'Unavailable'}</span>
            </div>
            <div className="p-2 rounded-lg bg-stone-50 dark:bg-zinc-800/60 border border-stone-200/60 dark:border-zinc-700/60">
              <span className="text-[10px] text-ink-muted dark:text-zinc-400 block">Observed PM10</span>
              <span className="text-sm font-bold text-ink dark:text-white">{station.pm10 !== null && station.pm10 !== undefined ? `${station.pm10} µg/m³` : 'Unavailable'}</span>
            </div>
            <div className="p-2 rounded-lg bg-stone-50 dark:bg-zinc-800/60 border border-stone-200/60 dark:border-zinc-700/60">
              <span className="text-[10px] text-ink-muted dark:text-zinc-400 block">Distance to User</span>
              <span className="text-sm font-bold text-ink dark:text-white">
                {station.distanceKm !== null && station.distanceKm !== undefined ? `${station.distanceKm} km` : 'Unavailable'}
              </span>
            </div>
            <div className="p-2 rounded-lg bg-stone-50 dark:bg-zinc-800/60 border border-stone-200/60 dark:border-zinc-700/60">
              <span className="text-[10px] text-ink-muted dark:text-zinc-400 block">Sensor Type</span>
              <span className="text-sm font-bold text-ink dark:text-white">
                {station.stationType === 'official_reference' ? 'Regulatory Reference' : 'Optical Laser'}
              </span>
            </div>
          </div>

          {isRegistryOnly && (
            <div className="p-2 rounded-lg bg-stone-100 dark:bg-zinc-800/80 border border-stone-200 dark:border-zinc-700/60 text-[11px] text-ink-muted dark:text-zinc-400">
              Station is registered in official CAAQMS directory. Live ground observations are currently unavailable for this station.
            </div>
          )}

          {delta && (
            <p className="text-[11px] text-ink-muted dark:text-zinc-400 pt-1 leading-relaxed">
              <strong>Ground vs. Atmospheric Model:</strong> {delta.narrative}
            </p>
          )}
        </div>
      )}

      {/* Hardware Connector Modal */}
      <DeviceConnectorModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onDeviceConnected={() => {
          // Hardware monitor is updated reactively via hardwareDeviceService subscription.
          // Do not trigger full atmospheric API refetch per incoming sensor packet.
        }}
      />
    </>
  );
}
