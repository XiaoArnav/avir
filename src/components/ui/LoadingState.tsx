import React from 'react';
import { Loader2 } from 'lucide-react';

export interface LoadingStateProps {
  message?: string;
  subMessage?: string;
  className?: string;
}

export const LoadingState: React.FC<LoadingStateProps> = ({
  message = 'Loading verified environmental telemetry...',
  subMessage,
  className = '',
}) => {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={`flex flex-col items-center justify-center p-8 sm:p-12 text-center space-y-3 rounded-2xl bg-stone-50/60 dark:bg-zinc-900/40 border border-stone-200 dark:border-zinc-800 ${className}`}
    >
      <Loader2 className="w-6 h-6 animate-spin text-ink dark:text-white" />
      <div className="space-y-1">
        <p className="text-xs sm:text-sm font-semibold text-ink dark:text-zinc-200">
          {message}
        </p>
        {subMessage && (
          <p className="text-[11px] text-ink-muted dark:text-zinc-400 font-mono">
            {subMessage}
          </p>
        )}
      </div>
    </div>
  );
};
