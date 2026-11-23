'use client';

import React, { useRef } from 'react';
import { X, Atom, ShieldCheck, Wind, Flame } from 'lucide-react';
import { useAccessibleDialog } from '@/components/ui/AccessibleDialog';

interface ScienceExplainerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ScienceExplainerModal: React.FC<ScienceExplainerModalProps> = ({
  isOpen,
  onClose,
}) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  useAccessibleDialog({ isOpen, onClose, dialogRef });

  if (!isOpen) return null;

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
        aria-labelledby="science-modal-title"
        tabIndex={-1}
        className="relative w-full max-w-3xl rounded-2xl bg-white dark:bg-zinc-950 border border-stone-300 dark:border-zinc-800 p-6 sm:p-8 shadow-2xl overflow-y-auto max-h-[90vh] space-y-6 transition-colors focus:outline-none"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-stone-200 dark:border-zinc-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-stone-100 dark:bg-zinc-900 border border-stone-300 dark:border-zinc-800 flex items-center justify-center text-ink dark:text-white">
              <Atom className="w-5 h-5 text-sage-600 dark:text-white" />
            </div>
            <div>
              <h2 id="science-modal-title" className="text-lg font-bold text-ink dark:text-white tracking-tight">
                How It Works: Clean Air Science Explained
              </h2>
              <p className="text-xs text-ink-muted dark:text-zinc-400">
                Simple breakdown of smoke ceilings, breathing calculations, and DIY air cleaners
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

        {/* Pillar 1: Thermal Inversion Physics */}
        <div className="p-4 rounded-xl bg-stone-50 dark:bg-zinc-900/60 border border-stone-200 dark:border-zinc-800 space-y-2">
          <div className="flex items-center gap-2 text-ink dark:text-white font-bold text-sm">
            <Wind className="w-4 h-4 text-sage-600 dark:text-zinc-300" />
            <span>1. Why Smog Gets Trapped at Night (The Smoke Ceiling)</span>
          </div>
          <p className="text-xs text-ink-muted dark:text-zinc-300 leading-relaxed">
            During winter nights in northern India and urban basins, radiative ground cooling creates a temperature inversion where cold, dense air sits underneath a warmer lid. The mixing layer contracts to <strong>h(t) &lt; 150m</strong> (compared to &gt; 1,200m in the afternoon), physically trapping vehicular exhaust, biomass smoke, and dust within human breathing height.
          </p>
          <div className="p-3 rounded-lg bg-white dark:bg-zinc-950 border border-stone-200 dark:border-zinc-800 font-mono text-[11px] text-ink dark:text-zinc-200 shadow-xs">
            Ground Concentration C(t) ∝ Emission_Rate / (Mixing_Height h(t) × Wind_Speed u)
          </div>
        </div>

        {/* Pillar 2: Inhaled Dose Equation */}
        <div className="p-4 rounded-xl bg-stone-50 dark:bg-zinc-900/60 border border-stone-200 dark:border-zinc-800 space-y-2">
          <div className="flex items-center gap-2 text-ink dark:text-white font-bold text-sm">
            <ShieldCheck className="w-4 h-4 text-sage-600 dark:text-zinc-300" />
            <span>2. How Much Smog Enters Your Lungs (Inhaled Dose)</span>
          </div>
          <p className="text-xs text-ink-muted dark:text-zinc-300 leading-relaxed">
            Air toxicity is not merely the ambient number on an AQI app—it is the biological mass of particulate deposited in human pulmonary alveoli:
          </p>
          <div className="p-3 rounded-lg bg-white dark:bg-zinc-950 border border-stone-200 dark:border-zinc-800 font-mono text-[11px] text-ink dark:text-zinc-200 shadow-xs">
            Dose (µg) = ∫ [ Ambient_Concentration C(t) × Minute_Ventilation V_E × Deposition_Fraction η ] dt
          </div>
          <p className="text-xs text-stone-500 dark:text-zinc-400 leading-relaxed">
            By shifting high-ventilation activities (e.g. morning jogging: 45 L/min) away from the 7:00 AM inversion peak to the 1:30 PM solar convection window, <strong>inhaled dosage decreases by 64% without canceling the workout</strong>.
          </p>
        </div>

        {/* Pillar 3: Berkeley Earth Cigarette Equivalence */}
        <div className="p-4 rounded-xl bg-stone-50 dark:bg-zinc-900/60 border border-stone-200 dark:border-zinc-800 space-y-2">
          <div className="flex items-center gap-2 text-ink dark:text-white font-bold text-sm">
            <Flame className="w-4 h-4 text-terracotta-600 dark:text-zinc-300" />
            <span>3. Cigarette Equivalence (Berkeley Earth Formula)</span>
          </div>
          <p className="text-xs text-ink-muted dark:text-zinc-300 leading-relaxed">
            Dr. Richard Muller (UC Berkeley) and Berkeley Earth established that breathing ambient air with <strong>22 µg/m³ of PM2.5 over 24 hours</strong> transfers roughly the same particulate mass into the lungs as smoking <strong>one commercial cigarette</strong>:
          </p>
          <div className="p-3 rounded-lg bg-white dark:bg-zinc-950 border border-stone-200 dark:border-zinc-800 font-mono text-[11px] text-ink dark:text-zinc-200 shadow-xs">
            Cigarettes_Equivalence = PM2.5_Concentration (µg/m³) / 22.0
          </div>
        </div>

        {/* Pillar 4: Corsi-Rosenthal Box IAQ Physics */}
        <div className="p-4 rounded-xl bg-stone-50 dark:bg-zinc-900/60 border border-stone-200 dark:border-zinc-800 space-y-2">
          <div className="flex items-center gap-2 text-ink dark:text-white font-bold text-sm">
            <Atom className="w-4 h-4 text-sage-600 dark:text-zinc-300" />
            <span>4. Building a Cheap Air Cleaner (Corsi-Rosenthal Box)</span>
          </div>
          <p className="text-xs text-ink-muted dark:text-zinc-300 leading-relaxed">
            Invented by Dr. Richard Corsi and Jim Rosenthal, this low-cost DIY air cleaner mates a 20-inch box fan with 4 or 5 MERV-13 pleated HVAC filters. Particulate clearance follows first-order exponential decay:
          </p>
          <div className="p-3 rounded-lg bg-white dark:bg-zinc-950 border border-stone-200 dark:border-zinc-800 font-mono text-[11px] text-ink dark:text-zinc-200 shadow-xs">
            C(t) = C_0 × e^(- (ACH_CR + k_dep) × t), where ACH = CADR / Room_Volume
          </div>
          <p className="text-xs text-stone-500 dark:text-zinc-400 leading-relaxed">
            At a cost of ~₹2,950 ($35), it delivers 490 CFM CADR—equivalent to two commercial ₹18,000 HEPA units with higher airflow throughput.
          </p>
        </div>

        {/* Close Button */}
        <div className="pt-2 flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2 text-xs font-bold rounded-xl bg-ink hover:bg-stone-800 text-white dark:bg-white dark:hover:bg-zinc-200 dark:text-black transition-colors shadow-sm"
          >
            Understood
          </button>
        </div>
      </div>
    </div>
  );
};
