'use client';

import React, { useState, useEffect } from 'react';
import { TopNav } from '@/components/TopNav';
import { AtmosphereHero } from '@/components/AtmosphereHero';
import { CityPicker } from '@/components/CityPicker';
import { FamilyProfileForm } from '@/components/FamilyProfileForm';
import { RoutineShifter } from '@/components/RoutineShifter';
import { IAQStudio } from '@/components/IAQStudio';
import { ImpactScorecard } from '@/components/ImpactScorecard';
import { SettingsModal } from '@/components/SettingsModal';
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

  // Settings State
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
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
    } catch (err) {
      console.error('Plan generation failed:', err);
    } finally {
      setIsPlanGenerating(false);
    }
  };

  const aqiCategory = metrics ? getAQICategory(metrics.usAqi) : 'Hazardous';

  return (
    <div className="flex-1 flex flex-col">
      <TopNav
        onOpenSettings={() => setIsSettingsOpen(true)}
        hasCustomKey={Boolean(geminiApiKey)}
      />

      <main id="main-content" className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Atmosphere Telemetry Hero */}
        {metrics && (
          <AtmosphereHero
            city={selectedCity.name}
            metrics={metrics}
            category={aqiCategory}
          />
        )}

        {/* City Selector & Profile Input Grid */}
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

        {/* Quantified Impact Scorecard */}
        {plan && <ImpactScorecard plan={plan} />}

        {/* Dynamic Routine Shifter */}
        {plan && <RoutineShifter routineShifts={plan.routineShifts} />}

        {/* Frugal IAQ Studio: DIY Corsi-Rosenthal Box */}
        {plan && <IAQStudio spec={plan.corsiRosenthalBox} />}
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-800 bg-[#090d16] py-8 text-center text-xs text-gray-500">
        <div className="max-w-7xl mx-auto px-4 space-y-2">
          <p className="text-gray-400 font-medium">
            Avir — Urban Air Quality & Winter Smog Assistant
          </p>
          <p>
            PromptWars Virtual (Challenge 6) • Author: XiaoArnav • Powered by Google Antigravity & Open-Meteo
          </p>
          <p className="text-[11px] text-gray-600">
            Open Access Environmental Toxicology. Not a substitute for clinical medical diagnosis during acute respiratory distress.
          </p>
        </div>
      </footer>

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        geminiApiKey={geminiApiKey}
        onSaveKey={setGeminiApiKey}
      />
    </div>
  );
}
