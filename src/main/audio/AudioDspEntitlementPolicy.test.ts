import { afterEach, describe, expect, it, vi } from 'vitest';
import { EqStateStore } from './EqStateStore';
import { loadEffectiveDspStates } from './AudioDspEntitlementPolicy';

vi.mock('../plugins/LocalProEntitlements', () => ({
  isLocalProUnlocked: () => false,
}));

afterEach(() => vi.restoreAllMocks());

describe('AudioDspEntitlementPolicy', () => {
  it('preserves stored Pro configuration while bypassing every live DSP module when locked', () => {
    const eq = { ...EqStateStore.loadEqState(), enabled: true, preampDb: -4, dspHeadroomDb: 3 };
    const rack = EqStateStore.loadDspRackState();
    rack.compressor.enabled = true;
    rack.crossfeed.enabled = true;
    rack.stereoField.enabled = true;
    rack.channelMatrix.enabled = true;
    const balance = { ...EqStateStore.loadChannelBalanceState(), enabled: true };
    const room = { ...EqStateStore.loadRoomCorrectionState(), enabled: true };
    vi.spyOn(EqStateStore, 'loadEqState').mockReturnValue(eq);
    vi.spyOn(EqStateStore, 'loadDspRackState').mockReturnValue(rack);
    vi.spyOn(EqStateStore, 'loadChannelBalanceState').mockReturnValue(balance);
    vi.spyOn(EqStateStore, 'loadRoomCorrectionState').mockReturnValue(room);

    const effective = loadEffectiveDspStates(false);

    expect(effective.eqState).toMatchObject({ enabled: false, preampDb: 0, dspHeadroomDb: 0, dspSafetyLimiterEnabled: false });
    expect(effective.dspRackState.compressor.enabled).toBe(false);
    expect(effective.dspRackState.crossfeed.enabled).toBe(false);
    expect(effective.dspRackState.stereoField.enabled).toBe(false);
    expect(effective.dspRackState.channelMatrix.enabled).toBe(false);
    expect(effective.channelBalanceState.enabled).toBe(false);
    expect(effective.roomCorrectionState.enabled).toBe(false);
    expect(eq.enabled).toBe(true);
    expect(rack.compressor.enabled).toBe(true);
  });
});
