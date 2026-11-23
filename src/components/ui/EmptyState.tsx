import React from 'react';
import { HelpCircle } from 'lucide-react';

export interface EmptyStateProps {
  title: string;
  message: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title,
  message,
  icon,
  action,
  className = '',
}) => {
  return (
    <div
      role="status"
      className={`flex flex-col items-center justify-center p-8 sm:p-10 text-center space-y-3 rounded-2xl bg-stone-50/50 dark:bg-zinc-900/30 border border-stone-200 dark:border-zinc-800 ${className}`}
    >
      <div className="w-10 h-10 rounded-full bg-stone-100 dark:bg-zinc-800 flex items-center justify-center text-ink-muted dark:text-zinc-400">
        {icon || <HelpCircle className="w-5 h-5" />}
      </div>
      <div className="space-y-1 max-w-sm">
        <h3 className="text-sm font-bold text-ink dark:text-white">
          {title}
        </h3>
        <p className="text-xs text-ink-muted dark:text-zinc-400 leading-relaxed">
          {message}
        </p>
      </div>
      {action && <div className="pt-2">{action}</div>}
    </div>
  );
};
