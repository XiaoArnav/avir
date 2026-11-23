'use client';

import React from 'react';

export type HoloPanelElevation = 'surface' | 'raised' | 'floating' | 'inset';
export type HoloStatusColor = 'cyan' | 'emerald' | 'amber' | 'rose' | 'slate';

interface HoloPanelProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  elevation?: HoloPanelElevation;
  brackets?: boolean;
  glow?: boolean;
  title?: string;
  badge?: React.ReactNode;
  headerAction?: React.ReactNode;
  as?: 'div' | 'section' | 'article' | 'aside';
  className?: string;
}

export function HoloPanel({
  children,
  elevation = 'surface',
  brackets = false,
  glow = false,
  title,
  badge,
  headerAction,
  as: Component = 'div',
  className = '',
  ...rest
}: HoloPanelProps) {
  const elevationClasses: Record<HoloPanelElevation, string> = {
    surface: 'holo-panel rounded-2xl p-4 sm:p-5',
    raised: 'holo-panel-elevated rounded-2xl p-5 sm:p-6',
    floating: 'holo-panel-elevated rounded-2xl p-4 sm:p-6 shadow-2xl backdrop-blur-2xl',
    inset: 'bg-black/20 dark:bg-black/40 border border-white/5 dark:border-sky-500/10 rounded-xl p-3 sm:p-4',
  };

  return (
    <Component
      className={`relative overflow-hidden transition-all duration-200 ${elevationClasses[elevation]} ${
        brackets ? 'hud-corner-brackets' : ''
      } ${glow ? 'dark:shadow-[0_0_30px_-5px_rgba(56,189,248,0.18)]' : ''} ${className}`}
      {...rest}
    >
      {(title || badge || headerAction) && (
        <div className="flex items-center justify-between gap-3 pb-3 mb-4 border-b border-stone-200/80 dark:border-sky-500/15">
          <div className="flex items-center gap-2 min-w-0">
            {title && (
              <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-muted dark:text-sky-300/80 telemetry-mono truncate">
                {title}
              </h3>
            )}
            {badge}
          </div>
          {headerAction && <div className="flex items-center gap-1.5 flex-shrink-0">{headerAction}</div>}
        </div>
      )}
      {children}
    </Component>
  );
}
