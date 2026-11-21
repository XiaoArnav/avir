'use client';

import React from 'react';
import { Activity, Clock, Wrench, Megaphone } from 'lucide-react';

export type ActiveTabId = 'overview' | 'routine' | 'iaq' | 'rwa';

interface TabItem {
  id: ActiveTabId;
  label: string;
  icon: React.ReactNode;
  badge?: string;
}

interface SegmentedTabsProps {
  activeTab: ActiveTabId;
  onChangeTab: (tab: ActiveTabId) => void;
}

export const SegmentedTabs: React.FC<SegmentedTabsProps> = ({ activeTab, onChangeTab }) => {
  const tabs: TabItem[] = [
    {
      id: 'overview',
      label: 'Telemetry & Profile',
      icon: <Activity className="w-4 h-4" />,
    },
    {
      id: 'routine',
      label: 'Routine Shifter',
      icon: <Clock className="w-4 h-4" />,
      badge: '-64% Dose',
    },
    {
      id: 'iaq',
      label: 'DIY Air Purifier',
      icon: <Wrench className="w-4 h-4" />,
      badge: '₹2,950',
    },
    {
      id: 'rwa',
      label: 'Community RWA Circular',
      icon: <Megaphone className="w-4 h-4" />,
      badge: 'Action',
    },
  ];

  return (
    <nav 
      aria-label="Navigation View Selector" 
      className="w-full flex justify-center py-2"
    >
      <div 
        role="tablist"
        className="w-full max-w-3xl p-1.5 rounded-2xl glass-panel-subtle bg-slate-950/80 border border-white/[0.08] flex items-center gap-1 overflow-x-auto no-scrollbar shadow-lg"
      >
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              onClick={() => onChangeTab(tab.id)}
              className={`flex-1 min-w-[130px] sm:min-w-0 py-2.5 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all duration-200 select-none touch-target ${
                isActive
                  ? 'bg-gradient-to-r from-emerald-500/20 to-teal-500/20 border border-emerald-500/40 text-emerald-300 shadow-[0_2px_12px_rgba(16,185,129,0.25)]'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60 border border-transparent'
              }`}
            >
              <span className={isActive ? 'text-emerald-400' : 'text-slate-500'}>
                {tab.icon}
              </span>
              <span className="truncate">{tab.label}</span>
              {tab.badge && (
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded-md font-mono hidden sm:inline-block ${
                    isActive
                      ? 'bg-emerald-500/30 text-emerald-200'
                      : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
};
