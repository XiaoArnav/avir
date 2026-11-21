'use client';

import React, { useState } from 'react';
import { Megaphone, X, Copy, Check, Printer, ShieldAlert, Building2 } from 'lucide-react';
import { AtmosphericMetrics } from '@/domain/types';
import { getGrapStage, calculateCigaretteEquivalence } from '@/domain/air-math';

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
  const [societyName, setSocietyName] = useState('Greenwood Residency RWA');
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const aqi = metrics?.usAqi || 380;
  const pm25 = metrics?.pm25 || 220;
  const grap = getGrapStage(aqi);
  const cigarettes = calculateCigaretteEquivalence(pm25);
  const todayDate = new Date().toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  const whatsappText = `📢 *URGENT SMOG ADVISORY: ${societyName.toUpperCase()}*
📍 *Location:* ${cityName} | 📅 *Date:* ${todayDate}
⚠️ *Ambient AQI:* ${aqi} (${grap.label})
🚬 *Breathing Risk:* Equivalent to smoking ~${cigarettes} cigarettes today.

*MANDATORY COMMUNITY ACTIONS UNDER CAQM ${grap.stage}:*
1. 🚫 *Zero Open Burning:* Strictly no burning of garden dry leaves, trash, or biomass. Guards will report violations.
2. ⚡ *Diesel Generator Ban:* DG sets prohibited except for critical lift operations; transition to grid battery backup.
3. 🏃 *Children Outdoor Play Shift:* All sports shifted from morning (06:00 - 09:00 AM) to afternoon solar window (01:30 - 03:30 PM).
4. 💧 *Dust Suppression:* Facility team to execute mist water spraying along boundary walls and driveways twice daily.
5. 🛡️ *Security Guard Protection:* Mandatory N95 masks provided to outdoor guard posts and clubhouse staff.

_Generated via Avir — Urban Air Quality & Winter Smog Assistant_
https://avir-alpha.vercel.app`;

  const handleCopy = () => {
    navigator.clipboard.writeText(whatsappText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="rwa-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in duration-200"
    >
      <div 
        className="relative w-full max-w-2xl rounded-2xl bg-zinc-950 border border-zinc-800 p-6 sm:p-8 shadow-2xl overflow-y-auto max-h-[90vh]"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-white">
              <Megaphone className="w-5 h-5" />
            </div>
            <div>
              <h2 id="rwa-modal-title" className="text-lg font-bold text-white tracking-tight">
                Community &amp; RWA Smog Circular
              </h2>
              <p className="text-xs text-zinc-400">
                Generate an official, CAQM-compliant advisory for societies, schools &amp; RWAs
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Society Configuration Input */}
        <div className="py-4 space-y-3">
          <label className="block text-xs font-semibold uppercase font-mono tracking-wider text-zinc-300">
            Resident Welfare Association / Housing Society Name
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-zinc-500">
              <Building2 className="w-4 h-4 text-zinc-400" />
            </div>
            <input
              type="text"
              value={societyName}
              onChange={(e) => setSocietyName(e.target.value)}
              placeholder="e.g. Silver Oaks Apartments RWA, Sector 54..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-white transition-colors"
            />
          </div>
        </div>

        {/* Circular Preview Paper */}
        <div className="my-2 p-5 rounded-xl bg-zinc-900/90 border border-zinc-800 text-zinc-200 text-xs sm:text-sm font-sans space-y-3.5 leading-relaxed shadow-inner">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-2.5">
            <div>
              <div className="font-extrabold text-white text-base tracking-tight uppercase">
                {societyName}
              </div>
              <div className="text-[11px] font-mono text-zinc-400">
                Official Environmental Health Advisory • CAQM {grap.stage}
              </div>
            </div>
            <div className="text-right text-[11px] font-mono text-zinc-400">
              <div>{cityName}</div>
              <div>{todayDate}</div>
            </div>
          </div>

          <div className="flex items-center gap-2 p-2.5 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-300 text-xs">
            <ShieldAlert className="w-4 h-4 shrink-0 text-white" />
            <span>
              <strong>Emergency Threshold:</strong> Ambient AQI is {aqi} (PM2.5: {pm25} µg/m³). Inhalation risk is equivalent to smoking ~{cigarettes} cigarettes/day.
            </span>
          </div>

          <div className="space-y-2 text-xs">
            <div className="font-semibold text-white tracking-wide">MANDATORY RESIDENT &amp; ESTATE DIRECTIVES:</div>
            <ol className="list-decimal pl-4 space-y-1.5 text-zinc-300">
              <li>
                <strong className="text-white">Strict Ban on Dry Leaf &amp; Waste Burning:</strong> All horticulture waste must be bagged and transferred to municipal composters. Estate guards are authorized to fine violators.
              </li>
              <li>
                <strong className="text-white">Diesel Generator Restrictions:</strong> DG sets are prohibited during non-grid outage periods under GRAP Stage regulations.
              </li>
              <li>
                <strong className="text-white">Children Outdoor Hours Shifted:</strong> Early morning physical outdoor sports (06:00 - 09:00 AM) are suspended due to nocturnal thermal inversion. Shift all activities to 01:30 - 03:30 PM.
              </li>
              <li>
                <strong className="text-white">Estate Dust Mitigation:</strong> Maintenance staff will conduct twice-daily mist water sprinkling on internal roads and common entryways.
              </li>
              <li>
                <strong className="text-white">Guard Post Respiratory PPE:</strong> N95 protective respirators are distributed to all night-shift outdoor security personnel.
              </li>
            </ol>
          </div>

          <div className="text-[11px] text-zinc-500 border-t border-zinc-800 pt-2 text-right">
            Issued by Executive Managing Committee • Validated by Avir Environmental Modeling
          </div>
        </div>

        {/* Action Buttons */}
        <div className="mt-5 flex flex-col sm:flex-row items-center justify-end gap-3 pt-4 border-t border-zinc-800">
          <button
            onClick={handlePrint}
            className="w-full sm:w-auto px-4 py-2 text-xs font-semibold rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-200 transition-colors border border-zinc-800 flex items-center justify-center gap-2"
          >
            <Printer className="w-4 h-4" />
            <span>Print / Save PDF</span>
          </button>

          <button
            onClick={handleCopy}
            className="w-full sm:w-auto px-5 py-2 rounded-xl bg-white hover:bg-zinc-200 text-black text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-sm active:scale-95"
          >
            {copied ? <Check className="w-4 h-4 text-black" /> : <Copy className="w-4 h-4 text-black" />}
            <span>{copied ? 'Copied to Clipboard!' : 'Copy WhatsApp Circular'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
