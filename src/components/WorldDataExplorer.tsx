'use client';

import React, { useState, useEffect } from 'react';
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
import { 
  Globe, 
  Search, 
  ArrowUpDown, 
  LayoutGrid, 
  List, 
  CloudFog, 
  Cigarette, 
  ArrowRight, 
  Loader2, 
  CheckCircle2, 
  AlertTriangle,
  Compass,
  X
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
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [isSearchingOnline, setIsSearchingOnline] = useState(false);
  const [onlineResults, setOnlineResults] = useState<WorldCityItem[]>([]);

  // Load curated world cities
  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      setIsLoading(true);
      const data = await fetchAllWorldCities();
      if (isMounted) {
        setCities(data);
        setIsLoading(false);
      }
    }
    loadData();
    return () => {
      isMounted = false;
    };
  }, []);

  // Handle dynamic global geocoded search if query has no local matches
  useEffect(() => {
    if (!searchQuery || searchQuery.trim().length < 3) {
      setOnlineResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      // Check if local matches exist
      const localMatches = cities.filter(
        (c) =>
          c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          c.country.toLowerCase().includes(searchQuery.toLowerCase())
      );

      // If fewer than 2 local matches, query Open-Meteo geocoding globally
      if (localMatches.length < 2) {
        setIsSearchingOnline(true);
        const external = await searchAndFetchGlobalCity(searchQuery);
        setOnlineResults(external);
        setIsSearchingOnline(false);
      } else {
        setOnlineResults([]);
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [searchQuery, cities]);

  // Combine curated + online results
  const combinedList = [...cities];
  onlineResults.forEach((ext) => {
    if (!combinedList.some((c) => c.name.toLowerCase() === ext.name.toLowerCase())) {
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

  const getAqiBadgeColor = (aqi: number) => {
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
      latitude: city.latitude,
      longitude: city.longitude,
    });
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
              <span>Global Atmospheric Telemetry Network</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-extrabold text-ink dark:text-white tracking-tight flex items-center gap-2">
              <span>Air Quality Across Tracked Cities</span>
            </h2>
            <p className="text-xs text-ink-muted dark:text-zinc-400 mt-1 max-w-2xl leading-relaxed">
              Real-time atmospheric telemetry across 35+ tracked world metros. Search any city worldwide to inspect air quality, mixing ceilings, and exposure reduction plans.
            </p>
          </div>

          <div className="flex items-center gap-2 self-start lg:self-auto">
            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-stone-100 dark:bg-zinc-900 border border-stone-300 dark:border-zinc-800 text-xs font-mono font-bold text-ink dark:text-zinc-200 shadow-xs">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>{cities.length} Tracked Metros</span>
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
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-stone-400 hover:text-ink dark:hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Filter Controls Row */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pt-2 text-xs">
          {/* Region Filter Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
            {(['All', 'Asia', 'Europe', 'Americas', 'Middle East & Africa', 'Oceania'] as WorldRegion[]).map(
              (reg) => (
                <button
                  key={reg}
                  onClick={() => setSelectedRegion(reg)}
                  className={`px-3 py-1.5 rounded-lg font-medium whitespace-nowrap transition-colors touch-target ${
                    selectedRegion === reg
                      ? 'bg-ink text-white dark:bg-white dark:text-black font-bold shadow-xs'
                      : 'bg-stone-100 hover:bg-stone-200 dark:bg-zinc-900 dark:hover:bg-zinc-800 text-ink-muted dark:text-zinc-400'
                  }`}
                >
                  {reg}
                </button>
              )
            )}
          </div>

          {/* Severity & View Controls */}
          <div className="flex items-center gap-2 self-start md:self-auto shrink-0">
            {/* Severity Dropdown Filter */}
            <select
              value={selectedSeverity}
              onChange={(e) => setSelectedSeverity(e.target.value as SeverityFilter)}
              className="px-3 py-1.5 rounded-lg bg-stone-100 dark:bg-zinc-900 border border-stone-300 dark:border-zinc-800 text-ink dark:text-zinc-200 text-xs font-medium focus:outline-none"
            >
              <option value="All">All Pollution Levels</option>
              <option value="hazardous">Hazardous (AQI 300+)</option>
              <option value="unhealthy">Unhealthy (AQI 150+)</option>
              <option value="moderate">Moderate (AQI 50–150)</option>
              <option value="clean">Clean Air (AQI &lt; 50)</option>
            </select>

            {/* Sort Toggle Button */}
            <button
              onClick={() =>
                setSortOrder(sortOrder === 'most_polluted' ? 'cleanest' : 'most_polluted')
              }
              className="px-3 py-1.5 rounded-lg bg-stone-100 hover:bg-stone-200 dark:bg-zinc-900 dark:hover:bg-zinc-800 border border-stone-300 dark:border-zinc-800 text-ink dark:text-zinc-200 font-medium flex items-center gap-1.5 transition-colors"
              title="Toggle Sort Order"
            >
              <ArrowUpDown className="w-3.5 h-3.5" />
              <span>{sortOrder === 'most_polluted' ? 'Most Polluted' : 'Cleanest First'}</span>
            </button>

            {/* View Mode Toggle */}
            <div className="hidden sm:flex items-center p-0.5 rounded-lg bg-stone-100 dark:bg-zinc-900 border border-stone-300 dark:border-zinc-800">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-1.5 rounded-md transition-colors ${
                  viewMode === 'grid'
                    ? 'bg-white dark:bg-zinc-800 text-ink dark:text-white shadow-xs'
                    : 'text-stone-400 hover:text-ink dark:hover:text-white'
                }`}
                title="Grid Card View"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setViewMode('table')}
                className={`p-1.5 rounded-md transition-colors ${
                  viewMode === 'table'
                    ? 'bg-white dark:bg-zinc-800 text-ink dark:text-white shadow-xs'
                    : 'text-stone-400 hover:text-ink dark:hover:text-white'
                }`}
                title="Ranked Table View"
              >
                <List className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
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
                key={city.id || idx}
                onClick={() => handleCityClick(city)}
                className={`group relative rounded-2xl p-5 border transition-all duration-200 cursor-pointer select-none shadow-xs hover:shadow-md ${
                  isActive
                    ? 'bg-white dark:bg-zinc-900 border-ink dark:border-white ring-2 ring-ink/20 dark:ring-white/20'
                    : 'bg-white/95 dark:bg-[#0c0c0e]/95 border-stone-300 dark:border-zinc-800/90 hover:border-stone-400 dark:hover:border-zinc-700'
                }`}
              >
                {/* Header: Rank + City + Country */}
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-mono font-bold px-1.5 py-0.5 rounded bg-stone-100 dark:bg-zinc-800 text-ink dark:text-zinc-300 border border-stone-200 dark:border-zinc-700">
                        #{city.rank || idx + 1}
                      </span>
                      <span className="text-[11px] font-mono text-ink-muted dark:text-zinc-400">
                        {city.country}
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
                    <div className="text-xl leading-none">{city.usAqi}</div>
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
                      {city.pm25} <span className="text-[10px] font-normal text-stone-400">µg/m³</span>
                    </div>
                  </div>

                  <div className="space-y-0.5">
                    <span className="text-[10px] font-mono uppercase text-ink-muted dark:text-zinc-400">
                      Inhaled Burden
                    </span>
                    <div className="font-mono font-bold text-terracotta-600 dark:text-zinc-300 flex items-center gap-1">
                      <Cigarette className="w-3 h-3" />
                      <span>~{cigarettes} cigs/d</span>
                    </div>
                  </div>
                </div>

                {/* Footer Action */}
                <div className="mt-3.5 pt-2.5 border-t border-stone-100 dark:border-zinc-800/80 flex items-center justify-between text-xs font-semibold text-ink dark:text-zinc-300">
                  <span className="text-[11px] text-ink-muted dark:text-zinc-400">
                    {city.category}
                  </span>
                  <span className="flex items-center gap-1 text-[11px] text-sage-700 dark:text-emerald-400 group-hover:translate-x-0.5 transition-transform">
                    {isActive ? 'Active City' : 'Inspect City'} &rarr;
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* TABLE RANKINGS VIEW */
        <div className="rounded-2xl glass-panel border border-stone-300 dark:border-zinc-800 bg-white/95 dark:bg-[#0c0c0e]/95 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-stone-100 dark:bg-zinc-900 border-b border-stone-200 dark:border-zinc-800 text-ink-muted dark:text-zinc-400 uppercase font-mono text-[11px]">
                <tr>
                  <th className="py-3 px-4 w-14">Rank</th>
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
                      key={city.id || idx}
                      onClick={() => handleCityClick(city)}
                      className={`cursor-pointer transition-colors ${
                        isActive
                          ? 'bg-stone-100 dark:bg-zinc-800/80 font-semibold'
                          : 'hover:bg-stone-50 dark:hover:bg-zinc-900/60'
                      }`}
                    >
                      <td className="py-3 px-4 font-mono font-bold text-ink-muted dark:text-zinc-400">
                        #{city.rank || idx + 1}
                      </td>
                      <td className="py-3 px-4 font-bold text-ink dark:text-white">
                        {city.name}
                      </td>
                      <td className="py-3 px-4 text-ink-muted dark:text-zinc-400">
                        {city.country} <span className="text-[10px] font-mono text-stone-400">({city.region})</span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`inline-block px-2.5 py-1 rounded-lg border font-mono font-bold text-xs ${getAqiBadgeColor(
                            city.usAqi
                          )}`}
                        >
                          {city.usAqi}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono font-semibold text-ink dark:text-zinc-200">
                        {city.pm25}
                      </td>
                      <td className="py-3 px-4 font-mono text-terracotta-600 dark:text-zinc-300">
                        ~{cigarettes} cigs/day
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCityClick(city);
                          }}
                          className="px-3 py-1.5 rounded-lg bg-stone-100 dark:bg-zinc-800 hover:bg-stone-200 dark:hover:bg-zinc-700 text-ink dark:text-white font-semibold text-[11px] transition-colors"
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
      )}
    </section>
  );
};
