'use client';

import React from 'react';
import { motion, useReducedMotion, type HTMLMotionProps } from 'motion/react';
import { springs } from '@/lib/motion-tokens';

export interface SpringCardProps extends HTMLMotionProps<'div'> {
  children: React.ReactNode;
  className?: string;
  interactive?: boolean;
  elevation?: 'subtle' | 'base' | 'prominent';
}

export function SpringCard({
  children,
  className = '',
  interactive = true,
  elevation = 'base',
  ...rest
}: SpringCardProps) {
  const shouldReduceMotion = useReducedMotion();

  const getElevationClasses = () => {
    switch (elevation) {
      case 'subtle':
        return 'glass-panel-subtle';
      case 'prominent':
        return 'glass-panel shadow-2xl';
      case 'base':
      default:
        return 'glass-panel';
    }
  };

  const hoverProps = interactive && !shouldReduceMotion
    ? {
        whileHover: { y: -3, transition: springs.snappy },
        whileTap: { scale: 0.985, transition: springs.snappy },
      }
    : {};

  return (
    <motion.div
      {...hoverProps}
      className={`rounded-2xl transition-colors ${getElevationClasses()} ${
        interactive ? 'cursor-pointer select-none focus-visible-ring' : ''
      } ${className}`}
      {...rest}
    >
      {children}
    </motion.div>
  );
}
