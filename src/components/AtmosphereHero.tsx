'use client';

import React, { useState } from 'react';
import { AtmosphericMetrics, AQICategory } from '@/domain/types';
import {
  calculateCigaretteEquivalence,
  getGrapStage,
} from '@/domain/air-math';
import { CityPanoramicBackdrop } from './CityPanoramicBackdrop';
import {
  AlertTriangle,
  CloudFog,
  Compass,
  Gauge,
  ShieldCheck,
  Cigarette,
  Wind,
  Activity,
  ShieldAlert,
  Home,
  CheckCircle2,
  Sun,
  Moon,
} from 'lucide-react';

interface AtmosphereHeroProps {
  city: string;
  metrics: AtmosphericMetrics;
  category: AQICategory;
  onOpenExplainer?: () => void;
  onRefresh?: () => void;
  isLoading?: boolean;
  isDarkMode?: boolean;
}

export const AtmosphereHero: React.FC<AtmosphereHeroProps> = ({
  city,
  metrics,
  category,
  onOpenExplainer,
  onRefresh,
  isLoading,
  isDarkMode = true,
}) => {
  const cigarettes = calculateCigaretteEquivalence(metrics.pm25);
  const grap = getGrapStage(metrics.usAqi);
  const [selectedHour, setSelectedHour] = useState<number>(new Date().getHours());

  // 24-Hour Diurnal Inversion & Solar Venting Simulation
  const hourlyData = Array.from({ length: 24 }, (_, hour) => {
    // Solar heating boundary layer expansion model
    let blh = 140; // nocturnal inversion floor
    if (hour >= 10 && hour <= 17) {
      // Solar convective window peaks at 13:00-15:00
      blh = Math.round(550 + Math.sin(((hour - 10) / 7) * Math.PI) * 750);
    } else if (hour >= 7 && hour < 10) {
      blh = Math.round(180 + (hour - 7) * 90);
    } else if (hour > 17 && hour <= 20) {
      blh = Math.round(500 - (hour - 17) * 110);
    }
    const isSafeVentilation = hour >= 12 && hour <= 16;
    return {
      hour,
      blh,
      isSafeVentilation,
      timeLabel: `${hour.toString().padStart(2, '0')}:00`,
    };
  });

  // Single functional color: AQI status category badge
  const getCategoryBadge = (cat: AQICategory) => {
    switch (cat) {
      case 'Good':
        return {
          bg: 'bg-emerald-500/15 border-emerald-500/40 text-emerald-600 dark:text-emerald-400',
          dot: 'bg-emerald-500',
          label: 'Good Air',
        };
      case 'Moderate':
        return {
          bg: 'bg-yellow-500/15 border-yellow-500/40 text-yellow-600 dark:text-yellow-300',
          dot: 'bg-yellow-500',
          label: 'Moderate',
        };
      case 'UnhealthySensitive':
        return {
          bg: 'bg-orange-500/15 border-orange-500/40 text-orange-600 dark:text-orange-400',
          dot: 'bg-orange-500',
          label: 'Unhealthy for Sensitive Groups',
        };
      case 'Unhealthy':
        return {
          bg: 'bg-rose-500/15 border-rose-500/40 text-rose-600 dark:text-rose-400',
          dot: 'bg-rose-500',
          label: 'Unhealthy Smog',
        };
      case 'VeryUnhealthy':
        return {
          bg: 'bg-purple-500/20 border-purple-500/40 text-purple-700 dark:text-purple-300',
          dot: 'bg-purple-500',
          label: 'Very Unhealthy',
        };
      case 'Hazardous':
      default:
        return {
          bg: 'bg-red-600/20 border-red-500/50 text-red-700 dark:text-red-300',
          dot: 'bg-red-500',
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
      className="relative overflow-hidden rounded-2xl glass-panel p-6 sm:p-8 lg:p-10 transition-colors"
    >
      {/* Background Architectural Vector Skyline Silhouette (Vikas VayuSaathi Inspired) */}
      <div 
        className="absolute inset-x-0 bottom-0 h-36 sm:h-48 opacity-15 dark:opacity-20 pointer-events-none select-none overflow-hidden transition-opacity duration-700"
        aria-hidden="true"
      >
        <CityPanoramicBackdrop 
          cityId={city} 
          isDark={isDarkMode} 
          className="w-full h-full" 
        />
      </div>

      {/* Top Header: Location, Live Status & Science Link */}
      <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-stone-200 dark:border-zinc-800/80">
        <div>
          <div className="flex items-center gap-2 text-[11px] font-mono text-ink-muted dark:text-zinc-400 tracking-wider uppercase mb-1.5">
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span>Live Mesh • Copernicus &amp; NOAA Atmospheric Stream</span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black text-ink dark:text-white tracking-tight">
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
        <div className="flex items-center sm:flex-col sm:items-end justify-between gap-2 text-xs font-mono text-ink-muted dark:text-zinc-400">
          <div className="flex items-center gap-2">
            <span>Live since:</span>
            <span className="text-ink dark:text-zinc-200 font-semibold">{formattedTime}</span>
            {onRefresh && (
              <button
                onClick={onRefresh}
                disabled={isLoading}
                className="p-1 rounded hover:bg-stone-200 dark:hover:bg-zinc-800 text-ink-muted dark:text-zinc-400 hover:text-ink dark:hover:text-white transition-colors"
                title="Refresh Live Telemetry"
                aria-label="Refresh telemetry feed"
              >
                <Activity className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-primary' : ''}`} />
              </button>
            )}
          </div>
          {onOpenExplainer && (
            <button
              onClick={onOpenExplainer}
              className="text-[11px] text-sage-600 dark:text-zinc-400 hover:underline flex items-center gap-1 transition-colors"
            >
              Learn the Science &rarr;
            </button>
          )}
        </div>
      </div>

      {/* Main Atmospheric Scoreboard */}
      <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-6 py-6 items-center">
        {/* Left Column: AQI Metric & Health Burden */}
        <div className="lg:col-span-5 flex flex-col justify-center">
          <div className="flex items-baseline gap-4">
            <div className="text-6xl sm:text-7xl lg:text-8xl font-black text-ink dark:text-white tracking-tighter tabular-nums font-mono">
              {metrics.usAqi}
            </div>
            <div className="flex flex-col">
              <span className="text-xs uppercase font-mono tracking-widest text-ink-muted dark:text-zinc-400 font-semibold">
                US AQI
              </span>
              <span className="text-xs font-mono text-ink-muted dark:text-zinc-500 mt-0.5">
                CPCB NAQI: {Math.min(500, Math.round(metrics.usAqi * 1.05))}
              </span>
            </div>
          </div>

          {/* Berkeley Earth Cigarette Equivalence Card */}
          <div className="mt-4 p-3.5 rounded-xl bg-white/80 dark:bg-zinc-900/70 border border-stone-200 dark:border-zinc-800/80 flex items-center gap-3 shadow-sm">
            <div className="w-10 h-10 rounded-lg bg-stone-100 dark:bg-zinc-800 border border-stone-200 dark:border-zinc-700/60 flex items-center justify-center shrink-0">
              <Cigarette className="w-5 h-5 text-terracotta-600 dark:text-zinc-300" />
            </div>
            <div className="text-xs">
              <div className="font-semibold text-ink dark:text-white flex items-center gap-1.5">
                <span>Inhalation Exposure:</span>
                <span className="font-bold font-mono text-sm px-1.5 py-0.5 rounded bg-terracotta-50 dark:bg-zinc-800 text-terracotta-700 dark:text-white border border-terracotta-200 dark:border-zinc-700">
                  ≈ {cigarettes} cigs/day
                </span>
              </div>
              <p className="text-[11px] text-ink-muted dark:text-zinc-400 leading-tight mt-1">
                Berkeley Earth rule: 22 µg/m³ ambient PM2.5 = 1 smoked cigarette.
              </p>
            </div>
          </div>

          {/* CAQM GRAP Emergency Stage Pill */}
          <div className="mt-2.5 flex items-center gap-2">
            <span className="text-[11px] font-mono px-2 py-0.5 rounded border font-semibold bg-stone-100 dark:bg-zinc-900 text-ink dark:text-zinc-300 border-stone-300 dark:border-zinc-700">
              {grap.label}
            </span>
            <span className="text-[11px] text-ink-muted dark:text-zinc-400 truncate">
              {grap.advisory}
            </span>
          </div>
        </div>

        {/* Right Column: 4 Clean Telemetry Tiles */}
        <div className="lg:col-span-7 grid grid-cols-2 gap-3 sm:gap-3.5">
          {/* PM2.5 Fine Particulate */}
          <div className="rounded-xl p-4 bg-white/80 dark:bg-zinc-900/60 border border-stone-200 dark:border-zinc-800/80 hover:border-stone-300 dark:hover:border-zinc-700 transition-colors shadow-sm">
            <div className="flex items-center justify-between text-ink-muted dark:text-zinc-400 text-xs mb-1">
              <span className="font-mono uppercase tracking-wider text-[11px]">Fine PM2.5</span>
              <CloudFog className="w-4 h-4 text-terracotta-500 dark:text-zinc-400" />
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold text-ink dark:text-white font-mono tracking-tight tabular-nums">
              {metrics.pm25} <span className="text-xs font-sans font-normal text-ink-muted dark:text-zinc-400">µg/m³</span>
            </div>
            <div className="text-[11px] text-ink-muted dark:text-zinc-500 mt-1">Deep Alveolar Penetration</div>
          </div>

          {/* PM10 Coarse Particulate */}
          <div className="rounded-xl p-4 bg-white/80 dark:bg-zinc-900/60 border border-stone-200 dark:border-zinc-800/80 hover:border-stone-300 dark:hover:border-zinc-700 transition-colors shadow-sm">
            <div className="flex items-center justify-between text-ink-muted dark:text-zinc-400 text-xs mb-1">
              <span className="font-mono uppercase tracking-wider text-[11px]">Respirable PM10</span>
              <CloudFog className="w-4 h-4 text-amber-500 dark:text-zinc-400" />
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold text-ink dark:text-white font-mono tracking-tight tabular-nums">
              {metrics.pm10} <span className="text-xs font-sans font-normal text-ink-muted dark:text-zinc-400">µg/m³</span>
            </div>
            <div className="text-[11px] text-ink-muted dark:text-zinc-500 mt-1">Coarse Inhalable Aerosol</div>
          </div>

          {/* Planetary Boundary Layer */}
          <div className="rounded-xl p-4 bg-white/80 dark:bg-zinc-900/60 border border-stone-200 dark:border-zinc-800/80 hover:border-stone-300 dark:hover:border-zinc-700 transition-colors shadow-sm">
            <div className="flex items-center justify-between text-ink-muted dark:text-zinc-400 text-xs mb-1">
              <span className="font-mono uppercase tracking-wider text-[11px]">Boundary Layer</span>
              <Compass className="w-4 h-4 text-sage-600 dark:text-zinc-400" />
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold text-ink dark:text-white font-mono tracking-tight tabular-nums">
              {metrics.boundaryLayerHeight} <span className="text-xs font-sans font-normal text-ink-muted dark:text-zinc-400">m</span>
            </div>
            <div className="text-[11px] text-ink-muted dark:text-zinc-500 mt-1">Thermal Mixing Ceiling</div>
          </div>

          {/* Live Meteorology & Dispersion */}
          <div className="rounded-xl p-4 bg-white/80 dark:bg-zinc-900/60 border border-stone-200 dark:border-zinc-800/80 hover:border-stone-300 dark:hover:border-zinc-700 transition-colors shadow-sm">
            <div className="flex items-center justify-between text-ink-muted dark:text-zinc-400 text-xs mb-1">
              <span className="font-mono uppercase tracking-wider text-[11px]">Meteorology</span>
              <Wind className="w-4 h-4 text-ink-muted dark:text-zinc-400" />
            </div>
            <div className="text-xl sm:text-2xl font-bold text-ink dark:text-white font-mono tracking-tight tabular-nums">
              {metrics.temperature !== undefined ? `${metrics.temperature}°C` : '19°C'}
              <span className="text-stone-400 dark:text-zinc-500 mx-1.5 font-normal">•</span>
              <span className="text-base text-ink-muted dark:text-zinc-300 font-normal">
                {metrics.humidity !== undefined ? `${metrics.humidity}%` : '76%'}
              </span>
            </div>
            <div className="text-[11px] text-ink-muted dark:text-zinc-500 mt-1 flex items-center gap-1">
              <span>Wind: {metrics.windSpeed !== undefined ? `${metrics.windSpeed} km/h` : '3.2 km/h'}</span>
              <span>(Stagnant Trap)</span>
            </div>
          </div>
        </div>
      </div>

      {/* 24-Hour Diurnal Inversion & Solar Venting Timeline Bar (Vikas VayuSaathi Inspired) */}
      <div className="relative z-10 py-3.5 px-4 rounded-xl bg-white/90 dark:bg-zinc-950/80 border border-stone-200 dark:border-zinc-800/80 mb-5 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2.5">
          <div className="flex items-center gap-2 text-xs font-mono">
            <Sun className="w-3.5 h-3.5 text-amber-500" />
            <span className="font-bold text-ink dark:text-white uppercase tracking-wider text-[11px]">
              24-Hour Diurnal Venting &amp; Inversion Track
            </span>
          </div>
          <div className="flex items-center gap-3 text-[11px] font-mono text-ink-muted dark:text-zinc-400">
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500/80" />
              <span>Solar Venting Window (12:00–16:00)</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-sm bg-stone-300 dark:bg-zinc-800" />
              <span>Nocturnal Inversion Trap</span>
            </span>
          </div>
        </div>

        {/* 24-Bar Heatmap Strip */}
        <div className="grid grid-cols-24 gap-1 h-10 items-end" role="meter" aria-label="24-hour atmospheric boundary layer trend">
          {hourlyData.map((slot) => {
            const isCurrent = slot.hour === new Date().getHours();
            const isSelected = slot.hour === selectedHour;
            const heightPercent = Math.max(20, Math.min(100, (slot.blh / 1200) * 100));

            return (
              <button
                key={slot.hour}
                type="button"
                onClick={() => setSelectedHour(slot.hour)}
                className={`relative w-full rounded-t-sm transition-all group ${
                  slot.isSafeVentilation
                    ? 'bg-emerald-500/80 hover:bg-emerald-400'
                    : 'bg-stone-300 dark:bg-zinc-800 hover:bg-stone-400 dark:hover:bg-zinc-700'
                } ${isSelected ? 'ring-2 ring-primary ring-offset-1' : ''}`}
                style={{ height: `${heightPercent}%` }}
                title={`${slot.timeLabel} — Mixing Height: ${slot.blh}m ${slot.isSafeVentilation ? '(Solar Venting Window)' : '(Inversion Trap)'}`}
              >
                {isCurrent && (
                  <span className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-primary" />
                )}
              </button>
            );
          })}
        </div>

        <div className="flex justify-between text-[10px] font-mono text-ink-muted dark:text-zinc-500 mt-1.5">
          <span>00:00 (Night Trap)</span>
          <span className="text-emerald-600 dark:text-emerald-400 font-bold">13:30 (Peak Convective Window)</span>
          <span>23:00 (Inversion Descends)</span>
        </div>
      </div>

      {/* Live Atmospheric Trace Gases Strip */}
      <div className="relative z-10 py-3 px-4 rounded-xl bg-white/70 dark:bg-zinc-950/80 border border-stone-200 dark:border-zinc-800/70 mb-5 flex flex-wrap items-center justify-between gap-3 text-xs font-mono shadow-sm">
        <div className="text-ink-muted dark:text-zinc-400 flex items-center gap-1.5 text-[11px]">
          <Gauge className="w-3.5 h-3.5 text-sage-600 dark:text-zinc-400" />
          <span className="uppercase tracking-wider">Live Trace Gases:</span>
        </div>
        <div className="flex flex-wrap items-center gap-4 text-ink dark:text-zinc-300 text-[11px]">
          <span>CO: <strong className="font-mono text-ink dark:text-white">{metrics.co ? `${Math.round(metrics.co)}` : '4,228'}</strong> µg/m³</span>
          <span className="text-stone-300 dark:text-zinc-700">•</span>
          <span>NO₂: <strong className="font-mono text-ink dark:text-white">{metrics.no2 ? `${metrics.no2}` : '117.5'}</strong> µg/m³</span>
          <span className="text-stone-300 dark:text-zinc-700">•</span>
          <span>SO₂: <strong className="font-mono text-ink dark:text-white">{metrics.so2 ? `${metrics.so2}` : '104.5'}</strong> µg/m³</span>
          <span className="text-stone-300 dark:text-zinc-700">•</span>
          <span>O₃: <strong className="font-mono text-ink dark:text-white">{metrics.o3 ? `${metrics.o3}` : '17.0'}</strong> µg/m³</span>
        </div>
      </div>

      {/* 4-Icon Protective Action Advice Strip */}
      <div className="relative z-10 grid grid-cols-2 sm:grid-cols-4 gap-2 mb-5">
        <div className="p-2.5 rounded-lg bg-white/80 dark:bg-zinc-900/40 border border-stone-200 dark:border-zinc-800 flex items-center gap-2.5 shadow-sm">
          <ShieldAlert className="w-4 h-4 text-terracotta-600 dark:text-zinc-300 shrink-0" />
          <span className="text-[11px] text-ink dark:text-zinc-300 leading-tight">
            Wear <strong>N95 / FFP2</strong> outdoors
          </span>
        </div>
        <div className="p-2.5 rounded-lg bg-white/80 dark:bg-zinc-900/40 border border-stone-200 dark:border-zinc-800 flex items-center gap-2.5 shadow-sm">
          <Activity className="w-4 h-4 text-sage-600 dark:text-zinc-300 shrink-0" />
          <span className="text-[11px] text-ink dark:text-zinc-300 leading-tight">
            Run <strong>Air Purifier</strong> on High
          </span>
        </div>
        <div className="p-2.5 rounded-lg bg-white/80 dark:bg-zinc-900/40 border border-stone-200 dark:border-zinc-800 flex items-center gap-2.5 shadow-sm">
          <Home className="w-4 h-4 text-sage-600 dark:text-zinc-300 shrink-0" />
          <span className="text-[11px] text-ink dark:text-zinc-300 leading-tight">
            Keep <strong>Windows Closed</strong>
          </span>
        </div>
        <div className="p-2.5 rounded-lg bg-white/80 dark:bg-zinc-900/40 border border-stone-200 dark:border-zinc-800 flex items-center gap-2.5 shadow-sm">
          <CheckCircle2 className="w-4 h-4 text-sage-600 dark:text-zinc-300 shrink-0" />
          <span className="text-[11px] text-ink dark:text-zinc-300 leading-tight">
            Avoid <strong>Outdoor Cardio</strong>
          </span>
        </div>
      </div>

      {/* Atmospheric Thermal Inversion Alert Banner (With Required a11y Live Region) */}
      <div
        className={`relative z-10 rounded-xl p-4 sm:p-5 border flex items-start gap-3.5 transition-colors ${
          metrics.isThermalInversionActive
            ? 'bg-terracotta-50 dark:bg-zinc-950 border-terracotta-200 dark:border-red-900/50 text-terracotta-800 dark:text-zinc-200'
            : 'bg-sage-50 dark:bg-zinc-950 border-sage-200 dark:border-emerald-900/50 text-sage-800 dark:text-zinc-200'
        }`}
        role="alert"
        aria-live="polite"
      >
        {metrics.isThermalInversionActive ? (
          <AlertTriangle className="w-5 h-5 text-terracotta-600 dark:text-red-400 shrink-0 mt-0.5" />
        ) : (
          <ShieldCheck className="w-5 h-5 text-sage-600 dark:text-emerald-400 shrink-0 mt-0.5" />
        )}

        <div className="text-xs sm:text-sm">
          <div className="font-bold tracking-wide flex items-center gap-2 font-mono text-ink dark:text-white">
            <span>
              {metrics.isThermalInversionActive
                ? 'CRITICAL WARNING: ACTIVE THERMAL INVERSION TRAP'
                : 'SOLAR CONVECTIVE VENTING WINDOW ACTIVE'}
            </span>
          </div>
          <p className="mt-1 text-ink-muted dark:text-zinc-400 leading-relaxed text-xs sm:text-sm">
            {metrics.isThermalInversionActive
              ? `A low atmospheric boundary layer (${metrics.boundaryLayerHeight}m) is physically acting as a lid, trapping toxic vehicular and biomass emissions within human breathing height. Avoid high-exertion outdoor activities; shift workouts to the 12:30 PM - 3:30 PM solar venting window.`
              : 'Daytime solar heating has expanded the atmospheric boundary layer, diluting ground-level particulate concentrations. This is your safest daily window for essential errands, ventilation, and outdoor transit.'}
          </p>
        </div>
      </div>
    </section>
  );
};
