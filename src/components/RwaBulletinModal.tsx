'use client';

import React, { useState, useRef } from 'react';
import { Megaphone, X, Copy, Check, Printer, ShieldAlert, Building2, AlertTriangle, ShieldCheck } from 'lucide-react';
import { AtmosphericMetrics } from '@/domain/types';
import { getIndicativeGrapThreshold, calculateCigaretteEquivalence } from '@/domain/air-math';
import { resolveOfficialGrapStatus } from '@/services/advisories/grap-status-resolver';
import { useAccessibleDialog } from '@/components/ui/AccessibleDialog';

interface RwaBulletinModalProps {
  isOpen: boolean;
  onClose: () => void;
  cityName: string;
  metrics: AtmosphericMetrics | null;
}

export const RwaBulletinModal: React.FC<RwaBulletinModalProps> = ({
  isOpen,
  onClose,
  cityName,
  metrics,
}) => {
  const [societyName, setSocietyName] = useState('');
  const [copied, setCopied] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  useAccessibleDialog({ isOpen, onClose, dialogRef });

  if (!isOpen) return null;

  // Strict zero-fabrication verification: Never substitute 380 AQI or 220 PM2.5 fallbacks
  const hasAqi = typeof metrics?.usAqi === 'number' && Number.isFinite(metrics.usAqi) && metrics.usAqi >= 0;
  const hasPm25 = typeof metrics?.pm25 === 'number' && Number.isFinite(metrics.pm25) && metrics.pm25 >= 0;
  const isDataAvailable = hasAqi && hasPm25;

  const aqi = hasAqi ? metrics!.usAqi! : null;
  const pm25 = hasPm25 ? metrics!.pm25! : null;
  const grap = hasAqi ? getIndicativeGrapThreshold(aqi) : null;
  const cigarettes = hasPm25 ? calculateCigaretteEquivalence(pm25) : null;

  const officialGrap = resolveOfficialGrapStatus(undefined, { cityName });

  const todayDate = new Date().toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  const displaySociety = societyName.trim() || 'Resident Welfare Association';

  const provenanceLabel =
    metrics?.provenance === 'observed'
      ? 'Ground Station Observation'
      : metrics?.provenance === 'modeled_forecast'
      ? 'Numerical Atmospheric Model'
      : 'Telemetry Model Feed';

  const officialStatusText =
    officialGrap.verification === 'verified' && officialGrap.highestActiveStage !== null
      ? `CAQM Stage-${officialGrap.highestActiveStage} Active (Statutory Order)`
      : officialGrap.verification === 'not_applicable'
      ? 'Not Applicable (Outside NCR)'
      : officialGrap.verification === 'unknown'
      ? 'Official Status Unverified'
      : 'No Emergency Stages Active';

  const whatsappText = isDataAvailable
    ? `📢 *COMMUNITY AIR-QUALITY ADVISORY: ${displaySociety.toUpperCase()}*
📍 *Location:* ${cityName} | 📅 *Date:* ${todayDate}
⚠️ *Ambient AQI:* ${aqi} (${grap?.label ?? 'Indicative'})
🏛️ *Official Regulatory Status:* ${officialStatusText}
🚬 *Particulate Burden:* ~${cigarettes} cigs/day eq. (Berkeley Earth statistical mass rule; not an individual clinical diagnosis)
🔬 *Source:* ${metrics?.sourceAttribution || 'Open-Meteo'} (${provenanceLabel})

*RECOMMENDED COMMUNITY CLEAN-AIR GUIDANCE (VOLUNTARY PRECAUTIONS):*
1. 🚫 *Zero Open Waste Burning:* Bag all dry leaves and horticulture waste; report burning violations immediately.
2. ⚡ *Diesel Generator Measures:* Minimize non-essential DG set operations; comply with applicable emission control retrofits.
3. 🏃 *Activity Timing Shift:* Move high-intensity outdoor physical activities away from early morning nocturnal inversion windows to midday solar dispersion hours.
4. 💧 *Dust Suppression:* Conduct periodic mist water spraying along boundary walls, unpaved pathways, and driveways.
5. 🛡️ *Worker Respiratory PPE:* Provide certified N95 respirators to outdoor security and estate maintenance staff.

_Classification: Avir-Generated Community Clean-Air Advisory — Not a Government Order_
_Official CAQM Orders: https://caqm.nic.in/ | https://avir-blue.vercel.app_`
    : '';

  const handleCopy = () => {
    if (!isDataAvailable) return;
    navigator.clipboard.writeText(whatsappText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handlePrint = () => {
    if (!isDataAvailable) return;
    window.print();
  };

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div 
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="rwa-modal-title"
        tabIndex={-1}
        className="relative w-full max-w-2xl rounded-3xl bg-white/95 dark:bg-[#060b18]/95 backdrop-blur-2xl border border-stone-200/90 dark:border-sky-500/30 p-6 sm:p-8 shadow-2xl overflow-y-auto max-h-[90vh] transition-colors focus:outline-none hud-corner-brackets"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-stone-200 dark:border-zinc-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-stone-100 dark:bg-zinc-900 border border-stone-300 dark:border-zinc-800 flex items-center justify-center text-ink dark:text-white">
              <Megaphone className="w-5 h-5 text-terracotta-600 dark:text-white" />
            </div>
            <div>
              <h2 id="rwa-modal-title" className="text-lg font-bold text-ink dark:text-white tracking-tight">
                Community Air-Quality Advisory &amp; RWA Guidance
              </h2>
              <p className="text-xs text-ink-muted dark:text-zinc-400">
                Generate an evidence-based clean-air advisory for housing societies, schools &amp; RWAs
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-lg text-ink-muted hover:text-ink hover:bg-stone-100 dark:text-zinc-400 dark:hover:text-white dark:hover:bg-zinc-800 transition-colors focus-visible-ring cursor-pointer"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Society Configuration Input */}
        <div className="py-4 space-y-3">
          <label htmlFor="rwa-name-input" className="block text-xs font-semibold uppercase font-mono tracking-wider text-ink-muted dark:text-zinc-300">
            Resident Welfare Association / Housing Society Name
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-stone-400 dark:text-zinc-500">
              <Building2 className="w-4 h-4 text-stone-400 dark:text-zinc-400" />
            </div>
            <input
              id="rwa-name-input"
              type="text"
              value={societyName}
              onChange={(e) => setSocietyName(e.target.value)}
              placeholder="e.g. Silver Oaks Apartments RWA, Sector 54..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-stone-50 dark:bg-zinc-900 border border-stone-300 dark:border-zinc-800 text-sm text-ink dark:text-white placeholder-stone-400 dark:placeholder-zinc-500 focus:outline-none focus:border-ink dark:focus:border-white transition-colors"
            />
          </div>
        </div>

        {/* Honest Unavailable State vs Live Circular Preview */}
        {!isDataAvailable ? (
          <div className="my-3 p-6 rounded-xl bg-stone-100/90 dark:bg-zinc-900/90 border border-stone-300 dark:border-zinc-800 text-center space-y-3">
            <div className="w-12 h-12 mx-auto rounded-full bg-amber-500/10 text-amber-500 border border-amber-500/20 flex items-center justify-center">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-ink dark:text-white">
                Atmospheric Telemetry Unavailable for {cityName}
              </h3>
              <p className="text-xs text-ink-muted dark:text-zinc-400 max-w-md mx-auto leading-relaxed">
                Avir strictly enforces a zero-fabrication policy and never substitutes synthetic pollution figures or default fallback estimates into community notices.
              </p>
            </div>
            <p className="text-[11px] font-mono text-stone-500 dark:text-zinc-500">
              Export is disabled until verified atmospheric readings are received for this location.
            </p>
          </div>
        ) : (
          <div className="my-2 p-5 rounded-xl bg-stone-100/90 dark:bg-zinc-900/90 border border-stone-300 dark:border-zinc-800 text-ink dark:text-zinc-200 text-xs sm:text-sm font-sans space-y-3.5 leading-relaxed shadow-inner">
            <div className="flex items-center justify-between border-b border-stone-200 dark:border-zinc-800 pb-2.5">
              <div>
                <div className="font-extrabold text-ink dark:text-white text-base tracking-tight uppercase">
                  {displaySociety}
                </div>
                <div className="text-[11px] font-mono text-ink-muted dark:text-zinc-400">
                  Community Clean-Air Health Advisory • {grap?.label ?? 'Indicative'}
                </div>
              </div>
              <div className="text-right text-[11px] font-mono text-ink-muted dark:text-zinc-400">
                <div>{cityName}</div>
                <div>{todayDate}</div>
              </div>
            </div>

            {/* Official Regulatory Banner */}
            <div className="flex items-center gap-2 p-2.5 rounded-lg bg-stone-50 dark:bg-zinc-950 border border-stone-200 dark:border-zinc-800 text-xs">
              <ShieldCheck className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <span>
                <strong>Official CAQM Status:</strong> {officialStatusText}
              </span>
            </div>

            {/* Ambient Reading */}
            <div className="flex items-center gap-2 p-2.5 rounded-lg bg-amber-50 dark:bg-zinc-950 border border-amber-200 dark:border-zinc-800 text-amber-900 dark:text-zinc-300 text-xs">
              <ShieldAlert className="w-4 h-4 shrink-0 text-terracotta-600 dark:text-white" />
              <span>
                <strong>Atmospheric Reading:</strong> Ambient AQI is {aqi} (PM2.5: {pm25} µg/m³). Particulate burden equivalent to ~{cigarettes} cigs/day (statistical mass analogy).
              </span>
            </div>

            <div className="space-y-2 text-xs">
              <div className="font-semibold text-ink dark:text-white tracking-wide">
                RECOMMENDED COMMUNITY CLEAN-AIR ADVISORY (VOLUNTARY PRECAUTIONS):
              </div>
              <div className="text-[11px] text-ink-muted dark:text-zinc-400">
                RECOMMENDED COMMUNITY CLEAN-AIR GUIDANCE FOR RESIDENTS:
              </div>
              <ol className="list-decimal pl-4 space-y-1.5 text-ink-muted dark:text-zinc-300">
                <li>
                  <strong className="text-ink dark:text-white">Strict Ban on Dry Leaf &amp; Waste Burning:</strong> All horticulture waste must be bagged and transferred to municipal composters. Estate guards are authorized to report violators.
                </li>
                <li>
                  <strong className="text-ink dark:text-white">Diesel Generator Measures:</strong> Minimize non-essential DG set operations during elevated pollution periods; verify compliance with retrofitted emission control devices.
                </li>
                <li>
                  <strong className="text-ink dark:text-white">Children Outdoor Hours Shifted:</strong> Early morning physical outdoor sports are discouraged during nocturnal thermal inversion. Shift activities to afternoon solar dispersion windows.
                </li>
                <li>
                  <strong className="text-ink dark:text-white">Estate Dust Mitigation:</strong> Maintenance staff should conduct twice-daily mist water sprinkling on internal roads and common entryways.
                </li>
                <li>
                  <strong className="text-ink dark:text-white">Worker Respiratory PPE:</strong> Provide high-filtration N95 respirators to outdoor security personnel and estate maintenance teams.
                </li>
              </ol>
            </div>

            <div className="text-[10px] text-stone-500 dark:text-zinc-500 border-t border-stone-200 dark:border-zinc-800 pt-2 flex items-center justify-between">
              <span>Classification: Avir-Generated Advisory • Not a Government Order</span>
              <span>{provenanceLabel} ({metrics?.sourceAttribution || 'Open-Meteo'})</span>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="mt-5 flex flex-col sm:flex-row items-center justify-end gap-3 pt-4 border-t border-stone-200 dark:border-zinc-800">
          <button
            onClick={handlePrint}
            disabled={!isDataAvailable}
            className={`w-full sm:w-auto px-4 py-2 text-xs font-semibold rounded-xl border flex items-center justify-center gap-2 transition-colors ${
              isDataAvailable
                ? 'bg-stone-100 dark:bg-zinc-900 hover:bg-stone-200 dark:hover:bg-zinc-800 text-ink dark:text-zinc-200 border-stone-300 dark:border-zinc-800 cursor-pointer'
                : 'bg-stone-100/50 dark:bg-zinc-900/50 text-stone-400 dark:text-zinc-600 border-stone-200 dark:border-zinc-800 cursor-not-allowed'
            }`}
            title={isDataAvailable ? 'Print or save PDF bulletin' : 'Export disabled: telemetry unavailable'}
          >
            <Printer className="w-4 h-4" />
            <span>Print / Save PDF</span>
          </button>

          <button
            onClick={handleCopy}
            disabled={!isDataAvailable}
            className={`w-full sm:w-auto px-5 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-sm ${
              isDataAvailable
                ? 'bg-ink hover:bg-stone-800 text-white dark:bg-white dark:hover:bg-zinc-200 dark:text-black cursor-pointer active:scale-95'
                : 'bg-stone-300 dark:bg-zinc-800 text-stone-500 dark:text-zinc-500 cursor-not-allowed opacity-60'
            }`}
            title={isDataAvailable ? 'Copy WhatsApp bulletin text' : 'Export disabled: telemetry unavailable'}
          >
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            <span>{copied ? 'Copied to Clipboard!' : 'Copy WhatsApp Circular'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
