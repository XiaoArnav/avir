'use client';

import React from 'react';
import { GeographicObservationPoint } from '@/services/geo/geographic-observation-adapter';

export interface AccessibleEarthFallbackProps {
  points: GeographicObservationPoint[];
  selectedPointId?: string | null;
  onSelectPoint: (point: GeographicObservationPoint) => void;
  className?: string;
}

export function AccessibleEarthFallback({
  points,
  selectedPointId,
  onSelectPoint,
  className = '',
}: AccessibleEarthFallbackProps) {
  // SVG projection dimensions (2:1 equirectangular ratio)
  const mapWidth = 800;
  const mapHeight = 400;

  const projectToSvg = (lat: number, lng: number) => {
    const x = ((lng + 180) / 360) * mapWidth;
    const y = ((90 - lat) / 180) * mapHeight;
    return { x, y };
  };

  return (
    <div
      role="region"
      aria-label="2D Geographic Observation Map"
      className={`relative w-full rounded-2xl overflow-hidden border border-stone-200/80 dark:border-sky-500/20 bg-stone-100 dark:bg-[#060b18] p-4 ${className}`}
    >
      <div className="flex items-center justify-between mb-3 text-xs">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-sky-500 dark:shadow-[0_0_8px_#38bdf8]" />
          <span className="font-semibold text-ink-primary dark:text-sky-200 telemetry-mono uppercase">
            Geographic Observation Grid (2D Projection)
          </span>
        </div>
        <span className="text-[11px] text-ink-muted dark:text-slate-400 telemetry-mono">
          {points.length} STATIONS MONITORED
        </span>
      </div>

      {/* SVG Equirectangular Map Canvas */}
      <div className="relative w-full aspect-[2/1] rounded-xl overflow-hidden border border-stone-200 dark:border-sky-500/15 bg-white/60 dark:bg-black/40">
        <svg
          viewBox={`0 0 ${mapWidth} ${mapHeight}`}
          className="w-full h-full select-none"
          aria-hidden="true"
        >
          {/* Latitude & Longitude Graticule Lines */}
          <g stroke="currentColor" strokeWidth="0.5" className="text-stone-300 dark:text-sky-900/30">
            {[-60, -30, 0, 30, 60].map((lat) => {
              const { y } = projectToSvg(lat, 0);
              return <line key={`lat-${lat}`} x1="0" y1={y} x2={mapWidth} y2={y} strokeDasharray="3 3" />;
            })}
            {[-120, -60, 0, 60, 120].map((lng) => {
              const { x } = projectToSvg(0, lng);
              return <line key={`lng-${lng}`} x1={x} y1="0" x2={x} y2={mapHeight} strokeDasharray="3 3" />;
            })}
            {/* Equator & Prime Meridian */}
            <line x1="0" y1={mapHeight / 2} x2={mapWidth} y2={mapHeight / 2} stroke="currentColor" strokeWidth="1" className="text-stone-400 dark:text-sky-500/30" />
            <line x1={mapWidth / 2} y1="0" x2={mapWidth / 2} y2={mapHeight} stroke="currentColor" strokeWidth="1" className="text-stone-400 dark:text-sky-500/30" />
          </g>

          {/* City Observation Pins */}
          {points.map((point) => {
            const { x, y } = projectToSvg(point.latitude, point.longitude);
            const isSelected = selectedPointId === point.id;
            const aqiDisplay = point.aqi !== null ? Math.round(point.aqi) : 'N/A';

            return (
              <g
                key={point.id}
                role="button"
                tabIndex={0}
                aria-label={`${point.name}, ${point.country}. AQI: ${aqiDisplay}. Category: ${point.categoryLabel}`}
                onClick={() => onSelectPoint(point)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelectPoint(point);
                  }
                }}
                className="cursor-pointer focus:outline-none group"
              >
                {/* Selection / Pulse Rings */}
                {isSelected && (
                  <circle
                    cx={x}
                    cy={y}
                    r="12"
                    fill="none"
                    stroke={point.categoryColor}
                    strokeWidth="1.5"
                    strokeDasharray="2 2"
                    className="animate-spin origin-center"
                    style={{ transformOrigin: `${x}px ${y}px` }}
                  />
                )}

                {/* Marker Outer Glow */}
                <circle
                  cx={x}
                  cy={y}
                  r={isSelected ? '7' : '4.5'}
                  fill={point.categoryColor}
                  opacity={isSelected ? '0.9' : '0.75'}
                  className="transition-all duration-200 group-hover:scale-125 origin-center"
                  style={{ transformOrigin: `${x}px ${y}px` }}
                />

                {/* Center Core Dot */}
                <circle
                  cx={x}
                  cy={y}
                  r="2"
                  fill="#FFFFFF"
                />

                {/* City Name Label for Selected Pin */}
                {isSelected && (
                  <text
                    x={x}
                    y={y - 12}
                    textAnchor="middle"
                    fill="currentColor"
                    className="text-[10px] font-bold fill-ink-primary dark:fill-white telemetry-mono"
                  >
                    {point.name} [{aqiDisplay}]
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {/* Accessible Table for Screen Readers & Tabular Overview */}
      <details className="mt-4 text-xs">
        <summary className="cursor-pointer font-medium text-ink-muted dark:text-sky-300/80 telemetry-mono hover:text-ink-primary dark:hover:text-white">
          View Tabular Station Ledger ({points.length} Stations)
        </summary>
        <div className="mt-2 max-h-56 overflow-y-auto rounded-lg border border-stone-200 dark:border-sky-500/20 bg-white/40 dark:bg-black/30">
          <table className="w-full text-left border-collapse">
            <thead className="bg-stone-200/50 dark:bg-sky-950/40 text-[11px] text-ink-muted dark:text-sky-300/70 telemetry-mono sticky top-0">
              <tr>
                <th className="p-2 font-semibold">City</th>
                <th className="p-2 font-semibold">Coordinates</th>
                <th className="p-2 font-semibold">AQI</th>
                <th className="p-2 font-semibold">Category</th>
                <th className="p-2 font-semibold">Source</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-200/50 dark:divide-sky-500/10 text-[11px]">
              {points.map((pt) => (
                <tr
                  key={`tbl-${pt.id}`}
                  onClick={() => onSelectPoint(pt)}
                  className={`cursor-pointer hover:bg-stone-100/70 dark:hover:bg-sky-900/20 transition-colors ${
                    selectedPointId === pt.id ? 'bg-sky-500/10 dark:bg-sky-500/20 font-semibold' : ''
                  }`}
                >
                  <td className="p-2 text-ink-primary dark:text-white font-medium">{pt.name}, {pt.countryCode}</td>
                  <td className="p-2 text-ink-muted dark:text-slate-400 telemetry-mono">
                    {pt.latitude.toFixed(2)}°, {pt.longitude.toFixed(2)}°
                  </td>
                  <td className="p-2 tabular-nums telemetry-mono" style={{ color: pt.categoryColor }}>
                    {pt.aqi !== null ? Math.round(pt.aqi) : '--'}
                  </td>
                  <td className="p-2 text-ink-muted dark:text-slate-300">{pt.categoryLabel}</td>
                  <td className="p-2 text-ink-faint dark:text-slate-500">{pt.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
