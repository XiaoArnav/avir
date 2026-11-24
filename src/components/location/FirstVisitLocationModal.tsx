'use client';

import React, { useState } from 'react';
import {
  Navigation,
  Search,
  Globe2,
  X,
  AlertCircle,
  Loader2,
  CheckCircle2,
} from 'lucide-react';
import { GeocodedLocation, PREDEFINED_INDIAN_CITIES } from '@/services/telemetry-service';
import { WORLD_METROS } from '@/services/world-telemetry-service';
import { LocationSelectionSource } from '@/domain/types';

export interface FirstVisitLocationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectCity: (location: GeocodedLocation, source?: LocationSelectionSource) => void;
  onOpenSearchPicker?: () => void;
}

export function FirstVisitLocationModal({
  isOpen,
  onClose,
  onSelectCity,
  onOpenSearchPicker,
}: FirstVisitLocationModalProps) {
  const [geoStatus, setGeoStatus] = useState<'idle' | 'requesting' | 'denied' | 'error' | 'success'>('idle');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchActive, setIsSearchActive] = useState(false);

  if (!isOpen) return null;

  // 1. Explicit User-Initiated Geolocation Request
  const handleRequestGeolocation = () => {
    if (!navigator.geolocation) {
      setGeoStatus('error');
      setErrorMessage('Geolocation is not supported by your browser.');
      return;
    }

    setGeoStatus('requesting');
    setErrorMessage('');

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const lat = Number(pos.coords.latitude.toFixed(3));
          const lon = Number(pos.coords.longitude.toFixed(3));

          // Call secure, cached reverse geocoding API route
          let detectedLocation: GeocodedLocation = {
            id: Math.abs(Math.round(lat * 1000) * 10000 + (Math.round(lon * 1000) % 10000)),
            name: `Near ${lat >= 0 ? `${lat.toFixed(2)}°N` : `${Math.abs(lat).toFixed(2)}°S`}, ${lon >= 0 ? `${lon.toFixed(2)}°E` : `${Math.abs(lon).toFixed(2)}°W`}`,
            country: 'Detected Location',
            countryCode: 'IN',
            latitude: lat,
            longitude: lon,
          };

          try {
            const res = await fetch(`/api/geo/reverse?lat=${lat}&lon=${lon}`);
            if (res.ok) {
              const data = await res.json();
              if (data?.name) {
                detectedLocation = {
                  id: data.id ?? detectedLocation.id,
                  name: data.name,
                  admin1: data.admin1,
                  country: data.country ?? detectedLocation.country,
                  countryCode: data.countryCode ?? detectedLocation.countryCode,
                  latitude: data.latitude ?? lat,
                  longitude: data.longitude ?? lon,
                };
              }
            }
          } catch {
            // Falls back to coarse coordinates gracefully
          }

          setGeoStatus('success');
          try {
            // Respect user privacy: Do NOT automatically persist raw GPS coordinates across sessions.
            // Mark onboarding as complete; ephemeral GPS stays session-scoped in memory.
            localStorage.setItem('avir_location_onboarded_v1', 'true');
          } catch {}

          setTimeout(() => {
            onSelectCity(detectedLocation, 'ephemeral_gps');
            onClose();
          }, 400);
        } catch (err: any) {
          setGeoStatus('error');
          setErrorMessage('Failed to resolve coordinates. Please choose a city below.');
        }
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setGeoStatus('denied');
          setErrorMessage('Location permission was denied. You can search for your city below.');
        } else {
          setGeoStatus('error');
          setErrorMessage('Could not determine your location. Please choose a city below.');
        }
      },
      {
        enableHighAccuracy: false,
        timeout: 10000,
        maximumAge: 300000, // 5 minutes cache
      }
    );
  };

  // 2. Explore without Location (Default Example City)
  const handleExploreWithoutLocation = () => {
    try {
      localStorage.setItem('avir_location_onboarded_v1', 'true');
    } catch {}
    // Clearly marked as Example City (Delhi-NCR)
    onSelectCity(PREDEFINED_INDIAN_CITIES[0]);
    onClose();
  };

  // Filter cities for inline search
  const filteredIndian = searchQuery.trim()
    ? PREDEFINED_INDIAN_CITIES.filter((c) =>
        c.name.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : PREDEFINED_INDIAN_CITIES.slice(0, 6);

  const filteredWorld = searchQuery.trim()
    ? WORLD_METROS.filter((c) =>
        c.name.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : WORLD_METROS.slice(0, 4);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="location-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-200"
    >
      <div className="relative w-full max-w-md rounded-3xl bg-stone-900/95 dark:bg-[#060b18]/95 border border-stone-200/20 dark:border-sky-500/30 p-6 shadow-2xl text-white">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <div className="flex items-center gap-1.5 text-xs text-sky-400 font-bold uppercase tracking-wider telemetry-mono">
              <Globe2 className="w-4 h-4 text-sky-400" />
              <span>Avir Earth Intelligence</span>
            </div>
            <h2 id="location-dialog-title" className="text-xl font-black text-white mt-1">
              Explore the air around you.
            </h2>
            <p className="text-xs text-slate-300 mt-1 leading-relaxed">
              Connect to real-time atmospheric telemetry and high-resolution planetary modeling.
            </p>
          </div>

          <button
            type="button"
            onClick={handleExploreWithoutLocation}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            aria-label="Dismiss location selection"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Options Stack */}
        <div className="space-y-3 my-5">
          {/* Option 1: Use Current Location */}
          <button
            type="button"
            onClick={handleRequestGeolocation}
            disabled={geoStatus === 'requesting'}
            className="w-full flex items-center gap-3.5 p-3.5 rounded-2xl bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/40 text-left transition-all cursor-pointer group"
          >
            <div className="w-10 h-10 rounded-xl bg-sky-500/20 flex items-center justify-center text-sky-400 shrink-0">
              {geoStatus === 'requesting' ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : geoStatus === 'success' ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              ) : (
                <Navigation className="w-5 h-5 transition-transform group-hover:scale-110" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-bold text-white flex items-center gap-2">
                <span>Use my current location</span>
                <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-sky-500/30 text-sky-200 telemetry-mono">
                  GPS
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                Permission requested only upon selection. Never continuously tracked.
              </p>
            </div>
          </button>

          {/* Feedback messages for geolocation */}
          {geoStatus === 'denied' && (
            <div className="p-3 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-start gap-2.5 text-xs text-amber-200">
              <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {geoStatus === 'error' && (
            <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 flex items-start gap-2.5 text-xs text-rose-200">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Option 2: Search for a City */}
          <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10">
            <div className="flex items-center gap-2 mb-2">
              <Search className="w-4 h-4 text-slate-400" />
              <span className="text-xs font-bold text-white uppercase tracking-wider telemetry-mono">
                Search for a City
              </span>
            </div>

            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setIsSearchActive(true);
                }}
                placeholder="Search Delhi, Mumbai, Bengaluru, Tokyo..."
                className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/15 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-400"
              />
            </div>

            {/* Quick City Chips */}
            <div className="flex flex-wrap gap-1.5 mt-2.5">
              {filteredIndian.map((city) => (
                <button
                  key={city.id}
                  type="button"
                  onClick={() => {
                    try {
                      localStorage.setItem('avir_location_onboarded_v1', 'true');
                      localStorage.setItem('avir_selected_city_v1', JSON.stringify(city));
                    } catch {}
                    onSelectCity(city, 'manual_predefined');
                    onClose();
                  }}
                  className="px-2.5 py-1 rounded-lg text-xs font-medium bg-white/10 hover:bg-sky-500 hover:text-black transition-colors cursor-pointer"
                >
                  {city.name}
                </button>
              ))}
              {filteredWorld.map((city) => (
                <button
                  key={city.id}
                  type="button"
                  onClick={() => {
                    const loc: GeocodedLocation = {
                      id: city.id,
                      name: city.name,
                      country: city.country,
                      countryCode: city.countryCode,
                      latitude: city.latitude,
                      longitude: city.longitude,
                    };
                    try {
                      localStorage.setItem('avir_location_onboarded_v1', 'true');
                      localStorage.setItem('avir_selected_city_v1', JSON.stringify(loc));
                    } catch {}
                    onSelectCity(loc, 'manual_predefined');
                    onClose();
                  }}
                  className="px-2.5 py-1 rounded-lg text-xs font-medium bg-sky-950/60 border border-sky-500/20 text-sky-200 hover:bg-sky-500 hover:text-black transition-colors cursor-pointer"
                >
                  {city.name} ({city.countryCode})
                </button>
              ))}
            </div>
          </div>

          {/* Option 3: Explore Without Location */}
          <button
            type="button"
            onClick={handleExploreWithoutLocation}
            className="w-full flex items-center justify-between p-3 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-slate-300 hover:text-white transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <Globe2 className="w-4 h-4 text-slate-400" />
              <span>Explore without location</span>
            </div>
            <span className="text-[11px] text-slate-500 telemetry-mono">
              Loads Delhi-NCR (Example)
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
