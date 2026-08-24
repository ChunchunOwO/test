import type { PropsWithChildren } from 'react';
import { MotionConfig } from 'motion/react';
import { useLowSpecModeEnabled } from './useLowSpecModeEnabled';

export const LightweightMotionConfig = ({ children }: PropsWithChildren): JSX.Element => {
  const lowSpecModeEnabled = useLowSpecModeEnabled();

  return (
    <MotionConfig reducedMotion={lowSpecModeEnabled ? 'always' : 'user'}>
      {children}
    </MotionConfig>
  );
};
