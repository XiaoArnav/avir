'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Search, MapPin, Navigation, Loader2, AlertCircle, X } from 'lucide-react';
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
  const [geoError, setGeoError] = useState<string | null>(null);
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!query || query.trim().length < 2) {
      setSearchResults([]);
      setHighlightedIndex(-1);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      const results = await searchCities(query);
      setSearchResults(results);
      setHighlightedIndex(results.length > 0 ? 0 : -1);
      setIsSearching(false);
    }, 250);

    return () => clearTimeout(timer);
  }, [query]);

  const handleDetectLocation = () => {
    setGeoError(null);
    if (typeof window === 'undefined' || !navigator.geolocation) {
      setGeoError('Geolocation is not supported by your browser.');
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
        if (err.code === err.PERMISSION_DENIED) {
          setGeoError('Location permission denied. You can search your city name in the search box below.');
        } else if (err.code === err.TIMEOUT) {
          setGeoError('Location request timed out. Please search for your city directly.');
        } else {
          setGeoError('Unable to retrieve device coordinates. Please enter your city name above.');
        }
      },
      { timeout: 10000, maximumAge: 60000 }
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (searchResults.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev + 1) % searchResults.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev - 1 + searchResults.length) % searchResults.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightedIndex >= 0 && highlightedIndex < searchResults.length) {
        const selected = searchResults[highlightedIndex];
        onSelectCity(selected);
        setQuery('');
        setSearchResults([]);
      }
    } else if (e.key === 'Escape') {
      setSearchResults([]);
    }
  };

  return (
    <div className="rounded-2xl glass-panel p-6 border border-stone-300 dark:border-zinc-800 bg-white/95 dark:bg-[#0c0c0e]/95 space-y-4 shadow-sm transition-colors">
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-ink dark:text-white flex items-center gap-2">
            <MapPin className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span>Target Global Air Station</span>
          </h2>
          <p className="text-xs text-ink-muted dark:text-zinc-400">
            Search any city globally with verified geographic disambiguation
          </p>
        </div>

        <button
          type="button"
          onClick={handleDetectLocation}
          disabled={isLocating || isLoading}
          aria-label="Detect current location via device GPS"
          className="inline-flex items-center justify-center gap-2 text-xs font-semibold px-3.5 py-2 rounded-xl bg-stone-100 dark:bg-zinc-900 hover:bg-stone-200 dark:hover:bg-zinc-800 border border-stone-300 dark:border-zinc-800 text-ink dark:text-zinc-200 transition-colors disabled:opacity-50 touch-target active:scale-95 shadow-xs cursor-pointer focus-visible-ring"
        >
          {isLocating || isLoading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin text-ink dark:text-white" />
          ) : (
            <Navigation className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
          )}
          <span>{isLocating ? 'Locating...' : isLoading ? 'Loading...' : 'Locate Me'}</span>
        </button>
      </div>

      {geoError && (
        <div
          role="alert"
          className="flex items-center justify-between p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-800 dark:text-amber-300"
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
            <span>{geoError}</span>
          </div>
          <button
            type="button"
            onClick={() => setGeoError(null)}
            className="p-1 text-ink-muted hover:text-ink dark:text-zinc-400 dark:hover:text-white"
            aria-label="Dismiss error"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

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
          role="combobox"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          aria-label="Search city name for air quality telemetry"
          aria-autocomplete="list"
          aria-expanded={searchResults.length > 0}
          aria-controls="city-search-results"
          placeholder="Search any city (e.g. Lahore, Lucknow, Gurugram, Beijing, London)..."
          className="w-full pl-10 pr-4 py-2.5 bg-stone-50 dark:bg-zinc-900/80 border border-stone-300 dark:border-zinc-800 rounded-xl text-sm text-ink dark:text-white placeholder-stone-400 dark:placeholder-zinc-500 focus:outline-none focus:border-ink dark:focus:border-white transition-colors focus-visible-ring"
        />

        {/* Live Search Autocomplete Dropdown */}
        {searchResults.length > 0 && (
          <div
            id="city-search-results"
            role="listbox"
            ref={dropdownRef}
            className="absolute left-0 right-0 top-full mt-2 bg-white dark:bg-zinc-900/95 backdrop-blur-2xl border border-stone-300 dark:border-zinc-800 rounded-xl shadow-2xl z-30 max-h-56 overflow-y-auto divide-y divide-stone-200 dark:divide-zinc-800"
          >
            {searchResults.map((loc, idx) => {
              const isHighlighted = idx === highlightedIndex;
              return (
                <button
                  key={loc.id}
                  role="option"
                  aria-selected={isHighlighted}
                  onClick={() => {
                    onSelectCity(loc);
                    setQuery('');
                    setSearchResults([]);
                  }}
                  onMouseEnter={() => setHighlightedIndex(idx)}
                  className={`w-full text-left px-4 py-3 transition-colors text-xs text-ink dark:text-zinc-200 flex items-center justify-between cursor-pointer ${
                    isHighlighted ? 'bg-stone-100 dark:bg-zinc-800' : 'hover:bg-stone-50 dark:hover:bg-zinc-850'
                  }`}
                >
                  <div>
                    <span className="font-bold text-ink dark:text-white text-sm">{loc.name}</span>
                    {loc.admin1 && (
                      <span className="text-ink-muted dark:text-zinc-400 ml-1.5 font-mono">
                        ({loc.admin1})
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-stone-100 dark:bg-zinc-800 text-ink-muted dark:text-zinc-400 font-mono border border-stone-200 dark:border-zinc-700">
                    {loc.country}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Active City Confirmation Stamp */}
      <div className="flex items-center justify-between text-xs text-ink-muted dark:text-zinc-400 pt-1">
        <span className="flex items-center gap-1.5 font-mono">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          <span>Active: <strong className="text-ink dark:text-white">{currentCity}</strong></span>
        </span>
        <span className="text-[11px] font-mono text-stone-400 dark:text-zinc-500">
          Open-Meteo High-Resolution Mesh
        </span>
      </div>
    </div>
  );
};
