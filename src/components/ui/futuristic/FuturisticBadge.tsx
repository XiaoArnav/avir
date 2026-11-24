'use client';

import React from 'react';

export type FuturisticBadgeVariant = 'cyan' | 'emerald' | 'amber' | 'rose' | 'purple' | 'neutral';

interface FuturisticBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  label: string;
  variant?: FuturisticBadgeVariant;
  pulse?: boolean;
  icon?: React.ReactNode;
  className?: string;
}

export function FuturisticBadge({
  label,
  variant = 'cyan',
  pulse = false,
  icon,
  className = '',
  ...rest
}: FuturisticBadgeProps) {
  const variantStyles: Record<FuturisticBadgeVariant, { container: string; dot: string; text: string }> = {
    cyan: {
      container: 'bg-sky-500/10 border-sky-500/30 text-sky-700 dark:text-sky-300',
      dot: 'bg-sky-500 shadow-[0_0_8px_rgba(56,189,248,0.8)]',
      text: 'text-sky-700 dark:text-sky-300',
    },
    emerald: {
      container: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300',
      dot: 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]',
      text: 'text-emerald-700 dark:text-emerald-300',
    },
    amber: {
      container: 'bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-300',
      dot: 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.8)]',
      text: 'text-amber-700 dark:text-amber-300',
    },
    rose: {
      container: 'bg-rose-500/10 border-rose-500/30 text-rose-700 dark:text-rose-300',
      dot: 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.8)]',
      text: 'text-rose-700 dark:text-rose-300',
    },
    purple: {
      container: 'bg-purple-500/10 border-purple-500/30 text-purple-700 dark:text-purple-300',
      dot: 'bg-purple-500 shadow-[0_0_8px_rgba(168,85,247,0.8)]',
      text: 'text-purple-700 dark:text-purple-300',
    },
    neutral: {
      container: 'bg-stone-500/10 border-stone-500/30 text-stone-700 dark:text-stone-300',
      dot: 'bg-stone-400',
      text: 'text-stone-700 dark:text-stone-300',
    },
  };

  const style = variantStyles[variant];

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium border tracking-wider telemetry-mono uppercase ${style.container} ${className}`}
      {...rest}
    >
      <span className="relative flex h-1.5 w-1.5">
        {pulse && (
          <span
            className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${style.dot}`}
          />
        )}
        <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${style.dot}`} />
      </span>
      {icon && <span className="flex-shrink-0">{icon}</span>}
      <span className={style.text}>{label}</span>
    </span>
  );
}
