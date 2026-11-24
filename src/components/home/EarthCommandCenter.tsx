'use client';

import React, { useState, useMemo } from 'react';
import {
  AtmosphericMetrics,
  HourlyAtmosphericPoint,
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
import { assessJurisdiction, resolveOfficialGrapStatus } from '@/services/advisories/grap-status-resolver';
import { isThermalInversion } from '@/domain/air-math';
import { formatTimeAgo, resolveTruthfulSourceLabel } from '@/domain/presentation-contract';
import { calculateComprehensiveCpcbNaqi } from '@/domain/cpcb-naqi';

export interface EarthCommandCenterProps {
  currentCity: GeocodedLocation;
  metrics: AtmosphericMetrics | null;
  isLoading: boolean;
  selectedTemporalPoint?: HourlyAtmosphericPoint | null;
  themeMode?: 'dark' | 'light';
  onSelectCity: (location: GeocodedLocation) => void;
  onRefreshTelemetry: () => void;
  onOpenExplainer: () => void;
  onOpenShare: () => void;
  onOpenMultiSource: () => void;
  onOpenDailyPlan: () => void;
  onSnapToNow?: () => void;
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
  selectedTemporalPoint,
  themeMode = 'dark',
  onSelectCity,
  onRefreshTelemetry,
  onOpenExplainer,
  onOpenShare,
  onOpenMultiSource,
  onOpenDailyPlan,
  onSnapToNow,
  className = '',
  initialDetailsOpen = false,
}: EarthCommandCenterProps) {
  const [standard, setStandard] = useState<AqiStandard>('cpcb');
  const [selectedGlobePointId, setSelectedGlobePointId] = useState<string | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(initialDetailsOpen);

  // Current live hour observation point from forecast registry if available
  const liveHour = useMemo(() => new Date().getHours(), []);
  const hourlyPoint = useMemo(() => {
    if (!metrics?.hourlyForecast || metrics.hourlyForecast.length === 0) return null;
    return metrics.hourlyForecast.find((h) => h.hour === liveHour) ?? null;
  }, [metrics?.hourlyForecast, liveHour]);

  // Active time point: explicitly selected point or default live point
  const isForecastSelected = Boolean(selectedTemporalPoint?.isForecast);
  const activeTimePoint = selectedTemporalPoint ?? hourlyPoint;

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
      // Deterministic integer ID from coordinates & name hash
      const latHash = Math.abs(Math.round(point.latitude * 1000));
      const lonHash = Math.abs(Math.round(point.longitude * 1000));
      const deterministicId = latHash * 10000 + (lonHash % 10000);

      onSelectCity({
        id: deterministicId,
        name: point.name,
        country: point.country,
        countryCode: point.countryCode,
        latitude: point.latitude,
        longitude: point.longitude,
      });
    }
  };

  // Strict Scientific Standard Separation:
  // CPCB NAQI and US EPA AQI values preserved without cross-contamination.
  // Data reflects the active dashboard city (currentCity), never an inspected marker of another city!
  const aqiValue = useMemo(() => {
    if (isForecastSelected && activeTimePoint) {
      if (standard === 'epa') {
        return activeTimePoint.usAqi ?? null;
      }
      // CPCB NAQI does not publish official statutory forecasts.
      // If modeled PM2.5/PM10 forecast exists, calculate indicative sub-index honestly:
      if (activeTimePoint.pm25 !== null && activeTimePoint.pm25 !== undefined) {
        const cpcbRes = calculateComprehensiveCpcbNaqi({
          pm25: activeTimePoint.pm25,
          pm10: activeTimePoint.pm10 ?? null,
        });
        return cpcbRes.aqi;
      }
      return null;
    }

    if (standard === 'cpcb') {
      return metrics?.cpcbAqi ?? null;
    }
    return metrics?.usAqi ?? null;
  }, [isForecastSelected, activeTimePoint, standard, metrics]);

  const hasOfficialGround = Boolean(
    metrics?.groundStation &&
    metrics.groundStation.pm25 !== null &&
    metrics.groundStation.stationState !== 'registry_only' &&
    metrics.groundStation.stationState !== 'measurement_unavailable'
  );

  // Truthful Provenance & Source Labeling (Part 1.3)
  const sourceInfo = useMemo(() => {
    return resolveTruthfulSourceLabel({
      isForecast: isForecastSelected,
      hasOfficialGround,
      groundStationProvider: metrics?.groundStation?.provider,
      isCached: metrics?.cacheMetadata?.isCached,
      isLive: metrics?.isLive,
      status: metrics?.status,
    });
  }, [isForecastSelected, hasOfficialGround, metrics]);

  // Honest freshness state: never display "Live" when timestamp is absent
  const relativeFreshness = useMemo(() => {
    if (isForecastSelected && activeTimePoint) {
      const timeStr = activeTimePoint.localDisplayTime || `${activeTimePoint.hour.toString().padStart(2, '0')}:00`;
      return `Forecast for ${timeStr}`;
    }
    if (!metrics?.timestamp) return 'Awaiting Telemetry';
    return metrics.isLive
      ? (formatTimeAgo(metrics.timestamp) || 'Just now')
      : `Cached (${formatTimeAgo(metrics.timestamp) || 'Recent'})`;
  }, [isForecastSelected, activeTimePoint, metrics]);

  // Scientific Thermal Inversion calculation for the active hour
  const isHourlyInversion = useMemo(() => {
    if (activeTimePoint?.boundaryLayerHeight !== null && activeTimePoint?.boundaryLayerHeight !== undefined) {
      return isThermalInversion(activeTimePoint.boundaryLayerHeight, activeTimePoint.hour);
    }
    return Boolean(metrics?.isThermalInversionActive);
  }, [activeTimePoint, metrics?.isThermalInversionActive]);

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
      <div className="relative">
        <MissionHeader
          cityName={currentCity.name}
          latitude={currentCity.latitude}
          longitude={currentCity.longitude}
          elevationMeters={elevation}
          stationName={isForecastSelected ? `${sourceInfo.label} [DIURNAL FORECAST: ${activeTimePoint?.localDisplayTime || `${activeTimePoint?.hour}:00`}]` : sourceInfo.label}
          hasOfficialGround={hasOfficialGround}
          standard={standard}
          onToggleStandard={toggleStandard}
        />
        {isForecastSelected && onSnapToNow && (
          <div className="absolute right-4 top-1/2 -translate-y-1/2 z-20 hidden md:block">
            <button
              type="button"
              onClick={onSnapToNow}
              className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 border border-emerald-500/30 transition-colors cursor-pointer"
              title="Snap back to current live observation hour"
            >
              SNAP TO NOW
            </button>
          </div>
        )}
      </div>

      {/* 2. Panoramic Atmospheric Earth Command Center (70-80% globe-first viewport) */}
      <div className="relative w-full min-h-[600px] lg:min-h-[720px] overflow-hidden flex flex-col justify-between">
        {/* Full-Bleed 3D Earth Globe Canvas Background */}
        <div className="absolute inset-0 w-full h-full z-0">
          <AvirGlobe
            points={points}
            selectedPointId={selectedGlobePointId || activeGlobePoint?.id}
            activeCityName={currentCity.name}
            onSelectPoint={handleGlobeSelectPoint}
            onSetActiveCity={handleGlobeSetActiveCity}
            standard={standard}
            onToggleStandard={toggleStandard}
            themeMode={themeMode}
            validAtUtc={activeTimePoint?.validAtUtc || metrics?.timestamp}
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
              primaryPollutant={metrics?.primaryPollutant || 'PM2.5'}
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
          selectedTemporalPoint={activeTimePoint}
          standard={standard}
          onToggleStandard={toggleStandard}
          onOpenDailyPlan={onOpenDailyPlan}
          onOpenMultiSource={onOpenMultiSource}
          onOpenExplainer={onOpenExplainer}
          grapStage={grapStage}
          isOfficialGround={hasOfficialGround}
          isThermalInversion={isHourlyInversion}
        />

        {/* Bottom Quick-Access Metro Selector Bar */}
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
