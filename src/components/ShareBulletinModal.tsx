'use client';

import React, { useState, useRef } from 'react';
import { formatWhatsAppBulletin } from '@/domain/advanced-air-math';
import { Share2, X, Check, Copy, MessageCircle, AlertTriangle } from 'lucide-react';
import { resolveOfficialGrapStatus } from '@/services/advisories/grap-status-resolver';
import { useAccessibleDialog } from '@/components/ui/AccessibleDialog';

interface ShareBulletinModalProps {
  isOpen: boolean;
  onClose: () => void;
  cityName: string;
  usAqi: number | null;
  pm25: number | null;
  cigarettes: number | null;
  bestWindow?: string;
  worstInversion?: string;
  sourceAttribution?: string;
  provenance?: string;
  timestamp?: string;
}

export const ShareBulletinModal: React.FC<ShareBulletinModalProps> = ({
  isOpen,
  onClose,
  cityName,
  usAqi,
  pm25,
  cigarettes,
  bestWindow = '12:30 PM - 3:30 PM (Solar boundary layer expanded)',
  worstInversion = '5:00 AM - 9:00 AM & 8:00 PM - 11:00 PM (Active inversion trap)',
  sourceAttribution = 'Open-Meteo Atmospheric Chemistry Model',
  provenance,
  timestamp,
}) => {
  const [copied, setCopied] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  useAccessibleDialog({ isOpen, onClose, dialogRef });

  if (!isOpen) return null;

  // Strict check: 0 is valid clean air, null/undefined/NaN/<0 is unavailable
  const hasAqi = typeof usAqi === 'number' && Number.isFinite(usAqi) && usAqi >= 0;
  const hasPm25 = typeof pm25 === 'number' && Number.isFinite(pm25) && pm25 >= 0;
  const isAvailable = hasAqi && hasPm25;

  const officialGrap = resolveOfficialGrapStatus(undefined, { cityName });

  const officialStatusText =
    officialGrap.verification === 'verified' && officialGrap.highestActiveStage !== null
      ? `CAQM Stage-${officialGrap.highestActiveStage} Active (Statutory Order)`
      : officialGrap.verification === 'not_applicable'
      ? 'Not Applicable (Outside NCR)'
      : officialGrap.verification === 'unknown'
      ? 'Official Status Unverified'
      : 'No Emergency Stages Active';

  if (!isAvailable) {
    const generalPrecautionText = `📢 *AVIR CLEAN-AIR BASELINE ADVISORY — ${cityName.toUpperCase()}*
📅 *Date:* ${new Date().toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}
🏛️ *Official Regulatory Status:* ${officialStatusText}
⚠️ *Telemetry:* Live measurements currently unverified for this location.

*GENERAL CLEAN-AIR PRECAUTIONS:*
1. 🚫 Strictly avoid open trash, dry leaf, and plastic biomass burning.
2. 💧 Conduct dust suppression water sprinkling on unpaved driveways.
3. 🏃 Sensitive individuals should schedule outdoor exertion during midday solar ventilation hours.
4. 🩺 Consult a doctor if experiencing acute respiratory distress.

_Zero-Fabrication Policy: Synthetic figures are never substituted into bulletins._
https://avir-blue.vercel.app`;

    const handleCopyGeneral = () => {
      navigator.clipboard.writeText(generalPrecautionText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    };

    return (
      <div 
        role="presentation"
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div 
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="share-modal-title"
          tabIndex={-1}
          className="bg-white dark:bg-zinc-900 border border-stone-200 dark:border-zinc-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 focus:outline-none"
        >
          <div className="flex items-center justify-between pb-3 border-b border-stone-200 dark:border-zinc-800">
            <div className="flex items-center gap-2">
              <Share2 className="w-5 h-5 text-emerald-500" />
              <h3 id="share-modal-title" className="text-lg font-bold text-ink dark:text-white">
                Share Clean-Air Advisory
              </h3>
            </div>
            <button 
              onClick={onClose} 
              className="p-1.5 rounded-lg text-ink-muted hover:text-ink dark:text-zinc-400 dark:hover:text-white focus-visible-ring cursor-pointer" 
              aria-label="Close modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-800 dark:text-amber-300 text-xs flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-amber-500" />
            <p className="leading-relaxed">
              Atmospheric telemetry is currently unavailable or unverified for {cityName}. To protect data integrity, Avir never substitutes synthetic pollution figures. A general clean-air precaution bulletin is prepared below.
            </p>
          </div>
          <div className="p-3.5 rounded-xl bg-stone-100 dark:bg-zinc-950 font-mono text-xs text-ink dark:text-zinc-300 whitespace-pre-wrap max-h-48 overflow-y-auto">
            {generalPrecautionText}
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-stone-100 hover:bg-stone-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-ink dark:text-white text-xs font-semibold"
            >
              Close
            </button>
            <button
              onClick={handleCopyGeneral}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5"
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              <span>{copied ? 'Copied!' : 'Copy Precaution Bulletin'}</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  const validAqi = usAqi!;
  const validPm25 = pm25!;
  const validCigarettes = typeof cigarettes === 'number' && Number.isFinite(cigarettes) && cigarettes >= 0
    ? cigarettes
    : Math.round((validPm25 / 22) * 10) / 10;

  const baseBulletin = formatWhatsAppBulletin({
    cityName,
    usAqi: validAqi,
    pm25: validPm25,
    cigarettes: validCigarettes,
    bestWindow,
    worstInversion,
  });

  const provenanceNote = provenance === 'observed'
    ? 'Ground Station Observation'
    : provenance === 'modeled_forecast'
    ? 'Modeled Atmospheric Conditions'
    : 'Atmospheric Telemetry Model';

  const timeNote = timestamp ? `\n🕒 *Reported at:* ${new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : '';
  const bulletinText = `${baseBulletin}
🏛️ *Official Regulatory Status:* ${officialStatusText}
🔬 *Provenance:* ${sourceAttribution} (${provenanceNote})${timeNote}
_Notice: Avir evidence-based briefing • Not a formal government circular_`;

  const handleCopy = () => {
    navigator.clipboard.writeText(bulletinText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleShareWhatsApp = () => {
    const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(bulletinText)}`;
    window.open(url, '_blank');
  };

  return (
    <div 
      role="presentation"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div 
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-modal-title"
        tabIndex={-1}
        className="bg-white dark:bg-zinc-900 border border-stone-200 dark:border-zinc-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5 focus:outline-none"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-stone-200 dark:border-zinc-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
              <Share2 className="w-5 h-5" />
            </div>
            <div>
              <h3 id="share-modal-title" className="text-lg font-bold text-ink dark:text-white">
                Share Daily Smog Bulletin
              </h3>
              <p className="text-xs text-ink-muted dark:text-zinc-400">
                1-tap social briefing for family, WhatsApp &amp; Telegram groups
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-ink-muted hover:text-ink dark:text-zinc-400 dark:hover:text-white transition-colors focus-visible-ring cursor-pointer"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Live Message Preview Card */}
        <div className="space-y-1.5">
          <label className="text-xs font-mono font-bold text-ink-muted dark:text-zinc-400 uppercase">
            Live Preview
          </label>
          <div className="p-4 rounded-xl bg-stone-100 dark:bg-zinc-950 border border-stone-300 dark:border-zinc-800 font-mono text-xs text-ink dark:text-zinc-200 whitespace-pre-wrap leading-relaxed max-h-64 overflow-y-auto select-all">
            {bulletinText}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-between gap-3 pt-2">
          <button
            onClick={handleCopy}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-stone-100 dark:bg-zinc-800 hover:bg-stone-200 dark:hover:bg-zinc-700 text-ink dark:text-white font-semibold text-xs transition-colors border border-stone-200 dark:border-zinc-700 cursor-pointer"
          >
            {copied ? (
              <>
                <Check className="w-4 h-4 text-emerald-500" />
                <span>Copied to Clipboard!</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                <span>Copy Text</span>
              </>
            )}
          </button>

          <button
            onClick={handleShareWhatsApp}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition-colors shadow-sm cursor-pointer"
          >
            <MessageCircle className="w-4 h-4" />
            <span>Share to WhatsApp</span>
          </button>
        </div>
      </div>
    </div>
  );
};
