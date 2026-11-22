'use client';

import React, { useState } from 'react';
import { getSchoolSportsAdvisory } from '@/domain/advanced-air-math';
import { GraduationCap, X, Check, Copy, AlertTriangle, ShieldCheck, HeartPulse } from 'lucide-react';

interface SchoolSafetyAdvisoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  cityName: string;
  usAqi: number | null;
  pm25: number | null;
}

export const SchoolSafetyAdvisoryModal: React.FC<SchoolSafetyAdvisoryModalProps> = ({
  isOpen,
  onClose,
  cityName,
  usAqi,
  pm25,
}) => {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  // Strict check: 0 is valid clean air, null/undefined/NaN/<0 is unavailable
  const hasAqi = typeof usAqi === 'number' && Number.isFinite(usAqi) && usAqi >= 0;
  const hasPm25 = typeof pm25 === 'number' && Number.isFinite(pm25) && pm25 >= 0;
  const isAvailable = hasAqi && hasPm25;

  if (!isAvailable) {
    return (
      <div 
        role="dialog"
        aria-modal="true"
        aria-labelledby="school-modal-title"
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
      >
        <div className="bg-white dark:bg-zinc-900 border border-stone-200 dark:border-zinc-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-stone-200 dark:border-zinc-800">
            <div className="flex items-center gap-2">
              <GraduationCap className="w-5 h-5 text-amber-500" />
              <h3 id="school-modal-title" className="text-lg font-bold text-ink dark:text-white">
                School Sports Advisory
              </h3>
            </div>
            <button 
              onClick={onClose} 
              className="p-1.5 rounded-lg text-ink-muted hover:text-ink dark:text-zinc-400 dark:hover:text-white" 
              aria-label="Close modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-800 dark:text-amber-300 text-xs flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-amber-500" />
            <p className="leading-relaxed">
              Atmospheric telemetry is currently unavailable for {cityName}. School health circulars require verified live PM2.5 readings to calculate safety recommendations. Zero synthetic data is substituted.
            </p>
          </div>
          <div className="flex justify-end pt-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-stone-100 hover:bg-stone-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-ink dark:text-white text-xs font-semibold"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  const validAqi = usAqi!;
  const validPm25 = pm25!;
  const advisory = getSchoolSportsAdvisory(validAqi, validPm25);

  const copyNotice = () => {
    const text = `SCHOOL HEALTH CIRCULAR — ${cityName.toUpperCase()}
Date: ${new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
Risk Level: ${advisory.statusLabel.toUpperCase()}

Verified Telemetry: ${validAqi} US AQI (${validPm25} µg/m³ PM2.5)

RECOMMENDED CAMPUS HEALTH PROTOCOLS:
1. Outdoor Morning Assembly: ${advisory.morningAssemblyAction}
2. Physical Education & Athletics: ${advisory.highExertionSportsAction}
3. Recess & Outdoor Play: ${advisory.recessAction}

PEDIATRIC HEALTH ADVISORY:
${advisory.pediatricVulnerabilityNote}

Note: Advisories reflect pediatric respiratory guidelines. Official school operational changes are governed by statutory administrative notifications.
Issued via Avir: https://avir-blue.vercel.app`;

    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div 
      role="dialog"
      aria-modal="true"
      aria-labelledby="school-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div className="bg-white dark:bg-zinc-900 border border-stone-200 dark:border-zinc-800 rounded-2xl max-w-xl w-full p-6 shadow-2xl space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-stone-200 dark:border-zinc-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-500 border border-amber-500/20">
              <GraduationCap className="w-5 h-5" />
            </div>
            <div>
              <h3 id="school-modal-title" className="text-lg font-bold text-ink dark:text-white">
                School &amp; Child Outdoor Sports Advisory
              </h3>
              <p className="text-xs text-ink-muted dark:text-zinc-400">
                Pediatric respiratory safety guidelines for {cityName}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-ink-muted hover:text-ink dark:text-zinc-400 dark:hover:text-white transition-colors"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Status Badge */}
        <div
          className={`p-4 rounded-xl border flex items-center gap-3 ${
            advisory.status === 'hazardous'
              ? 'bg-red-500/10 border-red-500/30 text-red-600 dark:text-red-400'
              : advisory.status === 'restricted'
              ? 'bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400'
              : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
          }`}
        >
          {advisory.status === 'safe' ? (
            <ShieldCheck className="w-6 h-6 shrink-0" />
          ) : (
            <AlertTriangle className="w-6 h-6 shrink-0" />
          )}
          <div>
            <div className="text-xs font-mono uppercase font-bold">Campus Guidance Level</div>
            <div className="text-sm font-bold">{advisory.statusLabel}</div>
          </div>
        </div>

        {/* Protocols Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="p-3 rounded-xl bg-stone-50 dark:bg-zinc-800/60 border border-stone-200 dark:border-zinc-800">
            <div className="text-[10px] text-ink-muted dark:text-zinc-400 uppercase font-mono">
              Morning Assembly
            </div>
            <div className="mt-1 text-sm font-bold text-ink dark:text-white">
              {advisory.morningAssemblyAction}
            </div>
          </div>

          <div className="p-3 rounded-xl bg-stone-50 dark:bg-zinc-800/60 border border-stone-200 dark:border-zinc-800">
            <div className="text-[10px] text-ink-muted dark:text-zinc-400 uppercase font-mono">
              PE &amp; High Cardio
            </div>
            <div className="mt-1 text-sm font-bold text-ink dark:text-white">
              {advisory.highExertionSportsAction}
            </div>
          </div>

          <div className="p-3 rounded-xl bg-stone-50 dark:bg-zinc-800/60 border border-stone-200 dark:border-zinc-800">
            <div className="text-[10px] text-ink-muted dark:text-zinc-400 uppercase font-mono">
              Recess / Play
            </div>
            <div className="mt-1 text-sm font-bold text-ink dark:text-white">
              {advisory.recessAction}
            </div>
          </div>
        </div>

        {/* Pediatric Note */}
        <div className="p-4 rounded-xl bg-stone-50 dark:bg-zinc-800/50 border border-stone-200 dark:border-zinc-800 flex items-start gap-3">
          <HeartPulse className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
          <div className="text-xs space-y-1">
            <div className="font-bold text-ink dark:text-white">
              Pediatric Respiratory Guidance
            </div>
            <p className="text-ink-muted dark:text-zinc-300 leading-relaxed">
              {advisory.pediatricVulnerabilityNote}
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between gap-3 pt-2">
          <p className="text-[11px] text-ink-muted dark:text-zinc-400">
            Pediatric guidelines • Zero synthetic data policy
          </p>

          <button
            onClick={copyNotice}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-stone-900 hover:bg-stone-800 text-white dark:bg-white dark:hover:bg-stone-100 dark:text-black font-semibold text-xs transition-colors shadow-sm cursor-pointer"
          >
            {copied ? (
              <>
                <Check className="w-4 h-4 text-emerald-400" />
                <span>Notice Copied!</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                <span>Copy School Notice</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
