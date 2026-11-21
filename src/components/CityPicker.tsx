'use client';

import React, { useState, useEffect } from 'react';
import { Search, MapPin, Navigation, Loader2 } from 'lucide-react';
import { searchCities, GeocodedLocation } from '@/services/telemetry-service';

interface CityPickerProps {
  currentCity: string;
  onSelectCity: (city: GeocodedLocation) => void;
  isLoading: boolean;
}

export const CityPicker: React.FC<CityPickerProps> = ({ currentCity, onSelectCity, isLoading }) => {
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<GeocodedLocation[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isLocating, setIsLocating] = useState(false);

  useEffect(() => {
    if (!query || query.trim().length < 2) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      const results = await searchCities(query);
      setSearchResults(results);
      setIsSearching(false);
    }, 250);

    return () => clearTimeout(timer);
  }, [query]);

  const handleDetectLocation = () => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser.');
      return;
    }

    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setIsLocating(false);
        onSelectCity({
          id: 9999,
          name: 'My GPS Location',
          country: 'Local Device',
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        });
      },
      (err) => {
        setIsLocating(false);
        console.warn('Geolocation error:', err);
        alert('Could not determine GPS coordinates. Defaulting to Delhi-NCR.');
      }
    );
  };

  return (
    <div className="rounded-2xl glass-panel p-6 border border-stone-300 dark:border-zinc-800 bg-white/95 dark:bg-[#0c0c0e]/95 space-y-4 shadow-sm transition-colors">
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-ink dark:text-white flex items-center gap-2">
            <MapPin className="w-4 h-4 text-sage-600 dark:text-zinc-300" />
            <span>Target Global Air Station</span>
          </h2>
          <p className="text-xs text-ink-muted dark:text-zinc-400">
            Search any city globally or geolocate your local sensor coordinates
          </p>
        </div>

        <button
          onClick={handleDetectLocation}
          disabled={isLocating || isLoading}
          className="inline-flex items-center justify-center gap-2 text-xs font-semibold px-3.5 py-2 rounded-xl bg-stone-100 dark:bg-zinc-900 hover:bg-stone-200 dark:hover:bg-zinc-800 border border-stone-300 dark:border-zinc-800 text-ink dark:text-zinc-200 transition-colors disabled:opacity-50 touch-target active:scale-95 shadow-xs"
        >
          {isLocating ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin text-ink dark:text-white" />
          ) : (
            <Navigation className="w-3.5 h-3.5 text-sage-600 dark:text-zinc-400" />
          )}
          <span>{isLocating ? 'Locating...' : 'Locate Me'}</span>
        </button>
      </div>

      {/* Search Input Bar */}
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-stone-400 dark:text-zinc-500">
          {isSearching ? (
            <Loader2 className="w-4 h-4 animate-spin text-ink dark:text-white" />
          ) : (
            <Search className="w-4 h-4 text-stone-400 dark:text-zinc-400" />
          )}
        </div>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search any city (e.g. Lahore, Lucknow, Gurugram, Beijing, London)..."
          className="w-full pl-10 pr-4 py-2.5 bg-stone-50 dark:bg-zinc-900/80 border border-stone-300 dark:border-zinc-800 rounded-xl text-sm text-ink dark:text-white placeholder-stone-400 dark:placeholder-zinc-500 focus:outline-none focus:border-ink dark:focus:border-white transition-colors"
        />

        {/* Live Search Autocomplete Dropdown */}
        {searchResults.length > 0 && (
          <div className="absolute left-0 right-0 top-full mt-2 bg-white dark:bg-zinc-900/95 backdrop-blur-2xl border border-stone-300 dark:border-zinc-800 rounded-xl shadow-2xl z-30 max-h-56 overflow-y-auto divide-y divide-stone-200 dark:divide-zinc-800">
            {searchResults.map((loc) => (
              <button
                key={loc.id}
                onClick={() => {
                  onSelectCity(loc);
                  setQuery('');
                  setSearchResults([]);
                }}
                className="w-full text-left px-4 py-3 hover:bg-stone-100 dark:hover:bg-zinc-800/80 transition-colors text-xs text-ink dark:text-zinc-200 flex items-center justify-between"
              >
                <div>
                  <span className="font-bold text-ink dark:text-white text-sm">{loc.name}</span>
                  {loc.admin1 && <span className="text-ink-muted dark:text-zinc-400 ml-1.5 font-mono">({loc.admin1})</span>}
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-stone-100 dark:bg-zinc-800 text-ink-muted dark:text-zinc-400 font-mono border border-stone-200 dark:border-zinc-700">
                  {loc.country}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Active City Confirmation Stamp */}
      <div className="flex items-center justify-between text-xs text-ink-muted dark:text-zinc-400 pt-1">
        <span className="flex items-center gap-1.5 font-mono">
          <span className="w-1.5 h-1.5 rounded-full bg-sage-500 dark:bg-emerald-400" />
          <span>Active: <strong className="text-ink dark:text-white">{currentCity}</strong></span>
        </span>
        <span className="text-[11px] font-mono text-stone-400 dark:text-zinc-500">
          Open-Meteo High-Resolution Mesh
        </span>
      </div>
    </div>
  );
};
