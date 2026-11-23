'use client';

import React, { useState, useEffect } from 'react';
import { FuturisticBadge } from './FuturisticBadge';

export interface MissionHeaderProps {
  cityName?: string;
  latitude?: number;
  longitude?: number;
  elevationMeters?: number;
  stationName?: string;
  hasOfficialGround?: boolean;
  standard?: 'epa' | 'cpcb';
  onToggleStandard?: () => void;
  className?: string;
}

export function MissionHeader({
  cityName = 'New Delhi',
  latitude = 28.6139,
  longitude = 77.209,
  elevationMeters,
  stationName,
  hasOfficialGround = false,
  standard = 'cpcb',
  onToggleStandard,
  className = '',
}: MissionHeaderProps) {
  const [utcTime, setUtcTime] = useState<string>('');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const updateTime = () => {
      const now = new Date();
      setUtcTime(
        now.toISOString().substring(11, 19) + ' UTC'
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const latFormatted = `${Math.abs(latitude).toFixed(4)}° ${latitude >= 0 ? 'N' : 'S'}`;
  const lonFormatted = `${Math.abs(longitude).toFixed(4)}° ${longitude >= 0 ? 'E' : 'W'}`;

  return (
    <header
      role="banner"
      className={`w-full bg-white/75 dark:bg-[#040711]/90 backdrop-blur-xl border-b border-stone-200/80 dark:border-sky-500/15 py-2.5 px-4 sm:px-6 transition-colors ${className}`}
    >
      <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3 text-xs">
        {/* Left: Mission Brand & Location Coordinates */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-sm bg-sky-500 dark:shadow-[0_0_10px_#38bdf8]" />
            <span className="font-bold tracking-wider uppercase text-ink-primary dark:text-white telemetry-mono">
              AVIR // COMMAND
            </span>
          </div>

          <div className="hidden md:flex items-center gap-2 text-ink-muted dark:text-sky-300/60 telemetry-mono border-l border-stone-200 dark:border-sky-500/20 pl-3">
            <span className="font-semibold text-ink-primary dark:text-sky-200">{cityName}</span>
            <span>[{latFormatted}, {lonFormatted}]</span>
            {elevationMeters !== undefined && (
              <span className="text-[11px] text-ink-faint dark:text-slate-500">
                ALT {Math.round(elevationMeters)}m
              </span>
            )}
          </div>
        </div>

        {/* Center: Real-time Telemetry Health & Ground Status */}
        <div className="flex items-center gap-2">
          {hasOfficialGround ? (
            <FuturisticBadge
              label={`GROUND STATION: ${stationName ? stationName.substring(0, 18) : 'ACTIVE'}`}
              variant="emerald"
              pulse
            />
          ) : (
            <FuturisticBadge
              label="SATELLITE/MODEL CONSENSUS"
              variant="cyan"
              pulse
            />
          )}

          {/* Clock */}
          <div
            className="hidden sm:inline-flex items-center px-2 py-0.5 rounded bg-stone-100 dark:bg-sky-950/40 border border-stone-200 dark:border-sky-500/20 text-ink-primary dark:text-sky-300 telemetry-mono font-medium text-[11px] tabular-nums"
            aria-label="Real-time mission UTC clock"
          >
            {mounted && utcTime ? utcTime : '--:--:-- UTC'}
          </div>
        </div>

        {/* Right: AQI Regulatory Standard Toggle */}
        {onToggleStandard && (
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-ink-muted dark:text-sky-300/60 telemetry-mono uppercase hidden lg:inline">
              STANDARD:
            </span>
            <button
              type="button"
              onClick={onToggleStandard}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold border border-stone-300 dark:border-sky-500/30 bg-stone-50 dark:bg-sky-900/30 text-ink-primary dark:text-sky-200 hover:border-sky-400 focus-visible-ring transition-all telemetry-mono"
              title={`Switch standard (currently ${standard.toUpperCase()})`}
            >
              <span className={standard === 'cpcb' ? 'text-emerald-600 dark:text-emerald-400 font-bold' : 'opacity-40'}>
                CPCB NAQI
              </span>
              <span className="opacity-40">/</span>
              <span className={standard === 'epa' ? 'text-sky-600 dark:text-sky-400 font-bold' : 'opacity-40'}>
                EPA US
              </span>
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
