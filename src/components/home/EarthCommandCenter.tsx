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
import { MissionHeader } from '@/components/ui/futuristic';
import { CompactCityCard } from './CompactCityCard';
import { EnvironmentalDetailsDrawer } from './EnvironmentalDetailsDrawer';
import {
  Sun,
  RotateCcw,
} from 'lucide-react';
import { assessJurisdiction, resolveOfficialGrapStatus } from '@/services/advisories/grap-status-resolver';
import { isThermalInversion } from '@/domain/air-math';
import { formatTimeAgo, resolveTruthfulSourceLabel } from '@/domain/presentation-contract';
import { calculateComprehensiveCpcbNaqi } from '@/domain/cpcb-naqi';

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
  initialDetailsOpen?: boolean;
}

const VERIFIED_CITY_ELEVATIONS: Record<string, number> = {
  'delhi': 216,
  'delhi-ncr': 216,
  'new delhi': 216,
  'mumbai': 14,
  'bengaluru': 920,
  'kolkata': 9,
  'patna': 53,
  'lucknow': 123,
  'kanpur': 126,
  'varanasi': 81,
  'lahore': 217,
  'beijing': 43,
};

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
  initialDetailsOpen = false,
}: EarthCommandCenterProps) {
  const [standard, setStandard] = useState<AqiStandard>('cpcb');
  const [selectedGlobePointId, setSelectedGlobePointId] = useState<string | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(initialDetailsOpen);

  // 24-hour Diurnal Scrubber state (defaults to current live hour)
  const liveHour = useMemo(() => new Date().getHours(), []);
  const [selectedHour, setSelectedHour] = useState<number>(liveHour);

  // Look up hourly forecast slice for selected diurnal hour
  const hourlyPoint = useMemo(() => {
    if (!metrics?.hourlyForecast || metrics.hourlyForecast.length === 0) return null;
    return metrics.hourlyForecast.find((h) => h.hour === selectedHour) ?? null;
  }, [metrics?.hourlyForecast, selectedHour]);

  // Build reactive geographic observation points from current telemetry & world registries
  const points = useMemo(() => {
    return buildGeographicObservations({
      standard,
      currentMetrics: metrics,
      currentLocation: currentCity,
    });
  }, [standard, metrics, currentCity]);

  // Synchronize active city as the selected globe marker point with strict ID priority
  const activeGlobePoint = useMemo(() => {
    if (selectedGlobePointId) {
      const found = points.find((p) => p.id === selectedGlobePointId);
      if (found) return found;
    }
    return (
      points.find(
        (p) => p.name.toLowerCase() === currentCity.name.toLowerCase()
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

  const isFutureHour = selectedHour !== liveHour;

  // Strict Scientific Standard Separation & Future Hour Forecast Integrity (Part 1.1, 1.2, 5.2):
  // Never silently reuse the current CPCB measurement for future forecast hours!
  const aqiValue = useMemo(() => {
    if (isFutureHour) {
      if (standard === 'epa') {
        return hourlyPoint?.usAqi ?? null;
      }
      // CPCB NAQI does not publish official statutory forecasts.
      // If modeled PM2.5/PM10 forecast exists, calculate indicative sub-index honestly:
      if (hourlyPoint?.pm25 !== null && hourlyPoint?.pm25 !== undefined) {
        const cpcbRes = calculateComprehensiveCpcbNaqi({
          pm25: hourlyPoint.pm25,
          pm10: hourlyPoint.pm10 ?? null,
        });
        return cpcbRes.aqi;
      }
      return null;
    }

    // Current observation / present hour
    if (standard === 'cpcb') {
      return activeGlobePoint?.cpcbAqi ?? null;
    }
    return activeGlobePoint?.usAqi ?? metrics?.usAqi ?? null;
  }, [isFutureHour, standard, activeGlobePoint, hourlyPoint, metrics]);

  const hasOfficialGround = Boolean(
    metrics?.groundStation &&
    metrics.groundStation.pm25 !== null &&
    metrics.groundStation.stationState !== 'registry_only' &&
    metrics.groundStation.stationState !== 'measurement_unavailable'
  );

  // Truthful Provenance & Source Labeling (Part 1.3)
  const sourceInfo = useMemo(() => {
    return resolveTruthfulSourceLabel({
      isForecast: isFutureHour,
      hasOfficialGround,
      groundStationProvider: metrics?.groundStation?.provider,
      isCached: metrics?.cacheMetadata?.isCached,
      isLive: metrics?.isLive,
      status: metrics?.status,
    });
  }, [isFutureHour, hasOfficialGround, metrics]);

  // Honest freshness state: never display "Live" when timestamp is absent
  const relativeFreshness = useMemo(() => {
    if (isFutureHour) {
      const timeStr = hourlyPoint?.localDisplayTime || `${selectedHour.toString().padStart(2, '0')}:00`;
      return `Forecast for ${timeStr}`;
    }
    if (!metrics?.timestamp) return 'Awaiting Telemetry';
    return metrics.isLive
      ? (formatTimeAgo(metrics.timestamp) || 'Just now')
      : `Cached (${formatTimeAgo(metrics.timestamp) || 'Recent'})`;
  }, [isFutureHour, hourlyPoint, selectedHour, metrics]);

  // Scientific Thermal Inversion calculation for the active hour
  const isHourlyInversion = useMemo(() => {
    if (hourlyPoint) {
      return isThermalInversion(hourlyPoint.boundaryLayerHeight, hourlyPoint.hour);
    }
    return Boolean(metrics?.isThermalInversionActive);
  }, [hourlyPoint, metrics?.isThermalInversionActive]);

  // Authoritative statutory CAQM GRAP stage resolution with NCR jurisdiction enforcement
  const grapStage = useMemo(() => {
    const jurisdiction = assessJurisdiction({
      cityName: currentCity.name,
      latitude: currentCity.latitude,
      longitude: currentCity.longitude,
      admin1: currentCity.admin1,
    });

    if (!jurisdiction.isNcr) {
      return {
        stage: null,
        label: 'Non-NCR Region',
        isJurisdiction: false,
      };
    }

    const resolved = resolveOfficialGrapStatus(undefined, {
      cityName: currentCity.name,
      latitude: currentCity.latitude,
      longitude: currentCity.longitude,
      admin1: currentCity.admin1,
    });

    const stage = resolved.highestActiveStage;
    const displayLabel =
      stage === 4
        ? 'Stage IV (Severe+)'
        : stage === 3
        ? 'Stage III (Severe)'
        : stage === 2
        ? 'Stage II (Very Poor)'
        : stage === 1
        ? 'Stage I (Poor)'
        : 'Normal Baseline';

    return {
      stage,
      label: displayLabel,
      isJurisdiction: true,
    };
  }, [currentCity]);

  // Verified city elevation lookup
  const elevation = VERIFIED_CITY_ELEVATIONS[currentCity.name.toLowerCase()] ?? undefined;

  // Category label and color with strict standard awareness
  const categoryInfo = useMemo(() => {
    if (standard === 'cpcb' && aqiValue === null) {
      return {
        label: 'CPCB Unavailable',
        color: '#64748B',
      };
    }
    return {
      label: activeGlobePoint?.categoryLabel || 'Validated',
      color: activeGlobePoint?.categoryColor || '#10B981',
    };
  }, [standard, aqiValue, activeGlobePoint]);

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
        elevationMeters={elevation}
        stationName={sourceInfo.label}
        hasOfficialGround={hasOfficialGround}
        standard={standard}
        onToggleStandard={toggleStandard}
      />

      {/* 2. Panoramic Atmospheric Earth Command Center (70-80% globe-first viewport) */}
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
            selectedHour={selectedHour}
            validAtUtc={hourlyPoint?.validAtUtc || metrics?.timestamp}
            className="w-full h-full !rounded-none !border-none !shadow-none !bg-transparent"
          />
        </div>

        {/* Foreground Floating Controls Layer (unobtrusive, allows 80% globe visibility) */}
        <div className="relative z-10 w-full p-4 sm:p-6 flex justify-between items-start pointer-events-none">
          {/* Top-Left Compact Floating City Card (Part 2.3) */}
          <div className="pointer-events-auto">
            <CompactCityCard
              cityName={currentCity.name}
              admin1={currentCity.admin1}
              country={currentCity.country}
              aqiValue={aqiValue}
              categoryLabel={categoryInfo.label}
              categoryColor={categoryInfo.color}
              primaryPollutant={activeGlobePoint?.primaryPollutant || 'PM2.5'}
              standard={standard}
              onToggleStandard={toggleStandard}
              provenanceLabel={sourceInfo.shortLabel}
              isOfficialGround={hasOfficialGround}
              freshnessLabel={relativeFreshness}
              onOpenDetails={() => setIsDetailsOpen(true)}
              onRefresh={onRefreshTelemetry}
              isLoading={isLoading}
            />
          </div>
        </div>

        {/* Slide-out Environmental Details Drawer (Part 2.2) */}
        <EnvironmentalDetailsDrawer
          isOpen={isDetailsOpen}
          onClose={() => setIsDetailsOpen(false)}
          city={currentCity}
          metrics={metrics}
          standard={standard}
          onToggleStandard={toggleStandard}
          onOpenDailyPlan={onOpenDailyPlan}
          onOpenMultiSource={onOpenMultiSource}
          onOpenExplainer={onOpenExplainer}
          grapStage={grapStage}
          isOfficialGround={hasOfficialGround}
          isThermalInversion={isHourlyInversion}
        />

        {/* 3. Interactive 24-Hour Diurnal Time Scrubber Bar (Part 5) */}
        <div className="relative z-10 w-full px-4 sm:px-6 py-2.5 bg-black/80 backdrop-blur-xl border-t border-b border-white/10 pointer-events-auto">
          <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-3 text-xs">
            {/* Scrubber Label & Active Hour */}
            <div className="flex items-center gap-2.5 text-slate-300 telemetry-mono">
              <Sun className="w-4 h-4 text-amber-400 animate-spin-slow" />
              <span className="font-bold text-white uppercase tracking-wider text-[11px]">
                DIURNAL TIMELINE
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-sky-500/20 text-sky-300 border border-sky-500/30">
                {hourlyPoint?.localDisplayTime || `${selectedHour.toString().padStart(2, '0')}:00`}
              </span>
              {isFutureHour && (
                <span className="text-[10px] uppercase font-bold text-sky-400 telemetry-mono">
                  [FORECAST]
                </span>
              )}
              {selectedHour !== liveHour && (
                <button
                  type="button"
                  onClick={() => setSelectedHour(liveHour)}
                  className="flex items-center gap-1 px-2.5 py-0.5 rounded text-[11px] font-bold bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 border border-emerald-500/30 transition-colors cursor-pointer"
                  title="Snap back to current live observation hour"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>NOW</span>
                </button>
              )}
            </div>

            {/* Scrubber Interactive Range Slider */}
            <div className="w-full md:w-[480px] flex items-center gap-3">
              <span className="text-[10px] text-slate-400 telemetry-mono">00:00</span>
              <input
                type="range"
                min={0}
                max={23}
                step={1}
                value={selectedHour}
                onChange={(e) => setSelectedHour(Number(e.target.value))}
                className="w-full h-2 bg-slate-700/80 rounded-lg appearance-none cursor-pointer accent-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/50"
                aria-label="24-hour diurnal sunlight and atmospheric forecast scrubber"
              />
              <span className="text-[10px] text-slate-400 telemetry-mono">23:00</span>
            </div>

            {/* Real-time Planetary Atmospheric Indicators */}
            <div className="flex items-center gap-2 text-[11px] telemetry-mono">
              <span className="text-slate-400">MIXING DEPTH:</span>
              <span className="text-white font-bold">
                {hourlyPoint?.boundaryLayerHeight !== null && hourlyPoint?.boundaryLayerHeight !== undefined
                  ? `${Math.round(hourlyPoint.boundaryLayerHeight)}m`
                  : 'Modeled'}
              </span>
              <span
                className={`px-2.5 py-0.5 rounded text-[10px] font-bold ${
                  hourlyPoint?.isSafeVentingWindow
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    : isHourlyInversion
                    ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                    : 'bg-slate-700/50 text-slate-300'
                }`}
              >
                {hourlyPoint?.isSafeVentingWindow
                  ? 'VENTING OPEN'
                  : isHourlyInversion
                  ? 'INVERSION TRAP'
                  : 'EQUILIBRIUM'}
              </span>
            </div>
          </div>
        </div>

        {/* 4. Bottom Quick-Access Metro Selector Bar */}
        <div className="relative z-10 w-full p-4 sm:p-5 bg-gradient-to-t from-black/90 via-black/50 to-transparent pointer-events-auto">
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
                    onClick={() => {
                      onSelectCity(city);
                      setSelectedGlobePointId(null);
                    }}
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
