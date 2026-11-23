import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
  className?: string;
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  title = 'Telemetry Connection Unavailable',
  message,
  onRetry,
  className = '',
}) => {
  return (
    <div
      role="alert"
      className={`flex flex-col items-center justify-center p-6 sm:p-8 text-center space-y-3 rounded-2xl bg-red-50/60 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50 ${className}`}
    >
      <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/50 flex items-center justify-center text-red-600 dark:text-red-400">
        <AlertTriangle className="w-5 h-5" />
      </div>
      <div className="space-y-1 max-w-md">
        <h3 className="text-sm font-bold text-red-900 dark:text-red-200">
          {title}
        </h3>
        <p className="text-xs text-red-700 dark:text-red-300 leading-relaxed">
          {message}
        </p>
        <p className="text-[10px] font-mono text-stone-500 dark:text-zinc-500 pt-1">
          Zero synthetic data policy: Avir never substitutes simulated values when live feeds fail.
        </p>
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-2 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-ink hover:bg-stone-800 text-white dark:bg-white dark:hover:bg-zinc-200 dark:text-black text-xs font-semibold transition-all shadow-sm active:scale-95"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Retry Connection</span>
        </button>
      )}
    </div>
  );
};
