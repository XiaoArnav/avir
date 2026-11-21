'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { AtmosphericMetrics, AQICategory, HourlyAtmosphericPoint } from '@/domain/types';
import {
  calculateCigaretteEquivalence,
  calculateCpcbNaqi,
  getGrapStage,
} from '@/domain/air-math';
import { CityPanoramicBackdrop } from './CityPanoramicBackdrop';
import {
  AlertTriangle,
  CloudFog,
  Gauge,
  ShieldCheck,
  Cigarette,
  Activity,
  ShieldAlert,
  Home,
  CheckCircle2,
  Sparkles,
  Share2,
  GraduationCap,
} from 'lucide-react';

interface AtmosphereHeroProps {
  city: string;
  metrics: AtmosphericMetrics | null;
  category: AQICategory;
  onOpenExplainer?: () => void;
  onRefresh?: () => void;
  onOpenShare?: () => void;
  onOpenSchoolAdvisory?: () => void;
  onOpenMultiSource?: () => void;
  isLoading?: boolean;
  isDarkMode?: boolean;
}

export const AtmosphereHero: React.FC<AtmosphereHeroProps> = ({
  city,
  metrics,
  category,
  onOpenExplainer,
  onRefresh,
  onOpenShare,
  onOpenSchoolAdvisory,
  onOpenMultiSource,
  isLoading,
  isDarkMode = true,
}) => {
  // Parse target city's wall-clock hour directly from location timestamp to avoid browser timezone drift
  const currentCityHour = useMemo(() => {
    if (metrics?.timestamp && metrics.timestamp.includes('T')) {
      const parsed = parseInt(metrics.timestamp.split('T')[1].slice(0, 2), 10);
      if (!isNaN(parsed)) return parsed;
    }
    return new Date().getHours();
  }, [metrics?.timestamp]);

  const [selectedHour, setSelectedHour] = useState<number>(currentCityHour);

  useEffect(() => {
    setSelectedHour(currentCityHour);
  }, [currentCityHour]);

  // Diurnal 24-hour mixing forecast points directly from Open-Meteo telemetry
  const forecastPoints: HourlyAtmosphericPoint[] = useMemo(() => {
    return metrics?.hourlyForecast || [];
  }, [metrics?.hourlyForecast]);

  const safeVentingWindows = useMemo(() => {
    return forecastPoints.filter((p) => p.isSafeVentingWindow);
  }, [forecastPoints]);

  const bestVentingSlot = useMemo(() => {
    return forecastPoints.reduce<HourlyAtmosphericPoint | null>((best, curr) => {
      if (curr.usAqi === null && curr.boundaryLayerHeight === null) return best;
      if (!best) return curr;
      const currScore = (curr.boundaryLayerHeight ?? 200) - (curr.usAqi ?? 200) * 2;
      const bestScore = (best.boundaryLayerHeight ?? 200) - (best.usAqi ?? 200) * 2;
      return currScore > bestScore ? curr : best;
    }, null);
  }, [forecastPoints]);

  // Dynamic 4 Protective Action Pills tailored strictly to live AQI / Particulate severity
  const actionPills = useMemo(() => {
    if (!metrics || metrics.usAqi === null) {
      return [
        { icon: AlertTriangle, title: 'Particulates', action: 'Telemetry Awaiting', color: 'text-stone-500' },
        { icon: Activity, title: 'Air Purifier', action: 'Auto / Eco Mode', color: 'text-stone-500' },
        { icon: Home, title: 'Windows', action: 'Normal Usage', color: 'text-stone-500' },
        { icon: CheckCircle2, title: 'Cardio', action: 'Listen to Body', color: 'text-stone-500' },
      ];
    }

    if (metrics.usAqi <= 50) {
      return [
        { icon: CheckCircle2, title: 'Outdoor Air', action: 'Safe for Everyone', color: 'text-emerald-600 dark:text-emerald-400' },
        { icon: Activity, title: 'Air Purifiers', action: 'Eco / Standby Mode', color: 'text-emerald-600 dark:text-emerald-400' },
        { icon: Home, title: 'Ventilation', action: 'Open Windows Freely', color: 'text-emerald-600 dark:text-emerald-400' },
        { icon: CheckCircle2, title: 'Cardio', action: 'Ideal for Workouts', color: 'text-emerald-600 dark:text-emerald-400' },
      ];
    }

    if (metrics.usAqi <= 100) {
      return [
        { icon: CheckCircle2, title: 'Outdoor Air', action: 'Acceptable Baseline', color: 'text-yellow-600 dark:text-yellow-400' },
        { icon: Activity, title: 'Air Purifiers', action: 'Normal Auto Mode', color: 'text-yellow-600 dark:text-yellow-400' },
        { icon: Home, title: 'Ventilation', action: 'Air Out Midday', color: 'text-yellow-600 dark:text-yellow-400' },
        { icon: Activity, title: 'Sensitive Groups', action: 'Moderate Heavy Strain', color: 'text-yellow-600 dark:text-yellow-400' },
      ];
    }

    if (metrics.usAqi <= 150) {
      return [
        { icon: ShieldAlert, title: 'Sensitive Groups', action: 'Wear N95 Outdoors', color: 'text-orange-600 dark:text-orange-400' },
        { icon: Activity, title: 'Air Purifiers', action: 'Medium Fan Speed', color: 'text-orange-600 dark:text-orange-400' },
        { icon: Home, title: 'Ventilation', action: 'Brief Midday Airing', color: 'text-orange-600 dark:text-orange-400' },
        { icon: CheckCircle2, title: 'Cardio', action: 'Limit Heavy Cardio', color: 'text-orange-600 dark:text-orange-400' },
      ];
    }

    if (metrics.usAqi <= 200) {
      return [
        { icon: ShieldAlert, title: 'Mask Protection', action: 'Wear N95 / FFP2', color: 'text-rose-600 dark:text-rose-400' },
        { icon: Activity, title: 'Air Purifier', action: 'Run on High', color: 'text-rose-600 dark:text-rose-400' },
        { icon: Home, title: 'Windows', action: 'Keep Windows Closed', color: 'text-rose-600 dark:text-rose-400' },
        { icon: CheckCircle2, title: 'Cardio', action: 'Avoid Outdoor Cardio', color: 'text-rose-600 dark:text-rose-400' },
      ];
    }

    // Very Unhealthy & Hazardous (201+)
    return [
      { icon: ShieldAlert, title: 'Severe Smog', action: 'N95 Sealed Required', color: 'text-red-600 dark:text-red-400' },
      { icon: Activity, title: 'Air Purifier', action: 'Continuous Max Clean', color: 'text-red-600 dark:text-red-400' },
      { icon: Home, title: 'Windows', action: 'Seal Windows & Vents', color: 'text-red-600 dark:text-red-400' },
      { icon: CheckCircle2, title: 'Cardio', action: 'Strict Indoor Only', color: 'text-red-600 dark:text-red-400' },
    ];
  }, [metrics]);

  // Dynamic Inversion & Mixing Ceiling Alert (Zero hardcoded static hour claims)
  const inversionBanner = useMemo(() => {
    if (!metrics || metrics.boundaryLayerHeight === null) {
      return {
        isActive: false,
        isWarning: false,
        title: 'PLANETARY BOUNDARY LAYER • TELEMETRY AWAITING',
        message: 'Mixing ceiling telemetry is currently unavailable from regional model feeds. Exercise and outdoor ventilation decisions should follow observed particulate concentrations.',
      };
    }

    if (metrics.isThermalInversionActive) {
      let advice = `A shallow atmospheric boundary layer (${metrics.boundaryLayerHeight}m) is acting as a lid, trapping toxic vehicular and biomass emissions within human breathing height. Avoid high-exertion outdoor activities.`;

      if (safeVentingWindows.length > 0) {
        const start = Math.min(...safeVentingWindows.map((w) => w.hour));
        const end = Math.max(...safeVentingWindows.map((w) => w.hour)) + 1;
        advice += ` Atmospheric dispersion is projected to temporarily improve between ${start}:00 and ${end}:00 as solar heating expands the boundary layer.`;
      } else if (bestVentingSlot && bestVentingSlot.hour !== currentCityHour && (bestVentingSlot.boundaryLayerHeight ?? 0) > metrics.boundaryLayerHeight + 150) {
        advice += ` Relative mixing ceiling peak is forecast around ${bestVentingSlot.hour}:00 (~${bestVentingSlot.boundaryLayerHeight}m).`;
      } else {
        advice += ` No significant solar venting window is projected across the forecast; keep workouts indoors in filtered air zones.`;
      }

      return {
        isActive: true,
        isWarning: true,
        title: 'CRITICAL WARNING: ACTIVE THERMAL INVERSION TRAP',
        message: advice,
      };
    }

    // When inversion is NOT active
    if (category === 'Good' || category === 'Moderate') {
      return {
        isActive: false,
        isWarning: false,
        title: 'ATMOSPHERIC DISPERSION ACTIVE • NORMAL VENTILATION',
        message: `Expanded atmospheric boundary layer ceiling (${metrics.boundaryLayerHeight}m) facilitates natural pollutant dispersion. Favorable conditions for outdoor errands, workouts, and fresh air ventilation.`,
      };
    }

    return {
      isActive: false,
      isWarning: true,
      title: 'ELEVATED PARTICULATE ADVECTION • REGIONAL SMOG',
      message: `Vertical mixing ceiling is elevated (${metrics.boundaryLayerHeight}m), but ambient particulate density remains elevated from heavy regional emissions or advection. Sensitive individuals should moderate prolonged outdoor cardio.`,
    };
  }, [metrics, safeVentingWindows, bestVentingSlot, currentCityHour, category]);

  // Dynamic Ventilation text for Quick Health Guide Question 3
  const ventilationGuideText = useMemo(() => {
    if (!metrics || metrics.usAqi === null) {
      return 'Follow local municipal guidance while telemetry feed synchronizes.';
    }
    if (metrics.usAqi <= 50) {
      return 'Air quality is pristine; open windows whenever desired for natural cross-ventilation.';
    }
    if (metrics.usAqi <= 100) {
      return 'Moderate particulate levels; natural ventilation is safe, ideally during midday solar mixing.';
    }
    if (safeVentingWindows.length > 0) {
      const start = Math.min(...safeVentingWindows.map((w) => w.hour));
      const end = Math.max(...safeVentingWindows.map((w) => w.hour)) + 1;
      return `Air out rooms briefly during the ${start}:00–${end}:00 venting window; keep windows shut during night and morning inversion peaks.`;
    }
    return 'Keep windows sealed; severe ambient particulates detected across the forecast. Rely on indoor HEPA / Corsi-Rosenthal filtration.';
  }, [metrics, safeVentingWindows]);

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

  // If loading and no metrics, render sleek skeleton
  if (!metrics || isLoading) {
    return (
      <section
        aria-label="Real-time Atmospheric Telemetry Loading"
        className="relative overflow-hidden rounded-2xl glass-panel p-6 sm:p-8 lg:p-10 border border-stone-300 dark:border-zinc-800 bg-white/90 dark:bg-black/90 min-h-[460px] flex flex-col justify-between animate-pulse"
      >
        <div className="space-y-4">
          <div className="h-4 bg-stone-200 dark:bg-zinc-800 rounded w-1/3" />
          <div className="h-10 bg-stone-300 dark:bg-zinc-700 rounded w-1/2" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 my-8">
          <div className="lg:col-span-5 space-y-3">
            <div className="h-24 bg-stone-200 dark:bg-zinc-800 rounded-xl w-3/4" />
            <div className="h-12 bg-stone-200 dark:bg-zinc-800 rounded-xl w-full" />
          </div>
          <div className="lg:col-span-7 grid grid-cols-2 gap-3">
            <div className="h-28 bg-stone-200 dark:bg-zinc-800 rounded-xl" />
            <div className="h-28 bg-stone-200 dark:bg-zinc-800 rounded-xl" />
            <div className="h-28 bg-stone-200 dark:bg-zinc-800 rounded-xl" />
            <div className="h-28 bg-stone-200 dark:bg-zinc-800 rounded-xl" />
          </div>
        </div>
        <div className="h-12 bg-stone-200 dark:bg-zinc-800 rounded-xl w-full" />
      </section>
    );
  }

  // Graceful zero-fabrication error state
  if (metrics.status === 'error') {
    return (
      <section
        aria-label="Atmospheric Telemetry Connection Error"
        className="relative overflow-hidden rounded-2xl glass-panel p-6 sm:p-8 lg:p-10 border border-red-300 dark:border-red-900/60 bg-red-50/50 dark:bg-zinc-950 shadow-sm"
      >
        <div className="flex flex-col items-center justify-center text-center max-w-lg mx-auto py-10 space-y-4">
          <div className="w-14 h-14 rounded-full bg-red-100 dark:bg-red-950/80 border border-red-200 dark:border-red-800 flex items-center justify-center text-red-600 dark:text-red-400">
            <AlertTriangle className="w-7 h-7" />
          </div>
          <div className="space-y-1.5">
            <h2 className="text-xl sm:text-2xl font-bold text-ink dark:text-white">
              Atmospheric Telemetry Unavailable
            </h2>
            <p className="text-xs sm:text-sm text-ink-muted dark:text-zinc-400 leading-relaxed">
              {metrics.errorMessage || 'Unable to establish connection to Open-Meteo atmospheric servers.'}
            </p>
            <p className="text-[11px] font-mono text-stone-500 dark:text-zinc-500">
              Zero synthetic data policy: Avir never fabricates pollution levels when feeds are down.
            </p>
          </div>
          {onRefresh && (
            <button
              onClick={onRefresh}
              className="px-5 py-2.5 rounded-xl bg-ink hover:bg-stone-800 text-white dark:bg-white dark:hover:bg-zinc-200 dark:text-black font-semibold text-xs transition-all shadow-md active:scale-95 flex items-center gap-2"
            >
              <Activity className="w-3.5 h-3.5" />
              <span>Retry Telemetry Connection</span>
            </button>
          )}
        </div>
      </section>
    );
  }

  const cigarettes = calculateCigaretteEquivalence(metrics.pm25);
  const cpcb = metrics.cpcbAqi
    ? { aqi: metrics.cpcbAqi, category: metrics.cpcbCategory || 'Poor' }
    : calculateCpcbNaqi(metrics.pm25, metrics.pm10);
  const grap = getGrapStage(metrics.usAqi);

  const formattedTime = new Date(metrics.timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

  return (
    <section
      aria-label="Real-time Atmospheric Telemetry Hero"
      className="relative overflow-hidden rounded-2xl glass-panel p-6 sm:p-8 lg:p-10 transition-colors shadow-sm"
    >
      {/* Background Architectural Vector Skyline Silhouette */}
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

      {/* Top Header: Location, Live Status & Scientific Attribution */}
      <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-stone-200 dark:border-zinc-800/80">
        <div>
          <div className="flex items-center gap-2 text-[11px] font-mono text-ink-muted dark:text-zinc-400 tracking-wider uppercase mb-1.5">
            <span className="flex h-2 w-2 relative">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${metrics.isLive && !metrics.isStale ? 'bg-emerald-500' : 'bg-amber-500'} opacity-75`}></span>
              <span className={`relative inline-flex rounded-full h-2 w-2 ${metrics.isLive && !metrics.isStale ? 'bg-emerald-500' : 'bg-amber-500'}`}></span>
            </span>
            <span>
              {metrics.sourceAttribution || 'Open-Meteo High-Resolution Ensemble (ECMWF & NOAA GFS)'}
            </span>
            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
              metrics.isStale || metrics.status === 'stale'
                ? 'bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800'
                : 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800'
            }`}>
              {metrics.isStale || metrics.status === 'stale' ? 'Cached Reading' : 'Live Observation'}
            </span>
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
            <span>Observed at:</span>
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
          <div className="flex items-center gap-2">
            {onOpenShare && (
              <button
                onClick={onOpenShare}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-[11px] transition-colors shadow-sm"
                title="Share Daily Smog Bulletin on WhatsApp"
              >
                <Share2 className="w-3 h-3" />
                <span>Share Briefing</span>
              </button>
            )}
            {onOpenSchoolAdvisory && (
              <button
                onClick={onOpenSchoolAdvisory}
                className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-stone-100 dark:bg-zinc-800 hover:bg-stone-200 dark:hover:bg-zinc-700 text-ink dark:text-zinc-200 font-medium text-[11px] transition-colors border border-stone-200 dark:border-zinc-700"
                title="Open School Sports Safety Guide"
              >
                <GraduationCap className="w-3 h-3 text-amber-500" />
                <span>School Guide</span>
              </button>
            )}
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
      </div>

      {/* Main Atmospheric Scoreboard */}
      <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-6 py-6 items-center">
        {/* Left Column: AQI Metric & Health Burden */}
        <div className="lg:col-span-5 flex flex-col justify-center">
          <div className="flex items-baseline gap-4">
            <div className="text-6xl sm:text-7xl lg:text-8xl font-black text-ink dark:text-white tracking-tighter tabular-nums font-mono">
              {metrics.usAqi !== null ? metrics.usAqi : '—'}
            </div>
            <div className="flex flex-col">
              <span className="text-xs uppercase font-mono tracking-widest text-ink-muted dark:text-zinc-400 font-semibold">
                US AQI
              </span>
              <span className="text-xs font-mono text-ink-muted dark:text-zinc-400 mt-0.5">
                CPCB NAQI: <strong className="text-ink dark:text-zinc-200">{cpcb.aqi !== null ? cpcb.aqi : '—'}</strong> ({cpcb.category})
              </span>
            </div>
          </div>

          {/* Multi-Source Open-Source AQI Consensus Range Badge */}
          {metrics.ensemble && metrics.ensemble.consensusAqi !== null && (
            <button
              onClick={onOpenMultiSource}
              className="mt-3.5 inline-flex items-center flex-wrap gap-2 px-3 py-1.5 rounded-xl bg-white/90 dark:bg-zinc-900/90 border border-stone-200 dark:border-zinc-800 text-xs text-ink dark:text-zinc-200 hover:border-emerald-500/60 hover:bg-emerald-50/40 dark:hover:bg-emerald-950/20 transition-all shadow-sm group cursor-pointer text-left w-fit"
              title="Compare open-source air quality model feeds"
              aria-label="Inspect Open-Source AQI Feeds"
            >
              <span className="flex h-2 w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span className="font-semibold text-ink dark:text-white">
                Multi-Model Consensus: <strong className="font-mono text-emerald-600 dark:text-emerald-400 font-bold">{metrics.ensemble.consensusAqi} AQI</strong>
              </span>
              {metrics.ensemble.aqiMin !== null && metrics.ensemble.aqiMax !== null && (
                <span className="font-mono text-ink-muted dark:text-zinc-400 text-[11px]">
                  (Spread: {metrics.ensemble.aqiMin}–{metrics.ensemble.aqiMax})
                </span>
              )}
              {metrics.ensemble.confidenceScorePercent !== null && (
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 font-bold border border-emerald-500/20">
                  {metrics.ensemble.confidenceScorePercent}% Agreement
                </span>
              )}
              <span className="text-emerald-600 dark:text-emerald-400 font-bold text-xs group-hover:translate-x-0.5 transition-transform">
                &rarr;
              </span>
            </button>
          )}

          {/* Berkeley Earth Cigarette Equivalence Card */}
          <div className="mt-4 p-3.5 rounded-xl bg-white/80 dark:bg-zinc-900/70 border border-stone-200 dark:border-zinc-800/80 flex items-center gap-3 shadow-sm">
            <div className="w-10 h-10 rounded-lg bg-stone-100 dark:bg-zinc-800 border border-stone-200 dark:border-zinc-700/60 flex items-center justify-center shrink-0">
              <Cigarette className="w-5 h-5 text-terracotta-600 dark:text-zinc-300" />
            </div>
            <div className="text-xs">
              <div className="font-semibold text-ink dark:text-white flex items-center gap-1.5">
                <span>Breathing Burden:</span>
                <span className="font-bold font-mono text-sm px-1.5 py-0.5 rounded bg-terracotta-50 dark:bg-zinc-800 text-terracotta-700 dark:text-white border border-terracotta-200 dark:border-zinc-700">
                  {cigarettes !== null ? `≈ ${cigarettes} cigs/day` : 'Data Awaiting'}
                </span>
              </div>
              <p className="text-[11px] text-ink-muted dark:text-zinc-400 leading-tight mt-1">
                Health standard: 22 µg/m³ ambient fine dust = smoking 1 cigarette.
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
              <span className="font-mono uppercase tracking-wider text-[11px]">Fine Dust (PM2.5)</span>
              <CloudFog className="w-4 h-4 text-terracotta-500 dark:text-zinc-400" />
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold text-ink dark:text-white font-mono tracking-tight tabular-nums">
              {metrics.pm25 !== null ? metrics.pm25 : '—'} <span className="text-xs font-sans font-normal text-ink-muted dark:text-zinc-400">µg/m³</span>
            </div>
            <div className="text-[11px] text-ink-muted dark:text-zinc-500 mt-1">Enters lungs &amp; bloodstream</div>
          </div>

          {/* PM10 Coarse Particulate */}
          <div className="rounded-xl p-4 bg-white/80 dark:bg-zinc-900/60 border border-stone-200 dark:border-zinc-800/80 hover:border-stone-300 dark:hover:border-zinc-700 transition-colors shadow-sm">
            <div className="flex items-center justify-between text-ink-muted dark:text-zinc-400 text-xs mb-1">
              <span className="font-mono uppercase tracking-wider text-[11px]">Bigger Dust (PM10)</span>
              <CloudFog className="w-4 h-4 text-amber-500 dark:text-zinc-400" />
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold text-ink dark:text-white font-mono tracking-tight tabular-nums">
              {metrics.pm10 !== null ? metrics.pm10 : '—'} <span className="text-xs font-sans font-normal text-ink-muted dark:text-zinc-400">µg/m³</span>
            </div>
            <div className="text-[11px] text-ink-muted dark:text-zinc-500 mt-1">Irritates eyes, nose &amp; throat</div>
          </div>

          {/* Thermal Mixing Ceiling / Boundary Layer */}
          <div className="rounded-xl p-4 bg-white/80 dark:bg-zinc-900/60 border border-stone-200 dark:border-zinc-800/80 hover:border-stone-300 dark:hover:border-zinc-700 transition-colors shadow-sm">
            <div className="flex items-center justify-between text-ink-muted dark:text-zinc-400 text-xs mb-1">
              <span className="font-mono uppercase tracking-wider text-[11px]">Smoke Ceiling</span>
              <Gauge className="w-4 h-4 text-sage-600 dark:text-zinc-400" />
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold text-ink dark:text-white font-mono tracking-tight tabular-nums">
              {metrics.boundaryLayerHeight !== null ? metrics.boundaryLayerHeight : '—'} <span className="text-xs font-sans font-normal text-ink-muted dark:text-zinc-400">m</span>
            </div>
            <div className="text-[11px] text-ink-muted dark:text-zinc-500 mt-1">
              {metrics.boundaryLayerHeight === null
                ? 'Mixing ceiling telemetry unavailable'
                : metrics.isThermalInversionActive
                ? 'Low ceiling (Trapping smog near ground)'
                : 'High ceiling (Blowing smog away)'}
            </div>
          </div>

          {/* Meteorological Ambient Conditions */}
          <div className="rounded-xl p-4 bg-white/80 dark:bg-zinc-900/60 border border-stone-200 dark:border-zinc-800/80 hover:border-stone-300 dark:hover:border-zinc-700 transition-colors shadow-sm">
            <div className="flex items-center justify-between text-ink-muted dark:text-zinc-400 text-xs mb-1">
              <span className="font-mono uppercase tracking-wider text-[11px]">Live Weather</span>
              <Activity className="w-4 h-4 text-sage-600 dark:text-zinc-400" />
            </div>
            <div className="text-xl sm:text-2xl font-extrabold text-ink dark:text-white font-mono tracking-tight">
              {metrics.temperature !== null && metrics.temperature !== undefined ? `${metrics.temperature}°C` : '—'}
              <span className="text-xs font-normal text-ink-muted dark:text-zinc-400 ml-2">
                {metrics.humidity !== null && metrics.humidity !== undefined ? `${metrics.humidity}% Humidity` : '—'}
              </span>
            </div>
            <div className="text-[11px] text-ink-muted dark:text-zinc-500 mt-1">
              Wind: {metrics.windSpeed !== null && metrics.windSpeed !== undefined ? `${metrics.windSpeed} km/h` : '—'}
            </div>
          </div>
        </div>
      </div>

      {/* 3-Point Action-First Decision Box ("Know your air. Plan your day.") */}
      <div className="relative z-10 my-4 p-4 rounded-xl bg-stone-50 dark:bg-zinc-900/90 border border-stone-200 dark:border-zinc-800 shadow-sm space-y-3">
        <div className="flex items-center justify-between border-b border-stone-200 dark:border-zinc-800 pb-2">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-sage-600 dark:text-emerald-400" />
            <h3 className="text-xs font-bold font-mono uppercase tracking-wider text-ink dark:text-white">
              Today's Quick Health Guide • What to do
            </h3>
          </div>
          <span className="text-[10px] font-mono text-ink-muted dark:text-zinc-400 hidden sm:inline">
            Direct Public Action
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          {/* Question 1: How bad is the air? */}
          <div className="p-3 rounded-lg bg-white dark:bg-zinc-950 border border-stone-200 dark:border-zinc-800/80 space-y-1">
            <div className="font-bold text-ink dark:text-white flex items-center gap-1.5">
              <Gauge className="w-3.5 h-3.5 text-sage-600 dark:text-emerald-400" />
              <span>1. How bad is the air?</span>
            </div>
            <p className="text-ink-muted dark:text-zinc-400 text-[11px] leading-relaxed">
              {metrics.usAqi === null
                ? 'Telemetry awaiting synchronization with regional station.'
                : metrics.usAqi > 200
                ? 'Severe toxic smog. Inhaled particulate burden is substantial.'
                : metrics.usAqi > 100
                ? 'Unhealthy air. Children, elderly, and sensitive lungs will experience symptoms.'
                : 'Good air quality. Safe for normal outdoor activities.'}
            </p>
          </div>

          {/* Question 2: Can I go outside? */}
          <div className="p-3 rounded-lg bg-white dark:bg-zinc-950 border border-stone-200 dark:border-zinc-800/80 space-y-1">
            <div className="font-bold text-ink dark:text-white flex items-center gap-1.5">
              <ShieldAlert className="w-3.5 h-3.5 text-terracotta-600 dark:text-amber-400" />
              <span>2. Can I go outside?</span>
            </div>
            <p className="text-ink-muted dark:text-zinc-400 text-[11px] leading-relaxed">
              {metrics.usAqi === null
                ? 'Check local advisories for outdoor activity clearance.'
                : metrics.usAqi > 200
                ? 'Avoid outdoor exertion. Wear a tightly fitted N95 mask if stepping out.'
                : metrics.usAqi > 100
                ? 'Avoid heavy morning runs. Walking with an N95 mask is safer.'
                : 'Safe for normal outdoor exercise and daily activities.'}
            </p>
          </div>

          {/* Question 3: What should I change? */}
          <div className="p-3 rounded-lg bg-white dark:bg-zinc-950 border border-stone-200 dark:border-zinc-800/80 space-y-1">
            <div className="font-bold text-ink dark:text-white flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-sage-600 dark:text-emerald-400" />
              <span>3. When should I air out rooms?</span>
            </div>
            <p className="text-ink-muted dark:text-zinc-400 text-[11px] leading-relaxed">
              {ventilationGuideText}
            </p>
          </div>
        </div>
      </div>

      {/* 24-Hour Diurnal Venting & Inversion Track */}
      <div className="relative z-10 my-4 p-4 rounded-xl bg-white/80 dark:bg-zinc-900/60 border border-stone-200 dark:border-zinc-800/80 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-ink dark:text-white uppercase font-mono tracking-wider">
              Hourly Smog &amp; Mixing Trend (24-Hour Diurnal Cycle)
            </span>
          </div>
          <div className="flex items-center gap-3 text-[11px] font-mono text-ink-muted dark:text-zinc-400">
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500/80" />
              <span>Solar Venting Window</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-sm bg-stone-300 dark:bg-zinc-800" />
              <span>Inversion Smog Trap</span>
            </span>
          </div>
        </div>

        {/* 24-Bar Heatmap Strip directly driven by Open-Meteo hourly forecast */}
        {forecastPoints.length > 0 ? (
          <>
            <div className="grid grid-cols-24 gap-1 h-10 items-end" role="meter" aria-label="24-hour atmospheric boundary layer trend">
              {forecastPoints.slice(0, 24).map((slot) => {
                const isCurrent = slot.hour === currentCityHour;
                const isSelected = slot.hour === selectedHour;
                const blh = slot.boundaryLayerHeight ?? 200;
                const heightPercent = Math.max(20, Math.min(100, (blh / 1200) * 100));

                return (
                  <button
                    key={slot.hour}
                    type="button"
                    onClick={() => setSelectedHour(slot.hour)}
                    className={`relative w-full rounded-t-sm transition-all group ${
                      slot.isSafeVentingWindow
                        ? 'bg-emerald-500/80 hover:bg-emerald-400'
                        : 'bg-stone-300 dark:bg-zinc-800 hover:bg-stone-400 dark:hover:bg-zinc-700'
                    } ${isSelected ? 'ring-2 ring-primary ring-offset-1' : ''}`}
                    style={{ height: `${heightPercent}%` }}
                    title={`${slot.hour.toString().padStart(2, '0')}:00 — Mixing Depth: ${slot.boundaryLayerHeight !== null ? `${slot.boundaryLayerHeight}m` : 'N/A'}, PM2.5: ${slot.pm25 !== null ? `${slot.pm25}µg/m³` : 'N/A'}`}
                  >
                    {isCurrent && (
                      <span className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-primary" />
                    )}
                  </button>
                );
              })}
            </div>

            <div className="flex justify-between text-[10px] font-mono text-ink-muted dark:text-zinc-500 mt-1.5">
              <span>00:00 ({forecastPoints[0]?.pm25 !== null ? `${forecastPoints[0].pm25} µg/m³` : 'Night'})</span>
              {bestVentingSlot && (
                <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                  {bestVentingSlot.hour}:00 (Best Dispersion: ~{bestVentingSlot.boundaryLayerHeight ?? '—'}m)
                </span>
              )}
              <span>23:00 ({forecastPoints[23]?.pm25 !== null ? `${forecastPoints[23].pm25} µg/m³` : 'Late Night'})</span>
            </div>
          </>
        ) : (
          <div className="py-4 text-center text-xs font-mono text-ink-muted dark:text-zinc-500">
            Hourly diurnal atmospheric forecast telemetry is currently unavailable.
          </div>
        )}
      </div>

      {/* Live Atmospheric Trace Gases Strip */}
      <div className="relative z-10 py-3 px-4 rounded-xl bg-white/70 dark:bg-zinc-950/80 border border-stone-200 dark:border-zinc-800/70 mb-5 flex flex-wrap items-center justify-between gap-3 text-xs font-mono shadow-sm">
        <div className="text-ink-muted dark:text-zinc-400 flex items-center gap-1.5 text-[11px]">
          <Gauge className="w-3.5 h-3.5 text-sage-600 dark:text-zinc-400" />
          <span className="uppercase tracking-wider">Key Trace Gas Pollutants:</span>
        </div>
        <div className="flex flex-wrap items-center gap-4 text-ink dark:text-zinc-300 text-[11px]">
          <span>CO: <strong className="font-mono text-ink dark:text-white">{metrics.co !== null && metrics.co !== undefined ? `${Math.round(metrics.co)}` : '—'}</strong> µg/m³</span>
          <span className="text-stone-300 dark:text-zinc-700">•</span>
          <span>NO₂: <strong className="font-mono text-ink dark:text-white">{metrics.no2 !== null && metrics.no2 !== undefined ? `${metrics.no2}` : '—'}</strong> µg/m³</span>
          <span className="text-stone-300 dark:text-zinc-700">•</span>
          <span>SO₂: <strong className="font-mono text-ink dark:text-white">{metrics.so2 !== null && metrics.so2 !== undefined ? `${metrics.so2}` : '—'}</strong> µg/m³</span>
          <span className="text-stone-300 dark:text-zinc-700">•</span>
          <span>O₃: <strong className="font-mono text-ink dark:text-white">{metrics.o3 !== null && metrics.o3 !== undefined ? `${metrics.o3}` : '—'}</strong> µg/m³</span>
        </div>
      </div>

      {/* 4-Icon Protective Action Advice Strip - Tailored Dynamically to Live Severity */}
      <div className="relative z-10 grid grid-cols-2 sm:grid-cols-4 gap-2 mb-5">
        {actionPills.map((pill, idx) => {
          const IconComp = pill.icon;
          return (
            <div
              key={idx}
              className="p-2.5 rounded-lg bg-white/80 dark:bg-zinc-900/40 border border-stone-200 dark:border-zinc-800 flex items-center gap-2.5 shadow-sm"
            >
              <IconComp className={`w-4 h-4 ${pill.color} shrink-0`} />
              <span className="text-[11px] text-ink dark:text-zinc-300 leading-tight">
                {pill.title}: <strong>{pill.action}</strong>
              </span>
            </div>
          );
        })}
      </div>

      {/* Atmospheric Thermal Inversion Alert Banner - Directly driven by Meteorological Models */}
      <div
        className={`relative z-10 rounded-xl p-4 sm:p-5 border flex items-start gap-3.5 transition-colors ${
          inversionBanner.isWarning
            ? 'bg-red-50 dark:bg-zinc-950 border-red-200 dark:border-red-900/50 text-red-900 dark:text-zinc-200'
            : 'bg-emerald-50 dark:bg-zinc-950 border-emerald-200 dark:border-emerald-900/50 text-emerald-900 dark:text-zinc-200'
        }`}
        role="alert"
        aria-live="polite"
      >
        {inversionBanner.isWarning ? (
          <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
        ) : (
          <ShieldCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
        )}

        <div className="text-xs sm:text-sm">
          <div className="font-bold tracking-wide flex items-center gap-2 font-mono text-ink dark:text-white">
            <span>{inversionBanner.title}</span>
          </div>
          <p className="mt-1 text-ink-muted dark:text-zinc-400 leading-relaxed text-xs sm:text-sm">
            {inversionBanner.message}
          </p>
        </div>
      </div>
    </section>
  );
};
