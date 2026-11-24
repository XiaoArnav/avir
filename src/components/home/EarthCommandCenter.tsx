'use client';

import React, { useState, useMemo } from 'react';
import {
  AtmosphericMetrics,
} from '@/domain/types';
import { GeocodedLocation, PREDEFINED_INDIAN_CITIES } from '@/services/telemetry-service';
import {
  buildGeographicObservations,
  GeographicObservationPoint,
  AqiStandard,
} from '@/services/geo/geographic-observation-adapter';
import { AvirGlobe } from '@/components/globe/AvirGlobe';
import {
  HoloPanel,
  MissionHeader,
  TelemetryReadout,
  FuturisticBadge,
} from '@/components/ui/futuristic';
import {
  ShieldAlert,
  RefreshCw,
  Compass,
  ArrowRight,
  Share2,
  Info,
  Cigarette,
  Flame,
  Layers,
} from 'lucide-react';
import { calculateCigaretteEquivalence, getGrapStage } from '@/domain/air-math';
import { formatTimeAgo } from '@/domain/presentation-contract';

export interface EarthCommandCenterProps {
  currentCity: GeocodedLocation;
  metrics: AtmosphericMetrics | null;
  isLoading: boolean;
  onSelectCity: (location: GeocodedLocation) => void;
  onRefreshTelemetry: () => void;
  onOpenExplainer: () => void;
  onOpenShare: () => void;
  onOpenMultiSource: () => void;
  onOpenDailyPlan: () => void;
  className?: string;
}

export function EarthCommandCenter({
  currentCity,
  metrics,
  isLoading,
  onSelectCity,
  onRefreshTelemetry,
  onOpenExplainer,
  onOpenShare,
  onOpenMultiSource,
  onOpenDailyPlan,
  className = '',
}: EarthCommandCenterProps) {
  const [standard, setStandard] = useState<AqiStandard>('cpcb');
  const [selectedGlobePointId, setSelectedGlobePointId] = useState<string | null>(null);

  // Build reactive geographic observation points from current telemetry & world registries
  const points = useMemo(() => {
    return buildGeographicObservations({
      standard,
      currentMetrics: metrics,
      currentLocation: currentCity,
    });
  }, [standard, metrics, currentCity]);

  // Synchronize active city as the selected globe marker point
  const activeGlobePoint = useMemo(() => {
    return (
      points.find(
        (p) =>
          p.name.toLowerCase() === currentCity.name.toLowerCase() ||
          p.id === selectedGlobePointId
      ) || points[0]
    );
  }, [points, currentCity, selectedGlobePointId]);

  const toggleStandard = () => {
    setStandard((prev) => (prev === 'cpcb' ? 'epa' : 'cpcb'));
  };

  const handleGlobeSelectPoint = (point: GeographicObservationPoint) => {
    setSelectedGlobePointId(point.id);
  };

  const handleGlobeSetActiveCity = (point: GeographicObservationPoint) => {
    const matched = PREDEFINED_INDIAN_CITIES.find(
      (c) => c.name.toLowerCase() === point.name.toLowerCase()
    );
    if (matched) {
      onSelectCity(matched);
    } else {
      onSelectCity({
        id: Math.floor(Math.random() * 100000),
        name: point.name,
        country: point.country,
        countryCode: point.countryCode,
        latitude: point.latitude,
        longitude: point.longitude,
      });
    }
  };

  const aqiValue = activeGlobePoint?.aqi ?? (standard === 'cpcb' ? metrics?.usAqi : metrics?.usAqi);
  const aqiDisplay = aqiValue !== null && aqiValue !== undefined ? Math.round(aqiValue) : '--';
  const hasGround = Boolean(metrics?.groundStation?.stationName);
  const cigarettes = metrics?.pm25 !== null && metrics?.pm25 !== undefined ? calculateCigaretteEquivalence(metrics.pm25) : null;
  const grapStage = metrics?.usAqi !== null && metrics?.usAqi !== undefined ? getGrapStage(metrics.usAqi) : null;
  const relativeFreshness = metrics?.timestamp ? formatTimeAgo(metrics.timestamp) : 'Live';

  return (
    <section
      aria-label="Atmospheric Intelligence Earth Command Center"
      className={`relative w-full rounded-3xl overflow-hidden border border-stone-200/90 dark:border-sky-500/25 bg-stone-900/95 dark:bg-[#030712] shadow-2xl transition-all ${className}`}
    >
      {/* 1. Aerospace Mission Control Top Banner */}
      <MissionHeader
        cityName={currentCity.name}
        latitude={currentCity.latitude}
        longitude={currentCity.longitude}
        elevationMeters={216}
        stationName={metrics?.groundStation?.stationName}
        hasOfficialGround={hasGround}
        standard={standard}
        onToggleStandard={toggleStandard}
      />

      {/* 2. Panoramic Atmospheric Earth Command Center */}
      <div className="relative w-full min-h-[600px] lg:min-h-[720px] overflow-hidden flex flex-col justify-between">
        {/* Full-Bleed 3D Earth Globe Canvas Background */}
        <div className="absolute inset-0 w-full h-full z-0">
          <AvirGlobe
            points={points}
            selectedPointId={activeGlobePoint?.id}
            activeCityName={currentCity.name}
            onSelectPoint={handleGlobeSelectPoint}
            onSetActiveCity={handleGlobeSetActiveCity}
            standard={standard}
            onToggleStandard={toggleStandard}
            className="w-full h-full !rounded-none !border-none !shadow-none !bg-transparent"
          />
        </div>

        {/* Foreground Floating Frosted HUD Controls Layer */}
        <div className="relative z-10 w-full p-4 sm:p-6 flex flex-col lg:flex-row justify-between items-start gap-6 pointer-events-none">
          {/* Floating Left Telemetry HUD Card */}
          <div className="w-full lg:w-[410px] pointer-events-auto">
            <HoloPanel
              elevation="raised"
              brackets
              glow
              title={`OBSERVATION STATION // ${currentCity.name.toUpperCase()}`}
              badge={
                hasGround ? (
                  <FuturisticBadge label="CPCB GROUND" variant="emerald" pulse />
                ) : (
                  <FuturisticBadge label="SATELLITE CONSENSUS" variant="cyan" pulse />
                )
              }
              headerAction={
                <button
                  type="button"
                  onClick={onRefreshTelemetry}
                  disabled={isLoading}
                  className="p-1.5 rounded-lg text-ink-muted dark:text-sky-300 hover:text-ink-primary dark:hover:text-white hover:bg-stone-100 dark:hover:bg-sky-950/40 transition-colors cursor-pointer"
                  title="Refresh real-time telemetry"
                  aria-label="Refresh real-time telemetry"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                </button>
              }
              className="backdrop-blur-2xl bg-white/85 dark:bg-[#060b18]/90 border border-stone-200/90 dark:border-sky-500/30 shadow-2xl"
            >
              {/* Primary AQI Readout Box */}
              <div className="relative p-4 rounded-2xl bg-white/70 dark:bg-[#080d1a]/80 border border-stone-200/70 dark:border-sky-500/15 mb-3.5 overflow-hidden">
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-ink-muted dark:text-sky-300/80 telemetry-mono">
                    {standard === 'cpcb' ? 'CPCB NAQI STANDARD' : 'US EPA AQI STANDARD'}
                  </span>
                  <span
                    className="px-2.5 py-0.5 rounded-full text-xs font-bold text-white shadow-sm"
                    style={{ backgroundColor: activeGlobePoint?.categoryColor || '#10B981' }}
                  >
                    {activeGlobePoint?.categoryLabel || 'Validated'}
                  </span>
                </div>

                <div className="flex items-baseline gap-3 my-1">
                  <span
                    className="text-5xl sm:text-6xl font-black tabular-nums telemetry-mono tracking-tighter"
                    style={{ color: activeGlobePoint?.categoryColor || '#10B981' }}
                  >
                    {aqiDisplay}
                  </span>
                  <span className="text-xs font-semibold text-ink-muted dark:text-slate-400 telemetry-mono">
                    INDEX VALUE
                  </span>
                </div>

                <div className="flex items-center justify-between text-[11px] pt-2 border-t border-stone-200/50 dark:border-sky-500/10 text-ink-muted dark:text-slate-400">
                  <span>Primary: <strong className="text-ink-primary dark:text-white">PM2.5</strong></span>
                  <span className="telemetry-mono text-ink-faint dark:text-sky-300/60">
                    {relativeFreshness}
                  </span>
                </div>
              </div>

              {/* High-Impact Equivalence & Health Badges */}
              <div className="grid grid-cols-2 gap-2 mb-3.5 text-xs">
                {cigarettes !== null && (
                  <div className="p-2 rounded-xl bg-stone-100/80 dark:bg-black/40 border border-stone-200/60 dark:border-sky-500/15 flex items-center gap-2">
                    <Cigarette className="w-4 h-4 text-amber-500 flex-shrink-0" />
                    <div>
                      <span className="text-[10px] text-ink-muted dark:text-slate-400 uppercase telemetry-mono block">
                        Passive Smoke
                      </span>
                      <span className="font-bold text-ink-primary dark:text-white telemetry-mono">
                        ≈ {cigarettes.toFixed(1)} cigs/day
                      </span>
                    </div>
                  </div>
                )}
                {grapStage && (
                  <div className="p-2 rounded-xl bg-stone-100/80 dark:bg-black/40 border border-stone-200/60 dark:border-sky-500/15 flex items-center gap-2">
                    <Layers className="w-4 h-4 text-sky-400 flex-shrink-0" />
                    <div>
                      <span className="text-[10px] text-ink-muted dark:text-slate-400 uppercase telemetry-mono block">
                        Action Plan
                      </span>
                      <span className="font-bold text-ink-primary dark:text-white telemetry-mono">
                        {grapStage.stage !== 'Normal' ? grapStage.stage : 'Standard Baseline'}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Key Telemetry Pollutant Readout Matrix */}
              <div className="grid grid-cols-2 gap-2.5 mb-3.5">
                <TelemetryReadout
                  label="PM2.5"
                  value={metrics?.pm25}
                  unit="µg/m³"
                  provenance={hasGround ? 'official' : 'modeled'}
                  categoryLabel={activeGlobePoint?.categoryLabel}
                />
                <TelemetryReadout
                  label="PM10"
                  value={metrics?.pm10}
                  unit="µg/m³"
                  provenance={hasGround ? 'official' : 'modeled'}
                />
                <TelemetryReadout
                  label="WIND SPEED"
                  value={metrics?.windSpeed}
                  unit="km/h"
                  provenance="modeled"
                  uncertainty={1.2}
                />
                <TelemetryReadout
                  label="THERMAL INVERSION"
                  value={metrics?.isThermalInversionActive ? 'ACTIVE' : 'NORMAL'}
                  provenance="modeled"
                  categoryColor={metrics?.isThermalInversionActive ? 'rose' : 'emerald'}
                />
              </div>

              {/* Actionable Exposure Guidance Alert */}
              <div className="p-3.5 rounded-xl bg-sky-500/10 dark:bg-sky-950/40 border border-sky-500/25 flex items-start gap-3">
                <ShieldAlert className="w-5 h-5 text-sky-600 dark:text-sky-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <h5 className="text-xs font-bold text-ink-primary dark:text-white tracking-wide uppercase telemetry-mono">
                    Exposure Guidance
                  </h5>
                  <p className="text-xs text-ink-muted dark:text-slate-300 mt-0.5 leading-relaxed">
                    {metrics?.isThermalInversionActive
                      ? 'Thermal inversion trapping particulate smog. Avoid strenuous outdoor activities until afternoon dispersion.'
                      : 'Atmospheric boundary layer is open. Review optimal hourly exposure windows in your Daily Plan.'}
                  </p>
                  <button
                    type="button"
                    onClick={onOpenDailyPlan}
                    className="inline-flex items-center gap-1.5 mt-2 text-xs font-bold text-sky-600 dark:text-sky-400 hover:underline telemetry-mono cursor-pointer"
                  >
                    <span>Open Daily Plan Workspace</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Quick Scientific Modals Footer */}
              <div className="flex items-center justify-between pt-3 border-t border-stone-200/60 dark:border-sky-500/15 text-xs">
                <button
                  type="button"
                  onClick={onOpenMultiSource}
                  className="inline-flex items-center gap-1 text-ink-muted dark:text-sky-300/80 hover:text-ink-primary dark:hover:text-white telemetry-mono cursor-pointer"
                >
                  <Compass className="w-3.5 h-3.5 text-sky-500" />
                  <span>Source Inspector</span>
                </button>

                <button
                  type="button"
                  onClick={onOpenExplainer}
                  className="inline-flex items-center gap-1 text-ink-muted dark:text-sky-300/80 hover:text-ink-primary dark:hover:text-white telemetry-mono cursor-pointer"
                >
                  <Info className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Scientific Methodology</span>
                </button>

                <button
                  type="button"
                  onClick={onOpenShare}
                  className="inline-flex items-center gap-1 text-ink-muted dark:text-sky-300/80 hover:text-ink-primary dark:hover:text-white telemetry-mono cursor-pointer"
                >
                  <Share2 className="w-3.5 h-3.5 text-sky-400" />
                  <span>Share Bulletin</span>
                </button>
              </div>
            </HoloPanel>
          </div>
        </div>

        {/* Bottom Quick-Access Metro Selector Bar */}
        <div className="relative z-10 w-full p-4 sm:p-6 bg-gradient-to-t from-black/80 via-black/40 to-transparent pointer-events-auto">
          <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3 text-xs">
            {/* Quick Metro City Switcher */}
            <div className="flex items-center gap-1.5 overflow-x-auto py-1 no-scrollbar">
              <span className="text-[10px] font-bold text-slate-400 telemetry-mono uppercase tracking-wider mr-1 hidden sm:inline">
                METROS:
              </span>
              {PREDEFINED_INDIAN_CITIES.map((city) => {
                const isSelected = city.name.toLowerCase() === currentCity.name.toLowerCase();
                return (
                  <button
                    key={city.id}
                    type="button"
                    onClick={() => onSelectCity(city)}
                    className={`px-3 py-1.5 rounded-xl font-medium text-xs transition-all whitespace-nowrap cursor-pointer telemetry-mono ${
                      isSelected
                        ? 'bg-sky-500 text-black font-bold shadow-lg shadow-sky-500/30'
                        : 'bg-white/10 hover:bg-white/20 text-white/90 backdrop-blur-md border border-white/10'
                    }`}
                  >
                    {city.name}
                  </button>
                );
              })}
            </div>

            {/* Orbital Status Badge */}
            <div className="text-[10px] text-sky-300/60 telemetry-mono hidden md:flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>3D ORBITAL TELEMETRY // GL-ES 3.0</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
