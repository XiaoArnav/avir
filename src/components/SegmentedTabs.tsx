'use client';

import React from 'react';
import { Activity, CalendarClock, Home, Users } from 'lucide-react';

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
  reductionPercentage?: number;
}

export const SegmentedTabs: React.FC<SegmentedTabsProps> = ({ 
  activeTab, 
  onChangeTab,
  reductionPercentage 
}) => {
  const tabs: TabItem[] = [
    {
      id: 'overview',
      label: 'Air Quality',
      icon: <Activity className="w-4 h-4" />,
    },
    {
      id: 'routine',
      label: 'Daily Plan',
      icon: <CalendarClock className="w-4 h-4" />,
      badge: reductionPercentage ? `-${reductionPercentage}% Dose` : undefined,
    },
    {
      id: 'iaq',
      label: 'Clean Home',
      icon: <Home className="w-4 h-4" />,
      badge: '₹2,950',
    },
    {
      id: 'rwa',
      label: 'Community',
      icon: <Users className="w-4 h-4" />,
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
        className="w-full max-w-3xl p-1 rounded-xl bg-stone-200/90 dark:bg-zinc-950 border border-stone-300 dark:border-zinc-800 flex items-center gap-1 overflow-x-auto no-scrollbar shadow-sm dark:shadow-lg transition-colors"
      >
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              onClick={() => onChangeTab(tab.id)}
              className={`flex-1 min-w-[120px] sm:min-w-0 py-2.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all duration-200 select-none touch-target ${
                isActive
                  ? 'bg-white text-ink shadow-sm dark:bg-white dark:text-black font-bold'
                  : 'text-ink-muted hover:text-ink hover:bg-white/60 dark:text-zinc-400 dark:hover:text-white dark:hover:bg-zinc-900/60 border border-transparent'
              }`}
            >
              <span className={isActive ? 'text-ink dark:text-black' : 'text-ink-muted dark:text-zinc-500'}>
                {tab.icon}
              </span>
              <span className="truncate">{tab.label}</span>
              {tab.badge && (
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded font-mono hidden sm:inline-block ${
                    isActive
                      ? 'bg-stone-100 text-ink dark:bg-black/10 dark:text-black font-bold'
                      : 'bg-stone-300/80 text-ink-muted dark:bg-zinc-800 dark:text-zinc-400'
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
