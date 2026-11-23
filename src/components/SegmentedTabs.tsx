'use client';

import React, { useRef } from 'react';
import { Activity, Globe, CalendarClock, Home, Users } from 'lucide-react';

export type ActiveTabId = 'overview' | 'world' | 'routine' | 'iaq' | 'rwa';

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
  // Misleading ₹2,950 and unqualified "Live" badges removed in Step 20 / UX25
  const tabs: TabItem[] = [
    {
      id: 'overview',
      label: 'Air Quality',
      icon: <Activity className="w-4 h-4" />,
    },
    {
      id: 'world',
      label: 'World Data',
      icon: <Globe className="w-4 h-4" />,
    },
    {
      id: 'routine',
      label: 'Daily Plan',
      icon: <CalendarClock className="w-4 h-4" />,
      badge: typeof reductionPercentage === 'number' && reductionPercentage > 0
        ? `-${reductionPercentage}% Dose`
        : undefined,
    },
    {
      id: 'iaq',
      label: 'Clean Home',
      icon: <Home className="w-4 h-4" />,
    },
    {
      id: 'rwa',
      label: 'Community',
      icon: <Users className="w-4 h-4" />,
    },
  ];

  const buttonRefs = useRef<{ [key: string]: HTMLButtonElement | null }>({});

  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    let targetIndex: number | null = null;

    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      targetIndex = (index + 1) % tabs.length;
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      targetIndex = (index - 1 + tabs.length) % tabs.length;
    } else if (e.key === 'Home') {
      e.preventDefault();
      targetIndex = 0;
    } else if (e.key === 'End') {
      e.preventDefault();
      targetIndex = tabs.length - 1;
    }

    if (targetIndex !== null) {
      const targetTab = tabs[targetIndex];
      onChangeTab(targetTab.id);
      buttonRefs.current[targetTab.id]?.focus();
    }
  };

  return (
    <nav 
      aria-label="Navigation View Selector" 
      className="w-full flex justify-center py-2"
    >
      <div 
        role="tablist"
        aria-orientation="horizontal"
        className="w-full max-w-3xl p-1 rounded-xl bg-stone-200/90 dark:bg-zinc-950 border border-stone-300 dark:border-zinc-800 flex items-center gap-1 overflow-x-auto no-scrollbar shadow-sm dark:shadow-lg transition-colors"
      >
        {tabs.map((tab, idx) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              ref={(el) => {
                buttonRefs.current[tab.id] = el;
              }}
              id={`tab-${tab.id}`}
              role="tab"
              aria-selected={isActive}
              aria-controls={`panel-${tab.id}`}
              tabIndex={isActive ? 0 : -1}
              onClick={() => onChangeTab(tab.id)}
              onKeyDown={(e) => handleKeyDown(e, idx)}
              className={`flex-1 min-w-[110px] sm:min-w-0 py-2.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all duration-200 select-none touch-target focus-visible-ring cursor-pointer ${
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
