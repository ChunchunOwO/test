import type { TargetAndTransition, Transition, Variants } from 'motion/react';

const easeStandard = [0.2, 0.82, 0.18, 1] as const;
const easeQuick = [0.22, 0.68, 0.18, 1] as const;

export const springSoft: Transition = {
  duration: 0.18,
  ease: easeStandard,
};

export const springFast: Transition = {
  duration: 0.16,
  ease: easeQuick,
};

export const pageTransition: Transition = {
  duration: 0.18,
  ease: easeStandard,
};

export const panelTransition: Transition = {
  duration: 0.16,
  ease: easeQuick,
};

export const miniPlayerTransition: Transition = {
  duration: 0.18,
  ease: easeStandard,
};

export const pageVariants: Variants = {
  enter: {
    opacity: 0,
  },
  active: {
    opacity: 1,
  },
  inactive: {
    opacity: 0,
  },
  exit: {
    opacity: 0,
  },
  reducedActive: {
    opacity: 1,
  },
  reducedInactive: {
    opacity: 0,
  },
};

export const panelVariants: Variants = {
  enter: {
    opacity: 0,
  },
  active: {
    opacity: 1,
  },
  inactive: {
    opacity: 0,
  },
  exit: {
    opacity: 0,
  },
  reducedActive: {
    opacity: 1,
  },
  reducedInactive: {
    opacity: 0,
  },
};

export const fadeVariants: Variants = {
  enter: {
    opacity: 0,
  },
  active: {
    opacity: 1,
  },
  inactive: {
    opacity: 0,
  },
  exit: {
    opacity: 0,
  },
};

export const hoverTapMotion: {
  whileHover: TargetAndTransition;
  whileTap: TargetAndTransition;
  transition: Transition;
} = {
  whileHover: {
    opacity: 1,
  },
  whileTap: {
    opacity: 0.92,
  },
  transition: {
    duration: 0.1,
    ease: easeQuick,
  },
};
