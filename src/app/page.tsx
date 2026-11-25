'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { TopNav } from '@/components/TopNav';
import { MetroRail } from '@/components/MetroRail';
import { AtmosphereHero } from '@/components/AtmosphereHero';
import { SegmentedTabs, ActiveTabId } from '@/components/SegmentedTabs';
import { CityPicker } from '@/components/CityPicker';
import { FamilyProfileForm } from '@/components/FamilyProfileForm';
import { RoutineBuilder } from '@/components/RoutineBuilder';
import { RoutineShifter } from '@/components/RoutineShifter';
import dynamic from 'next/dynamic';
import { ImpactScorecard } from '@/components/ImpactScorecard';
import { DiurnalForecastTimeline } from '@/components/DiurnalForecastTimeline';
import { CityShootout } from '@/components/CityShootout';
import { CommuteCalculator } from '@/components/CommuteCalculator';
import { FilterLifespanEstimator } from '@/components/FilterLifespanEstimator';
import { WindVectorGauge } from '@/components/WindVectorGauge';
import { WindDispersionVisualizer } from '@/components/WindDispersionVisualizer';
import { SchoolSafetyAdvisoryModal } from '@/components/SchoolSafetyAdvisoryModal';
import { ShareBulletinModal } from '@/components/ShareBulletinModal';
import { SettingsModal } from '@/components/SettingsModal';
import { RwaBulletinModal } from '@/components/RwaBulletinModal';
import { ScienceExplainerModal } from '@/components/ScienceExplainerModal';
import { MultiSourceInspectorModal } from '@/components/MultiSourceInspectorModal';
import { VerifiedAdvisoryPanel } from '@/components/VerifiedAdvisoryPanel';
import { ActionDecisionCard } from '@/components/ui/ActionDecisionCard';
import { resolveOfficialGrapStatus } from '@/services/advisories/grap-status-resolver';
import { RequestCoordinator } from '@/lib/async/request-coordinator';
import {
  AtmosphericMetrics,
  UserVulnerabilityProfile,
  RecommendationPlan,
  HourlyAtmosphericPoint,
  LocationSelectionSource,
} from '@/domain/types';
import { getAQICategory } from '@/domain/air-math';
import {
  fetchLiveAtmosphericMetrics,
  GeocodedLocation,
  PREDEFINED_INDIAN_CITIES,
} from '@/services/telemetry-service';
import {
  generateAirQualityPlan,
  deriveSelectedCurrentMeasurement,
  buildMetricsViewForCurrentSource,
  prepareCurrentSourcePlanInput,
} from '@/services/ai-assistant-service';
import { sanitizeUserHealthContext } from '@/services/ai/plan-validator';
import { loadScheduleFromStorage } from '@/services/routines/routine-storage';
import { DeterministicPlanResult, AiPlanExplanation } from '@/domain/planning-types';
import { DailySchedule } from '@/domain/routine-types';
import { FloatingDock } from '@/components/ui/futuristic';
import { FirstVisitLocationModal } from '@/components/location/FirstVisitLocationModal';
import { SourcePreference } from '@/services/source-control/source-control-types';
import {
  DEFAULT_SOURCE_PREFERENCE,
  loadSourcePreference,
  saveSourcePreference,
} from '@/services/source-control/source-preferences';
import { resolveSource } from '@/services/source-control/source-resolution';

const EarthCommandCenter = dynamic(
  () => import('@/components/home/EarthCommandCenter').then((module) => module.EarthCommandCenter),
  { ssr: false }
);
const IAQStudio = dynamic(() => import('@/components/IAQStudio').then(module => module.IAQStudio));
const WorldDataExplorer = dynamic(() => import('@/components/WorldDataExplorer').then(module => module.WorldDataExplorer));

export default function Home() {
  const [selectedCity, setSelectedCity] = useState<GeocodedLocation>(PREDEFINED_INDIAN_CITIES[0]);
  const [metrics, setMetrics] = useState<AtmosphericMetrics | null>(null);
  const [selectedTemporalPoint, setSelectedTemporalPoint] = useState<HourlyAtmosphericPoint | null>(null);
  const [isTelemetryLoading, setIsTelemetryLoading] = useState(true);
  const [isPlanGenerating, setIsPlanGenerating] = useState(false);
  const [plannerMessage, setPlannerMessage] = useState('');
  const [activeTab, setActiveTab] = useState<ActiveTabId>('overview');

  // User Profile State (Neutral un-opinionated default baseline)
  const [profile, setProfile] = useState<UserVulnerabilityProfile>({
    ageGroup: 'adult',
    hasAsthmaOrRespiratory: false,
    hasCardiovascularCondition: false,
    isPregnant: false,
    isOutdoorWorker: false,
  });
  const [roomSizeSqFt, setRoomSizeSqFt] = useState(200);
  const [customRoutine, setCustomRoutine] = useState('06:30 AM Morning Jog & Daily Commute');

  // Plan State
  const [plan, setPlan] = useState<RecommendationPlan | null>(null);
  const [deterministicPlan, setDeterministicPlan] = useState<DeterministicPlanResult | null>(null);
  const [aiExplanation, setAiExplanation] = useState<AiPlanExplanation | null>(null);
  const planGenIdRef = React.useRef(0);

  // Modals State
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isRwaModalOpen, setIsRwaModalOpen] = useState(false);
  const [isExplainerOpen, setIsExplainerOpen] = useState(false);
  const [isSchoolModalOpen, setIsSchoolModalOpen] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isMultiSourceModalOpen, setIsMultiSourceModalOpen] = useState(false);
  const [isFirstVisitModalOpen, setIsFirstVisitModalOpen] = useState(false);
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [sourcePreference, setSourcePreference] = useState<SourcePreference>(DEFAULT_SOURCE_PREFERENCE);
  const [isPreferencesHydrated, setIsPreferencesHydrated] = useState(false);
  const sourcePreferenceRef = useRef<SourcePreference>(DEFAULT_SOURCE_PREFERENCE);
  const latestMetricsRef = useRef<AtmosphericMetrics | null>(null);
  const activeManualPlanGenRef = useRef(0);

  // Authoritative resolved current source derived at page boundary (Fix A)
  const selectedCurrentSource = useMemo(() => {
    return resolveSource(sourcePreference, metrics, 'cpcb');
  }, [sourcePreference, metrics]);

  // Unified memoized current-measurement adapter preventing standard cross-copying or silent fallbacks (Fix A)
  const currentSourceMeasurement = useMemo(() => {
    return deriveSelectedCurrentMeasurement(selectedCurrentSource, metrics);
  }, [selectedCurrentSource, metrics]);

  // Shallow, non-mutating metrics view for current-source components & modals (Fix A, Fix F)
  const currentSourceMetricsView = useMemo(() => {
    return buildMetricsViewForCurrentSource(metrics, currentSourceMeasurement);
  }, [metrics, currentSourceMeasurement]);

  // Restore persisted preferences on client mount before telemetry planning executes (Fix B, UX29)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const restoredPref = loadSourcePreference();
        sourcePreferenceRef.current = restoredPref;
        setSourcePreference(restoredPref);

        const savedTheme = localStorage.getItem('avir_theme_mode_v1');
        if (savedTheme === 'light') {
          setIsDarkMode(false);
        } else if (savedTheme === 'dark') {
          setIsDarkMode(true);
        } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
          setIsDarkMode(false);
        }

        const hasOnboarded = localStorage.getItem('avir_location_onboarded_v1');
        const savedCityJson = localStorage.getItem('avir_selected_city_v1');
        if (savedCityJson) {
          const parsed = JSON.parse(savedCityJson);
          if (parsed && typeof parsed.name === 'string' && typeof parsed.latitude === 'number' && typeof parsed.longitude === 'number') {
            setSelectedCity(parsed);
          }
        } else if (!hasOnboarded) {
          setIsFirstVisitModalOpen(true);
        }
      } catch (e) {
        console.warn('Failed to load user preferences from localStorage:', e);
      } finally {
        setIsPreferencesHydrated(true);
      }
    } else {
      setIsPreferencesHydrated(true);
    }
  }, []);

  // Sync dark class on root document element and persist preference
  useEffect(() => {
    if (typeof document !== 'undefined') {
      if (isDarkMode) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
      try {
        localStorage.setItem('avir_theme_mode_v1', isDarkMode ? 'dark' : 'light');
      } catch (e) {}
    }
  }, [isDarkMode]);

  // Coordinated request manager preventing race conditions and stale response leaks
  const coordinatorRef = useRef<RequestCoordinator>(new RequestCoordinator());

  // Shared source-aware plan generation pipeline reused across initial load, refresh, manual submit, and source switches
  const generateCoordinatedPlan = async (
    telemetry: AtmosphericMetrics,
    preference: SourcePreference,
    options?: {
      switchToRoutineTab?: boolean;
      trackLoading?: boolean;
      isMountedCheck?: () => boolean;
    }
  ) => {
    const isStillMounted = options?.isMountedCheck ?? (() => true);

    if (telemetry.status === 'error') {
      if (isStillMounted()) setPlan(null);
      return;
    }

    const { currentMeasurement, planRequest } = prepareCurrentSourcePlanInput({
      city: selectedCity.name,
      metrics: telemetry,
      preference,
      profile,
      roomSizeSqFt,
      customRoutine,
      geminiApiKey,
    });

    if (
      !currentMeasurement.isAvailable ||
      currentMeasurement.pm25 === null ||
      currentMeasurement.usAqi === null
    ) {
      coordinatorRef.current.invalidatePendingPlans();
      if (isStillMounted()) {
        setPlan(null);
      }
      return;
    }

    let manualGenId = activeManualPlanGenRef.current;
    if (options?.trackLoading) {
      manualGenId = ++activeManualPlanGenRef.current;
      setIsPlanGenerating(true);
    }

    const planCtx = coordinatorRef.current.beginPlanRequest({
      cityName: selectedCity.name,
      metricsTimestamp: telemetry.timestamp,
      usAqi: currentMeasurement.usAqi,
      pm25: currentMeasurement.pm25,
      profileId: `${profile.ageGroup}:${profile.hasAsthmaOrRespiratory ? 'resp' : 'norm'}:${profile.hasCardiovascularCondition ? 'cardio' : 'nocardio'}:${profile.isPregnant ? 'preg' : 'nopreg'}:${profile.isOutdoorWorker ? 'outdoor' : 'indoor'}|src:${preference.mode}:${currentMeasurement.sourceId ?? 'none'}:${Boolean(preference.allowFallbackToModel)}`,
      ageGroup: profile.ageGroup,
      hasAsthmaOrRespiratory: profile.hasAsthmaOrRespiratory,
      hasCardiovascularCondition: profile.hasCardiovascularCondition,
      isPregnant: profile.isPregnant,
      isOutdoorWorker: profile.isOutdoorWorker,
      roomSizeSqFt,
      customRoutine,
    });

    try {
      const updatedPlan = await generateAirQualityPlan(planRequest);
      if (isStillMounted() && coordinatorRef.current.isPlanResponseValid(planCtx)) {
        setPlan(updatedPlan);
        if (options?.switchToRoutineTab) {
          setActiveTab('routine');
        }
      }
    } catch (err) {
      console.error('Plan generation failed:', err);
    } finally {
      if (options?.trackLoading && isStillMounted() && activeManualPlanGenRef.current === manualGenId) {
        setIsPlanGenerating(false);
      }
    }
  };

  // Load telemetry when city changes (after preference hydration) with RequestCoordinator protection (Fix B)
  useEffect(() => {
    if (!isPreferencesHydrated) return;

    let isMounted = true;
    const ctx = coordinatorRef.current.beginTelemetryRequest(
      selectedCity.latitude,
      selectedCity.longitude,
      selectedCity.name
    );

    async function loadTelemetry() {
      setIsTelemetryLoading(true);
      try {
        const data = await fetchLiveAtmosphericMetrics(
          selectedCity.latitude,
          selectedCity.longitude,
          { signal: ctx.signal, cityName: selectedCity.name }
        );

        if (!isMounted || !coordinatorRef.current.isTelemetryResponseValid(ctx)) {
          return;
        }

        latestMetricsRef.current = data;
        setMetrics(data);

        await generateCoordinatedPlan(data, sourcePreferenceRef.current, {
          isMountedCheck: () => isMounted,
        });
      } catch (err: any) {
        if (err?.name !== 'AbortError') {
          console.error('Failed to load telemetry:', err);
        }
      } finally {
        if (isMounted && coordinatorRef.current.isTelemetryResponseValid(ctx)) {
          setIsTelemetryLoading(false);
        }
      }
    }

    loadTelemetry();
    return () => {
      isMounted = false;
      coordinatorRef.current.abortAll();
    };
  }, [selectedCity, isPreferencesHydrated]);

  // Handle city selection with clean transition and strict privacy-conscious persistence (Fix G)
  const handleCitySelect = (
    loc: GeocodedLocation,
    source: LocationSelectionSource = 'manual_predefined'
  ) => {
    if (loc.id === selectedCity.id && loc.name === selectedCity.name) return;

    // Privacy Policy: Only persist manual selections and explicit preferences.
    // Ephemeral GPS-detected coordinates remain in-memory for the current session only.
    if (source === 'manual_predefined' || source === 'manual_search' || source === 'saved_preference') {
      try {
        localStorage.setItem('avir_selected_city_v1', JSON.stringify(loc));
      } catch (e) {
        console.warn('Failed to persist selected city preference:', e);
      }
    }

    planGenIdRef.current += 1;
    activeManualPlanGenRef.current += 1;
    coordinatorRef.current.invalidatePendingPlans();
    setIsPlanGenerating(false);
    setPlannerMessage('');
    setIsTelemetryLoading(true);
    setSelectedTemporalPoint(null); // Reset temporal scrubber to live observation on city change
    latestMetricsRef.current = null;
    setMetrics(null); // Clear stale city metrics immediately
    setPlan(null); // Clear stale previous city plan immediately
    setDeterministicPlan(null);
    setAiExplanation(null);
    setSelectedCity(loc);
  };

  // Switch active environmental source while invalidating in-flight plans and preserving forecasts/telemetry (Fix G)
  const handleUpdateSourcePreference = (pref: SourcePreference) => {
    sourcePreferenceRef.current = pref;
    setSourcePreference(pref);
    saveSourcePreference(pref);
    coordinatorRef.current.invalidatePendingPlans();
    setPlan(null);

    const activeMetrics = latestMetricsRef.current;
    if (activeMetrics && activeMetrics.status !== 'error') {
      void generateCoordinatedPlan(activeMetrics, pref);
    }
  };

  // Handle manual live telemetry refresh & dependent plan recalculation with generation protection (Fix C)
  const refreshTelemetry = async () => {
    setIsTelemetryLoading(true);
    const ctx = coordinatorRef.current.beginTelemetryRequest(
      selectedCity.latitude,
      selectedCity.longitude,
      selectedCity.name
    );

    try {
      const data = await fetchLiveAtmosphericMetrics(
        selectedCity.latitude,
        selectedCity.longitude,
        { forceRefresh: true, cityName: selectedCity.name, signal: ctx.signal }
      );

      if (!coordinatorRef.current.isTelemetryResponseValid(ctx)) return;

      latestMetricsRef.current = data;
      setMetrics(data);
      await generateCoordinatedPlan(data, sourcePreferenceRef.current);
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        console.error('Failed to reload telemetry:', err);
      }
    } finally {
      if (coordinatorRef.current.isTelemetryResponseValid(ctx)) {
        setIsTelemetryLoading(false);
      }
    }
  };

  // Handle manual plan regeneration with generation protection (Fix D)
  const handleGeneratePlan = async () => {
    const activeMetrics = metrics ?? latestMetricsRef.current;
    if (!activeMetrics || activeMetrics.status === 'error') return;

    await generateCoordinatedPlan(activeMetrics, sourcePreferenceRef.current, {
      switchToRoutineTab: true,
      trackLoading: true,
    });
  };

  const aqiCategory =
    currentSourceMeasurement.isAvailable && currentSourceMeasurement.usAqi !== null
      ? getAQICategory(currentSourceMeasurement.usAqi)
      : 'Unavailable';

  const officialGrapStatus = resolveOfficialGrapStatus(undefined, {
    cityName: selectedCity.name,
    admin1: selectedCity.admin1,
    countryCode: selectedCity.countryCode,
    latitude: selectedCity.latitude,
    longitude: selectedCity.longitude,
  });

  const reductionPercentage =
    plan?.impactMetrics?.totalInhaledBaselineUg !== null &&
    plan?.impactMetrics?.totalInhaledBaselineUg !== undefined &&
    plan?.impactMetrics?.totalInhaledOptimizedUg !== null &&
    plan?.impactMetrics?.totalInhaledOptimizedUg !== undefined &&
    plan.impactMetrics.totalInhaledBaselineUg > 0
      ? Math.round(
          ((plan.impactMetrics.totalInhaledBaselineUg - plan.impactMetrics.totalInhaledOptimizedUg) /
            plan.impactMetrics.totalInhaledBaselineUg) *
            100
        )
      : undefined;

  return (
    <div className="flex-1 flex flex-col min-h-screen bg-stone-100 dark:bg-black text-ink dark:text-white transition-colors duration-200 selection:bg-emerald-500 selection:text-black">
      <TopNav
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenExplainer={() => setIsExplainerOpen(true)}
        onOpenRwa={() => setIsRwaModalOpen(true)}
        onOpenWorldData={() => setActiveTab('world')}
        onOpenSchoolAdvisory={() => setIsSchoolModalOpen(true)}
        onOpenShare={() => setIsShareModalOpen(true)}
        onOpenMultiSource={() => setIsMultiSourceModalOpen(true)}
        hasCustomKey={Boolean(geminiApiKey)}
        isDarkMode={isDarkMode}
        onToggleTheme={() => setIsDarkMode(!isDarkMode)}
      />

      <main id="main-content" className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6 sm:space-y-8 pb-safe">
        {/* Screen Reader Live Status Region (WCAG 4.1.3 Status Messages) */}
        <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
          {isTelemetryLoading
            ? `Loading live air quality measurements for ${selectedCity.name}...`
            : metrics?.status === 'error'
            ? `Telemetry error: ${metrics.errorMessage || 'Live sensor data currently unavailable.'}`
            : metrics
            ? !currentSourceMeasurement.isAvailable
              ? `Air quality data updated for ${selectedCity.name}. Source: ${currentSourceMeasurement.sourceName}. Current measurements unavailable without silent fallback.`
              : `Air quality data updated for ${selectedCity.name}. Source: ${currentSourceMeasurement.sourceName}. CPCB NAQI: ${currentSourceMeasurement.cpcbAqi ?? 'unavailable'}, US EPA AQI: ${currentSourceMeasurement.usAqi ?? 'unavailable'}, PM2.5: ${currentSourceMeasurement.pm25 ?? 'unavailable'} micrograms per cubic meter.`
            : `Selected city: ${selectedCity.name}.`}
        </div>

        {/* Flagship Futuristic 3D Earth Environmental Intelligence Command Center */}
        <EarthCommandCenter
          currentCity={selectedCity}
          metrics={metrics}
          isLoading={isTelemetryLoading}
          selectedTemporalPoint={selectedTemporalPoint}
          themeMode={isDarkMode ? 'dark' : 'light'}
          onSelectCity={handleCitySelect}
          onRefreshTelemetry={refreshTelemetry}
          onOpenExplainer={() => setIsExplainerOpen(true)}
          onOpenShare={() => setIsShareModalOpen(true)}
          onOpenMultiSource={() => setIsMultiSourceModalOpen(true)}
          onOpenDailyPlan={() => setActiveTab('routine')}
          onSnapToNow={() => setSelectedTemporalPoint(null)}
          sourcePreference={sourcePreference}
          onUpdateSourcePreference={handleUpdateSourcePreference}
        />

        {/* Action-First Quick Health & Activity Decision Guide (Fix F) */}
        <ActionDecisionCard
          metrics={currentSourceMetricsView}
          category={aqiCategory}
          onOpenDailyPlan={() => setActiveTab('routine')}
        />

        {/* Futuristic Floating Navigation Dock */}
        <div className="flex justify-center my-2">
          <FloatingDock
            activeTab={activeTab}
            onChangeTab={setActiveTab}
            reductionPercentage={reductionPercentage}
          />
        </div>

        {/* High-Contrast Segmented Navigation View Controller (Accessible Fallback) */}
        <div className="sm:hidden">
          <SegmentedTabs 
            activeTab={activeTab} 
            onChangeTab={setActiveTab} 
            reductionPercentage={reductionPercentage}
          />
        </div>

        {/* Tab 1: Overview, Location Search, Profile & Scorecard */}
        {activeTab === 'overview' && (
          <div 
            role="tabpanel"
            id="panel-overview"
            aria-labelledby="tab-overview"
            tabIndex={0}
            className="space-y-8 animate-in fade-in duration-300 focus-visible-ring rounded-2xl outline-none"
          >
            {plan && <ImpactScorecard plan={plan} />}

            {/* 1. 24-Hour Diurnal Safe Hours Forecast Timeline */}
            <DiurnalForecastTimeline
              hourlyForecast={metrics?.hourlyForecast}
              cityName={selectedCity.name}
              selectedValidAtUtc={selectedTemporalPoint?.validAtUtc}
              onSelectTimePoint={(pt) => setSelectedTemporalPoint(pt)}
              onSnapToNow={() => setSelectedTemporalPoint(null)}
            />

            {/* 2. Meteorological Wind Vector & Smoke Transport Gauge with Animated Particle Stream */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <WindVectorGauge
                windDirection={metrics?.windDirection}
                windSpeed={metrics?.windSpeed}
                cityName={selectedCity.name}
              />
              <WindDispersionVisualizer
                windSpeed={metrics?.windSpeed ?? null}
                windDirection={metrics?.windDirection ?? null}
                boundaryLayerHeight={metrics?.boundaryLayerHeight ?? null}
                isThermalInversion={metrics?.isThermalInversionActive ?? false}
              />
            </div>

            {/* 3. City vs City Smog Shootout */}
            <CityShootout
              currentCityName={selectedCity.name}
              currentAqi={metrics?.usAqi ?? null}
              currentPm25={metrics?.pm25 ?? null}
              currentCountry={selectedCity.country}
              currentCountryCode={selectedCity.countryCode}
              currentAdmin1={selectedCity.admin1}
              currentCityId={`geo-${selectedCity.id}`}
              currentLatitude={selectedCity.latitude}
              currentLongitude={selectedCity.longitude}
              currentTimestamp={metrics?.timestamp ?? null}
              currentModelDomain="cams_global"
              currentSourceKind={metrics?.groundStation ? 'ground_station' : 'atmospheric_model'}
              currentStatus={metrics?.status ?? null}
            />

            {/* 4 & 5. Commute Exposure & Mask/Filter Lifespan Calculators (Fix E) */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <CommuteCalculator ambientPm25={currentSourceMeasurement.pm25} />
              <FilterLifespanEstimator ambientPm25={currentSourceMeasurement.pm25} />
            </div>

            {/* Location Search & Health Profile */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <CityPicker
                currentCity={selectedCity.name}
                onSelectCity={handleCitySelect}
                isLoading={isTelemetryLoading}
              />

              <FamilyProfileForm
                profile={profile}
                onChangeProfile={(newProfile) => {
                  coordinatorRef.current.invalidatePendingPlans();
                  setProfile(newProfile);
                }}
                roomSizeSqFt={roomSizeSqFt}
                onChangeRoomSize={(newSize) => {
                  coordinatorRef.current.invalidatePendingPlans();
                  setRoomSizeSqFt(newSize);
                }}
                customRoutine={customRoutine}
                onChangeCustomRoutine={(newRoutine) => {
                  coordinatorRef.current.invalidatePendingPlans();
                  setCustomRoutine(newRoutine);
                }}
                onSubmit={handleGeneratePlan}
                isLoading={isPlanGenerating}
              />
            </div>
          </div>
        )}

        {/* Tab: World Data Explorer (Global IQAir style rankings & search) */}
        {activeTab === 'world' && (
          <div
            role="tabpanel"
            id="panel-world"
            aria-labelledby="tab-world"
            tabIndex={0}
            className="animate-in fade-in duration-300 focus-visible-ring rounded-2xl outline-none"
          >
            <WorldDataExplorer
              onSelectCity={(loc) => {
                handleCitySelect(loc);
                setActiveTab('overview');
              }}
              activeCityName={selectedCity.name}
            />
          </div>
        )}

        {/* Tab 2: Dynamic Routine Shifter & Personal Schedule Builder */}
        {activeTab === 'routine' && (
          <div 
            role="tabpanel"
            id="panel-routine"
            aria-labelledby="tab-routine"
            tabIndex={0}
            className="space-y-8 animate-in fade-in duration-300 focus-visible-ring rounded-2xl outline-none"
          >
            <RoutineBuilder
              currentPm25={currentSourceMeasurement.pm25}
              proposedShifts={deterministicPlan?.activityShifts}
              aiExplanation={aiExplanation || undefined}
              onScheduleChange={(newSched) => {
                planGenIdRef.current += 1;
                setIsPlanGenerating(false);
                setPlannerMessage('');
                setDeterministicPlan(null);
                setAiExplanation(null);
              }}
              onRejectShift={(activityId) => {
                if (deterministicPlan) {
                  setDeterministicPlan({
                    ...deterministicPlan,
                    activityShifts: deterministicPlan.activityShifts.filter(s => s.activityId !== activityId),
                  });
                }
              }}
              onOptimizeClick={async () => {
                if (!metrics?.hourlyForecast?.length) {
                  setDeterministicPlan(null);
                  setAiExplanation(null);
                  setPlannerMessage('Hourly forecast unavailable. Your routine is saved.');
                  return;
                }
                const currentGen = ++planGenIdRef.current;
                setPlannerMessage('');
                setDeterministicPlan(null);
                setAiExplanation(null);
                setIsPlanGenerating(true);
                try {
                  const savedSched = loadScheduleFromStorage();
                  const res = await fetch('/api/ai/plan', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      city: selectedCity.name,
                      coordinates: { lat: selectedCity.latitude, lng: selectedCity.longitude },
                      schedule: { ...savedSched, timezone: metrics.timezone || savedSched.timezone },
                      hourlyForecast: metrics.hourlyForecast || [],
                      generalizedSensitivity: sanitizeUserHealthContext(profile),
                    }),
                  });
                  if (!res.ok) throw new Error('Plan request failed');
                  const data = await res.json();
                  if (currentGen === planGenIdRef.current) {
                    if (data.deterministicPlan) {
                      setDeterministicPlan(data.deterministicPlan);
                      setPlannerMessage(data.deterministicPlan.statusMessage);
                    }
                    if (data.aiExplanation) {
                      setAiExplanation(data.aiExplanation);
                    }
                  }
                } catch (e) {
                  if (currentGen === planGenIdRef.current) setPlannerMessage('Could not check the forecast. Your routine is saved. Try again.');
                  console.error('Plan optimization error:', e);
                } finally {
                  if (currentGen === planGenIdRef.current) {
                    setIsPlanGenerating(false);
                  }
                }
              }}
              isOptimizing={isPlanGenerating}
            />
            <p role="status" aria-live="polite">{plannerMessage}</p>
            {plan && <ImpactScorecard plan={plan} />}
            {plan && <RoutineShifter routineShifts={plan.routineShifts} />}
          </div>
        )}

        {/* Tab 3: Frugal IAQ Studio: DIY Corsi-Rosenthal Air Cleaner */}
        {activeTab === 'iaq' && (
          <div 
            role="tabpanel"
            id="panel-iaq"
            aria-labelledby="tab-iaq"
            tabIndex={0}
            className="space-y-8 animate-in fade-in duration-300 focus-visible-ring rounded-2xl outline-none"
          >
            <IAQStudio 
              spec={plan?.corsiRosenthalBox} 
              initialRoomVolumeM3={Math.round(roomSizeSqFt * 0.0929 * 2.7)} 
            />
          </div>
        )}

        {/* Tab 4: Community Action & Verified Advisories */}
        {activeTab === 'rwa' && (
          <div 
            role="tabpanel"
            id="panel-rwa"
            aria-labelledby="tab-rwa"
            tabIndex={0}
            className="space-y-6 animate-in fade-in duration-300 focus-visible-ring rounded-2xl outline-none"
          >
            {/* Official Regulatory Status Panel */}
            <VerifiedAdvisoryPanel
              status={officialGrapStatus}
              cityName={selectedCity.name}
            />

            <div className="rounded-2xl glass-panel p-6 sm:p-8 space-y-4 border border-stone-300 dark:border-zinc-800 bg-white/95 dark:bg-[#0c0c0e]/95 shadow-sm transition-colors">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-stone-200 dark:border-zinc-800">
                <div>
                  <h2 className="text-xl font-bold text-ink dark:text-white tracking-tight">
                    Community Action &amp; Verified Advisories
                  </h2>
                  <p className="text-xs text-ink-muted dark:text-zinc-400 mt-1">
                    Review verified official directives and prepare evidence-based community air-quality guidance.
                  </p>
                </div>
                <button
                  onClick={() => setIsRwaModalOpen(true)}
                  className="px-4 py-2 rounded-xl bg-ink hover:bg-stone-800 text-white dark:bg-white dark:hover:bg-zinc-200 dark:text-black text-xs font-bold transition-all shadow-md self-start sm:self-auto active:scale-95 cursor-pointer"
                >
                  Open Community Guidance Generator &rarr;
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                <div className="p-4 rounded-xl bg-stone-50 dark:bg-zinc-900/60 border border-stone-200 dark:border-zinc-800 space-y-1.5">
                  <div className="font-bold text-ink dark:text-white">1. School &amp; Play Hours</div>
                  <p className="text-ink-muted dark:text-zinc-400">
                    Schedule high-intensity outdoor athletics during midday solar dispersion windows. Avoid strenuous outdoor exertion during nocturnal thermal inversions.
                  </p>
                </div>
                <div className="p-4 rounded-xl bg-stone-50 dark:bg-zinc-900/60 border border-stone-200 dark:border-zinc-800 space-y-1.5">
                  <div className="font-bold text-ink dark:text-white">2. Guard Post Protection</div>
                  <p className="text-ink-muted dark:text-zinc-400">
                    Distribute certified, well-fitted N95 respirators to night-duty estate guards and sanitation teams directly exposed to ground inversion air.
                  </p>
                </div>
                <div className="p-4 rounded-xl bg-stone-50 dark:bg-zinc-900/60 border border-stone-200 dark:border-zinc-800 space-y-1.5">
                  <div className="font-bold text-ink dark:text-white">3. Society Common Area Filtration</div>
                  <p className="text-ink-muted dark:text-zinc-400">
                    Deploy mechanical HEPA or low-cost Corsi-Rosenthal filtration in clubhouses, libraries, and indoor community centers to maintain clean-air refuges.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Semantic Footer */}
      <footer className="border-t border-stone-300 dark:border-zinc-800/80 bg-white dark:bg-black py-8 text-center text-xs text-ink-muted dark:text-zinc-500 transition-colors duration-200">
        <div className="max-w-7xl mx-auto px-4 space-y-2.5">
          <div className="flex items-center justify-center gap-2 text-ink dark:text-zinc-200 font-semibold">
            <span className="text-ink dark:text-white font-bold text-sm">Avir</span>
            <span className="text-stone-300 dark:text-zinc-600">—</span>
            <span>Urban Atmospheric Defense &amp; Exposure Intelligence</span>
          </div>

          <p className="text-xs text-ink-muted dark:text-zinc-400 flex flex-wrap items-center justify-center gap-x-2">
            <span>Built by <strong className="text-ink dark:text-white">Arnav Patel (XiaoArnav)</strong></span>
            <span className="text-stone-300 dark:text-zinc-600">•</span>
            <span>Atmospheric Data: Copernicus &amp; NOAA</span>
            <span className="text-stone-300 dark:text-zinc-600">•</span>
            <a 
              href="https://github.com/XiaoArnav/avir" 
              target="_blank" 
              rel="noopener noreferrer" 
              className="text-ink dark:text-zinc-300 underline hover:text-sage-600 dark:hover:text-white"
            >
              Open Source on GitHub
            </a>
          </p>

          <p className="text-[11px] text-stone-500 dark:text-zinc-500 max-w-2xl mx-auto leading-relaxed">
            Mathematical calculations based on CPCB/EPA AQI breakpoints, WHO 2021 Global Air Quality Guidelines, and Corsi-Rosenthal Box fluid dynamics. Designed for community risk mitigation and routine shifting; not intended as a substitute for emergency clinical care during acute respiratory distress.
          </p>
        </div>
      </footer>

      {/* Modals */}
      <FirstVisitLocationModal
        isOpen={isFirstVisitModalOpen}
        onClose={() => setIsFirstVisitModalOpen(false)}
        onSelectCity={(loc) => {
          setSelectedCity(loc);
        }}
      />
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        geminiApiKey={geminiApiKey}
        onSaveKey={setGeminiApiKey}
      />

      <RwaBulletinModal
        isOpen={isRwaModalOpen}
        onClose={() => setIsRwaModalOpen(false)}
        cityName={selectedCity.name}
        metrics={currentSourceMetricsView}
      />

      <ScienceExplainerModal
        isOpen={isExplainerOpen}
        onClose={() => setIsExplainerOpen(false)}
      />

      {/* 6. School & Child Outdoor Sports Advisory Modal */}
      <SchoolSafetyAdvisoryModal
        isOpen={isSchoolModalOpen}
        onClose={() => setIsSchoolModalOpen(false)}
        cityName={selectedCity.name}
        usAqi={currentSourceMeasurement.usAqi}
        pm25={currentSourceMeasurement.pm25}
      />

      {/* 7. Instant WhatsApp & Telegram Smog Bulletin Modal */}
      <ShareBulletinModal
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        cityName={selectedCity.name}
        usAqi={currentSourceMeasurement.usAqi}
        pm25={currentSourceMeasurement.pm25}
        cigarettes={
          currentSourceMeasurement.isAvailable && currentSourceMeasurement.pm25 !== null
            ? Math.round((currentSourceMeasurement.pm25 / 22) * 10) / 10
            : null
        }
        sourceAttribution={currentSourceMeasurement.sourceName}
        provenance={
          !currentSourceMeasurement.isAvailable
            ? 'Unavailable'
            : currentSourceMeasurement.isModel
            ? 'Atmospheric Chemistry Model'
            : currentSourceMeasurement.providerName || 'Physical Ground Station'
        }
        timestamp={currentSourceMeasurement.timestamp || metrics?.timestamp}
      />

      {/* 8. Multi-Source Atmospheric Telemetry Consensus & Uncertainty Inspector */}
      <MultiSourceInspectorModal
        isOpen={isMultiSourceModalOpen}
        onClose={() => setIsMultiSourceModalOpen(false)}
        cityName={selectedCity.name}
        ensemble={metrics?.ensemble}
        environmentalSources={metrics?.environmentalSources}
        sourceComparison={metrics?.sourceComparison}
        metrics={metrics}
        sourcePreference={sourcePreference}
        onUpdateSourcePreference={handleUpdateSourcePreference}
      />
    </div>
  );
}
