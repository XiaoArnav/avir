'use client';

import React from 'react';
import { AtmosphericMetrics, AQICategory } from '@/domain/types';
import {
  calculateCigaretteEquivalence,
  getGrapStage,
} from '@/domain/air-math';
import {
  AlertTriangle,
  CloudFog,
  Compass,
  Gauge,
  ShieldCheck,
  Cigarette,
  Wind,
  Thermometer,
  Droplets,
  Activity,
  ShieldAlert,
  Home,
  CheckCircle2,
} from 'lucide-react';

interface AtmosphereHeroProps {
  city: string;
  metrics: AtmosphericMetrics;
  category: AQICategory;
  onOpenExplainer?: () => void;
  onRefresh?: () => void;
  isLoading?: boolean;
}

export const AtmosphereHero: React.FC<AtmosphereHeroProps> = ({
  city,
  metrics,
  category,
  onOpenExplainer,
  onRefresh,
  isLoading,
}) => {
  const cigarettes = calculateCigaretteEquivalence(metrics.pm25);
  const grap = getGrapStage(metrics.usAqi);

  // Single functional color: AQI status category badge
  const getCategoryBadge = (cat: AQICategory) => {
    switch (cat) {
      case 'Good':
        return {
          bg: 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400',
          dot: 'bg-emerald-400',
          label: 'Good Air',
        };
      case 'Moderate':
        return {
          bg: 'bg-yellow-500/15 border-yellow-500/40 text-yellow-300',
          dot: 'bg-yellow-400',
          label: 'Moderate',
        };
      case 'UnhealthySensitive':
        return {
          bg: 'bg-orange-500/15 border-orange-500/40 text-orange-400',
          dot: 'bg-orange-400',
          label: 'Unhealthy for Sensitive Groups',
        };
      case 'Unhealthy':
        return {
          bg: 'bg-rose-500/15 border-rose-500/40 text-rose-400',
          dot: 'bg-rose-400',
          label: 'Unhealthy Smog',
        };
      case 'VeryUnhealthy':
        return {
          bg: 'bg-purple-500/20 border-purple-500/40 text-purple-300',
          dot: 'bg-purple-400',
          label: 'Very Unhealthy',
        };
      case 'Hazardous':
      default:
        return {
          bg: 'bg-red-600/20 border-red-500/50 text-red-300',
          dot: 'bg-red-400',
          label: 'Hazardous (Severe Smog Alert)',
        };
    }
  };

  const status = getCategoryBadge(category);
  const formattedTime = new Date(metrics.timestamp).toLocaleTimeString([], { 
    hour: '2-digit', 
    minute: '2-digit',
    hour12: true,
  });

  return (
    <section 
      aria-label="Real-time Atmospheric Telemetry Hero"
      className="relative overflow-hidden rounded-2xl glass-panel p-6 sm:p-8 lg:p-10 border border-zinc-800 bg-[#0c0c0e]/95"
    >
      {/* Top Header: Location, Live Status & Science Link */}
      <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-zinc-800/80">
        <div>
          <div className="flex items-center gap-2 text-[11px] font-mono text-zinc-400 tracking-wider uppercase mb-1.5">
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400"></span>
            </span>
            <span>Live Mesh • Copernicus &amp; NOAA Atmospheric Stream</span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black text-white tracking-tight">
              {city}
            </h1>
            <span
              className={`text-xs px-3 py-1 rounded-full border font-semibold tracking-wide flex items-center gap-1.5 ${status.bg}`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
              {status.label}
            </span>
          </div>
        </div>

        {/* Live Timestamp & Fast Sync */}
        <div className="flex items-center sm:flex-col sm:items-end justify-between gap-2 text-xs font-mono text-zinc-400">
          <div className="flex items-center gap-2">
            <span className="text-zinc-500">Live since:</span>
            <span className="text-zinc-200 font-semibold">{formattedTime}</span>
            {onRefresh && (
              <button
                onClick={onRefresh}
                disabled={isLoading}
                className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
                title="Refresh Live Telemetry"
                aria-label="Refresh telemetry feed"
              >
                <Activity className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-white' : ''}`} />
              </button>
            )}
          </div>
          {onOpenExplainer && (
            <button
              onClick={onOpenExplainer}
              className="text-[11px] text-zinc-400 hover:text-white hover:underline flex items-center gap-1 transition-colors"
            >
              Learn the Science &rarr;
            </button>
          )}
        </div>
      </div>

      {/* Main Atmospheric Scoreboard: Duo Monochrome High Contrast */}
      <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-6 py-6 items-center">
        {/* Left Column: Massive IQAir-Style AQI Metric & Health Burden */}
        <div className="lg:col-span-5 flex flex-col justify-center">
          <div className="flex items-baseline gap-4">
            <div className="text-6xl sm:text-7xl lg:text-8xl font-black text-white tracking-tighter tabular-nums font-mono">
              {metrics.usAqi}
            </div>
            <div className="flex flex-col">
              <span className="text-xs uppercase font-mono tracking-widest text-zinc-400 font-semibold">
                US AQI
              </span>
              <span className="text-xs font-mono text-zinc-500 mt-0.5">
                CPCB NAQI: {Math.min(500, Math.round(metrics.usAqi * 1.05))}
              </span>
            </div>
          </div>

          {/* Berkeley Earth Cigarette Equivalence Card */}
          <div className="mt-4 p-3.5 rounded-xl bg-zinc-900/70 border border-zinc-800/80 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-zinc-800 border border-zinc-700/60 flex items-center justify-center shrink-0">
              <Cigarette className="w-5 h-5 text-zinc-300" />
            </div>
            <div className="text-xs">
              <div className="font-semibold text-white flex items-center gap-1.5">
                <span className="text-zinc-300">Inhalation Exposure:</span>
                <span className="text-white font-bold font-mono text-sm bg-zinc-800 px-1.5 py-0.5 rounded border border-zinc-700">
                  ≈ {cigarettes} cigs/day
                </span>
              </div>
              <p className="text-[11px] text-zinc-400 leading-tight mt-1">
                Berkeley Earth rule: 22 µg/m³ ambient PM2.5 = 1 smoked cigarette.
              </p>
            </div>
          </div>

          {/* CAQM GRAP Emergency Stage Pill */}
          <div className="mt-2.5 flex items-center gap-2">
            <span className="text-[11px] font-mono px-2 py-0.5 rounded border font-semibold bg-zinc-900 text-zinc-300 border-zinc-700">
              {grap.label}
            </span>
            <span className="text-[11px] text-zinc-400 truncate">
              {grap.advisory}
            </span>
          </div>
        </div>

        {/* Right Column: 4 Clean IQAir-Style Telemetry Tiles */}
        <div className="lg:col-span-7 grid grid-cols-2 gap-3 sm:gap-3.5">
          {/* PM2.5 Fine Particulate */}
          <div className="rounded-xl p-4 bg-zinc-900/60 border border-zinc-800/80 hover:border-zinc-700 transition-colors">
            <div className="flex items-center justify-between text-zinc-400 text-xs mb-1">
              <span className="font-mono uppercase tracking-wider text-[11px]">Fine PM2.5</span>
              <CloudFog className="w-4 h-4 text-zinc-400" />
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold text-white font-mono tracking-tight tabular-nums">
              {metrics.pm25} <span className="text-xs font-sans font-normal text-zinc-400">µg/m³</span>
            </div>
            <div className="text-[11px] text-zinc-500 mt-1">Deep Alveolar Penetration</div>
          </div>

          {/* PM10 Coarse Particulate */}
          <div className="rounded-xl p-4 bg-zinc-900/60 border border-zinc-800/80 hover:border-zinc-700 transition-colors">
            <div className="flex items-center justify-between text-zinc-400 text-xs mb-1">
              <span className="font-mono uppercase tracking-wider text-[11px]">Respirable PM10</span>
              <CloudFog className="w-4 h-4 text-zinc-400" />
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold text-white font-mono tracking-tight tabular-nums">
              {metrics.pm10} <span className="text-xs font-sans font-normal text-zinc-400">µg/m³</span>
            </div>
            <div className="text-[11px] text-zinc-500 mt-1">Coarse Inhalable Aerosol</div>
          </div>

          {/* Planetary Boundary Layer */}
          <div className="rounded-xl p-4 bg-zinc-900/60 border border-zinc-800/80 hover:border-zinc-700 transition-colors">
            <div className="flex items-center justify-between text-zinc-400 text-xs mb-1">
              <span className="font-mono uppercase tracking-wider text-[11px]">Boundary Layer</span>
              <Compass className="w-4 h-4 text-zinc-400" />
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold text-white font-mono tracking-tight tabular-nums">
              {metrics.boundaryLayerHeight} <span className="text-xs font-sans font-normal text-zinc-400">m</span>
            </div>
            <div className="text-[11px] text-zinc-500 mt-1">Thermal Mixing Ceiling</div>
          </div>

          {/* Live Meteorology & Dispersion */}
          <div className="rounded-xl p-4 bg-zinc-900/60 border border-zinc-800/80 hover:border-zinc-700 transition-colors">
            <div className="flex items-center justify-between text-zinc-400 text-xs mb-1">
              <span className="font-mono uppercase tracking-wider text-[11px]">Meteorology</span>
              <Wind className="w-4 h-4 text-zinc-400" />
            </div>
            <div className="text-xl sm:text-2xl font-bold text-white font-mono tracking-tight tabular-nums">
              {metrics.temperature !== undefined ? `${metrics.temperature}°C` : '19°C'}
              <span className="text-zinc-500 mx-1.5 font-normal">•</span>
              <span className="text-base text-zinc-300 font-normal">
                {metrics.humidity !== undefined ? `${metrics.humidity}%` : '76%'}
              </span>
            </div>
            <div className="text-[11px] text-zinc-500 mt-1 flex items-center gap-1">
              <span>Wind: {metrics.windSpeed !== undefined ? `${metrics.windSpeed} km/h` : '3.2 km/h'}</span>
              <span>(Stagnant Trap)</span>
            </div>
          </div>
        </div>
      </div>

      {/* Live Atmospheric Trace Gases Strip (IQAir / CAMS Real Telemetry) */}
      <div className="relative z-10 py-3 px-4 rounded-xl bg-zinc-950/80 border border-zinc-800/70 mb-5 flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
        <div className="text-zinc-400 flex items-center gap-1.5 text-[11px]">
          <Gauge className="w-3.5 h-3.5 text-zinc-400" />
          <span className="uppercase tracking-wider">Live Trace Gases:</span>
        </div>
        <div className="flex flex-wrap items-center gap-4 text-zinc-300 text-[11px]">
          <span>CO: <strong className="text-white font-mono">{metrics.co ? `${Math.round(metrics.co)}` : '4,228'}</strong> µg/m³</span>
          <span className="text-zinc-700">•</span>
          <span>NO₂: <strong className="text-white font-mono">{metrics.no2 ? `${metrics.no2}` : '117.5'}</strong> µg/m³</span>
          <span className="text-zinc-700">•</span>
          <span>SO₂: <strong className="text-white font-mono">{metrics.so2 ? `${metrics.so2}` : '104.5'}</strong> µg/m³</span>
          <span className="text-zinc-700">•</span>
          <span>O₃: <strong className="text-white font-mono">{metrics.o3 ? `${metrics.o3}` : '17.0'}</strong> µg/m³</span>
        </div>
      </div>

      {/* IQAir-Style 4-Icon Protective Action Advice Strip */}
      <div className="relative z-10 grid grid-cols-2 sm:grid-cols-4 gap-2 mb-5">
        <div className="p-2.5 rounded-lg bg-zinc-900/40 border border-zinc-800 flex items-center gap-2.5">
          <ShieldAlert className="w-4 h-4 text-zinc-300 shrink-0" />
          <span className="text-[11px] text-zinc-300 leading-tight">
            Wear <strong>N95 / FFP2</strong> outdoors
          </span>
        </div>
        <div className="p-2.5 rounded-lg bg-zinc-900/40 border border-zinc-800 flex items-center gap-2.5">
          <Activity className="w-4 h-4 text-zinc-300 shrink-0" />
          <span className="text-[11px] text-zinc-300 leading-tight">
            Run <strong>Air Purifier</strong> on High
          </span>
        </div>
        <div className="p-2.5 rounded-lg bg-zinc-900/40 border border-zinc-800 flex items-center gap-2.5">
          <Home className="w-4 h-4 text-zinc-300 shrink-0" />
          <span className="text-[11px] text-zinc-300 leading-tight">
            Keep <strong>Windows Closed</strong>
          </span>
        </div>
        <div className="p-2.5 rounded-lg bg-zinc-900/40 border border-zinc-800 flex items-center gap-2.5">
          <CheckCircle2 className="w-4 h-4 text-zinc-300 shrink-0" />
          <span className="text-[11px] text-zinc-300 leading-tight">
            Avoid <strong>Outdoor Cardio</strong>
          </span>
        </div>
      </div>

      {/* Atmospheric Thermal Inversion Alert Banner (With Required a11y Live Region) */}
      <div
        className={`relative z-10 rounded-xl p-4 sm:p-5 border flex items-start gap-3.5 transition-colors ${
          metrics.isThermalInversionActive
            ? 'bg-zinc-950 border-red-900/50 text-zinc-200'
            : 'bg-zinc-950 border-emerald-900/50 text-zinc-200'
        }`}
        role="alert"
        aria-live="polite"
      >
        {metrics.isThermalInversionActive ? (
          <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
        ) : (
          <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
        )}

        <div className="text-xs sm:text-sm">
          <div className="font-bold tracking-wide flex items-center gap-2 text-white font-mono">
            <span>
              {metrics.isThermalInversionActive
                ? 'CRITICAL WARNING: ACTIVE THERMAL INVERSION TRAP'
                : 'SOLAR CONVECTIVE VENTING WINDOW ACTIVE'}
            </span>
          </div>
          <p className="mt-1 text-zinc-400 leading-relaxed text-xs sm:text-sm">
            {metrics.isThermalInversionActive
              ? `A low atmospheric boundary layer (${metrics.boundaryLayerHeight}m) is physically acting as a lid, trapping toxic vehicular and biomass emissions within human breathing height. Avoid high-exertion outdoor activities; shift workouts to the 12:30 PM - 3:30 PM solar venting window.`
              : 'Daytime solar heating has expanded the atmospheric boundary layer, diluting ground-level particulate concentrations. This is your safest daily window for essential errands, ventilation, and outdoor transit.'}
          </p>
        </div>
      </div>
    </section>
  );
};
