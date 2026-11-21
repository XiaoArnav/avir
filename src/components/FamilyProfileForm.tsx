'use client';

import React from 'react';
import { UserVulnerabilityProfile } from '@/domain/types';
import { Users, Home, Activity, Sparkles, AlertCircle, Baby, UserCheck, HeartPulse } from 'lucide-react';

interface FamilyProfileFormProps {
  profile: UserVulnerabilityProfile;
  onChangeProfile: (profile: UserVulnerabilityProfile) => void;
  roomSizeSqFt: number;
  onChangeRoomSize: (size: number) => void;
  customRoutine: string;
  onChangeCustomRoutine: (routine: string) => void;
  onSubmit: () => void;
  isLoading: boolean;
}

export const FamilyProfileForm: React.FC<FamilyProfileFormProps> = ({
  profile,
  onChangeProfile,
  roomSizeSqFt,
  onChangeRoomSize,
  customRoutine,
  onChangeCustomRoutine,
  onSubmit,
  isLoading,
}) => {
  const roomVolumeM3 = Math.round(roomSizeSqFt * 0.0929 * 2.7); // 9ft ceiling assumption

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      className="rounded-3xl glass-panel p-6 shadow-xl space-y-5"
    >
      <div>
        <h2 className="text-base font-bold text-white flex items-center gap-2">
          <Users className="w-4 h-4 text-emerald-400" />
          <span>Vulnerability & Household Configuration</span>
        </h2>
        <p className="text-xs text-slate-400">
          Avir tailors routine shifts and indoor air cleaner physics to your exact household composition
        </p>
      </div>

      {/* Age Group Selector - Cupertino Segmented Button */}
      <div>
        <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2 font-mono">
          Primary Household Archetype
        </label>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {(['infant', 'child', 'adult', 'senior'] as const).map((age) => (
            <button
              key={age}
              type="button"
              onClick={() => onChangeProfile({ ...profile, ageGroup: age })}
              className={`py-2.5 px-3 text-xs rounded-2xl border text-center font-medium capitalize transition-all duration-200 select-none touch-target ${
                profile.ageGroup === age
                  ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-300 shadow-[0_0_16px_rgba(16,185,129,0.2)] font-bold'
                  : 'bg-slate-900/60 border-white/[0.06] text-slate-400 hover:border-white/15'
              }`}
            >
              {age === 'infant' ? 'Infant (< 2y)' : age === 'child' ? 'Child (2–12y)' : age === 'adult' ? 'Healthy Adult' : 'Senior (60y+)'}
            </button>
          ))}
        </div>
      </div>

      {/* Clinical & Environmental Vulnerability Toggles */}
      <div className="space-y-2">
        <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider font-mono">
          Clinical Vulnerability Flags
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <label className="flex items-center gap-2.5 p-3 rounded-2xl bg-slate-900/70 border border-white/[0.06] hover:border-white/10 cursor-pointer text-xs text-slate-300 transition-colors select-none">
            <input
              type="checkbox"
              checked={profile.hasAsthmaOrRespiratory}
              onChange={(e) => onChangeProfile({ ...profile, hasAsthmaOrRespiratory: e.target.checked })}
              className="rounded bg-slate-800 border-white/20 text-emerald-500 focus:ring-emerald-500 w-4 h-4"
            />
            <span className="font-medium">Asthma / Bronchitis / COPD</span>
          </label>

          <label className="flex items-center gap-2.5 p-3 rounded-2xl bg-slate-900/70 border border-white/[0.06] hover:border-white/10 cursor-pointer text-xs text-slate-300 transition-colors select-none">
            <input
              type="checkbox"
              checked={profile.hasCardiovascularCondition}
              onChange={(e) => onChangeProfile({ ...profile, hasCardiovascularCondition: e.target.checked })}
              className="rounded bg-slate-800 border-white/20 text-emerald-500 focus:ring-emerald-500 w-4 h-4"
            />
            <span className="font-medium">Cardiovascular Sensitivity</span>
          </label>

          <label className="flex items-center gap-2.5 p-3 rounded-2xl bg-slate-900/70 border border-white/[0.06] hover:border-white/10 cursor-pointer text-xs text-slate-300 transition-colors select-none">
            <input
              type="checkbox"
              checked={profile.isPregnant}
              onChange={(e) => onChangeProfile({ ...profile, isPregnant: e.target.checked })}
              className="rounded bg-slate-800 border-white/20 text-emerald-500 focus:ring-emerald-500 w-4 h-4"
            />
            <span className="font-medium">Pregnant Member in Home</span>
          </label>

          <label className="flex items-center gap-2.5 p-3 rounded-2xl bg-slate-900/70 border border-white/[0.06] hover:border-white/10 cursor-pointer text-xs text-slate-300 transition-colors select-none">
            <input
              type="checkbox"
              checked={profile.isOutdoorWorker}
              onChange={(e) => onChangeProfile({ ...profile, isOutdoorWorker: e.target.checked })}
              className="rounded bg-slate-800 border-white/20 text-emerald-500 focus:ring-emerald-500 w-4 h-4"
            />
            <span className="font-medium">Daily Outdoor Commuter</span>
          </label>
        </div>
      </div>

      {/* Primary Enclosure Dimensions (Room Volume) */}
      <div>
        <div className="flex items-center justify-between text-xs mb-1.5">
          <label className="font-semibold text-slate-300 uppercase tracking-wider font-mono flex items-center gap-1.5">
            <Home className="w-3.5 h-3.5 text-cyan-400" />
            <span>Target Enclosure Size</span>
          </label>
          <span className="font-mono text-cyan-300 font-bold">
            {roomSizeSqFt} sq ft (~{roomVolumeM3} m³)
          </span>
        </div>
        <input
          type="range"
          min="80"
          max="600"
          step="20"
          value={roomSizeSqFt}
          onChange={(e) => onChangeRoomSize(Number(e.target.value))}
          className="w-full accent-emerald-500 h-2 bg-slate-800 rounded-lg cursor-pointer"
        />
        <div className="flex justify-between text-[10px] text-slate-500 font-mono mt-1">
          <span>80 sq ft (Studio)</span>
          <span>250 sq ft (Master Bed)</span>
          <span>600 sq ft (Hall/Living)</span>
        </div>
      </div>

      {/* Custom Routine Input */}
      <div>
        <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5 font-mono flex items-center gap-1.5">
          <Activity className="w-3.5 h-3.5 text-emerald-400" />
          <span>Routine Description for AI Exposure Optimizer</span>
        </label>
        <input
          type="text"
          value={customRoutine}
          onChange={(e) => onChangeCustomRoutine(e.target.value)}
          placeholder="e.g. 06:30 AM 5km Jog & Evening Walk..."
          className="w-full px-4 py-2.5 bg-slate-950/80 border border-white/[0.1] rounded-2xl text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors"
        />
      </div>

      {/* Action Submit */}
      <button
        type="submit"
        disabled={isLoading}
        className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-black font-extrabold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all duration-200 shadow-[0_4px_24px_rgba(16,185,129,0.35)] disabled:opacity-50 touch-target active:scale-98"
      >
        <Sparkles className="w-4 h-4 text-black" />
        <span>
          {isLoading ? 'Synthesizing Atmospheric Models...' : 'Calculate Inhaled Dose & Optimize Routine'}
        </span>
      </button>
    </form>
  );
};
