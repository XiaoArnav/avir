'use client';

import React from 'react';
import { Wind, Settings, Atom, Megaphone } from 'lucide-react';

interface TopNavProps {
  onOpenSettings: () => void;
  onOpenExplainer: () => void;
  onOpenRwa: () => void;
  hasCustomKey: boolean;
}

export const TopNav: React.FC<TopNavProps> = ({
  onOpenSettings,
  onOpenExplainer,
  onOpenRwa,
  hasCustomKey,
}) => {
  return (
    <header className="border-b border-white/[0.08] bg-[#070a11]/80 backdrop-blur-2xl sticky top-0 z-40 transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand identity */}
        <div className="flex items-center gap-3">
          <div 
            className="w-11 h-11 rounded-2xl bg-gradient-to-br from-emerald-950/90 via-slate-900 to-slate-950 border border-emerald-500/50 flex items-center justify-center shadow-[0_0_24px_rgba(16,185,129,0.4)] shrink-0 select-none transition-transform hover:scale-105"
            title="אֲוִיר (Avir) — Hebrew for Air & Atmosphere"
          >
            <span 
              className="text-base sm:text-lg font-black tracking-normal bg-gradient-to-r from-emerald-300 via-teal-200 to-cyan-300 bg-clip-text text-transparent drop-shadow-[0_2px_10px_rgba(16,185,129,0.6)] font-sans"
              style={{ direction: 'rtl' }}
            >
              אֲוִיר
            </span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl font-black tracking-tight text-white">Avir</span>
              <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-mono">
                Challenge 6
              </span>
            </div>
            <p className="text-[11px] text-slate-400 hidden sm:block">
              Urban Air Quality & Winter Smog Assistant
            </p>
          </div>
        </div>

        {/* Live telemetry status & action buttons */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Science Explainer Button */}
          <button
            onClick={onOpenExplainer}
            className="hidden md:inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-xl bg-slate-900/80 hover:bg-slate-800 text-cyan-300 transition-colors border border-cyan-500/30"
            aria-label="Open Atmospheric Science Explainer"
          >
            <Atom className="w-3.5 h-3.5" />
            <span>The Science</span>
          </button>

          {/* RWA Circular Generator Button */}
          <button
            onClick={onOpenRwa}
            className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-xl bg-slate-900/80 hover:bg-slate-800 text-amber-300 transition-colors border border-amber-500/30"
            aria-label="Open RWA Notice Circular"
          >
            <Megaphone className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">RWA Notice</span>
          </button>

          {/* AI Settings Button */}
          <button
            onClick={onOpenSettings}
            className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-200 transition-colors border border-white/[0.08]"
            aria-label="Open AI and Sensor Settings"
          >
            <Settings className="w-3.5 h-3.5 text-emerald-400" />
            <span className="hidden sm:inline">
              {hasCustomKey ? 'Gemini Active' : 'AI Engine'}
            </span>
          </button>

          {/* GitHub Repo */}
          <a
            href="https://github.com/XiaoArnav/avir"
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white transition-colors border border-white/[0.08]"
            aria-label="GitHub Repository"
          >
            <svg
              className="w-4 h-4 fill-current"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
              />
            </svg>
          </a>
        </div>
      </div>
    </header>
  );
};
