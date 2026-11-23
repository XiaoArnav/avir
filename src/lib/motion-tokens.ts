import type { Transition, Variants } from 'motion/react';

/**
 * AVIR Motion Design Tokens
 * Calibrated for high-precision atmospheric intelligence interfaces.
 * Inspired by Apple Weather, Linear, and Vercel design systems.
 */

// Timing durations (in seconds)
export const duration = {
  instant: 0.1,
  fast: 0.18,
  base: 0.28,
  smooth: 0.42,
  slow: 0.65,
  ambient: 1.2,
} as const;

// Easing cubic beziers
export const easing = {
  // Linear / Apple signature responsive curve
  apple: [0.16, 1, 0.3, 1] as const,
  // Standard acceleration/deceleration
  easeOutQuart: [0.165, 0.84, 0.44, 1] as const,
  easeInOutQuart: [0.77, 0, 0.175, 1] as const,
  easeOutCubic: [0.215, 0.61, 0.355, 1] as const,
} as const;

// Spring configurations
export const springs = {
  snappy: {
    type: 'spring',
    stiffness: 420,
    damping: 32,
    mass: 0.8,
  } as Transition,

  gentle: {
    type: 'spring',
    stiffness: 260,
    damping: 26,
    mass: 1,
  } as Transition,

  bouncy: {
    type: 'spring',
    stiffness: 340,
    damping: 19,
    mass: 0.9,
  } as Transition,

  atmospheric: {
    type: 'spring',
    stiffness: 110,
    damping: 22,
    mass: 1.2,
  } as Transition,
} as const;

// Transition presets
export const transitions = {
  snappy: {
    duration: duration.fast,
    ease: easing.apple,
  } as Transition,

  smooth: {
    duration: duration.smooth,
    ease: easing.apple,
  } as Transition,

  modal: {
    duration: duration.base,
    ease: easing.apple,
  } as Transition,

  subtle: {
    duration: duration.base,
    ease: easing.easeOutCubic,
  } as Transition,
} as const;

// Standard Motion Variants
export const motionVariants = {
  fadeIn: {
    initial: { opacity: 0 },
    animate: { opacity: 1, transition: { duration: duration.base, ease: easing.apple } },
    exit: { opacity: 0, transition: { duration: duration.fast, ease: easing.apple } },
  } satisfies Variants,

  fadeUp: {
    initial: { opacity: 0, y: 12 },
    animate: { opacity: 1, y: 0, transition: { duration: duration.smooth, ease: easing.apple } },
    exit: { opacity: 0, y: -8, transition: { duration: duration.fast, ease: easing.apple } },
  } satisfies Variants,

  fadeDown: {
    initial: { opacity: 0, y: -12 },
    animate: { opacity: 1, y: 0, transition: { duration: duration.smooth, ease: easing.apple } },
    exit: { opacity: 0, y: 8, transition: { duration: duration.fast, ease: easing.apple } },
  } satisfies Variants,

  scaleUp: {
    initial: { opacity: 0, scale: 0.95 },
    animate: { opacity: 1, scale: 1, transition: springs.gentle },
    exit: { opacity: 0, scale: 0.96, transition: { duration: duration.fast } },
  } satisfies Variants,

  modalOverlay: {
    initial: { opacity: 0 },
    animate: { opacity: 1, transition: { duration: duration.fast } },
    exit: { opacity: 0, transition: { duration: duration.instant } },
  } satisfies Variants,

  modalContent: {
    initial: { opacity: 0, scale: 0.96, y: 10 },
    animate: { opacity: 1, scale: 1, y: 0, transition: springs.gentle },
    exit: { opacity: 0, scale: 0.97, y: 8, transition: { duration: duration.fast } },
  } satisfies Variants,

  staggerContainer: {
    initial: {},
    animate: {
      transition: {
        staggerChildren: 0.05,
        delayChildren: 0.02,
      },
    },
    exit: {
      transition: {
        staggerChildren: 0.03,
        staggerDirection: -1,
      },
    },
  } satisfies Variants,

  staggerItem: {
    initial: { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0, transition: { duration: duration.base, ease: easing.apple } },
    exit: { opacity: 0, y: 4, transition: { duration: duration.fast } },
  } satisfies Variants,
} as const;
