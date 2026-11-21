'use client';

import React from 'react';
import { BookOpen, X, Atom, ShieldCheck, Wind, Flame } from 'lucide-react';

interface ScienceExplainerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ScienceExplainerModal: React.FC<ScienceExplainerModalProps> = ({
  isOpen,
  onClose,
}) => {
  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="science-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-200"
    >
      <div 
        className="relative w-full max-w-3xl rounded-3xl glass-panel bg-slate-950/95 border border-white/[0.12] p-6 sm:p-8 shadow-2xl overflow-y-auto max-h-[90vh] space-y-6"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-white/[0.08]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <Atom className="w-5 h-5" />
            </div>
            <div>
              <h2 id="science-modal-title" className="text-lg font-bold text-white tracking-tight">
                The Atmospheric Physics & Toxicology Engine
              </h2>
              <p className="text-xs text-slate-400">
                Mathematical foundations of diurnal boundary layers, inhaled dose, and CADR clearance
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Pillar 1: Thermal Inversion Physics */}
        <div className="p-4 rounded-2xl bg-slate-900/80 border border-white/[0.08] space-y-2">
          <div className="flex items-center gap-2 text-cyan-400 font-bold text-sm">
            <Wind className="w-4 h-4" />
            <span>1. Diurnal Planetary Boundary Layer Dynamics (Thermal Inversion)</span>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            During winter nights in northern India and urban basins, radiative ground cooling creates a temperature inversion where cold, dense air sits underneath a warmer lid. The mixing layer contracts to <strong>h(t) &lt; 150m</strong> (compared to &gt; 1,200m in the afternoon), physically trapping vehicular exhaust, biomass smoke, and dust within human breathing height.
          </p>
          <div className="p-3 rounded-xl bg-slate-950 border border-white/[0.05] font-mono text-[11px] text-cyan-300">
            Ground Concentration C(t) ∝ Emission_Rate / (Mixing_Height h(t) × Wind_Speed u)
          </div>
        </div>

        {/* Pillar 2: Inhaled Dose Equation */}
        <div className="p-4 rounded-2xl bg-slate-900/80 border border-white/[0.08] space-y-2">
          <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
            <ShieldCheck className="w-4 h-4" />
            <span>2. Human Inhalation Dose Equation</span>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            Air toxicity is not merely the ambient number on an AQI app—it is the biological mass of particulate deposited in human pulmonary alveoli:
          </p>
          <div className="p-3 rounded-xl bg-slate-950 border border-white/[0.05] font-mono text-[11px] text-emerald-300">
            Dose (µg) = ∫ [ Ambient_Concentration C(t) × Minute_Ventilation V_E × Deposition_Fraction η ] dt
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            By shifting high-ventilation activities (e.g. morning jogging: 45 L/min) away from the 7:00 AM inversion peak to the 1:30 PM solar convection window, <strong>inhaled dosage decreases by 64% without canceling the workout</strong>.
          </p>
        </div>

        {/* Pillar 3: Berkeley Earth Cigarette Equivalence */}
        <div className="p-4 rounded-2xl bg-slate-900/80 border border-white/[0.08] space-y-2">
          <div className="flex items-center gap-2 text-orange-400 font-bold text-sm">
            <Flame className="w-4 h-4" />
            <span>3. Berkeley Earth Cigarette Equivalence Benchmark</span>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            Dr. Richard Muller (UC Berkeley) and Berkeley Earth established that breathing ambient air with <strong>22 µg/m³ of PM2.5 over 24 hours</strong> transfers roughly the same particulate mass into the lungs as smoking <strong>one commercial cigarette</strong>:
          </p>
          <div className="p-3 rounded-xl bg-slate-950 border border-white/[0.05] font-mono text-[11px] text-orange-300">
            Cigarettes_Equivalence = PM2.5_Concentration (µg/m³) / 22.0
          </div>
        </div>

        {/* Pillar 4: Corsi-Rosenthal Box IAQ Physics */}
        <div className="p-4 rounded-2xl bg-slate-900/80 border border-white/[0.08] space-y-2">
          <div className="flex items-center gap-2 text-purple-400 font-bold text-sm">
            <Atom className="w-4 h-4" />
            <span>4. Corsi-Rosenthal Box Clean Air Delivery Rate (CADR)</span>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            Invented by Dr. Richard Corsi and Jim Rosenthal, this low-cost DIY air cleaner mates a 20-inch box fan with 4 or 5 MERV-13 pleated HVAC filters. Particulate clearance follows first-order exponential decay:
          </p>
          <div className="p-3 rounded-xl bg-slate-950 border border-white/[0.05] font-mono text-[11px] text-purple-300">
            C(t) = C_0 × e^(- (ACH_CR + k_dep) × t), where ACH = CADR / Room_Volume
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            At a cost of ~₹2,950 ($35), it delivers 490 CFM CADR—equivalent to two commercial ₹18,000 HEPA units with higher airflow throughput.
          </p>
        </div>

        {/* Close Button */}
        <div className="pt-2 flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-bold transition-colors shadow-md"
          >
            Understood
          </button>
        </div>
      </div>
    </div>
  );
};
