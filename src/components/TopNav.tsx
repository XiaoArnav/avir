'use client';

import React from 'react';
import { Wind, Settings } from 'lucide-react';

interface TopNavProps {
  onOpenSettings: () => void;
  hasCustomKey: boolean;
}

export const TopNav: React.FC<TopNavProps> = ({ onOpenSettings, hasCustomKey }) => {
  return (
    <header className="border-b border-gray-800 bg-[#0c121e]/80 backdrop-blur-md sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand identity */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-400 flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <Wind className="w-6 h-6 text-white" aria-hidden="true" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl font-bold tracking-tight text-white">Avir</span>
              <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                Challenge 6
              </span>
            </div>
            <p className="text-xs text-gray-400 hidden sm:block">
              Urban Air Quality & Winter Smog Assistant
            </p>
          </div>
        </div>

        {/* Live telemetry status & actions */}
        <div className="flex items-center gap-3">
          <div 
            className="hidden md:flex items-center gap-2 text-xs font-mono px-3 py-1.5 rounded-full bg-gray-900/80 border border-gray-800 text-gray-300"
            title="Real-time global atmospheric stream active"
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span>Live Telemetry Active</span>
          </div>

          <button
            onClick={onOpenSettings}
            className="flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-200 transition-colors border border-gray-700"
            aria-label="Open AI and Sensor Settings"
          >
            <Settings className="w-4 h-4 text-emerald-400" />
            <span className="hidden sm:inline">
              {hasCustomKey ? 'Gemini Pro Active' : 'AI Engine'}
            </span>
          </button>

          <a
            href="https://github.com/XiaoArnav/avir"
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 rounded-lg bg-gray-850 hover:bg-gray-700 text-gray-300 transition-colors border border-gray-800"
            aria-label="View source code on GitHub"
          >
            <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24" aria-hidden="true">
              <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
            </svg>
          </a>
        </div>
      </div>
    </header>
  );
};
