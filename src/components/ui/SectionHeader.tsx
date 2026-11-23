import React from 'react';

export interface SectionHeaderProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}

export const SectionHeader: React.FC<SectionHeaderProps> = ({
  title,
  subtitle,
  icon,
  badge,
  action,
  className = '',
}) => {
  return (
    <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-stone-200 dark:border-zinc-800 ${className}`}>
      <div className="flex items-start gap-3">
        {icon && (
          <div className="p-2 rounded-xl bg-stone-100 dark:bg-zinc-800/80 text-ink dark:text-zinc-200 shrink-0 border border-stone-200 dark:border-zinc-700/60 shadow-xs">
            {icon}
          </div>
        )}
        <div className="space-y-0.5">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-base sm:text-lg font-bold text-ink dark:text-white tracking-tight">
              {title}
            </h2>
            {badge && <div>{badge}</div>}
          </div>
          {subtitle && (
            <p className="text-xs text-ink-muted dark:text-zinc-400">
              {subtitle}
            </p>
          )}
        </div>
      </div>
      {action && <div className="self-start sm:self-center shrink-0">{action}</div>}
    </div>
  );
};
