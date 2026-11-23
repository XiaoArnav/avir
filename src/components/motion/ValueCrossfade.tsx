'use client';

import React from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { duration, easing } from '@/lib/motion-tokens';

export interface ValueCrossfadeProps {
  value: React.ReactNode;
  valueKey?: string | number;
  className?: string;
  tabularNums?: boolean;
}

/**
 * ValueCrossfade
 * Strictly adheres to AVIR scientific data integrity guidelines:
 * Does NOT animate through fabricated intermediate numbers.
 * Instead, performs a crisp, elegant crossfade transition between
 * authentic measured or modeled values.
 */
export function ValueCrossfade({
  value,
  valueKey,
  className = '',
  tabularNums = true,
}: ValueCrossfadeProps) {
  const shouldReduceMotion = useReducedMotion();
  const resolvedKey = valueKey ?? (typeof value === 'string' || typeof value === 'number' ? value : undefined);

  return (
    <span className={`inline-block overflow-hidden ${tabularNums ? 'tabular-nums' : ''} ${className}`}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={resolvedKey}
          initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -6 }}
          transition={{
            duration: shouldReduceMotion ? 0.01 : duration.fast,
            ease: easing.apple,
          }}
          className="inline-block"
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
