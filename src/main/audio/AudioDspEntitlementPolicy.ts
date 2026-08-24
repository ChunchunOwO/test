import type { ChannelBalanceState } from '../../shared/types/audio';
import type { EqState, RoomCorrectionState } from '../../shared/types/eq';
import type { DspRackState } from '../../shared/types/dspRack';
import { isLocalProUnlocked } from '../plugins/LocalProEntitlements';
import { EqStateStore } from './EqStateStore';

const dspEntitlementCacheTtlMs = 1_000;
let cachedDspEntitlement: { unlocked: boolean; checkedAtMs: number } | null = null;

export const setCachedDspEntitlement = (unlocked: boolean): void => {
  cachedDspEntitlement = { unlocked, checkedAtMs: Date.now() };
};

export const isEchoProDspUnlocked = (): boolean => {
  if (cachedDspEntitlement && Date.now() - cachedDspEntitlement.checkedAtMs <= dspEntitlementCacheTtlMs) {
    return cachedDspEntitlement.unlocked;
  }
  const unlocked = isLocalProUnlocked('dsp');
  setCachedDspEntitlement(unlocked);
  return unlocked;
};

export const resetDspEntitlementCacheForTests = (): void => {
  cachedDspEntitlement = null;
};

export type EffectiveDspStates = {
  unlocked: boolean;
  eqState: EqState;
  dspRackState: DspRackState;
  channelBalanceState: ChannelBalanceState;
  roomCorrectionState: RoomCorrectionState;
};

export const loadEffectiveDspStates = (
  unlocked = isEchoProDspUnlocked(),
): EffectiveDspStates => {
  const eqState = EqStateStore.loadEqState();
  const dspRackState = EqStateStore.loadDspRackState();
  const channelBalanceState = EqStateStore.loadChannelBalanceState();
  const roomCorrectionState = EqStateStore.loadRoomCorrectionState();
  if (unlocked) {
    return { unlocked, eqState, dspRackState, channelBalanceState, roomCorrectionState };
  }

  return {
    unlocked,
    eqState: { ...eqState, enabled: false, preampDb: 0, dspHeadroomDb: 0, dspSafetyLimiterEnabled: false },
    dspRackState: {
      ...dspRackState,
      compressor: { ...dspRackState.compressor, enabled: false },
      crossfeed: { ...dspRackState.crossfeed, enabled: false },
      stereoField: { ...dspRackState.stereoField, enabled: false },
      channelMatrix: { ...dspRackState.channelMatrix, enabled: false },
    },
    channelBalanceState: { ...channelBalanceState, enabled: false },
    roomCorrectionState: { ...roomCorrectionState, enabled: false },
  };
};

export const hasConfiguredProDsp = (): boolean => {
  const { eqState, dspRackState, channelBalanceState, roomCorrectionState } = loadEffectiveDspStates(true);
  return eqState.enabled || Math.abs(eqState.preampDb) > 0.001 || Math.abs(eqState.dspHeadroomDb ?? 0) > 0.001 ||
    dspRackState.compressor.enabled || dspRackState.crossfeed.enabled || dspRackState.stereoField.enabled ||
    dspRackState.channelMatrix.enabled || channelBalanceState.enabled || roomCorrectionState.enabled;
};
