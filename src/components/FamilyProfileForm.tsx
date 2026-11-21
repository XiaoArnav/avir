'use client';

import React from 'react';
import { UserVulnerabilityProfile } from '@/domain/types';
import { Users, Home, Activity, Sparkles } from 'lucide-react';

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
      className="rounded-2xl glass-panel p-6 border border-stone-300 dark:border-zinc-800 bg-white/95 dark:bg-[#0c0c0e]/95 space-y-5 shadow-sm transition-colors"
    >
      <div>
        <h2 className="text-base font-bold text-ink dark:text-white flex items-center gap-2">
          <Users className="w-4 h-4 text-sage-600 dark:text-zinc-300" />
          <span>Personalize Your Protection Plan</span>
        </h2>
        <p className="text-xs text-ink-muted dark:text-zinc-400">
          Tailor routine shifts and indoor air filtration physics to your specific household needs
        </p>
      </div>

      {/* Age Group Selector - Adaptive Duo Monochrome */}
      <div>
        <label className="block text-xs font-semibold text-ink-muted dark:text-zinc-400 uppercase tracking-wider mb-2 font-mono">
          Primary Household Archetype
        </label>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {(['infant', 'child', 'adult', 'senior'] as const).map((age) => (
            <button
              key={age}
              type="button"
              onClick={() => onChangeProfile({ ...profile, ageGroup: age })}
              className={`py-2 px-3 text-xs rounded-xl border text-center font-medium capitalize transition-all duration-200 select-none touch-target ${
                profile.ageGroup === age
                  ? 'bg-ink text-white font-bold border-ink dark:bg-white dark:text-black dark:border-white shadow-sm'
                  : 'bg-stone-100 border-stone-300 text-ink-muted hover:text-ink hover:border-stone-400 dark:bg-zinc-900/60 dark:border-zinc-800 dark:text-zinc-400 dark:hover:text-white dark:hover:border-zinc-700'
              }`}
            >
              {age === 'infant' ? 'Infant (< 2y)' : age === 'child' ? 'Child (2–12y)' : age === 'adult' ? 'Healthy Adult' : 'Senior (60y+)'}
            </button>
          ))}
        </div>
      </div>

      {/* Clinical & Environmental Vulnerability Toggles */}
      <div className="space-y-2">
        <label className="block text-xs font-semibold text-ink-muted dark:text-zinc-400 uppercase tracking-wider font-mono">
          Clinical Vulnerability Flags
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <label className="flex items-center gap-2.5 p-3 rounded-xl bg-stone-50 dark:bg-zinc-900/60 border border-stone-300 dark:border-zinc-800 hover:border-stone-400 dark:hover:border-zinc-700 cursor-pointer text-xs text-ink dark:text-zinc-300 transition-colors select-none">
            <input
              type="checkbox"
              checked={profile.hasAsthmaOrRespiratory}
              onChange={(e) => onChangeProfile({ ...profile, hasAsthmaOrRespiratory: e.target.checked })}
              className="rounded bg-stone-200 dark:bg-zinc-800 border-stone-400 dark:border-zinc-700 text-ink dark:text-white focus:ring-ink dark:focus:ring-white w-4 h-4"
            />
            <span className="font-medium">Asthma / Bronchitis / COPD</span>
          </label>

          <label className="flex items-center gap-2.5 p-3 rounded-xl bg-stone-50 dark:bg-zinc-900/60 border border-stone-300 dark:border-zinc-800 hover:border-stone-400 dark:hover:border-zinc-700 cursor-pointer text-xs text-ink dark:text-zinc-300 transition-colors select-none">
            <input
              type="checkbox"
              checked={profile.hasCardiovascularCondition}
              onChange={(e) => onChangeProfile({ ...profile, hasCardiovascularCondition: e.target.checked })}
              className="rounded bg-stone-200 dark:bg-zinc-800 border-stone-400 dark:border-zinc-700 text-ink dark:text-white focus:ring-ink dark:focus:ring-white w-4 h-4"
            />
            <span className="font-medium">Cardiovascular Sensitivity</span>
          </label>

          <label className="flex items-center gap-2.5 p-3 rounded-xl bg-stone-50 dark:bg-zinc-900/60 border border-stone-300 dark:border-zinc-800 hover:border-stone-400 dark:hover:border-zinc-700 cursor-pointer text-xs text-ink dark:text-zinc-300 transition-colors select-none">
            <input
              type="checkbox"
              checked={profile.isPregnant}
              onChange={(e) => onChangeProfile({ ...profile, isPregnant: e.target.checked })}
              className="rounded bg-stone-200 dark:bg-zinc-800 border-stone-400 dark:border-zinc-700 text-ink dark:text-white focus:ring-ink dark:focus:ring-white w-4 h-4"
            />
            <span className="font-medium">Pregnant Member in Home</span>
          </label>

          <label className="flex items-center gap-2.5 p-3 rounded-xl bg-stone-50 dark:bg-zinc-900/60 border border-stone-300 dark:border-zinc-800 hover:border-stone-400 dark:hover:border-zinc-700 cursor-pointer text-xs text-ink dark:text-zinc-300 transition-colors select-none">
            <input
              type="checkbox"
              checked={profile.isOutdoorWorker}
              onChange={(e) => onChangeProfile({ ...profile, isOutdoorWorker: e.target.checked })}
              className="rounded bg-stone-200 dark:bg-zinc-800 border-stone-400 dark:border-zinc-700 text-ink dark:text-white focus:ring-ink dark:focus:ring-white w-4 h-4"
            />
            <span className="font-medium">Daily Outdoor Commuter</span>
          </label>
        </div>
      </div>

      {/* Primary Enclosure Dimensions (Room Volume) */}
      <div>
        <div className="flex items-center justify-between text-xs mb-1.5">
          <label className="font-semibold text-ink-muted dark:text-zinc-300 uppercase tracking-wider font-mono flex items-center gap-1.5">
            <Home className="w-3.5 h-3.5 text-sage-600 dark:text-zinc-400" />
            <span>Target Enclosure Size</span>
          </label>
          <span className="font-mono text-ink dark:text-white font-bold">
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
          className="w-full accent-ink dark:accent-white h-2 bg-stone-200 dark:bg-zinc-800 rounded-lg cursor-pointer"
        />
        <div className="flex justify-between text-[10px] text-stone-400 dark:text-zinc-500 font-mono mt-1">
          <span>80 sq ft (Studio)</span>
          <span>250 sq ft (Master Bed)</span>
          <span>600 sq ft (Hall/Living)</span>
        </div>
      </div>

      {/* Custom Routine Input */}
      <div>
        <label className="block text-xs font-semibold text-ink-muted dark:text-zinc-300 uppercase tracking-wider mb-1.5 font-mono flex items-center gap-1.5">
          <Activity className="w-3.5 h-3.5 text-sage-600 dark:text-zinc-400" />
          <span>Routine Description for Exposure Shifter</span>
        </label>
        <input
          type="text"
          value={customRoutine}
          onChange={(e) => onChangeCustomRoutine(e.target.value)}
          placeholder="e.g. 06:30 AM 5km Jog & Evening Walk..."
          className="w-full px-4 py-2.5 bg-stone-50 dark:bg-zinc-900/80 border border-stone-300 dark:border-zinc-800 rounded-xl text-xs sm:text-sm text-ink dark:text-white placeholder-stone-400 dark:placeholder-zinc-500 focus:outline-none focus:border-ink dark:focus:border-white transition-colors"
        />
      </div>

      {/* Action Submit */}
      <button
        type="submit"
        disabled={isLoading}
        className="w-full py-3 px-4 rounded-xl bg-ink hover:bg-stone-800 text-white dark:bg-white dark:hover:bg-zinc-200 dark:text-black font-extrabold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all shadow-md active:scale-98 disabled:opacity-50 touch-target"
      >
        <Sparkles className="w-4 h-4 text-white dark:text-black" />
        <span>
          {isLoading ? 'Synthesizing Atmospheric Models...' : 'Calculate Inhaled Dose & Optimize Routine'}
        </span>
      </button>
    </form>
  );
};
