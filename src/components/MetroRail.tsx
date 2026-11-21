'use client';

import React from 'react';
import { GeocodedLocation, PREDEFINED_INDIAN_CITIES } from '@/services/telemetry-service';
import { Compass } from 'lucide-react';

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
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sage-500 dark:bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-sage-600 dark:bg-emerald-400"></span>
          </span>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-muted dark:text-zinc-400 font-mono">
            Regional Smog Hotspots &amp; Metros
          </h2>
        </div>
        <span className="text-[11px] font-mono text-ink-muted dark:text-zinc-500 hidden sm:inline-flex items-center gap-1">
          <Compass className="w-3 h-3 text-sage-600 dark:text-zinc-400" /> 10-Station Atmospheric Mesh
        </span>
      </div>

      {/* Horizontal Swipe Rail - Adaptive Duo High Contrast */}
      <div 
        className="flex gap-2 overflow-x-auto no-scrollbar snap-x snap-mandatory py-1 px-0.5 -mx-1"
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
              className={`snap-start shrink-0 flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs transition-all duration-200 select-none touch-target ${
                isSelected
                  ? 'bg-ink text-white font-semibold border border-ink shadow-sm dark:bg-white dark:text-black dark:border-white dark:shadow-[0_2px_12px_rgba(255,255,255,0.15)] scale-[1.02]'
                  : 'bg-white/80 border border-stone-300 text-ink-muted hover:text-ink hover:border-stone-400 dark:bg-zinc-900/90 dark:border-zinc-800 dark:text-zinc-400 dark:hover:text-white dark:hover:border-zinc-700 active:scale-95 shadow-xs'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  isSelected ? 'bg-white dark:bg-black' : 'bg-stone-400 dark:bg-zinc-600'
                }`}
              />
              <span className="tracking-tight">{city.name}</span>
              {city.admin1 && (
                <span className={`text-[10px] font-mono hidden md:inline ${
                  isSelected ? 'text-stone-300 dark:text-zinc-600' : 'text-stone-400 dark:text-zinc-500'
                }`}>
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
