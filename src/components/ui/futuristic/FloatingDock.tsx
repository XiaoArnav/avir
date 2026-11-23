'use client';

import React, { useRef } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Activity, Globe, CalendarClock, Home, Users } from 'lucide-react';
import { ActiveTabId } from '@/components/SegmentedTabs';

export interface FloatingDockProps {
  activeTab: ActiveTabId;
  onChangeTab: (tab: ActiveTabId) => void;
  reductionPercentage?: number;
  className?: string;
}

export function FloatingDock({
  activeTab,
  onChangeTab,
  reductionPercentage,
  className = '',
}: FloatingDockProps) {
  const shouldReduceMotion = useReducedMotion();
  const buttonRefs = useRef<{ [key: string]: HTMLButtonElement | null }>({});

  const dockTabs = [
    {
      id: 'overview' as ActiveTabId,
      label: 'Air Quality',
      shortLabel: 'AQI',
      icon: Activity,
    },
    {
      id: 'world' as ActiveTabId,
      label: 'World Data',
      shortLabel: 'World',
      icon: Globe,
    },
    {
      id: 'routine' as ActiveTabId,
      label: 'Daily Plan',
      shortLabel: 'Plan',
      icon: CalendarClock,
      badge:
        typeof reductionPercentage === 'number' && reductionPercentage > 0
          ? `-${reductionPercentage}%`
          : undefined,
    },
    {
      id: 'iaq' as ActiveTabId,
      label: 'Clean Home',
      shortLabel: 'Home',
      icon: Home,
    },
    {
      id: 'rwa' as ActiveTabId,
      label: 'Community',
      shortLabel: 'RWA',
      icon: Users,
    },
  ];

  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    let nextIndex: number | null = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      nextIndex = (index + 1) % dockTabs.length;
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      nextIndex = (index - 1 + dockTabs.length) % dockTabs.length;
    } else if (e.key === 'Home') {
      e.preventDefault();
      nextIndex = 0;
    } else if (e.key === 'End') {
      e.preventDefault();
      nextIndex = dockTabs.length - 1;
    }

    if (nextIndex !== null) {
      const nextTab = dockTabs[nextIndex];
      onChangeTab(nextTab.id);
      buttonRefs.current[nextTab.id]?.focus();
    }
  };

  return (
    <nav
      aria-label="Mission command dock"
      className={`relative inline-flex items-center p-1.5 rounded-2xl bg-white/80 dark:bg-[#060b18]/85 backdrop-blur-xl border border-stone-200/90 dark:border-sky-500/25 shadow-xl dark:shadow-[0_12px_40px_rgba(0,0,0,0.8)] ${className}`}
    >
      <div role="tablist" aria-orientation="horizontal" className="flex items-center gap-1">
        {dockTabs.map((tab, idx) => {
          const isActive = activeTab === tab.id;
          const Icon = tab.icon;

          return (
            <button
              key={tab.id}
              ref={(el) => {
                buttonRefs.current[tab.id] = el;
              }}
              role="tab"
              aria-selected={isActive}
              aria-controls={`panel-${tab.id}`}
              id={`tab-${tab.id}`}
              tabIndex={isActive ? 0 : -1}
              onClick={() => onChangeTab(tab.id)}
              onKeyDown={(e) => handleKeyDown(e, idx)}
              className={`relative z-10 flex items-center gap-2 px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${
                isActive
                  ? 'text-sky-950 dark:text-white'
                  : 'text-stone-600 dark:text-slate-400 hover:text-stone-900 dark:hover:text-slate-200'
              }`}
            >
              {isActive && (
                <motion.div
                  layoutId="floating-dock-active-pill"
                  transition={
                    shouldReduceMotion
                      ? { duration: 0 }
                      : { type: 'spring', stiffness: 450, damping: 35 }
                  }
                  className="absolute inset-0 rounded-xl bg-gradient-to-b from-stone-200/80 to-stone-100/90 dark:from-sky-500/25 dark:to-sky-600/15 border border-stone-300 dark:border-sky-400/40 shadow-sm"
                  aria-hidden="true"
                />
              )}

              <span className="relative z-10 flex items-center gap-2">
                <Icon className={`w-4 h-4 ${isActive ? 'text-sky-600 dark:text-sky-400' : ''}`} />
                <span className="hidden sm:inline">{tab.label}</span>
                <span className="sm:hidden">{tab.shortLabel}</span>

                {tab.badge && (
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-emerald-500 text-white dark:bg-emerald-500/30 dark:text-emerald-300 telemetry-mono">
                    {tab.badge}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
