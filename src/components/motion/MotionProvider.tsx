'use client';

import React from 'react';
import { MotionConfig } from 'motion/react';

interface MotionProviderProps {
  children: React.ReactNode;
}

/**
 * System-wide Motion Provider
 * Configures global reduced-motion behavior so that any user with
 * `prefers-reduced-motion: reduce` gets instant, accessible transitions
 * without disorientation or vestibular trigger.
 */
export function MotionProvider({ children }: MotionProviderProps) {
  return (
    <MotionConfig reducedMotion="user" isValidProp={(key) => key !== 'children'}>
      {children}
    </MotionConfig>
  );
}
