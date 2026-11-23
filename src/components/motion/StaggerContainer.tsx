'use client';

import React from 'react';
import { motion, useReducedMotion, type HTMLMotionProps } from 'motion/react';
import { duration, easing } from '@/lib/motion-tokens';

interface StaggerContainerProps extends HTMLMotionProps<'div'> {
  children: React.ReactNode;
  staggerDelay?: number;
  initialDelay?: number;
  className?: string;
}

export function StaggerContainer({
  children,
  staggerDelay = 0.05,
  initialDelay = 0.02,
  className = '',
  ...rest
}: StaggerContainerProps) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <motion.div
      initial="initial"
      animate="animate"
      exit="exit"
      variants={{
        initial: {},
        animate: {
          transition: {
            staggerChildren: shouldReduceMotion ? 0 : staggerDelay,
            delayChildren: shouldReduceMotion ? 0 : initialDelay,
          },
        },
        exit: {
          transition: {
            staggerChildren: shouldReduceMotion ? 0 : staggerDelay * 0.6,
            staggerDirection: -1,
          },
        },
      }}
      className={className}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

interface StaggerItemProps extends HTMLMotionProps<'div'> {
  children: React.ReactNode;
  className?: string;
  distance?: number;
}

export function StaggerItem({
  children,
  className = '',
  distance = 10,
  ...rest
}: StaggerItemProps) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <motion.div
      variants={{
        initial: { opacity: 0, y: shouldReduceMotion ? 0 : distance },
        animate: {
          opacity: 1,
          y: 0,
          transition: {
            duration: shouldReduceMotion ? 0.01 : duration.base,
            ease: easing.apple,
          },
        },
        exit: {
          opacity: 0,
          y: shouldReduceMotion ? 0 : -distance * 0.5,
          transition: {
            duration: shouldReduceMotion ? 0.01 : duration.fast,
          },
        },
      }}
      className={className}
      {...rest}
    >
      {children}
    </motion.div>
  );
}
