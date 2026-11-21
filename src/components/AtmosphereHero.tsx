'use client';

import React from 'react';
import { AtmosphericMetrics, AQICategory } from '@/domain/types';
import { AlertTriangle, CloudFog, Compass, Gauge, Info, ShieldCheck } from 'lucide-react';

interface AtmosphereHeroProps {
  city: string;
  metrics: AtmosphericMetrics;
  category: AQICategory;
}

export const AtmosphereHero: React.FC<AtmosphereHeroProps> = ({ city, metrics, category }) => {
  const getBadgeStyle = (cat: AQICategory) => {
    switch (cat) {
      case 'Good':
        return { bg: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400', label: 'Good' };
      case 'Moderate':
        return { bg: 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400', label: 'Moderate' };
      case 'UnhealthySensitive':
        return { bg: 'bg-orange-500/10 border-orange-500/30 text-orange-400', label: 'Unhealthy for Sensitive Groups' };
      case 'Unhealthy':
        return { bg: 'bg-rose-500/10 border-rose-500/30 text-rose-400', label: 'Unhealthy' };
      case 'VeryUnhealthy':
        return { bg: 'bg-purple-500/10 border-purple-500/30 text-purple-400', label: 'Very Unhealthy' };
      case 'Hazardous':
      default:
        return { bg: 'bg-red-600/20 border-red-500/50 text-red-400', label: 'Hazardous (Severe Smog Alert)' };
    }
  };

  const badge = getBadgeStyle(category);

  return (
    <section className="rounded-2xl bg-gradient-to-b from-[#111928] to-[#0c121e] border border-gray-800 p-6 sm:p-8 shadow-xl">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-gray-800/80">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono text-emerald-400 tracking-wider uppercase mb-1">
            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
            Real-Time Ambient Telemetry
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight flex items-center gap-2">
            <span>{city}</span>
            <span className={`text-xs px-2.5 py-1 rounded-full border font-semibold ${badge.bg}`}>
              {badge.label}
            </span>
          </h1>
        </div>

        <div className="text-left sm:text-right text-xs text-gray-400 font-mono">
          <div>Telemetry Synchronized: {new Date(metrics.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
          <div className="text-gray-500">Source: Copernicus / NOAA Atmospheric Mesh</div>
        </div>
      </div>

      {/* Primary Atmospheric Gauges Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 py-6">
        {/* AQI Metric */}
        <div className="rounded-xl bg-gray-900/60 border border-gray-800 p-4">
          <div className="flex items-center justify-between text-gray-400 text-xs mb-2">
            <span>Air Quality Index</span>
            <Gauge className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight font-mono">
            {metrics.usAqi}
          </div>
          <div className="text-[11px] text-gray-400 mt-1">Standardized US AQI Scale</div>
        </div>

        {/* PM2.5 Metric */}
        <div className="rounded-xl bg-gray-900/60 border border-gray-800 p-4">
          <div className="flex items-center justify-between text-gray-400 text-xs mb-2">
            <span>Fine PM2.5</span>
            <CloudFog className="w-4 h-4 text-orange-400" />
          </div>
          <div className="text-3xl sm:text-4xl font-extrabold text-orange-400 tracking-tight font-mono">
            {metrics.pm25} <span className="text-xs font-sans text-gray-400">µg/m³</span>
          </div>
          <div className="text-[11px] text-gray-400 mt-1">Deep Alveolar Particulate</div>
        </div>

        {/* PM10 Metric */}
        <div className="rounded-xl bg-gray-900/60 border border-gray-800 p-4">
          <div className="flex items-center justify-between text-gray-400 text-xs mb-2">
            <span>Respirable PM10</span>
            <CloudFog className="w-4 h-4 text-yellow-400" />
          </div>
          <div className="text-3xl sm:text-4xl font-extrabold text-yellow-300 tracking-tight font-mono">
            {metrics.pm10} <span className="text-xs font-sans text-gray-400">µg/m³</span>
          </div>
          <div className="text-[11px] text-gray-400 mt-1">Coarse Inhalable Dust</div>
        </div>

        {/* Boundary Layer Height */}
        <div className="rounded-xl bg-gray-900/60 border border-gray-800 p-4">
          <div className="flex items-center justify-between text-gray-400 text-xs mb-2">
            <span>Boundary Layer</span>
            <Compass className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-3xl sm:text-4xl font-extrabold text-cyan-300 tracking-tight font-mono">
            {metrics.boundaryLayerHeight} <span className="text-xs font-sans text-gray-400">m</span>
          </div>
          <div className="text-[11px] text-gray-400 mt-1">Thermal Mixing Ceiling</div>
        </div>
      </div>

      {/* Atmospheric Thermal Inversion Alert Banner */}
      <div 
        className={`rounded-xl p-4 border flex items-start gap-3 transition-colors ${
          metrics.isThermalInversionActive 
            ? 'bg-rose-950/20 border-rose-800/40 text-rose-200' 
            : 'bg-emerald-950/20 border-emerald-800/40 text-emerald-200'
        }`}
        role="alert"
        aria-live="polite"
      >
        {metrics.isThermalInversionActive ? (
          <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
        ) : (
          <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
        )}

        <div className="text-xs sm:text-sm">
          <div className="font-bold tracking-wide">
            {metrics.isThermalInversionActive 
              ? 'ACTIVE THERMAL INVERSION LAYER (CRITICAL RISK)' 
              : 'SOLAR BOUNDARY MIXING ACTIVE (LOWEST SMOG WINDOW)'}
          </div>
          <p className="mt-1 text-gray-300 leading-relaxed">
            {metrics.isThermalInversionActive 
              ? `A cold surface boundary layer (${metrics.boundaryLayerHeight}m) is physically sealing toxic emissions near ground level. High-exertion outdoor activities must be paused or shifted to afternoon hours.`
              : 'Solar convection has expanded the planetary boundary layer, diluting particulate concentrations. Ideal time for essential outdoor transit and room air exchange.'}
          </p>
        </div>
      </div>
    </section>
  );
};
