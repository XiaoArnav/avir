'use client';

import React from 'react';
import { UserVulnerabilityProfile } from '@/domain/types';
import { Users, Home, Activity, Sparkles, AlertCircle } from 'lucide-react';

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
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      className="rounded-2xl bg-[#101623] border border-gray-800 p-5 shadow-lg space-y-5"
    >
      <div>
        <h2 className="text-base font-bold text-white flex items-center gap-2">
          <Users className="w-4 h-4 text-emerald-400" />
          <span>Family Vulnerability & Routine Profile</span>
        </h2>
        <p className="text-xs text-gray-400">
          Avir tailors routine shifts and indoor purification physics to your specific household composition
        </p>
      </div>

      {/* Age Group Selector */}
      <div>
        <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-2">
          Primary Household Archetype
        </label>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {(['infant', 'child', 'adult', 'senior'] as const).map((age) => (
            <button
              key={age}
              type="button"
              onClick={() => onChangeProfile({ ...profile, ageGroup: age })}
              className={`py-2 px-3 text-xs rounded-xl border text-center font-medium capitalize transition-all ${
                profile.ageGroup === age
                  ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300 shadow-sm'
                  : 'bg-gray-900 border-gray-800 text-gray-400 hover:border-gray-700'
              }`}
            >
              {age === 'infant' ? 'Infant (< 2y)' : age === 'child' ? 'Child (2–12y)' : age === 'adult' ? 'Healthy Adult' : 'Senior (60y+)'}
            </button>
          ))}
        </div>
      </div>

      {/* Clinical & Environmental Vulnerability Toggles */}
      <div className="space-y-2">
        <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider">
          Vulnerability & Exposure Flags
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <label className="flex items-center gap-2.5 p-2.5 rounded-xl bg-gray-900 border border-gray-800 hover:border-gray-700 cursor-pointer text-xs text-gray-300 transition-colors">
            <input
              type="checkbox"
              checked={profile.hasAsthmaOrRespiratory}
              onChange={(e) => onChangeProfile({ ...profile, hasAsthmaOrRespiratory: e.target.checked })}
              className="rounded bg-gray-800 border-gray-700 text-emerald-500 focus:ring-emerald-500"
            />
            <span>Asthma / Respiratory Sensitivity</span>
          </label>

          <label className="flex items-center gap-2.5 p-2.5 rounded-xl bg-gray-900 border border-gray-800 hover:border-gray-700 cursor-pointer text-xs text-gray-300 transition-colors">
            <input
              type="checkbox"
              checked={profile.hasCardiovascularCondition}
              onChange={(e) => onChangeProfile({ ...profile, hasCardiovascularCondition: e.target.checked })}
              className="rounded bg-gray-800 border-gray-700 text-emerald-500 focus:ring-emerald-500"
            />
            <span>Cardiovascular / Hypertension</span>
          </label>

          <label className="flex items-center gap-2.5 p-2.5 rounded-xl bg-gray-900 border border-gray-800 hover:border-gray-700 cursor-pointer text-xs text-gray-300 transition-colors">
            <input
              type="checkbox"
              checked={profile.isPregnant}
              onChange={(e) => onChangeProfile({ ...profile, isPregnant: e.target.checked })}
              className="rounded bg-gray-800 border-gray-700 text-emerald-500 focus:ring-emerald-500"
            />
            <span>Pregnancy Maternal Shield</span>
          </label>

          <label className="flex items-center gap-2.5 p-2.5 rounded-xl bg-gray-900 border border-gray-800 hover:border-gray-700 cursor-pointer text-xs text-gray-300 transition-colors">
            <input
              type="checkbox"
              checked={profile.isOutdoorWorker}
              onChange={(e) => onChangeProfile({ ...profile, isOutdoorWorker: e.target.checked })}
              className="rounded bg-gray-800 border-gray-700 text-emerald-500 focus:ring-emerald-500"
            />
            <span>Prolonged Outdoor Transit / Work</span>
          </label>
        </div>
      </div>

      {/* Household Room Size & Custom Activity */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
        <div>
          <div className="flex items-center justify-between text-xs mb-1.5">
            <label htmlFor="room-size" className="font-semibold text-gray-300 flex items-center gap-1.5">
              <Home className="w-3.5 h-3.5 text-cyan-400" />
              <span>Target Room Area (sq ft)</span>
            </label>
            <span className="font-mono text-emerald-400 font-bold">{roomSizeSqFt} sq ft</span>
          </div>
          <input
            id="room-size"
            type="range"
            min="80"
            max="600"
            step="10"
            value={roomSizeSqFt}
            onChange={(e) => onChangeRoomSize(Number(e.target.value))}
            className="w-full accent-emerald-500 bg-gray-800 rounded-lg cursor-pointer h-2"
          />
          <div className="flex justify-between text-[10px] text-gray-500 mt-1 font-mono">
            <span>80 sq ft (Small)</span>
            <span>250 sq ft (Master)</span>
            <span>600 sq ft (Living)</span>
          </div>
        </div>

        <div>
          <label htmlFor="custom-routine" className="block text-xs font-semibold text-gray-300 mb-1.5 flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5 text-orange-400" />
            <span>Target Daily Routine Activity</span>
          </label>
          <input
            id="custom-routine"
            type="text"
            value={customRoutine}
            onChange={(e) => onChangeCustomRoutine(e.target.value)}
            placeholder="e.g. 7 AM jog in park, 40-min bike commute"
            className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-xl text-xs text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500 transition-colors"
          />
          <p className="text-[10px] text-gray-500 mt-1">Avir will shift this activity out of toxic inversion hours</p>
        </div>
      </div>

      {/* Submit Trigger Button */}
      <button
        type="submit"
        disabled={isLoading}
        className="w-full py-3 px-4 rounded-xl font-bold text-sm bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-black shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 transition-all disabled:opacity-60"
      >
        <Sparkles className="w-4 h-4" />
        <span>{isLoading ? 'Synthesizing Atmospheric Reasoning...' : 'Calculate Non-Hardcoded Protection Plan'}</span>
      </button>
    </form>
  );
};
