'use client';

import React, { useState, useEffect } from 'react';
import { TopNav } from '@/components/TopNav';
import { MetroRail } from '@/components/MetroRail';
import { AtmosphereHero } from '@/components/AtmosphereHero';
import { SegmentedTabs, ActiveTabId } from '@/components/SegmentedTabs';
import { CityPicker } from '@/components/CityPicker';
import { FamilyProfileForm } from '@/components/FamilyProfileForm';
import { RoutineShifter } from '@/components/RoutineShifter';
import { IAQStudio } from '@/components/IAQStudio';
import { ImpactScorecard } from '@/components/ImpactScorecard';
import { WorldDataExplorer } from '@/components/WorldDataExplorer';
import { SettingsModal } from '@/components/SettingsModal';
import { RwaBulletinModal } from '@/components/RwaBulletinModal';
import { ScienceExplainerModal } from '@/components/ScienceExplainerModal';
import {
  AtmosphericMetrics,
  UserVulnerabilityProfile,
  RecommendationPlan,
} from '@/domain/types';
import { getAQICategory } from '@/domain/air-math';
import {
  fetchLiveAtmosphericMetrics,
  GeocodedLocation,
  PREDEFINED_INDIAN_CITIES,
} from '@/services/telemetry-service';
import { generateAirQualityPlan } from '@/services/ai-assistant-service';

export default function Home() {
  const [selectedCity, setSelectedCity] = useState<GeocodedLocation>(PREDEFINED_INDIAN_CITIES[0]);
  const [metrics, setMetrics] = useState<AtmosphericMetrics | null>(null);
  const [isTelemetryLoading, setIsTelemetryLoading] = useState(true);
  const [isPlanGenerating, setIsPlanGenerating] = useState(false);
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

  // Modals State
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isRwaModalOpen, setIsRwaModalOpen] = useState(false);
  const [isExplainerOpen, setIsExplainerOpen] = useState(false);
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [isDarkMode, setIsDarkMode] = useState(true);

  // Sync dark class on root document element for seamless Duo Theme toggle
  useEffect(() => {
    if (typeof document !== 'undefined') {
      if (isDarkMode) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    }
  }, [isDarkMode]);

  // Load telemetry when city changes
  useEffect(() => {
    let isMounted = true;
    async function loadTelemetry() {
      setIsTelemetryLoading(true);
      try {
        const data = await fetchLiveAtmosphericMetrics(
          selectedCity.latitude,
          selectedCity.longitude
        );
        if (isMounted) {
          setMetrics(data);
          // Automatically synthesize initial plan for immediate visibility
          const initialPlan = await generateAirQualityPlan({
            city: selectedCity.name,
            metrics: data,
            profile,
            roomSizeSqFt,
            customRoutine,
            geminiApiKey,
          });
          if (isMounted) setPlan(initialPlan);
        }
      } catch (err) {
        console.error('Failed to load telemetry:', err);
      } finally {
        if (isMounted) setIsTelemetryLoading(false);
      }
    }

    loadTelemetry();
    return () => {
      isMounted = false;
    };
  }, [selectedCity]);

  // Handle city selection with clean transition to avoid race condition
  const handleCitySelect = (loc: GeocodedLocation) => {
    if (loc.id === selectedCity.id && loc.name === selectedCity.name) return;
    setIsTelemetryLoading(true);
    setMetrics(null); // Clear stale city metrics immediately
    setSelectedCity(loc);
  };

  // Handle manual live telemetry refresh & dependent plan recalculation
  const refreshTelemetry = async () => {
    setIsTelemetryLoading(true);
    try {
      const data = await fetchLiveAtmosphericMetrics(
        selectedCity.latitude,
        selectedCity.longitude
      );
      setMetrics(data);
      // Synchronously recalculate dependent recommendation plan
      const updatedPlan = await generateAirQualityPlan({
        city: selectedCity.name,
        metrics: data,
        profile,
        roomSizeSqFt,
        customRoutine,
        geminiApiKey,
      });
      setPlan(updatedPlan);
    } catch (err) {
      console.error('Failed to reload telemetry:', err);
    } finally {
      setIsTelemetryLoading(false);
    }
  };

  // Handle manual plan regeneration
  const handleGeneratePlan = async () => {
    if (!metrics) return;
    setIsPlanGenerating(true);
    try {
      const updatedPlan = await generateAirQualityPlan({
        city: selectedCity.name,
        metrics,
        profile,
        roomSizeSqFt,
        customRoutine,
        geminiApiKey,
      });
      setPlan(updatedPlan);
      // Seamlessly switch to Daily Plan to view optimized results
      setActiveTab('routine');
    } catch (err) {
      console.error('Plan generation failed:', err);
    } finally {
      setIsPlanGenerating(false);
    }
  };

  const aqiCategory = metrics ? getAQICategory(metrics.usAqi) : 'Hazardous';

  const reductionPercentage = plan?.impactMetrics?.totalInhaledBaselineUg
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
        hasCustomKey={Boolean(geminiApiKey)}
        isDarkMode={isDarkMode}
        onToggleTheme={() => setIsDarkMode(!isDarkMode)}
      />

      <main id="main-content" className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6 sm:space-y-8 pb-safe">
        {/* Fast Metro Switcher Rail (One-tap swipe on mobile) */}
        <MetroRail
          currentCityName={selectedCity.name}
          onSelectCity={handleCitySelect}
          isLoading={isTelemetryLoading}
        />

        {/* Atmosphere Telemetry Hero - IQAir / AQI.in World-Class Duo Standard */}
        <AtmosphereHero
          city={selectedCity.name}
          metrics={metrics}
          category={aqiCategory}
          onOpenExplainer={() => setIsExplainerOpen(true)}
          onRefresh={refreshTelemetry}
          isLoading={isTelemetryLoading}
          isDarkMode={isDarkMode}
        />

        {/* High-Contrast Segmented Navigation View Controller */}
        <SegmentedTabs 
          activeTab={activeTab} 
          onChangeTab={setActiveTab} 
          reductionPercentage={reductionPercentage}
        />

        {/* Tab 1: Overview, Location Search, Profile & Scorecard */}
        {activeTab === 'overview' && (
          <div className="space-y-8 animate-in fade-in duration-300">
            {plan && <ImpactScorecard plan={plan} />}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <CityPicker
                currentCity={selectedCity.name}
                onSelectCity={handleCitySelect}
                isLoading={isTelemetryLoading}
              />

              <FamilyProfileForm
                profile={profile}
                onChangeProfile={setProfile}
                roomSizeSqFt={roomSizeSqFt}
                onChangeRoomSize={setRoomSizeSqFt}
                customRoutine={customRoutine}
                onChangeCustomRoutine={setCustomRoutine}
                onSubmit={handleGeneratePlan}
                isLoading={isPlanGenerating}
              />
            </div>
          </div>
        )}

        {/* Tab: World Data Explorer (Global IQAir style rankings & search) */}
        {activeTab === 'world' && (
          <WorldDataExplorer
            onSelectCity={(loc) => {
              handleCitySelect(loc);
              setActiveTab('overview');
            }}
            activeCityName={selectedCity.name}
          />
        )}

        {/* Tab 2: Dynamic Routine Shifter */}
        {activeTab === 'routine' && plan && (
          <div className="space-y-8 animate-in fade-in duration-300">
            <ImpactScorecard plan={plan} />
            <RoutineShifter routineShifts={plan.routineShifts} />
          </div>
        )}

        {/* Tab 3: Frugal IAQ Studio: DIY Corsi-Rosenthal Air Cleaner */}
        {activeTab === 'iaq' && plan && (
          <div className="space-y-8 animate-in fade-in duration-300">
            <IAQStudio spec={plan.corsiRosenthalBox} />
          </div>
        )}

        {/* Tab 4: Community & RWA Circular Hub */}
        {activeTab === 'rwa' && (
          <div className="space-y-6 animate-in fade-in duration-300">
            <div className="rounded-2xl glass-panel p-6 sm:p-8 space-y-4 border border-stone-300 dark:border-zinc-800 bg-white/95 dark:bg-[#0c0c0e]/95 shadow-sm transition-colors">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-stone-200 dark:border-zinc-800">
                <div>
                  <h2 className="text-xl font-bold text-ink dark:text-white tracking-tight">
                    Community Action &amp; Society Circular Hub
                  </h2>
                  <p className="text-xs text-ink-muted dark:text-zinc-400 mt-1">
                    Mobilize your residential apartment society, school council, or neighborhood RWA to enforce CAQM anti-smog protocols.
                  </p>
                </div>
                <button
                  onClick={() => setIsRwaModalOpen(true)}
                  className="px-4 py-2 rounded-xl bg-ink hover:bg-stone-800 text-white dark:bg-white dark:hover:bg-zinc-200 dark:text-black text-xs font-bold transition-all shadow-md self-start sm:self-auto active:scale-95"
                >
                  Open Official Notice Generator &rarr;
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                <div className="p-4 rounded-xl bg-stone-50 dark:bg-zinc-900/60 border border-stone-200 dark:border-zinc-800 space-y-1.5">
                  <div className="font-bold text-ink dark:text-white">1. School &amp; Play Hours</div>
                  <p className="text-ink-muted dark:text-zinc-400">
                    Never conduct physical sports before 10:00 AM during winter inversions. Shift outdoor recess to 1:30 PM.
                  </p>
                </div>
                <div className="p-4 rounded-xl bg-stone-50 dark:bg-zinc-900/60 border border-stone-200 dark:border-zinc-800 space-y-1.5">
                  <div className="font-bold text-ink dark:text-white">2. Guard Post Protection</div>
                  <p className="text-ink-muted dark:text-zinc-400">
                    Distribute reusable N95 respirators to night-duty estate guards and sanitation teams directly exposed to cold ground air.
                  </p>
                </div>
                <div className="p-4 rounded-xl bg-stone-50 dark:bg-zinc-900/60 border border-stone-200 dark:border-zinc-800 space-y-1.5">
                  <div className="font-bold text-ink dark:text-white">3. Society Common Area Filtration</div>
                  <p className="text-ink-muted dark:text-zinc-400">
                    Place low-cost Corsi-Rosenthal boxes in society clubhouses and reading rooms to maintain safe community clean-air zones.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Semantic Footer */}
      <footer className="border-t border-stone-300 dark:border-zinc-800/80 bg-white dark:bg-black py-8 text-center text-xs text-ink-muted dark:text-zinc-500 transition-colors duration-200">
        <div className="max-w-7xl mx-auto px-4 space-y-2">
          <div className="flex items-center justify-center gap-2 text-ink dark:text-zinc-200 font-semibold">
            <span className="text-ink dark:text-white font-bold text-sm">Avir</span>
            <span className="text-stone-300 dark:text-zinc-600">—</span>
            <span>Urban Air Quality Assistant</span>
          </div>

          <p className="text-xs text-ink-muted dark:text-zinc-400 flex flex-wrap items-center justify-center gap-x-2">
            <span>Built by <strong className="text-ink dark:text-white">XiaoArnav</strong> for PromptWars</span>
            <span className="text-stone-300 dark:text-zinc-600">•</span>
            <a 
              href="https://github.com/XiaoArnav/avir" 
              target="_blank" 
              rel="noopener noreferrer" 
              className="text-ink dark:text-zinc-300 underline hover:text-sage-600 dark:hover:text-white"
            >
              GitHub
            </a>
          </p>

          <p className="text-[11px] text-stone-500 dark:text-zinc-500 max-w-lg mx-auto">
            Live Open-Meteo telemetry &amp; environmental health guidance. For advisory use only.
          </p>
        </div>
      </footer>

      {/* Modals */}
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
        metrics={metrics}
      />

      <ScienceExplainerModal
        isOpen={isExplainerOpen}
        onClose={() => setIsExplainerOpen(false)}
      />
    </div>
  );
}
