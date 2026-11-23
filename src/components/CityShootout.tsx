'use client';

import React, { useState, useEffect } from 'react';
import { calculateCityComparison } from '@/domain/advanced-air-math';
import { savedComparisonsService, SavedCityComparisonRecord } from '@/services/saved-comparisons-service';
import { 
  Swords, 
  ArrowRightLeft, 
  Cigarette, 
  Flame, 
  CheckCircle2, 
  AlertTriangle, 
  Loader2, 
  Bookmark, 
  BookmarkCheck, 
  Trash2, 
  Clock, 
  Info 
} from 'lucide-react';

export interface ComparisonTargetDef {
  name: string;
  country: string;
  latitude: number;
  longitude: number;
}

// Preset metro locations — configuration and geographic coordinates ONLY (Zero synthetic pollution data)
export const COMPARISON_TARGETS: ComparisonTargetDef[] = [
  { name: 'Tokyo', country: 'Japan', latitude: 35.6762, longitude: 139.6503 },
  { name: 'Beijing', country: 'China', latitude: 39.9042, longitude: 116.4074 },
  { name: 'London', country: 'United Kingdom', latitude: 51.5074, longitude: -0.1278 },
  { name: 'New York', country: 'United States', latitude: 40.7128, longitude: -74.0060 },
  { name: 'Lahore', country: 'Pakistan', latitude: 31.5204, longitude: 74.3587 },
  { name: 'Bangkok', country: 'Thailand', latitude: 13.7563, longitude: 100.5018 },
  { name: 'Sydney', country: 'Australia', latitude: -33.8688, longitude: 151.2093 },
  { name: 'Paris', country: 'France', latitude: 48.8566, longitude: 2.3522 },
];

interface CityShootoutProps {
  currentCityName: string;
  currentAqi: number | null;
  currentPm25: number | null;
  currentCountry?: string;
  currentTimestamp?: string | null;
  initialTarget?: ComparisonTargetDef;
  comparisonTargetData?: { aqi: number | null; pm25: number | null; timestamp?: string | null } | null;
}

export const CityShootout: React.FC<CityShootoutProps> = ({
  currentCityName,
  currentAqi,
  currentPm25,
  currentCountry = 'India',
  currentTimestamp,
  initialTarget = COMPARISON_TARGETS[0],
  comparisonTargetData,
}) => {
  const [selectedTarget, setSelectedTarget] = useState<ComparisonTargetDef>(initialTarget);
  const [isSwapped, setIsSwapped] = useState(false);
  const [targetMetrics, setTargetMetrics] = useState<{ aqi: number; pm25: number; timestamp?: string | null } | null>(() => {
    if (
      comparisonTargetData &&
      typeof comparisonTargetData.aqi === 'number' &&
      Number.isFinite(comparisonTargetData.aqi) &&
      comparisonTargetData.aqi >= 0 &&
      typeof comparisonTargetData.pm25 === 'number' &&
      Number.isFinite(comparisonTargetData.pm25) &&
      comparisonTargetData.pm25 >= 0
    ) {
      return { 
        aqi: comparisonTargetData.aqi, 
        pm25: comparisonTargetData.pm25,
        timestamp: comparisonTargetData.timestamp || null,
      };
    }
    return null;
  });
  const [isLoadingTarget, setIsLoadingTarget] = useState(false);
  const [targetError, setTargetError] = useState(false);
  const [savedComparisons, setSavedComparisons] = useState<SavedCityComparisonRecord[]>(() => 
    typeof window !== 'undefined' ? savedComparisonsService.getSavedComparisons() : []
  );
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);

  // Synchronize target telemetry when comparisonTargetData is provided via props
  useEffect(() => {
    if (comparisonTargetData !== undefined) {
      if (
        comparisonTargetData !== null &&
        typeof comparisonTargetData.aqi === 'number' &&
        Number.isFinite(comparisonTargetData.aqi) &&
        comparisonTargetData.aqi >= 0 &&
        typeof comparisonTargetData.pm25 === 'number' &&
        Number.isFinite(comparisonTargetData.pm25) &&
        comparisonTargetData.pm25 >= 0
      ) {
        setTargetMetrics({ 
          aqi: comparisonTargetData.aqi, 
          pm25: comparisonTargetData.pm25,
          timestamp: comparisonTargetData.timestamp || null,
        });
        setTargetError(false);
      } else {
        setTargetMetrics(null);
        setTargetError(false);
      }
      return;
    }

    // Otherwise, fetch genuine live telemetry for target city from Open-Meteo with CAMS global domain
    let isMounted = true;
    const controller = new AbortController();

    async function fetchTargetTelemetry() {
      setIsLoadingTarget(true);
      setTargetError(false);
      try {
        const url = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${selectedTarget.latitude}&longitude=${selectedTarget.longitude}&current=us_aqi,pm2_5&domains=cams_global`;
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const current = data?.current;

        const validAqi = typeof current?.us_aqi === 'number' && Number.isFinite(current.us_aqi) && current.us_aqi >= 0;
        const validPm25 = typeof current?.pm2_5 === 'number' && Number.isFinite(current.pm2_5) && current.pm2_5 >= 0;

        if (validAqi && validPm25 && isMounted) {
          setTargetMetrics({
            aqi: current.us_aqi,
            pm25: Math.round(current.pm2_5 * 10) / 10,
            timestamp: current.time || null,
          });
        } else if (isMounted) {
          setTargetMetrics(null);
          setTargetError(true);
        }
      } catch (err: any) {
        if (err?.name !== 'AbortError' && isMounted) {
          setTargetError(true);
          setTargetMetrics(null);
        }
      } finally {
        if (isMounted) setIsLoadingTarget(false);
      }
    }

    fetchTargetTelemetry();

    return () => {
      isMounted = false;
      controller.abort();
    };
  }, [selectedTarget, comparisonTargetData]);

  // Strict check on current city's readings (0 is valid clean air!)
  const hasCurrentAqi = typeof currentAqi === 'number' && Number.isFinite(currentAqi) && currentAqi >= 0;
  const hasCurrentPm25 = typeof currentPm25 === 'number' && Number.isFinite(currentPm25) && currentPm25 >= 0;
  const isCurrentAvailable = hasCurrentAqi && hasCurrentPm25;

  const handleSaveCurrentComparison = () => {
    if (!targetCityData || !isCurrentAvailable) return;
    const res = savedComparisonsService.saveComparison({
      cityA: {
        name: currentCityName,
        country: currentCountry,
        aqi: currentAqi,
        pm25: currentPm25,
        timestamp: currentTimestamp,
      },
      cityB: {
        name: targetCityData.name,
        country: targetCityData.country,
        aqi: targetCityData.aqi,
        pm25: targetCityData.pm25,
        timestamp: targetCityData.timestamp,
      },
    });

    if (res.success) {
      setSavedComparisons(savedComparisonsService.getSavedComparisons());
      setSaveSuccessMsg(`Saved ${currentCityName} vs ${targetCityData.name} on this device`);
      setTimeout(() => setSaveSuccessMsg(null), 3000);
    }
  };

  const handleDeleteSavedComparison = (id: string) => {
    savedComparisonsService.removeSavedComparison(id);
    setSavedComparisons(savedComparisonsService.getSavedComparisons());
  };

  if (!isCurrentAvailable) {
    return (
      <div className="bg-white dark:bg-zinc-900 border border-stone-200 dark:border-zinc-800 rounded-2xl p-5 sm:p-6 shadow-sm space-y-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-amber-500/10 text-amber-500 border border-amber-500/20">
            <Swords className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base sm:text-lg font-bold text-ink dark:text-white">
              City vs City Smog Shootout
            </h3>
            <p className="text-xs text-ink-muted dark:text-zinc-400">
              Awaiting live atmospheric readings for {currentCityName} to compare with international metros. Zero synthetic data is substituted.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const currentCityData = {
    name: currentCityName,
    country: currentCountry,
    aqi: currentAqi!,
    pm25: currentPm25!,
    timestamp: currentTimestamp || null,
  };

  const targetCityData = targetMetrics
    ? {
        name: selectedTarget.name,
        country: selectedTarget.country,
        aqi: targetMetrics.aqi,
        pm25: targetMetrics.pm25,
        timestamp: targetMetrics.timestamp || null,
      }
    : null;

  return (
    <div className="bg-white dark:bg-zinc-900 border border-stone-200 dark:border-zinc-800 rounded-2xl p-5 sm:p-6 shadow-sm space-y-6">
      {/* Header & Target Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-rose-500/10 text-rose-500 border border-rose-500/20">
            <Swords className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base sm:text-lg font-bold text-ink dark:text-white">
              Compare Cities: Smog Shootout
            </h3>
            <p className="text-xs text-ink-muted dark:text-zinc-400">
              Scientific side-by-side comparison pinned to ECMWF CAMS Global atmospheric models
            </p>
          </div>
        </div>

        {/* Quick Target Selector & Actions */}
        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
          <label htmlFor="shootout-target" className="text-xs text-ink-muted dark:text-zinc-400 font-medium">
            Compare with:
          </label>
          <select
            id="shootout-target"
            value={selectedTarget.name}
            onChange={(e) => {
              const found = COMPARISON_TARGETS.find((p) => p.name === e.target.value);
              if (found) setSelectedTarget(found);
            }}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-stone-100 dark:bg-zinc-800 border border-stone-300 dark:border-zinc-700 text-ink dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            {COMPARISON_TARGETS.map((p) => (
              <option key={p.name} value={p.name}>
                {p.name} ({p.country})
              </option>
            ))}
          </select>

          <button
            onClick={() => setIsSwapped(!isSwapped)}
            disabled={!targetCityData}
            className="p-1.5 rounded-lg bg-stone-100 dark:bg-zinc-800 hover:bg-stone-200 dark:hover:bg-zinc-700 text-ink dark:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            title="Swap cities"
            aria-label="Swap comparison order"
          >
            <ArrowRightLeft className="w-4 h-4" />
          </button>

          {targetCityData && (
            <button
              onClick={handleSaveCurrentComparison}
              className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg bg-stone-100 hover:bg-stone-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-ink dark:text-zinc-200 border border-stone-300 dark:border-zinc-700 transition-colors"
              title="Save this comparison snapshot locally on this device"
            >
              <Bookmark className="w-3.5 h-3.5 text-emerald-500" />
              <span>Save</span>
            </button>
          )}
        </div>
      </div>

      {saveSuccessMsg && (
        <div className="px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-medium flex items-center gap-2">
          <BookmarkCheck className="w-4 h-4 shrink-0" />
          <span>{saveSuccessMsg}</span>
        </div>
      )}

      {/* Target Data Loading / Unavailable State */}
      {isLoadingTarget ? (
        <div className="p-8 text-center rounded-xl bg-stone-50 dark:bg-zinc-800/40 border border-stone-200 dark:border-zinc-800 space-y-2">
          <Loader2 className="w-6 h-6 mx-auto animate-spin text-emerald-500" />
          <p className="text-xs text-ink-muted dark:text-zinc-400 font-mono">
            Fetching verified telemetry for {selectedTarget.name} ({selectedTarget.country})...
          </p>
        </div>
      ) : !targetCityData ? (
        <div className="p-6 rounded-xl bg-stone-50 dark:bg-zinc-800/40 border border-stone-200 dark:border-zinc-800 text-center space-y-2">
          <div className="w-10 h-10 mx-auto rounded-full bg-amber-500/10 text-amber-500 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <h4 className="text-sm font-bold text-ink dark:text-white">
            Comparison data unavailable for {selectedTarget.name}
          </h4>
          <p className="text-xs text-ink-muted dark:text-zinc-400 max-w-md mx-auto leading-relaxed">
            Live atmospheric telemetry for {selectedTarget.name} ({selectedTarget.country}) could not be retrieved to compare against {currentCityName}. Avir never uses predetermined or static readings for live city comparisons.
          </p>
        </div>
      ) : (() => {
          const cityPrimary = isSwapped ? targetCityData : currentCityData;
          const citySecondary = isSwapped ? currentCityData : targetCityData;
          const comparison = calculateCityComparison(cityPrimary, citySecondary);

          return (
            <>
              {/* Incompatibility warning banner if present */}
              {comparison.reasons.length > 0 && (
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-700 dark:text-amber-400 flex items-start gap-2">
                  <Info className="w-4 h-4 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">Methodological Notice: </span>
                    {comparison.reasons.join(' ')}
                  </div>
                </div>
              )}

              {/* Side-by-Side Comparison Arena */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* City A Card */}
                <div
                  className={`p-4 rounded-xl border transition-all ${
                    (cityPrimary.aqi ?? 0) > (citySecondary.aqi ?? 0)
                      ? 'bg-rose-500/5 dark:bg-rose-950/20 border-rose-500/30'
                      : 'bg-emerald-500/5 dark:bg-emerald-950/20 border-emerald-500/30'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono font-bold text-ink-muted dark:text-zinc-400 uppercase">
                      Primary City
                    </span>
                    {(cityPrimary.aqi ?? 0) > (citySecondary.aqi ?? 0) ? (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-500 border border-rose-500/20 flex items-center gap-1">
                        <Flame className="w-3 h-3" /> More Polluted
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> Cleaner
                      </span>
                    )}
                  </div>

                  <h4 className="mt-2 text-xl font-bold text-ink dark:text-white">
                    {cityPrimary.name}
                  </h4>
                  <p className="text-xs text-ink-muted dark:text-zinc-400">{cityPrimary.country}</p>

                  <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                    <div className="p-2 rounded-lg bg-white/60 dark:bg-zinc-900/60 border border-stone-200 dark:border-zinc-800">
                      <div className="text-[10px] text-ink-muted dark:text-zinc-400">US AQI</div>
                      <div className="text-lg font-mono font-bold text-ink dark:text-white">
                        {cityPrimary.aqi ?? '—'}
                      </div>
                    </div>
                    <div className="p-2 rounded-lg bg-white/60 dark:bg-zinc-900/60 border border-stone-200 dark:border-zinc-800">
                      <div className="text-[10px] text-ink-muted dark:text-zinc-400">PM2.5 (µg/m³)</div>
                      <div className="text-lg font-mono font-bold text-ink dark:text-white">
                        {cityPrimary.pm25 ?? '—'}
                      </div>
                    </div>
                    <div className="p-2 rounded-lg bg-white/60 dark:bg-zinc-900/60 border border-stone-200 dark:border-zinc-800">
                      <div className="text-[10px] text-ink-muted dark:text-zinc-400">Inhaled Equiv.</div>
                      <div className="text-lg font-mono font-bold text-rose-500">
                        {comparison.cityA.cigarettes !== null ? `~${comparison.cityA.cigarettes}` : '—'}
                      </div>
                    </div>
                  </div>
                </div>

                {/* City B Card */}
                <div
                  className={`p-4 rounded-xl border transition-all ${
                    (citySecondary.aqi ?? 0) > (cityPrimary.aqi ?? 0)
                      ? 'bg-rose-500/5 dark:bg-rose-950/20 border-rose-500/30'
                      : 'bg-emerald-500/5 dark:bg-emerald-950/20 border-emerald-500/30'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono font-bold text-ink-muted dark:text-zinc-400 uppercase">
                      Comparison Metro
                    </span>
                    {(citySecondary.aqi ?? 0) > (cityPrimary.aqi ?? 0) ? (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-500 border border-rose-500/20 flex items-center gap-1">
                        <Flame className="w-3 h-3" /> More Polluted
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> Cleaner
                      </span>
                    )}
                  </div>

                  <h4 className="mt-2 text-xl font-bold text-ink dark:text-white">
                    {citySecondary.name}
                  </h4>
                  <p className="text-xs text-ink-muted dark:text-zinc-400">{citySecondary.country}</p>

                  <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                    <div className="p-2 rounded-lg bg-white/60 dark:bg-zinc-900/60 border border-stone-200 dark:border-zinc-800">
                      <div className="text-[10px] text-ink-muted dark:text-zinc-400">US AQI</div>
                      <div className="text-lg font-mono font-bold text-ink dark:text-white">
                        {citySecondary.aqi ?? '—'}
                      </div>
                    </div>
                    <div className="p-2 rounded-lg bg-white/60 dark:bg-zinc-900/60 border border-stone-200 dark:border-zinc-800">
                      <div className="text-[10px] text-ink-muted dark:text-zinc-400">PM2.5 (µg/m³)</div>
                      <div className="text-lg font-mono font-bold text-ink dark:text-white">
                        {citySecondary.pm25 ?? '—'}
                      </div>
                    </div>
                    <div className="p-2 rounded-lg bg-white/60 dark:bg-zinc-900/60 border border-stone-200 dark:border-zinc-800">
                      <div className="text-[10px] text-ink-muted dark:text-zinc-400">Inhaled Equiv.</div>
                      <div className="text-lg font-mono font-bold text-emerald-500">
                        {comparison.cityB.cigarettes !== null ? `~${comparison.cityB.cigarettes}` : '—'}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Analytical Verdict & Differential Gauge */}
              <div className="p-4 rounded-xl bg-stone-50 dark:bg-zinc-800/60 border border-stone-200 dark:border-zinc-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-sm text-ink dark:text-white">
                      Comparison Summary
                    </span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-500 font-bold">
                      {comparison.pm25ConcentrationRatio ? `${comparison.pm25ConcentrationRatio}× PM2.5 Difference` : `${comparison.toxicityMultiplier}× Difference`}
                    </span>
                  </div>
                  <p className="text-xs text-ink-muted dark:text-zinc-400">
                    {comparison.verdict}
                  </p>
                  <p className="text-[10px] text-stone-400 dark:text-zinc-500 italic">
                    * Inhaled cigarette equivalence is an illustrative toxicological estimate (Berkeley Earth: ~22 µg/m³ PM2.5 over 24h ≈ 1 cigarette equivalent).
                  </p>
                </div>

                <div className="flex items-center gap-3 shrink-0 p-2.5 rounded-lg bg-white dark:bg-zinc-900 border border-stone-200 dark:border-zinc-800 text-xs">
                  <Cigarette className="w-4 h-4 text-rose-500 shrink-0" />
                  <div>
                    <div className="text-[10px] text-ink-muted dark:text-zinc-400">Smoking Difference</div>
                    <div className="font-mono font-bold text-ink dark:text-white">
                      {comparison.cigaretteDifferential !== null ? `+${comparison.cigaretteDifferential} cigs/day` : 'N/A'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Saved Comparisons on this Device */}
              {savedComparisons.length > 0 && (
                <div className="pt-2 border-t border-stone-200 dark:border-zinc-800/80 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-mono font-semibold uppercase text-ink-muted dark:text-zinc-400 flex items-center gap-1.5">
                      <Bookmark className="w-3 h-3 text-emerald-500" />
                      <span>Saved on this device ({savedComparisons.length})</span>
                    </span>
                    <button
                      onClick={() => {
                        savedComparisonsService.clearAllSavedComparisons();
                        setSavedComparisons([]);
                      }}
                      className="text-[10px] text-stone-400 hover:text-rose-500 transition-colors"
                    >
                      Clear all
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {savedComparisons.map((sc) => (
                      <div
                        key={sc.id}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-stone-100 dark:bg-zinc-800/80 border border-stone-200 dark:border-zinc-700 text-xs text-ink dark:text-zinc-200"
                      >
                        <button
                          onClick={() => {
                            const found = COMPARISON_TARGETS.find(
                              (t) => t.name.toLowerCase() === sc.cityB.name.toLowerCase()
                            );
                            if (found) setSelectedTarget(found);
                          }}
                          className="hover:text-primary transition-colors font-medium"
                          title={`Restore ${sc.cityA.name} vs ${sc.cityB.name} (saved ${new Date(sc.savedAt).toLocaleDateString()})`}
                        >
                          {sc.cityA.name} vs {sc.cityB.name}
                        </button>
                        <button
                          onClick={() => handleDeleteSavedComparison(sc.id)}
                          className="text-stone-400 hover:text-rose-500 ml-1"
                          aria-label={`Remove saved comparison ${sc.cityA.name} vs ${sc.cityB.name}`}
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          );
        })()}
    </div>
  );
};

