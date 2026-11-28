'use client';

import React from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Settings, Sun, Moon, Layers } from 'lucide-react';
import { springs } from '@/lib/motion-tokens';

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
  onOpenMultiSource,
  hasCustomKey,
  isDarkMode = true,
  onToggleTheme,
}) => {
  const shouldReduceMotion = useReducedMotion();

  return (
    <header className="border-b border-stone-200/80 dark:border-sky-500/15 bg-white/85 dark:bg-[#040711]/90 backdrop-blur-2xl sticky top-0 z-40 transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand identity */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0 shrink-0">
          <motion.div 
            whileHover={shouldReduceMotion ? undefined : { scale: 1.05 }}
            whileTap={shouldReduceMotion ? undefined : { scale: 0.95 }}
            transition={springs.snappy}
            className="w-10 h-10 rounded-xl bg-white dark:bg-zinc-900 border border-stone-300 dark:border-zinc-800 p-1 flex items-center justify-center shrink-0 select-none shadow-sm cursor-pointer"
            title="Avir — Urban Air Quality & Winter Smog Assistant"
          >
            {/* Clean-air emblem monogram */}
            <svg viewBox="0 0 128 128" className="w-full h-full" fill="none" aria-hidden="true">
              <defs>
                <linearGradient id="nav-glyph" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#10b981" />
                  <stop offset="50%" stopColor={isDarkMode ? '#34d399' : '#059669'} />
                  <stop offset="100%" stopColor={isDarkMode ? '#38bdf8' : '#047857'} />
                </linearGradient>
              </defs>
              <g transform="translate(14, 14) scale(0.78)">
                {/* Resh (ר) Arch */}
                <path 
                  d="M 20 40 C 20 28, 32 20, 52 20 L 92 20 C 108 20, 116 28, 116 44 L 116 92 C 116 100, 110 104, 102 104 C 94 104, 90 100, 90 92 L 90 46 C 90 38, 84 34, 76 34 L 46 34 C 34 34, 26 38, 20 40 Z" 
                  fill="url(#nav-glyph)" 
                />
                {/* Vav (ו) Pillar */}
                <path 
                  d="M 60 26 C 60 20, 66 16, 72 16 C 78 16, 84 20, 84 26 L 84 96 C 84 102, 78 108, 70 108 C 62 108, 56 102, 56 96 Z" 
                  fill={isDarkMode ? '#ffffff' : '#18201D'} 
                />
                {/* Yod (י) Spark */}
                <circle cx="102" cy="38" r="6" fill={isDarkMode ? '#ffffff' : '#10b981'} />
                {/* Alef (א) Dynamic Cross-flow */}
                <path 
                  d="M 24 104 C 16 110, 10 104, 14 96 L 68 28 C 72 22, 80 22, 84 28 L 96 46 C 100 52, 98 58, 92 62 L 38 104 Z" 
                  fill="url(#nav-glyph)" 
                  opacity="0.85" 
                />
              </g>
            </svg>
          </motion.div>
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
        <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
          {/* Duo Theme Toggle Button (Antigravity Dark <-> Vikas Paper Light) */}
          {onToggleTheme && (
            <motion.button
              onClick={onToggleTheme}
              whileTap={shouldReduceMotion ? undefined : { scale: 0.92, rotate: 15 }}
              whileHover={shouldReduceMotion ? undefined : { scale: 1.05 }}
              transition={springs.snappy}
              className="p-2 rounded-xl bg-white dark:bg-zinc-900 hover:bg-stone-200 dark:hover:bg-zinc-800 text-ink dark:text-zinc-200 transition-colors border border-stone-300 dark:border-zinc-800 shadow-sm cursor-pointer focus-visible-ring"
              title={isDarkMode ? 'Switch to Vikas Paper Light Theme' : 'Switch to Antigravity Dark Theme'}
              aria-label="Toggle between Antigravity Dark and Vikas Light themes"
            >
              {isDarkMode ? (
                <Sun className="w-4 h-4 text-amber-400" />
              ) : (
                <Moon className="w-4 h-4 text-ink" />
              )}
            </motion.button>
          )}

          {/* Atmospheric Data Sources & Quality Button */}
          {onOpenMultiSource && (
            <motion.button
              onClick={onOpenMultiSource}
              whileTap={shouldReduceMotion ? undefined : { scale: 0.96 }}
              whileHover={shouldReduceMotion ? undefined : { scale: 1.02 }}
              transition={springs.snappy}
              className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 sm:px-3 py-1.5 rounded-lg bg-white dark:bg-zinc-900/80 hover:bg-stone-200 dark:hover:bg-zinc-800 text-ink dark:text-zinc-300 transition-colors border border-stone-300 dark:border-zinc-800 shadow-sm cursor-pointer focus-visible-ring"
              aria-label="Inspect Atmospheric Data Sources and Quality"
            >
              <Layers className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
              <span className="hidden sm:inline">Data Sources &amp; Quality</span>
              <span className="sm:hidden">Sources</span>
            </motion.button>
          )}

          {/* AI Settings Button */}
          <motion.button
            onClick={onOpenSettings}
            whileTap={shouldReduceMotion ? undefined : { scale: 0.96 }}
            whileHover={shouldReduceMotion ? undefined : { scale: 1.02 }}
            transition={springs.snappy}
            className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-white dark:bg-zinc-900 hover:bg-stone-200 dark:hover:bg-zinc-800 text-ink dark:text-zinc-300 transition-colors border border-stone-300 dark:border-zinc-800 shadow-sm cursor-pointer focus-visible-ring"
            aria-label="Open AI and Sensor Settings"
          >
            <Settings className="w-3.5 h-3.5 text-sage-600 dark:text-emerald-400" />
            <span className="hidden sm:inline">
              {hasCustomKey ? 'Gemini Active' : 'AI Engine'}
            </span>
          </motion.button>

          {/* GitHub Repo */}
          <motion.a
            href="https://github.com/XiaoArnav/avir"
            target="_blank"
            rel="noopener noreferrer"
            whileTap={shouldReduceMotion ? undefined : { scale: 0.92 }}
            whileHover={shouldReduceMotion ? undefined : { scale: 1.05 }}
            transition={springs.snappy}
            className="p-2 rounded-lg bg-white dark:bg-zinc-900 hover:bg-stone-200 dark:hover:bg-zinc-800 text-ink dark:text-zinc-400 transition-colors border border-stone-300 dark:border-zinc-800 shadow-sm cursor-pointer focus-visible-ring"
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
          </motion.a>
        </div>
      </div>
    </header>
  );
};
