'use client';

import React from 'react';
import { motion, useReducedMotion, type HTMLMotionProps } from 'motion/react';
import { springs } from '@/lib/motion-tokens';

export interface SlideUpProps extends HTMLMotionProps<'div'> {
  children: React.ReactNode;
  delay?: number;
  className?: string;
  distance?: number;
}

export function SlideUp({
  children,
  delay = 0,
  className = '',
  distance = 16,
  ...rest
}: SlideUpProps) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <motion.div
      initial={{ opacity: 0, y: shouldReduceMotion ? 0 : distance }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: shouldReduceMotion ? 0 : -distance }}
      transition={
        shouldReduceMotion
          ? { duration: 0.01 }
          : { ...springs.gentle, delay }
      }
      className={className}
      {...rest}
    >
      {children}
    </motion.div>
  );
}
