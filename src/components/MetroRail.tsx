'use client';

import React from 'react';
import { GeocodedLocation, PREDEFINED_INDIAN_CITIES } from '@/services/telemetry-service';
import { Flame, Compass } from 'lucide-react';

interface MetroRailProps {
  currentCityName: string;
  onSelectCity: (city: GeocodedLocation) => void;
  isLoading: boolean;
}

export const MetroRail: React.FC<MetroRailProps> = ({
  currentCityName,
  onSelectCity,
  isLoading,
}) => {
  return (
    <section className="w-full" aria-label="Regional Smog Hotspots Fast Switcher">
      <div className="flex items-center justify-between mb-2.5 px-1">
        <div className="flex items-center gap-2">
          <span className="flex h-2 w-2 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Regional Smog Hotspots & Metros
          </h2>
        </div>
        <span className="text-[11px] font-mono text-slate-500 hidden sm:inline-flex items-center gap-1">
          <Compass className="w-3 h-3" /> One-tap ambient sync
        </span>
      </div>

      {/* Horizontal Swipe Rail - Mobile Android / iOS Optimized with Snap */}
      <div 
        className="flex gap-2.5 overflow-x-auto no-scrollbar snap-x snap-mandatory py-1 px-0.5 -mx-1"
        role="tablist"
        aria-label="Target Metro Cities"
      >
        {PREDEFINED_INDIAN_CITIES.map((city) => {
          const isSelected =
            currentCityName.toLowerCase().trim() === city.name.toLowerCase().trim();

          return (
            <button
              key={city.id}
              role="tab"
              aria-selected={isSelected}
              disabled={isLoading && isSelected}
              onClick={() => onSelectCity(city)}
              className={`snap-start shrink-0 flex items-center gap-2 px-3.5 py-2 rounded-2xl text-xs font-medium transition-all duration-200 select-none touch-target ${
                isSelected
                  ? 'bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 shadow-[0_0_20px_rgba(16,185,129,0.2)] scale-[1.02]'
                  : 'bg-slate-900/60 border border-white/[0.06] text-slate-300 hover:bg-slate-800/80 hover:border-white/10 active:scale-95'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  isSelected ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'
                }`}
              />
              <span className="font-semibold tracking-tight">{city.name}</span>
              {city.admin1 && (
                <span className="text-[10px] text-slate-500 font-mono hidden md:inline">
                  {city.admin1}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
};
