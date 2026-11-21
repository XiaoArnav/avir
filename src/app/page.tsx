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

  // User Profile State
  const [profile, setProfile] = useState<UserVulnerabilityProfile>({
    ageGroup: 'child',
    hasAsthmaOrRespiratory: true,
    hasCardiovascularCondition: false,
    isPregnant: false,
    isOutdoorWorker: false,
  });
  const [roomSizeSqFt, setRoomSizeSqFt] = useState(180);
  const [customRoutine, setCustomRoutine] = useState('06:30 AM Morning Jog & Outdoor Play');

  // Plan State
  const [plan, setPlan] = useState<RecommendationPlan | null>(null);

  // Modals State
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isRwaModalOpen, setIsRwaModalOpen] = useState(false);
  const [isExplainerOpen, setIsExplainerOpen] = useState(false);
  const [geminiApiKey, setGeminiApiKey] = useState('');

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
      // Seamlessly switch to Routine Shifter to view optimized results
      setActiveTab('routine');
    } catch (err) {
      console.error('Plan generation failed:', err);
    } finally {
      setIsPlanGenerating(false);
    }
  };

  const aqiCategory = metrics ? getAQICategory(metrics.usAqi) : 'Hazardous';

  return (
    <div className="flex-1 flex flex-col min-h-screen bg-[#070a11] text-slate-100">
      <TopNav
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenExplainer={() => setIsExplainerOpen(true)}
        onOpenRwa={() => setIsRwaModalOpen(true)}
        hasCustomKey={Boolean(geminiApiKey)}
      />

      <main id="main-content" className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6 sm:space-y-8 pb-safe">
        {/* Fast Metro Switcher Rail (One-tap swipe on mobile) */}
        <MetroRail
          currentCityName={selectedCity.name}
          onSelectCity={(loc) => setSelectedCity(loc)}
          isLoading={isTelemetryLoading}
        />

        {/* Atmosphere Telemetry Hero */}
        {metrics && (
          <AtmosphereHero
            city={selectedCity.name}
            metrics={metrics}
            category={aqiCategory}
            onOpenExplainer={() => setIsExplainerOpen(true)}
          />
        )}

        {/* Apple-Style Segmented Navigation View Controller */}
        <SegmentedTabs activeTab={activeTab} onChangeTab={setActiveTab} />

        {/* Tab 1: Overview, Location Search, Profile & Scorecard */}
        {activeTab === 'overview' && (
          <div className="space-y-8 animate-in fade-in duration-300">
            {plan && <ImpactScorecard plan={plan} />}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <CityPicker
                currentCity={selectedCity.name}
                onSelectCity={(loc) => setSelectedCity(loc)}
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
            <div className="rounded-3xl glass-panel p-6 sm:p-8 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/[0.08]">
                <div>
                  <h2 className="text-xl font-bold text-white tracking-tight">
                    Community Action & Society Circular Hub
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">
                    Mobilize your residential apartment society, school council, or neighborhood RWA to enforce CAQM anti-smog protocols.
                  </p>
                </div>
                <button
                  onClick={() => setIsRwaModalOpen(true)}
                  className="px-5 py-2.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold transition-all shadow-md self-start sm:self-auto active:scale-95"
                >
                  Open Official Notice Generator &rarr;
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                <div className="p-4 rounded-2xl bg-slate-900/60 border border-white/[0.06] space-y-1.5">
                  <div className="font-bold text-white">1. School & Play Hours</div>
                  <p className="text-slate-400">
                    Never conduct physical sports before 10:00 AM during winter inversions. Shift outdoor recess to 1:30 PM.
                  </p>
                </div>
                <div className="p-4 rounded-2xl bg-slate-900/60 border border-white/[0.06] space-y-1.5">
                  <div className="font-bold text-white">2. Guard Post Protection</div>
                  <p className="text-slate-400">
                    Distribute reusable N95 respirators to night-duty estate guards and sanitation teams directly exposed to cold ground air.
                  </p>
                </div>
                <div className="p-4 rounded-2xl bg-slate-900/60 border border-white/[0.06] space-y-1.5">
                  <div className="font-bold text-white">3. Society Common Area Filtration</div>
                  <p className="text-slate-400">
                    Place low-cost Corsi-Rosenthal boxes in society clubhouses and reading rooms to maintain safe community clean-air zones.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Semantic Footer */}
      <footer className="border-t border-white/[0.08] bg-[#05080e] py-8 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 space-y-2">
          <p className="text-slate-300 font-semibold tracking-wide">
            Avir — Urban Air Quality & Winter Smog Assistant
          </p>
          <p className="text-[11px] text-slate-400">
            PromptWars Virtual (Challenge 6) • Author: XiaoArnav • Powered by Google Antigravity & Open-Meteo High-Resolution Mesh
          </p>
          <p className="text-[11px] text-slate-600 max-w-xl mx-auto">
            Grounded in peer-reviewed environmental toxicology and boundary layer fluid dynamics. Not a clinical substitute for emergency medical care during acute respiratory distress.
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
