'use client';

import React from 'react';
import { motion, useReducedMotion, type HTMLMotionProps } from 'motion/react';
import { duration, easing } from '@/lib/motion-tokens';

export interface FadeInProps extends HTMLMotionProps<'div'> {
  children: React.ReactNode;
  direction?: 'up' | 'down' | 'left' | 'right' | 'none';
  delay?: number;
  durationSeconds?: number;
  className?: string;
  distance?: number;
}

export function FadeIn({
  children,
  direction = 'up',
  delay = 0,
  durationSeconds = duration.smooth,
  className = '',
  distance = 12,
  ...rest
}: FadeInProps) {
  const shouldReduceMotion = useReducedMotion();

  const getInitialOffset = () => {
    if (shouldReduceMotion) return { x: 0, y: 0 };
    switch (direction) {
      case 'up':
        return { x: 0, y: distance };
      case 'down':
        return { x: 0, y: -distance };
      case 'left':
        return { x: distance, y: 0 };
      case 'right':
        return { x: -distance, y: 0 };
      case 'none':
      default:
        return { x: 0, y: 0 };
    }
  };

  const offset = getInitialOffset();

  return (
    <motion.div
      initial={{ opacity: 0, x: offset.x, y: offset.y }}
      animate={{ opacity: 1, x: 0, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{
        duration: shouldReduceMotion ? 0.01 : durationSeconds,
        delay: shouldReduceMotion ? 0 : delay,
        ease: easing.apple,
      }}
      className={className}
      {...rest}
    >
      {children}
    </motion.div>
  );
}
