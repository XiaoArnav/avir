'use client';

import React, { useState, useEffect, useRef } from 'react';
import { 
  WorldCityItem, 
  WorldRegion, 
  SeverityFilter, 
  SortOrder, 
  fetchAllWorldCities, 
  filterAndSortWorldCities, 
  searchAndFetchGlobalCity 
} from '@/services/world-telemetry-service';
import { GeocodedLocation } from '@/services/telemetry-service';
import { calculateCigaretteEquivalence } from '@/domain/air-math';
import { savedComparisonsService, SavedCityComparisonRecord } from '@/services/saved-comparisons-service';
import { AvirGlobe } from '@/components/globe';
import { buildGeographicObservations } from '@/services/geo/geographic-observation-adapter';
import { 
  Globe, 
  Search, 
  ArrowUpDown, 
  LayoutGrid, 
  List, 
  Cigarette, 
  Loader2, 
  X,
  Bookmark,
  Trash2,
  Clock,
  Layers
} from 'lucide-react';

interface WorldDataExplorerProps {
  onSelectCity: (city: GeocodedLocation) => void;
  activeCityName: string;
}

export const WorldDataExplorer: React.FC<WorldDataExplorerProps> = ({
  onSelectCity,
  activeCityName,
}) => {
  const [cities, setCities] = useState<WorldCityItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRegion, setSelectedRegion] = useState<WorldRegion>('All');
  const [selectedSeverity, setSelectedSeverity] = useState<SeverityFilter>('All');
  const [sortOrder, setSortOrder] = useState<SortOrder>('most_polluted');
  const [viewMode, setViewMode] = useState<'grid' | 'table' | 'globe'>('grid');
  const [isSearchingOnline, setIsSearchingOnline] = useState(false);
  const [onlineResults, setOnlineResults] = useState<WorldCityItem[]>([]);
  const [savedComparisons, setSavedComparisons] = useState<SavedCityComparisonRecord[]>(() =>
    typeof window !== 'undefined' ? savedComparisonsService.getSavedComparisons() : []
  );

  // Search race condition protection refs
  const searchGenRef = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Load curated world cities
  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      setIsLoading(true);
      try {
        const data = await fetchAllWorldCities();
        if (isMounted) {
          setCities(data);
          setIsLoading(false);
        }
      } catch {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }
    loadData();
    return () => {
      isMounted = false;
    };
  }, []);

  // Handle dynamic global geocoded search with generation token and abort protection
  useEffect(() => {
    if (!searchQuery || searchQuery.trim().length < 2) {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      setOnlineResults([]);
      setIsSearchingOnline(false);
      return;
    }

    const currentGen = ++searchGenRef.current;
    const timer = setTimeout(async () => {
      const q = searchQuery.toLowerCase().trim();
      // Check if local matches exist in curated list
      const localMatches = cities.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.country.toLowerCase().includes(q) ||
          (c.countryCode && c.countryCode.toLowerCase().includes(q))
      );

      // If fewer than 2 local matches, query Open-Meteo geocoding globally
      if (localMatches.length < 2) {
        if (abortControllerRef.current) {
          abortControllerRef.current.abort();
        }
        const controller = new AbortController();
        abortControllerRef.current = controller;

        setIsSearchingOnline(true);
        try {
          const external = await searchAndFetchGlobalCity(searchQuery, controller.signal);
          if (searchGenRef.current === currentGen) {
            setOnlineResults(external);
          }
        } catch (err: unknown) {
          if (!(err instanceof Error && err.name === 'AbortError')) {
            console.warn('Dynamic geocoded world search error:', err);
          }
        } finally {
          if (searchGenRef.current === currentGen) {
            setIsSearchingOnline(false);
          }
        }
      } else {
        setOnlineResults([]);
        setIsSearchingOnline(false);
      }
    }, 300);

    return () => {
      clearTimeout(timer);
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };
  }, [searchQuery, cities]);

  // Combine curated + online results with strict geographic deduplication
  const combinedList = [...cities];
  onlineResults.forEach((ext) => {
    const extLat = Math.round(ext.latitude * 100);
    const extLon = Math.round(ext.longitude * 100);
    const alreadyExists = combinedList.some((c) => {
      const cLat = Math.round(c.latitude * 100);
      const cLon = Math.round(c.longitude * 100);
      return (
        c.cityId === ext.cityId ||
        (c.name.toLowerCase() === ext.name.toLowerCase() &&
          c.country.toLowerCase() === ext.country.toLowerCase() &&
          cLat === extLat &&
          cLon === extLon)
      );
    });

    if (!alreadyExists) {
      combinedList.push(ext);
    }
  });

  const filteredCities = filterAndSortWorldCities(
    combinedList,
    searchQuery,
    selectedRegion,
    selectedSeverity,
    sortOrder
  );

  // Calculate cohort transparency statistics
  const comparableCities = cities.filter((c) => c.comparable && c.cohortRank !== null);
  const dominantTimestamp = cities.find((c) => c.modelValidAt)?.modelValidAt || null;
  const isStaleFeed = cities.some((c) => c.status === 'stale');

  const getAqiBadgeColor = (aqi: number | null | undefined) => {
    if (aqi === null || aqi === undefined) return 'bg-stone-200/60 border-stone-300 text-stone-500 dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-400';
    if (aqi <= 50) return 'bg-emerald-500/15 border-emerald-500/30 text-emerald-600 dark:text-emerald-400';
    if (aqi <= 100) return 'bg-yellow-500/15 border-yellow-500/30 text-yellow-600 dark:text-yellow-400';
    if (aqi <= 150) return 'bg-orange-500/15 border-orange-500/30 text-orange-600 dark:text-orange-400';
    if (aqi <= 200) return 'bg-rose-500/15 border-rose-500/30 text-rose-600 dark:text-rose-400';
    if (aqi <= 300) return 'bg-purple-500/15 border-purple-500/30 text-purple-600 dark:text-purple-400';
    return 'bg-red-600/20 border-red-600/40 text-red-600 dark:text-red-400';
  };

  const handleCityClick = (city: WorldCityItem) => {
    onSelectCity({
      id: city.id,
      name: city.name,
      country: city.country,
      admin1: city.admin1 || undefined,
      latitude: city.latitude,
      longitude: city.longitude,
    });
  };

  const handleDeleteSavedComparison = (id: string) => {
    savedComparisonsService.removeSavedComparison(id);
    setSavedComparisons(savedComparisonsService.getSavedComparisons());
  };

  return (
    <section 
      aria-label="Global Air Quality Index Rankings"
      className="space-y-6 animate-in fade-in duration-300"
    >
      {/* Top Banner / Header */}
      <div className="rounded-2xl glass-panel p-6 sm:p-8 border border-stone-300 dark:border-zinc-800 bg-white/95 dark:bg-[#0c0c0e]/95 shadow-sm transition-colors space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-stone-200 dark:border-zinc-800 pb-5">
          <div>
            <div className="flex items-center gap-2 text-xs font-mono text-ink-muted dark:text-zinc-400 uppercase tracking-wider mb-1">
              <Globe className="w-3.5 h-3.5 text-sage-600 dark:text-emerald-400" />
              <span>Global Air Quality — Tracked City Comparison</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-extrabold text-ink dark:text-white tracking-tight flex items-center gap-2">
              <span>Worldwide Modeled Telemetry &amp; Cohort Rankings</span>
            </h2>
            <p className="text-xs text-ink-muted dark:text-zinc-400 mt-1 max-w-2xl leading-relaxed">
              Compare modeled air quality across selected cities. Rankings include only cities with compatible, available data. Telemetry is modeled forecast data from ECMWF CAMS Global, not regulatory ground-station monitors.
            </p>
          </div>

          {/* Model Transparency & Cohort Badges */}
          <div className="flex items-center gap-2 flex-wrap self-start lg:self-auto">
            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-stone-100 dark:bg-zinc-900 border border-stone-300 dark:border-zinc-800 text-xs font-mono font-bold text-ink dark:text-zinc-200 shadow-xs">
              <span className={`w-2 h-2 rounded-full ${isStaleFeed ? 'bg-amber-500' : 'bg-emerald-500 animate-pulse'}`} />
              <span>{cities.length} Tracked Metros</span>
            </span>
            <span className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-xs font-mono font-semibold">
              <Layers className="w-3 h-3" />
              <span>{comparableCities.length} Comparable</span>
            </span>
            <span className="hidden sm:flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-stone-100 dark:bg-zinc-900 border border-stone-300 dark:border-zinc-800 text-[11px] font-mono text-ink-muted dark:text-zinc-400">
              <Clock className="w-3 h-3" />
              <span>{dominantTimestamp ? new Date(dominantTimestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Model valid time unavailable'}</span>
            </span>
          </div>
        </div>

        {/* Global Live Search Bar */}
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-stone-400 dark:text-zinc-500">
            {isSearchingOnline ? (
              <Loader2 className="w-4 h-4 animate-spin text-ink dark:text-white" />
            ) : (
              <Search className="w-4 h-4 text-stone-400 dark:text-zinc-400" />
            )}
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search any global city or country (e.g. Tokyo, Paris, New York, Cairo, Dubai, London, Zurich)..."
            className="w-full pl-10 pr-10 py-3 bg-stone-50 dark:bg-zinc-900/80 border border-stone-300 dark:border-zinc-800 rounded-xl text-sm text-ink dark:text-white placeholder-stone-400 dark:placeholder-zinc-500 focus:outline-none focus:border-ink dark:focus:border-white transition-colors"
            aria-label="Search global cities or countries"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-stone-400 hover:text-ink dark:hover:text-white focus:outline-none"
              aria-label="Clear search query"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Filter Controls Row */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pt-2 text-xs">
          {/* Region Filter Pills */}
          <div className="flex flex-wrap items-center gap-1.5 py-0.5">
            {(['All', 'Asia', 'Europe', 'Americas', 'Middle East & Africa', 'Oceania'] as WorldRegion[]).map(
              (reg) => (
                <button
                  key={reg}
                  type="button"
                  onClick={() => setSelectedRegion(reg)}
                  className={`px-3 py-1.5 rounded-lg font-medium whitespace-nowrap transition-colors touch-target focus:outline-none focus:ring-2 focus:ring-emerald-500 ${
                    selectedRegion === reg
                      ? 'bg-ink text-white dark:bg-white dark:text-black font-bold shadow-xs'
                      : 'bg-stone-100 hover:bg-stone-200 dark:bg-zinc-900 dark:hover:bg-zinc-800 text-ink-muted dark:text-zinc-400'
                  }`}
                  aria-pressed={selectedRegion === reg}
                >
                  {reg}
                </button>
              )
            )}
          </div>

          {/* Severity & View Controls */}
          <div className="flex items-center gap-2 self-start md:self-auto shrink-0">
            {/* Severity Dropdown Filter (US EPA standard categories) */}
            <select
              value={selectedSeverity}
              onChange={(e) => setSelectedSeverity(e.target.value as SeverityFilter)}
              className="px-3 py-1.5 rounded-lg bg-stone-100 dark:bg-zinc-900 border border-stone-300 dark:border-zinc-800 text-ink dark:text-zinc-200 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500"
              aria-label="Filter by air quality severity"
            >
              <option value="All">All Pollution Levels</option>
              <option value="hazardous">Hazardous &amp; Very Unhealthy (AQI &gt; 200)</option>
              <option value="unhealthy">Unhealthy &amp; Sensitive (AQI 101–200)</option>
              <option value="moderate">Moderate (AQI 51–100)</option>
              <option value="clean">Good / Clean Air (AQI ≤ 50)</option>
            </select>

            {/* Sort Toggle Button */}
            <button
              type="button"
              onClick={() =>
                setSortOrder(sortOrder === 'most_polluted' ? 'cleanest' : 'most_polluted')
              }
              className="px-3 py-1.5 rounded-lg bg-stone-100 hover:bg-stone-200 dark:bg-zinc-900 dark:hover:bg-zinc-800 border border-stone-300 dark:border-zinc-800 text-ink dark:text-zinc-200 font-medium flex items-center gap-1.5 transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500"
              title="Toggle Sort Order"
              aria-label={`Sort order: currently ${sortOrder === 'most_polluted' ? 'Most Polluted' : 'Cleanest First'}`}
            >
              <ArrowUpDown className="w-3.5 h-3.5" />
              <span>{sortOrder === 'most_polluted' ? 'Most Polluted' : 'Cleanest First'}</span>
            </button>

            {/* View Mode Toggle */}
            <div className="hidden sm:flex items-center p-0.5 rounded-lg bg-stone-100 dark:bg-zinc-900 border border-stone-300 dark:border-zinc-800">
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                className={`p-1.5 rounded-md transition-colors focus:outline-none ${
                  viewMode === 'grid'
                    ? 'bg-white dark:bg-zinc-800 text-ink dark:text-white shadow-xs'
                    : 'text-stone-400 hover:text-ink dark:hover:text-white'
                }`}
                title="Grid Card View"
                aria-label="Switch to grid card view"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={`p-1.5 rounded-md transition-colors focus:outline-none ${
                  viewMode === 'table'
                    ? 'bg-white dark:bg-zinc-800 text-ink dark:text-white shadow-xs'
                    : 'text-stone-400 hover:text-ink dark:hover:text-white'
                }`}
                title="Ranked Table View"
                aria-label="Switch to ranked table view"
              >
                <List className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setViewMode('globe')}
                className={`p-1.5 rounded-md transition-colors focus:outline-none ${
                  viewMode === 'globe'
                    ? 'bg-white dark:bg-zinc-800 text-ink dark:text-white shadow-xs'
                    : 'text-stone-400 hover:text-ink dark:hover:text-white'
                }`}
                title="3D Earth Globe View"
                aria-label="Switch to 3D earth globe view"
              >
                <Globe className="w-3.5 h-3.5 text-sky-500" />
              </button>
            </div>
          </div>
        </div>

        {/* Saved City Comparisons Drawer */}
        {savedComparisons.length > 0 && (
          <div className="pt-2 border-t border-stone-200 dark:border-zinc-800/80 flex items-center gap-2 overflow-x-auto text-xs">
            <span className="text-[11px] font-mono text-ink-muted dark:text-zinc-400 shrink-0 flex items-center gap-1">
              <Bookmark className="w-3 h-3 text-emerald-500" />
              <span>Saved on this device:</span>
            </span>
            {savedComparisons.map((sc) => (
              <span
                key={sc.id}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-stone-100 dark:bg-zinc-800 border border-stone-200 dark:border-zinc-700 text-[11px] shrink-0"
              >
                <span className="font-medium text-ink dark:text-zinc-200">{sc.cityA.name} vs {sc.cityB.name}</span>
                <button
                  type="button"
                  onClick={() => handleDeleteSavedComparison(sc.id)}
                  className="text-stone-400 hover:text-rose-500"
                  aria-label={`Remove saved comparison ${sc.cityA.name} vs ${sc.cityB.name}`}
                >
                  <Trash2 className="w-2.5 h-2.5" />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Loading Skeletons */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 animate-pulse">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-36 rounded-2xl bg-stone-200 dark:bg-zinc-900 border border-stone-300 dark:border-zinc-800"
            />
          ))}
        </div>
      ) : filteredCities.length === 0 ? (
        <div className="p-12 text-center rounded-2xl glass-panel border border-stone-300 dark:border-zinc-800 bg-white/95 dark:bg-[#0c0c0e]/95 space-y-3">
          <Globe className="w-8 h-8 text-stone-400 dark:text-zinc-600 mx-auto" />
          <h3 className="text-base font-bold text-ink dark:text-white">No Cities Match Your Filter</h3>
          <p className="text-xs text-ink-muted dark:text-zinc-400 max-w-md mx-auto">
            Try adjusting your search query, selecting &quot;All Regions&quot;, or removing the severity filter.
          </p>
        </div>
      ) : viewMode === 'grid' ? (
        /* GRID CARDS VIEW */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredCities.map((city, idx) => {
            const isActive = activeCityName.toLowerCase().trim() === city.name.toLowerCase().trim();
            const cigarettes = calculateCigaretteEquivalence(city.pm25);

            return (
              <div
                key={city.cityId || city.id || idx}
                onClick={() => handleCityClick(city)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleCityClick(city);
                  }
                }}
                tabIndex={0}
                role="button"
                aria-label={`Select ${city.name}, ${city.country} to inspect air quality`}
                className={`group relative rounded-2xl p-5 border transition-all duration-200 cursor-pointer select-none shadow-xs hover:shadow-md focus:outline-none focus:ring-2 focus:ring-emerald-500 ${
                  isActive
                    ? 'bg-white dark:bg-zinc-900 border-ink dark:border-white ring-2 ring-ink/20 dark:ring-white/20'
                    : 'bg-white/95 dark:bg-[#0c0c0e]/95 border-stone-300 dark:border-zinc-800/90 hover:border-stone-400 dark:hover:border-zinc-700'
                }`}
              >
                {/* Header: Rank + City + Country */}
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[11px] font-mono font-bold px-1.5 py-0.5 rounded bg-stone-100 dark:bg-zinc-800 text-ink dark:text-zinc-300 border border-stone-200 dark:border-zinc-700">
                        {city.cohortRank ? `#${city.cohortRank} of ${city.cohortSize}` : (city.rank ? `#${city.rank}` : 'Unranked')}
                      </span>
                      <span className="text-[11px] font-mono text-ink-muted dark:text-zinc-400">
                        {city.country} {city.admin1 ? `• ${city.admin1}` : ''}
                      </span>
                    </div>
                    <h3 className="text-lg font-bold text-ink dark:text-white tracking-tight mt-1 group-hover:text-primary transition-colors">
                      {city.name}
                    </h3>
                  </div>

                  {/* AQI Numerical Badge */}
                  <div
                    className={`px-3 py-1.5 rounded-xl border text-center font-mono font-extrabold ${getAqiBadgeColor(
                      city.usAqi
                    )}`}
                  >
                    <div className="text-xl leading-none">{city.usAqi !== null ? city.usAqi : '--'}</div>
                    <div className="text-[9px] uppercase tracking-wider font-sans mt-0.5">AQI</div>
                  </div>
                </div>

                {/* Metrics Breakdown */}
                <div className="grid grid-cols-2 gap-2 text-xs pt-3 border-t border-stone-100 dark:border-zinc-800/80">
                  <div className="space-y-0.5">
                    <span className="text-[10px] font-mono uppercase text-ink-muted dark:text-zinc-400">
                      Fine PM2.5
                    </span>
                    <div className="font-mono font-bold text-ink dark:text-white">
                      {city.pm25 !== null ? (
                        <>{city.pm25} <span className="text-[10px] font-normal text-stone-400">µg/m³</span></>
                      ) : (
                        <span className="text-stone-400">Unavailable</span>
                      )}
                    </div>
                  </div>

                  <div className="space-y-0.5">
                    <span className="text-[10px] font-mono uppercase text-ink-muted dark:text-zinc-400">
                      Inhaled Burden
                    </span>
                    <div className="font-mono font-bold text-terracotta-600 dark:text-zinc-300 flex items-center gap-1">
                      <Cigarette className="w-3 h-3" />
                      <span>{cigarettes !== null ? `~${cigarettes} cigs/d` : 'Unavailable'}</span>
                    </div>
                  </div>
                </div>

                {/* Footer Action & Provenance Label */}
                <div className="mt-3.5 pt-2.5 border-t border-stone-100 dark:border-zinc-800/80 flex items-center justify-between text-xs font-semibold text-ink dark:text-zinc-300">
                  <span className="text-[11px] text-ink-muted dark:text-zinc-400 flex items-center gap-1">
                    <span>{city.category}</span>
                    {city.status === 'stale' && (
                      <span className="text-[9px] px-1 rounded bg-amber-500/10 text-amber-500 font-mono">Stale</span>
                    )}
                  </span>
                  <span className="flex items-center gap-1 text-[11px] text-sage-700 dark:text-emerald-400 group-hover:translate-x-0.5 transition-transform">
                    {isActive ? 'Active City' : 'Inspect City'} &rarr;
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      ) : viewMode === 'table' ? (
        /* TABLE RANKINGS VIEW */
        <div className="rounded-2xl glass-panel border border-stone-300 dark:border-zinc-800 bg-white/95 dark:bg-[#0c0c0e]/95 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-stone-100 dark:bg-zinc-900 border-b border-stone-200 dark:border-zinc-800 text-ink-muted dark:text-zinc-400 uppercase font-mono text-[11px]">
                <tr>
                  <th className="py-3 px-4 w-16">Rank</th>
                  <th className="py-3 px-4">City</th>
                  <th className="py-3 px-4">Country / Region</th>
                  <th className="py-3 px-4 text-center">US AQI</th>
                  <th className="py-3 px-4">PM2.5 (µg/m³)</th>
                  <th className="py-3 px-4">Inhaled Equivalent</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-200 dark:divide-zinc-800">
                {filteredCities.map((city, idx) => {
                  const isActive =
                    activeCityName.toLowerCase().trim() === city.name.toLowerCase().trim();
                  const cigarettes = calculateCigaretteEquivalence(city.pm25);

                  return (
                    <tr
                      key={city.cityId || city.id || idx}
                      onClick={() => handleCityClick(city)}
                      className={`cursor-pointer transition-colors ${
                        isActive
                          ? 'bg-stone-100 dark:bg-zinc-800/80 font-semibold'
                          : 'hover:bg-stone-50 dark:hover:bg-zinc-900/60'
                      }`}
                    >
                      <td className="py-3 px-4 font-mono font-bold text-ink-muted dark:text-zinc-400">
                        {city.cohortRank ? `#${city.cohortRank}` : (city.rank ? `#${city.rank}` : '-')}
                      </td>
                      <td className="py-3 px-4 font-bold text-ink dark:text-white">
                        {city.name}
                      </td>
                      <td className="py-3 px-4 text-ink-muted dark:text-zinc-400">
                        {city.country} {city.admin1 ? `(${city.admin1})` : ''} <span className="text-[10px] font-mono text-stone-400">({city.region})</span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`inline-block px-2.5 py-1 rounded-lg border font-mono font-bold text-xs ${getAqiBadgeColor(
                            city.usAqi
                          )}`}
                        >
                          {city.usAqi !== null ? city.usAqi : '--'}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono font-semibold text-ink dark:text-zinc-200">
                        {city.pm25 !== null ? city.pm25 : '--'}
                      </td>
                      <td className="py-3 px-4 font-mono text-terracotta-600 dark:text-zinc-300">
                        {cigarettes !== null ? `~${cigarettes} cigs/day` : '--'}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCityClick(city);
                          }}
                          className="px-3 py-1.5 rounded-lg bg-stone-100 dark:bg-zinc-800 hover:bg-stone-200 dark:hover:bg-zinc-700 text-ink dark:text-white font-semibold text-[11px] transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500"
                          aria-label={`Inspect ${city.name}`}
                        >
                          {isActive ? 'Active' : 'Inspect'} &rarr;
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* 3D EARTH GLOBE VIEW */
        <div className="w-full">
          <AvirGlobe
            points={buildGeographicObservations({ standard: 'epa', worldCities: cities })}
            activeCityName={activeCityName}
            onSelectPoint={() => {}}
            onSetActiveCity={(pt) => {
              onSelectCity({
                id: Math.floor(Math.random() * 100000),
                name: pt.name,
                country: pt.country,
                countryCode: pt.countryCode,
                latitude: pt.latitude,
                longitude: pt.longitude,
              });
            }}
          />
        </div>
      )}
    </section>
  );
};
