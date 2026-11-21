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
  Flame,
  Radio,
} from 'lucide-react';

interface AtmosphereHeroProps {
  city: string;
  metrics: AtmosphericMetrics;
  category: AQICategory;
  onOpenExplainer?: () => void;
}

export const AtmosphereHero: React.FC<AtmosphereHeroProps> = ({
  city,
  metrics,
  category,
  onOpenExplainer,
}) => {
  const cigarettes = calculateCigaretteEquivalence(metrics.pm25);
  const grap = getGrapStage(metrics.usAqi);

  const getCategoryTheme = (cat: AQICategory) => {
    switch (cat) {
      case 'Good':
        return {
          glow: 'from-emerald-500/10 via-transparent to-transparent',
          badge: 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300',
          text: 'text-emerald-400',
          label: 'Good Air',
        };
      case 'Moderate':
        return {
          glow: 'from-yellow-500/10 via-transparent to-transparent',
          badge: 'bg-yellow-500/15 border-yellow-500/40 text-yellow-300',
          text: 'text-yellow-400',
          label: 'Moderate',
        };
      case 'UnhealthySensitive':
        return {
          glow: 'from-orange-500/10 via-transparent to-transparent',
          badge: 'bg-orange-500/15 border-orange-500/40 text-orange-300',
          text: 'text-orange-400',
          label: 'Unhealthy for Sensitive Groups',
        };
      case 'Unhealthy':
        return {
          glow: 'from-rose-500/10 via-transparent to-transparent',
          badge: 'bg-rose-500/15 border-rose-500/40 text-rose-300',
          text: 'text-rose-400',
          label: 'Unhealthy Smog',
        };
      case 'VeryUnhealthy':
        return {
          glow: 'from-purple-500/15 via-transparent to-transparent',
          badge: 'bg-purple-500/20 border-purple-500/40 text-purple-300',
          text: 'text-purple-400',
          label: 'Very Unhealthy',
        };
      case 'Hazardous':
      default:
        return {
          glow: 'from-red-600/20 via-transparent to-transparent',
          badge: 'bg-red-500/20 border-red-500/50 text-red-300',
          text: 'text-red-400',
          label: 'Hazardous (Severe Smog Alert)',
        };
    }
  };

  const theme = getCategoryTheme(category);

  return (
    <section 
      aria-label="Real-time Atmospheric Telemetry Hero"
      className="relative overflow-hidden rounded-3xl glass-panel p-6 sm:p-8 lg:p-10 shadow-[0_16px_48px_rgba(0,0,0,0.4)]"
    >
      {/* Ambient Atmospheric Background Glow */}
      <div
        className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${theme.glow} opacity-60 transition-opacity duration-700`}
        aria-hidden="true"
      />

      {/* Top Bar: Location & Live Telemetry Stamp */}
      <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-white/[0.08]">
        <div>
          <div className="flex items-center gap-2 text-[11px] font-mono text-emerald-400 tracking-wider uppercase mb-1.5">
            <Radio className="w-3.5 h-3.5 animate-pulse text-emerald-400" />
            <span>Real-Time Atmospheric Telemetry • Copernicus & NOAA Mesh</span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-white tracking-tight">
              {city}
            </h1>
            <span
              className={`text-xs px-3 py-1 rounded-full border font-semibold tracking-wide ${theme.badge}`}
            >
              {theme.label}
            </span>
          </div>
        </div>

        {/* Sync Timestamp & Explainer Button */}
        <div className="flex items-center sm:flex-col sm:items-end justify-between gap-2 text-xs font-mono text-slate-400">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span>Updated: {new Date(metrics.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          </div>
          {onOpenExplainer && (
            <button
              onClick={onOpenExplainer}
              className="text-[11px] text-cyan-400 hover:text-cyan-300 hover:underline flex items-center gap-1 transition-colors"
            >
              Learn the Science &rarr;
            </button>
          )}
        </div>
      </div>

      {/* Main Atmospheric Scoreboard */}
      <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-6 py-6 items-center">
        {/* Left Column: Massive Apple Weather-Style AQI Dial */}
        <div className="lg:col-span-5 flex flex-col justify-center">
          <div className="flex items-baseline gap-3">
            <div className="text-6xl sm:text-7xl lg:text-8xl font-black text-white tracking-tighter tabular-nums font-mono">
              {metrics.usAqi}
            </div>
            <div className="flex flex-col">
              <span className="text-xs uppercase font-mono tracking-widest text-slate-400">
                US AQI
              </span>
              <span className={`text-base font-bold tracking-tight ${theme.text}`}>
                {category}
              </span>
            </div>
          </div>

          {/* Berkeley Earth Cigarette Equivalence Banner */}
          <div className="mt-4 p-3.5 rounded-2xl bg-slate-900/80 border border-white/[0.08] flex items-center gap-3 shadow-inner">
            <div className="w-10 h-10 rounded-xl bg-orange-500/15 border border-orange-500/30 flex items-center justify-center shrink-0">
              <Cigarette className="w-5 h-5 text-orange-400" />
            </div>
            <div className="text-xs">
              <div className="font-semibold text-white flex items-center gap-1.5">
                <span>Toxic Inhalation Equivalent:</span>
                <span className="text-orange-400 font-bold font-mono text-sm">
                  ≈ {cigarettes} cigs/day
                </span>
              </div>
              <p className="text-[11px] text-slate-400 leading-tight mt-0.5">
                Berkeley Earth rule: 22 µg/m³ ambient PM2.5 = 1 smoked cigarette.
              </p>
            </div>
          </div>

          {/* CAQM GRAP Emergency Stage Pill */}
          <div className="mt-2.5 flex items-center gap-2">
            <span
              className={`text-[11px] font-mono px-2.5 py-1 rounded-lg border font-semibold ${grap.badgeBg}`}
            >
              {grap.label}
            </span>
            <span className="text-[11px] text-slate-400 truncate">
              {grap.advisory}
            </span>
          </div>
        </div>

        {/* Right Column: 4 Cupertino Atmospheric Metric Cards */}
        <div className="lg:col-span-7 grid grid-cols-2 gap-3.5 sm:gap-4">
          {/* PM2.5 Fine Particulate */}
          <div className="rounded-2xl glass-panel-subtle p-4 border border-white/[0.06] hover:border-white/10 transition-colors">
            <div className="flex items-center justify-between text-slate-400 text-xs mb-1.5">
              <span className="font-medium">Fine PM2.5</span>
              <CloudFog className="w-4 h-4 text-orange-400" />
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold text-orange-400 font-mono tracking-tight tabular-nums">
              {metrics.pm25} <span className="text-xs font-sans text-slate-400">µg/m³</span>
            </div>
            <div className="text-[11px] text-slate-400 mt-1">Deep Alveolar Penetration</div>
          </div>

          {/* PM10 Coarse Particulate */}
          <div className="rounded-2xl glass-panel-subtle p-4 border border-white/[0.06] hover:border-white/10 transition-colors">
            <div className="flex items-center justify-between text-slate-400 text-xs mb-1.5">
              <span className="font-medium">Respirable PM10</span>
              <CloudFog className="w-4 h-4 text-yellow-400" />
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold text-yellow-300 font-mono tracking-tight tabular-nums">
              {metrics.pm10} <span className="text-xs font-sans text-slate-400">µg/m³</span>
            </div>
            <div className="text-[11px] text-slate-400 mt-1">Coarse Inhalable Dust</div>
          </div>

          {/* Planetary Boundary Layer */}
          <div className="rounded-2xl glass-panel-subtle p-4 border border-white/[0.06] hover:border-white/10 transition-colors">
            <div className="flex items-center justify-between text-slate-400 text-xs mb-1.5">
              <span className="font-medium">Boundary Layer</span>
              <Compass className="w-4 h-4 text-cyan-400" />
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold text-cyan-300 font-mono tracking-tight tabular-nums">
              {metrics.boundaryLayerHeight} <span className="text-xs font-sans text-slate-400">m</span>
            </div>
            <div className="text-[11px] text-slate-400 mt-1">Thermal Mixing Ceiling</div>
          </div>

          {/* Standardized CPCB Index */}
          <div className="rounded-2xl glass-panel-subtle p-4 border border-white/[0.06] hover:border-white/10 transition-colors">
            <div className="flex items-center justify-between text-slate-400 text-xs mb-1.5">
              <span className="font-medium">CPCB Benchmark</span>
              <Gauge className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold text-emerald-400 font-mono tracking-tight tabular-nums">
              {Math.min(500, Math.round(metrics.usAqi * 1.05))} <span className="text-xs font-sans text-slate-400">AQI</span>
            </div>
            <div className="text-[11px] text-slate-400 mt-1">National Air Index (NAQI)</div>
          </div>
        </div>
      </div>

      {/* Atmospheric Thermal Inversion Alert Banner (With Required a11y Live Region) */}
      <div
        className={`relative z-10 rounded-2xl p-4 sm:p-5 border flex items-start gap-3.5 transition-colors ${
          metrics.isThermalInversionActive
            ? 'bg-rose-950/30 border-rose-800/40 text-rose-200'
            : 'bg-emerald-950/30 border-emerald-800/40 text-emerald-200'
        }`}
        role="alert"
        aria-live="polite"
      >
        {metrics.isThermalInversionActive ? (
          <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
        ) : (
          <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
        )}

        <div className="text-xs sm:text-sm">
          <div className="font-bold tracking-wide flex items-center gap-2">
            <span>
              {metrics.isThermalInversionActive
                ? 'CRITICAL WARNING: ACTIVE THERMAL INVERSION TRAP'
                : 'SOLAR CONVECTIVE VENTING WINDOW ACTIVE'}
            </span>
          </div>
          <p className="mt-1 text-slate-300 leading-relaxed text-xs sm:text-sm">
            {metrics.isThermalInversionActive
              ? `A low atmospheric boundary layer (${metrics.boundaryLayerHeight}m) is physically acting as a lid, trapping toxic vehicular and biomass emissions within human breathing height. Avoid high-exertion outdoor activities; shift workouts to the 12:30 PM - 3:30 PM solar venting window.`
              : 'Daytime solar heating has expanded the atmospheric boundary layer, diluting ground-level particulate concentrations. This is your safest daily window for essential errands, ventilation, and outdoor transit.'}
          </p>
        </div>
      </div>
    </section>
  );
};
