'use client';

import React, { useState } from 'react';
import {
  calculateAch,
  calculateRoomDimensions,
  calculateWellMixedDecay,
  CFM_TO_M3_PER_HOUR,
} from '@/domain/indoor-air-types';
import {
  calculateDiyPurifierBillOfMaterials,
  DIY_PURIFIER_PRESETS,
} from '@/services/indoor-air/indoor-air-service';
import { Wrench, Zap, Timer, CheckCircle2, Sparkles, Settings2 } from 'lucide-react';

interface IAQStudioProps {
  initialRoomVolumeM3?: number;
  spec?: {
    roomVolumeM3?: number;
    numberOfFilters?: number;
    airChangesPerHour?: number;
    clearingHalfLifeMinutes?: number;
    estimatedCostINR?: number;
  };
}

export const IAQStudio: React.FC<IAQStudioProps> = ({ initialRoomVolumeM3 = 45 }) => {
  const [selectedPresetId, setSelectedPresetId] = useState<string>('cr-box-4-filter');
  const [customCadrCfm] = useState<number>(450);
  const [unit, setUnit] = useState<'metric' | 'imperial'>('metric');
  const [roomLength, setRoomLength] = useState<number>(unit === 'metric' ? 5 : 16);
  const [roomWidth, setRoomWidth] = useState<number>(unit === 'metric' ? 3.5 : 12);
  const [roomHeight, setRoomHeight] = useState<number>(unit === 'metric' ? 2.6 : 8.5);
  const [showCostEditor, setShowCostEditor] = useState<boolean>(false);
  const [customFanCost, setCustomFanCost] = useState<number>(1500);
  const [customFilterCost, setCustomFilterCost] = useState<number>(1600);
  const [customTapeCost, setCustomTapeCost] = useState<number>(350);
  const [customCommercialCost, setCustomCommercialCost] = useState<number>(14000);

  // Derive room dimensions
  let room;
  try {
    room = calculateRoomDimensions(roomLength, roomWidth, roomHeight, unit);
  } catch {
    room = { floorAreaM2: 17.5, volumeM3: initialRoomVolumeM3, unit, length: 5, width: 3.5, height: 2.6 };
  }

  // Active preset
  const activePreset = DIY_PURIFIER_PRESETS.find(p => p.id === selectedPresetId) || DIY_PURIFIER_PRESETS[0];
  const effectiveCadrCfm = selectedPresetId === 'custom' ? customCadrCfm : activePreset.cadrCfm;
  const effectiveCadrM3H = Math.round(effectiveCadrCfm * CFM_TO_M3_PER_HOUR * 10) / 10;

  // Scientific calculations
  const achResult = calculateAch(effectiveCadrM3H, room.volumeM3);
  const decayResult = calculateWellMixedDecay(150, achResult.ach);
  const bom = calculateDiyPurifierBillOfMaterials(
    selectedPresetId,
    showCostEditor
      ? {
          boxFanCost: customFanCost,
          filtersCost: customFilterCost,
          shroudTapeCost: customTapeCost,
          commercialPurifierComparisonCost: customCommercialCost,
        }
      : undefined
  );

  return (
    <section 
      aria-label="Indoor Air-Cleaning Studio"
      className="rounded-3xl holo-panel-elevated p-6 sm:p-8 border border-stone-200/90 dark:border-sky-500/25 bg-white/90 dark:bg-[#060b18]/90 hud-corner-brackets space-y-6 shadow-2xl transition-colors"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-stone-200 dark:border-sky-500/15 pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono text-ink-muted dark:text-zinc-400 uppercase tracking-wider mb-1">
            <Sparkles className="w-3.5 h-3.5 text-sage-600 dark:text-zinc-300" />
            <span>Indoor Air Engineering Studio</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-extrabold text-ink dark:text-white tracking-tight flex items-center gap-2">
            <span>Air-Cleaner Sizing &amp; Particle Decay</span>
          </h2>
          <p className="text-xs text-ink-muted dark:text-zinc-400 mt-1 max-w-2xl leading-relaxed">
            Calculate real Air Changes per Hour (ACH), exponential particulate half-life clearance, and custom bill-of-materials for residential filtration.
          </p>
        </div>

        {/* Preset Selector */}
        <div className="flex flex-wrap items-center gap-1.5 p-1 rounded-xl bg-stone-100 dark:bg-zinc-900 border border-stone-300 dark:border-zinc-800 self-start sm:self-auto shadow-xs">
          {DIY_PURIFIER_PRESETS.map((preset) => (
            <button
              key={preset.id}
              onClick={() => setSelectedPresetId(preset.id)}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                selectedPresetId === preset.id
                  ? 'bg-ink text-white font-bold dark:bg-white dark:text-black shadow-sm'
                  : 'text-ink-muted hover:text-ink dark:text-zinc-400 dark:hover:text-white'
              }`}
            >
              {preset.name.split(' ')[0]} ({preset.cadrCfm} CFM)
            </button>
          ))}
        </div>
      </div>

      {/* Room Dimensions & Unit Configuration */}
      <div className="p-4 rounded-xl bg-stone-50 dark:bg-zinc-900/60 border border-stone-200 dark:border-zinc-800 flex flex-col md:flex-row md:items-center justify-between gap-4 text-xs">
        <div className="flex items-center gap-3">
          <span className="font-bold text-ink dark:text-white">Room Size:</span>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1">
              <span>L:</span>
              <input
                type="number"
                min="1"
                step="0.5"
                value={roomLength}
                onChange={(e) => setRoomLength(parseFloat(e.target.value) || 1)}
                className="w-14 px-1.5 py-0.5 rounded border border-stone-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 font-mono text-center"
              />
            </label>
            <label className="flex items-center gap-1">
              <span>W:</span>
              <input
                type="number"
                min="1"
                step="0.5"
                value={roomWidth}
                onChange={(e) => setRoomWidth(parseFloat(e.target.value) || 1)}
                className="w-14 px-1.5 py-0.5 rounded border border-stone-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 font-mono text-center"
              />
            </label>
            <label className="flex items-center gap-1">
              <span>H:</span>
              <input
                type="number"
                min="1"
                step="0.1"
                value={roomHeight}
                onChange={(e) => setRoomHeight(parseFloat(e.target.value) || 1)}
                className="w-14 px-1.5 py-0.5 rounded border border-stone-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 font-mono text-center"
              />
            </label>
            <span className="text-ink-muted dark:text-zinc-400">{unit === 'metric' ? 'meters' : 'feet'}</span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-ink-muted dark:text-zinc-400">
            Volume: <span className="font-bold font-mono text-ink dark:text-white">{room.volumeM3} m³</span> ({room.floorAreaM2} m² area)
          </div>
          <button
            onClick={() => {
              const newUnit = unit === 'metric' ? 'imperial' : 'metric';
              setUnit(newUnit);
              if (newUnit === 'imperial') {
                setRoomLength(Math.round(roomLength * 3.28084 * 10) / 10);
                setRoomWidth(Math.round(roomWidth * 3.28084 * 10) / 10);
                setRoomHeight(Math.round(roomHeight * 3.28084 * 10) / 10);
              } else {
                setRoomLength(Math.round((roomLength / 3.28084) * 10) / 10);
                setRoomWidth(Math.round((roomWidth / 3.28084) * 10) / 10);
                setRoomHeight(Math.round((roomHeight / 3.28084) * 10) / 10);
              }
            }}
            className="px-2.5 py-1 rounded border border-stone-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-[11px] font-semibold hover:bg-stone-100 dark:hover:bg-zinc-700"
          >
            Switch to {unit === 'metric' ? 'Feet (Imperial)' : 'Meters (Metric)'}
          </button>
        </div>
      </div>

      {/* Primary Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Metric 1: ACH (B-008 Elimination: Medical terms replaced with scientific standards) */}
        <div className="rounded-xl p-5 bg-stone-50 dark:bg-zinc-900/60 border border-stone-200 dark:border-zinc-800/80">
          <div className="flex items-center justify-between text-ink-muted dark:text-zinc-400 text-xs mb-1.5">
            <span className="font-semibold uppercase tracking-wider font-mono text-[11px]">Clean Air Delivery</span>
            <Zap className="w-4 h-4 text-sage-600 dark:text-zinc-300" />
          </div>
          <div className="text-3xl sm:text-4xl font-extrabold text-ink dark:text-white font-mono tracking-tight tabular-nums">
            {achResult.ach} <span className="text-sm font-sans font-normal text-ink-muted dark:text-zinc-400">ACH</span>
          </div>
          <p className="text-xs text-sage-700 dark:text-zinc-300 mt-2 font-semibold flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5 text-sage-600 dark:text-white shrink-0" />
            <span>{achResult.evaluationText}</span>
          </p>
        </div>

        {/* Metric 2: Particle Clearance Times (50% and 90%) */}
        <div className="rounded-xl p-5 bg-stone-50 dark:bg-zinc-900/60 border border-stone-200 dark:border-zinc-800/80">
          <div className="flex items-center justify-between text-ink-muted dark:text-zinc-400 text-xs mb-1.5">
            <span className="font-semibold uppercase tracking-wider font-mono text-[11px]">Clearance Dynamics</span>
            <Timer className="w-4 h-4 text-sage-600 dark:text-zinc-300" />
          </div>
          <div className="text-3xl sm:text-4xl font-extrabold text-ink dark:text-white font-mono tracking-tight tabular-nums">
            {decayResult.minutesTo50Percent} <span className="text-sm font-sans font-normal text-ink-muted dark:text-zinc-400">mins (50%)</span>
          </div>
          <p className="text-xs text-stone-500 dark:text-zinc-500 mt-2">
            90% particle clearance in ~{decayResult.minutesTo90Percent} minutes ({decayResult.totalLossRatePerHour}/h total loss rate in sealed {room.volumeM3} m³ room).
          </p>
        </div>

        {/* Metric 3: Cost Comparison (B-007 Elimination: Editable and Dated) */}
        <div className="rounded-xl p-5 bg-stone-50 dark:bg-zinc-900/60 border border-stone-200 dark:border-zinc-800/80">
          <div className="flex items-center justify-between text-ink-muted dark:text-zinc-400 text-xs mb-1.5">
            <span className="font-semibold uppercase tracking-wider font-mono text-[11px]">Estimated Build Cost</span>
            <button
              onClick={() => setShowCostEditor(!showCostEditor)}
              aria-label="Edit component costs"
              className="p-1 rounded text-ink-muted hover:text-ink dark:text-zinc-400 dark:hover:text-white"
            >
              <Settings2 className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="text-3xl sm:text-4xl font-extrabold text-ink dark:text-white font-mono tracking-tight tabular-nums">
            ₹{bom.totalDiyCost} <span className="text-xs font-sans font-normal text-ink-muted dark:text-zinc-400">vs ₹{bom.commercialPurifierComparisonCost}</span>
          </div>
          <p className="text-xs text-sage-700 dark:text-zinc-300 mt-2 font-semibold">
            {bom.isUserOverridden ? 'Custom user cost estimate' : `Baseline dated ${bom.lastUpdated}`} (~{Math.round(((bom.commercialPurifierComparisonCost - bom.totalDiyCost) / bom.commercialPurifierComparisonCost) * 100)}% savings)
          </p>
        </div>
      </div>

      {/* Editable Cost Inputs Panel */}
      {showCostEditor && (
        <div className="p-4 rounded-xl bg-stone-50 dark:bg-zinc-900 border border-stone-200 dark:border-zinc-800 space-y-3 text-xs">
          <div className="font-bold text-ink dark:text-white">Custom Component Cost Editor (₹ INR)</div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <label className="space-y-1">
              <span className="text-ink-muted dark:text-zinc-400">Box Fan (₹):</span>
              <input
                type="number"
                value={customFanCost}
                onChange={(e) => setCustomFanCost(parseInt(e.target.value, 10) || 0)}
                className="w-full px-2 py-1 rounded border border-stone-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 font-mono"
              />
            </label>
            <label className="space-y-1">
              <span className="text-ink-muted dark:text-zinc-400">Filters Total (₹):</span>
              <input
                type="number"
                value={customFilterCost}
                onChange={(e) => setCustomFilterCost(parseInt(e.target.value, 10) || 0)}
                className="w-full px-2 py-1 rounded border border-stone-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 font-mono"
              />
            </label>
            <label className="space-y-1">
              <span className="text-ink-muted dark:text-zinc-400">Tape &amp; Shroud (₹):</span>
              <input
                type="number"
                value={customTapeCost}
                onChange={(e) => setCustomTapeCost(parseInt(e.target.value, 10) || 0)}
                className="w-full px-2 py-1 rounded border border-stone-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 font-mono"
              />
            </label>
            <label className="space-y-1">
              <span className="text-ink-muted dark:text-zinc-400">Branded Compare (₹):</span>
              <input
                type="number"
                value={customCommercialCost}
                onChange={(e) => setCustomCommercialCost(parseInt(e.target.value, 10) || 0)}
                className="w-full px-2 py-1 rounded border border-stone-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 font-mono"
              />
            </label>
          </div>
        </div>
      )}

      {/* Assembly Blueprint & Disclosures */}
      <div className="rounded-xl bg-stone-50 dark:bg-zinc-950 p-5 border border-stone-200 dark:border-zinc-800 space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wider font-mono text-ink dark:text-zinc-300 flex items-center gap-2">
          <Wrench className="w-4 h-4 text-sage-600 dark:text-zinc-400" />
          <span>Physical Setup &amp; Scientific Disclosures</span>
        </h3>
        <p className="text-xs text-ink-muted dark:text-zinc-400 leading-relaxed">
          {activePreset.description}
        </p>
        <div className="pt-2 text-[11px] text-stone-500 dark:text-zinc-500 space-y-1">
          <div>* <strong>Well-mixed model disclosure:</strong> Assumes uniform spatial air mixing, closed windows, and no continuous internal particle generation (e.g. smoking, deep-frying).</div>
          <div>* <strong>Regulatory clarification:</strong> Standard residential purifiers do not provide hospital negative-pressure isolation. High ACH provides rapid aerosol dilution in ordinary living spaces.</div>
        </div>
      </div>
    </section>
  );
};
