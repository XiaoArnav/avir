'use client';

import React from 'react';
import { analyzeWindVector } from '@/domain/advanced-air-math';
import { Compass, Wind, AlertTriangle, ShieldCheck } from 'lucide-react';

interface WindVectorGaugeProps {
  windDirection?: number; // degrees
  windSpeed?: number;     // km/h
  cityName: string;
}

export const WindVectorGauge: React.FC<WindVectorGaugeProps> = ({
  windDirection = 315,
  windSpeed = 7.5,
  cityName,
}) => {
  const intel = analyzeWindVector(windDirection, windSpeed, cityName);

  return (
    <div className="bg-white dark:bg-zinc-900 border border-stone-200 dark:border-zinc-800 rounded-2xl p-5 sm:p-6 shadow-sm space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-teal-500/10 text-teal-500 border border-teal-500/20">
            <Compass className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-ink dark:text-white">
              Wind Vector &amp; Smoke Influx Compass
            </h3>
            <p className="text-xs text-ink-muted dark:text-zinc-400">
              Boundary layer horizontal transport &amp; regional dispersion vector
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-stone-100 dark:bg-zinc-800 text-ink dark:text-white font-mono text-xs font-bold border border-stone-200 dark:border-zinc-700">
          <Wind className="w-3.5 h-3.5 text-teal-500" />
          <span>{intel.speedKmh} km/h</span>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row items-center gap-6 pt-2">
        {/* Animated Compass Dial */}
        <div className="relative w-32 h-32 flex items-center justify-center shrink-0">
          {/* Compass Outer Ring */}
          <div className="absolute inset-0 rounded-full border-2 border-dashed border-stone-300 dark:border-zinc-700" />

          {/* Cardinal Labels */}
          <span className="absolute top-1 text-[10px] font-mono font-bold text-rose-500">N</span>
          <span className="absolute bottom-1 text-[10px] font-mono font-bold text-ink-muted dark:text-zinc-400">S</span>
          <span className="absolute left-1.5 text-[10px] font-mono font-bold text-ink-muted dark:text-zinc-400">W</span>
          <span className="absolute right-1.5 text-[10px] font-mono font-bold text-ink-muted dark:text-zinc-400">E</span>

          {/* Rotating Compass Needle */}
          <div
            className="w-24 h-24 flex items-center justify-center transition-transform duration-700 ease-out"
            style={{ transform: `rotate(${intel.degrees}deg)` }}
          >
            <svg viewBox="0 0 100 100" className="w-full h-full drop-shadow">
              {/* North Pointer (Red) */}
              <polygon points="50,10 44,50 56,50" fill="#ef4444" />
              {/* South Pointer (Gray) */}
              <polygon points="50,90 44,50 56,50" fill="#94a3b8" />
              {/* Center Pivot */}
              <circle cx="50" cy="50" r="4" fill="#0f172a" />
            </svg>
          </div>

          {/* Compass Center Degree Badge */}
          <div className="absolute -bottom-2 px-2 py-0.5 rounded-full bg-stone-900 text-white dark:bg-white dark:text-black font-mono font-bold text-[9px] shadow-sm">
            {intel.compassPoint} ({intel.degrees}°)
          </div>
        </div>

        {/* Intelligence Briefing Card */}
        <div className="flex-1 space-y-2 text-xs">
          <div className="flex items-center gap-2">
            <span className="font-bold text-ink dark:text-white">
              Meteorological Drift Diagnosis
            </span>
            {intel.isSmokeCorridor ? (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-500 font-bold border border-rose-500/20 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> Transboundary Smoke Corridor
              </span>
            ) : intel.isStagnantTrap ? (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-500 font-bold border border-amber-500/20 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> Calm Stagnation Trap
              </span>
            ) : (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 font-bold border border-emerald-500/20 flex items-center gap-1">
                <ShieldCheck className="w-3 h-3" /> Active Horizontal Ventilation
              </span>
            )}
          </div>

          <p className="text-ink-muted dark:text-zinc-300 leading-relaxed">
            {intel.meteorologicalImpact}
          </p>

          <div className="pt-1 flex flex-wrap items-center gap-3 text-[11px] font-mono text-ink-muted dark:text-zinc-400">
            <span>Surface Velocity: <strong>{intel.speedKmh} km/h</strong></span>
            <span>&bull;</span>
            <span>Wind Bearing: <strong>{intel.degrees}° ({intel.compassPoint})</strong></span>
            <span>&bull;</span>
            <span>Sensor Station: <strong>NOAA &amp; Copernicus GFS</strong></span>
          </div>
        </div>
      </div>
    </div>
  );
};
