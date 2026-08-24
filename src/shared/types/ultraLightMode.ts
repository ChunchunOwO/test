export type UltraLightModePhase = 'inactive' | 'entering' | 'active' | 'restoring';

export type UltraLightModeStatus = {
  phase: UltraLightModePhase;
  active: boolean;
  restoreAccelerator: string;
  error: string | null;
};
