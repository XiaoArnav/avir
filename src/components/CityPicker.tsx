'use client';

import React, { useState, useEffect } from 'react';
import { Search, MapPin, Navigation, Loader2 } from 'lucide-react';
import { searchCities, GeocodedLocation, PREDEFINED_INDIAN_CITIES } from '@/services/telemetry-service';

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
          name: 'My Location',
          country: 'Local GPS',
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
    <div className="rounded-2xl bg-[#101623] border border-gray-800 p-5 shadow-lg">
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 mb-4">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <MapPin className="w-4 h-4 text-emerald-400" />
            <span>Select Target Urban Center</span>
          </h2>
          <p className="text-xs text-gray-400">Search any global city or choose a regional smog benchmark</p>
        </div>

        <button
          onClick={handleDetectLocation}
          disabled={isLocating || isLoading}
          className="inline-flex items-center justify-center gap-2 text-xs font-medium px-3 py-2 rounded-lg bg-gray-850 hover:bg-gray-800 border border-gray-700 text-emerald-300 transition-colors disabled:opacity-50"
        >
          {isLocating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Navigation className="w-3.5 h-3.5" />}
          <span>Locate Me</span>
        </button>
      </div>

      {/* Search Input Bar */}
      <div className="relative mb-3">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-500">
          {isSearching ? <Loader2 className="w-4 h-4 animate-spin text-emerald-400" /> : <Search className="w-4 h-4" />}
        </div>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search city across India or worldwide (e.g. Lucknow, Varanasi, Gurugram)..."
          className="w-full pl-9 pr-4 py-2.5 bg-gray-900 border border-gray-700 rounded-xl text-sm text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500 transition-colors"
        />

        {/* Live Search Autocomplete Dropdown */}
        {searchResults.length > 0 && (
          <div className="absolute left-0 right-0 top-full mt-1.5 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl z-30 max-h-56 overflow-y-auto divide-y divide-gray-800">
            {searchResults.map((loc) => (
              <button
                key={loc.id}
                onClick={() => {
                  onSelectCity(loc);
                  setQuery('');
                  setSearchResults([]);
                }}
                className="w-full text-left px-4 py-2.5 text-xs text-gray-200 hover:bg-emerald-950/40 hover:text-emerald-300 flex items-center justify-between transition-colors"
              >
                <span className="font-semibold">{loc.name}</span>
                <span className="text-[11px] text-gray-400">{loc.admin1 ? `${loc.admin1}, ` : ''}{loc.country}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Quick Select Benchmark Chips */}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <span className="text-[11px] text-gray-500 font-mono uppercase tracking-wider mr-1">Benchmarks:</span>
        {PREDEFINED_INDIAN_CITIES.map((loc) => {
          const isSelected = currentCity.toLowerCase().includes(loc.name.toLowerCase());
          return (
            <button
              key={loc.id}
              onClick={() => onSelectCity(loc)}
              disabled={isLoading}
              className={`text-xs px-2.5 py-1 rounded-lg border transition-all ${
                isSelected
                  ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300 font-semibold'
                  : 'bg-gray-900/60 border-gray-800 text-gray-300 hover:bg-gray-800 hover:border-gray-700'
              }`}
            >
              {loc.name}
            </button>
          );
        })}
      </div>
    </div>
  );
};
