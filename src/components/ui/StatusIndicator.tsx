import React from 'react';
import { AQICategory } from '@/domain/types';

export interface StatusIndicatorProps {
  category: AQICategory | 'Unavailable';
  showDot?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  customLabel?: string;
}

export const StatusIndicator: React.FC<StatusIndicatorProps> = ({
  category,
  showDot = true,
  size = 'md',
  className = '',
  customLabel,
}) => {
  const getStyles = () => {
    switch (category) {
      case 'Good':
        return {
          bg: 'bg-emerald-500/15 border-emerald-500/40 text-emerald-700 dark:text-emerald-400',
          dot: 'bg-emerald-500',
          label: 'Good Air',
        };
      case 'Moderate':
        return {
          bg: 'bg-yellow-500/15 border-yellow-500/40 text-yellow-800 dark:text-yellow-300',
          dot: 'bg-yellow-500',
          label: 'Moderate',
        };
      case 'UnhealthySensitive':
        return {
          bg: 'bg-orange-500/15 border-orange-500/40 text-orange-800 dark:text-orange-400',
          dot: 'bg-orange-500',
          label: 'Unhealthy for Sensitive Groups',
        };
      case 'Unhealthy':
        return {
          bg: 'bg-rose-500/15 border-rose-500/40 text-rose-800 dark:text-rose-400',
          dot: 'bg-rose-500',
          label: 'Unhealthy Smog',
        };
      case 'VeryUnhealthy':
        return {
          bg: 'bg-purple-500/20 border-purple-500/40 text-purple-800 dark:text-purple-300',
          dot: 'bg-purple-500',
          label: 'Very Unhealthy',
        };
      case 'Hazardous':
      case 'Severe':
        return {
          bg: 'bg-red-600/20 border-red-500/50 text-red-800 dark:text-red-300',
          dot: 'bg-red-500',
          label: 'Hazardous (Severe Smog Alert)',
        };
      case 'Unavailable':
      default:
        return {
          bg: 'bg-stone-500/15 border-stone-500/30 text-stone-700 dark:text-stone-400',
          dot: 'bg-stone-400',
          label: 'Data Unavailable',
        };
    }
  };

  const style = getStyles();
  const label = customLabel || style.label;

  const sizeClasses = {
    sm: 'text-[10px] px-2 py-0.5',
    md: 'text-xs px-2.5 py-1',
    lg: 'text-sm px-3.5 py-1.5',
  }[size];

  const dotSize = {
    sm: 'w-1.5 h-1.5',
    md: 'w-2 h-2',
    lg: 'w-2.5 h-2.5',
  }[size];

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-semibold rounded-full border shadow-2xs select-none ${style.bg} ${sizeClasses} ${className}`}
    >
      {showDot && (
        <span
          className={`rounded-full shrink-0 ${dotSize} ${style.dot}`}
          aria-hidden="true"
        />
      )}
      <span>{label}</span>
    </span>
  );
};
