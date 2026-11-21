'use client';

import React from 'react';
import { Wind, Settings, Atom, Megaphone, Sun, Moon, Globe, GraduationCap, Share2, Layers } from 'lucide-react';

interface TopNavProps {
  onOpenSettings: () => void;
  onOpenExplainer: () => void;
  onOpenRwa: () => void;
  onOpenWorldData?: () => void;
  onOpenSchoolAdvisory?: () => void;
  onOpenShare?: () => void;
  onOpenMultiSource?: () => void;
  hasCustomKey: boolean;
  isDarkMode?: boolean;
  onToggleTheme?: () => void;
}

export const TopNav: React.FC<TopNavProps> = ({
  onOpenSettings,
  onOpenExplainer,
  onOpenRwa,
  onOpenWorldData,
  onOpenSchoolAdvisory,
  onOpenShare,
  onOpenMultiSource,
  hasCustomKey,
  isDarkMode = true,
  onToggleTheme,
}) => {
  return (
    <header className="border-b border-stone-300 dark:border-zinc-800/80 bg-stone-100/90 dark:bg-black/90 backdrop-blur-2xl sticky top-0 z-40 transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand identity */}
        <div className="flex items-center gap-3">
          <div 
            className="w-10 h-10 rounded-xl bg-white dark:bg-zinc-900 border border-stone-300 dark:border-zinc-800 p-2 flex items-center justify-center shrink-0 select-none transition-transform hover:scale-105 shadow-sm"
            title="Avir — Urban Atmospheric Defense & Air Quality Assistant"
          >
            {/* Pure Aerodynamic Airflow & Clean Atmosphere Monogram */}
            <svg viewBox="0 0 40 40" className="w-full h-full" fill="none" aria-hidden="true">
              <defs>
                <linearGradient id="nav-airflow" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#10b981" />
                  <stop offset="100%" stopColor="#059669" />
                </linearGradient>
              </defs>
              {/* Flow Stream 1 */}
              <path 
                d="M 6 12 C 14 12, 18 16, 26 16 C 31 16, 34 13, 34 10" 
                stroke="url(#nav-airflow)" 
                strokeWidth="3.2" 
                strokeLinecap="round" 
              />
              {/* Central Apex Stream */}
              <path 
                d="M 6 20 C 12 20, 16 26, 24 26 C 30 26, 34 22, 34 18" 
                stroke={isDarkMode ? '#ffffff' : '#18201D'} 
                strokeWidth="3.2" 
                strokeLinecap="round" 
              />
              {/* Base Horizon Stream */}
              <path 
                d="M 10 28 C 16 28, 20 32, 28 32 C 32 32, 34 30, 34 28" 
                stroke="url(#nav-airflow)" 
                strokeWidth="2.8" 
                strokeLinecap="round" 
                strokeOpacity="0.8" 
              />
              {/* Clean Air Particle Dot */}
              <circle cx="34" cy="10" r="2" fill="#10b981" />
            </svg>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold tracking-tight text-ink dark:text-white">Avir</span>
            </div>
            <p className="text-[11px] text-ink-muted dark:text-zinc-400 hidden sm:block">
              Urban Air Quality &amp; Winter Smog Assistant
            </p>
          </div>
        </div>

        {/* Live telemetry status & action buttons */}
        <div className="flex items-center gap-2 sm:gap-2.5">
          {/* Duo Theme Toggle Button (Antigravity Dark <-> Vikas Paper Light) */}
          {onToggleTheme && (
            <button
              onClick={onToggleTheme}
              className="p-2 rounded-xl bg-white dark:bg-zinc-900 hover:bg-stone-200 dark:hover:bg-zinc-800 text-ink dark:text-zinc-200 transition-colors border border-stone-300 dark:border-zinc-800 shadow-sm"
              title={isDarkMode ? 'Switch to Vikas Paper Light Theme' : 'Switch to Antigravity Dark Theme'}
              aria-label="Toggle between Antigravity Dark and Vikas Light themes"
            >
              {isDarkMode ? (
                <Sun className="w-4 h-4 text-amber-400" />
              ) : (
                <Moon className="w-4 h-4 text-ink" />
              )}
            </button>
          )}

          {/* World Data Rankings Shortcut Button */}
          {onOpenWorldData && (
            <button
              onClick={onOpenWorldData}
              className="hidden lg:inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-white dark:bg-zinc-900/80 hover:bg-stone-200 dark:hover:bg-zinc-800 text-ink dark:text-zinc-300 transition-colors border border-stone-300 dark:border-zinc-800 shadow-sm"
              aria-label="Open World Air Quality Rankings"
            >
              <Globe className="w-3.5 h-3.5 text-sage-600 dark:text-emerald-400" />
              <span>World AQI</span>
            </button>
          )}

          {/* Multi-Source Open-Source Consensus Button */}
          {onOpenMultiSource && (
            <button
              onClick={onOpenMultiSource}
              className="hidden md:inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-white dark:bg-zinc-900/80 hover:bg-stone-200 dark:hover:bg-zinc-800 text-ink dark:text-zinc-300 transition-colors border border-stone-300 dark:border-zinc-800 shadow-sm"
              aria-label="Open Multi-Source Atmospheric Consensus Inspector"
            >
              <Layers className="w-3.5 h-3.5 text-emerald-500" />
              <span>5-Source Consensus</span>
            </button>
          )}

          {/* Science Explainer Button */}
          <button
            onClick={onOpenExplainer}
            className="hidden md:inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-white dark:bg-zinc-900/80 hover:bg-stone-200 dark:hover:bg-zinc-800 text-ink dark:text-zinc-300 transition-colors border border-stone-300 dark:border-zinc-800 shadow-sm"
            aria-label="Open Atmospheric Science Explainer"
          >
            <Atom className="w-3.5 h-3.5 text-sage-600 dark:text-zinc-400" />
            <span>The Science</span>
          </button>

          {/* School Safety Advisory Button */}
          {onOpenSchoolAdvisory && (
            <button
              onClick={onOpenSchoolAdvisory}
              className="hidden lg:inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-white dark:bg-zinc-900/80 hover:bg-stone-200 dark:hover:bg-zinc-800 text-ink dark:text-zinc-300 transition-colors border border-stone-300 dark:border-zinc-800 shadow-sm"
              aria-label="Open School & Child Outdoor Sports Advisory"
            >
              <GraduationCap className="w-3.5 h-3.5 text-amber-500" />
              <span>School Guide</span>
            </button>
          )}

          {/* Share Daily Smog Bulletin Button */}
          {onOpenShare && (
            <button
              onClick={onOpenShare}
              className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition-colors shadow-sm"
              aria-label="Share Daily Smog Bulletin on WhatsApp"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Share</span>
            </button>
          )}

          {/* RWA Circular Generator Button */}
          <button
            onClick={onOpenRwa}
            className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-white dark:bg-zinc-900/80 hover:bg-stone-200 dark:hover:bg-zinc-800 text-ink dark:text-zinc-300 transition-colors border border-stone-300 dark:border-zinc-800 shadow-sm"
            aria-label="Open RWA Notice Circular"
          >
            <Megaphone className="w-3.5 h-3.5 text-terracotta-600 dark:text-zinc-400" />
            <span className="hidden sm:inline">RWA Notice</span>
          </button>

          {/* AI Settings Button */}
          <button
            onClick={onOpenSettings}
            className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-white dark:bg-zinc-900 hover:bg-stone-200 dark:hover:bg-zinc-800 text-ink dark:text-zinc-300 transition-colors border border-stone-300 dark:border-zinc-800 shadow-sm"
            aria-label="Open AI and Sensor Settings"
          >
            <Settings className="w-3.5 h-3.5 text-sage-600 dark:text-emerald-400" />
            <span className="hidden sm:inline">
              {hasCustomKey ? 'Gemini Active' : 'AI Engine'}
            </span>
          </button>

          {/* GitHub Repo */}
          <a
            href="https://github.com/XiaoArnav/avir"
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 rounded-lg bg-white dark:bg-zinc-900 hover:bg-stone-200 dark:hover:bg-zinc-800 text-ink dark:text-zinc-400 transition-colors border border-stone-300 dark:border-zinc-800 shadow-sm"
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
