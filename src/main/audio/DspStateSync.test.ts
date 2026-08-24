import { afterEach, describe, expect, it, vi } from 'vitest';
import { EqStateStore } from './EqStateStore';
import { syncPersistedDspStateToNative } from './DspStateSync';
import { resetDspEntitlementCacheForTests } from './AudioDspEntitlementPolicy';

const entitlement = vi.hoisted(() => ({ unlocked: true }));

vi.mock('../plugins/LocalProEntitlements', () => ({
  isLocalProUnlocked: () => entitlement.unlocked,
}));

afterEach(() => {
  entitlement.unlocked = true;
  resetDspEntitlementCacheForTests();
  vi.restoreAllMocks();
});

describe('syncPersistedDspStateToNative', () => {
  it('rehydrates EQ, headphone correction, balance and room correction into the live host in order', async () => {
    const eqState = { ...EqStateStore.loadEqState(), enabled: true, preampDb: -6, dspHeadroomDb: 2 };
    const balance = { ...EqStateStore.loadChannelBalanceState(), enabled: true, balance: -0.2 };
    const room = {
      ...EqStateStore.loadRoomCorrectionState(),
      enabled: true,
      irId: 'ir-test',
      irName: 'Test IR',
      trimDb: -3,
    };
    vi.spyOn(EqStateStore, 'loadEqState').mockReturnValue(eqState);
    const rack = EqStateStore.loadDspRackState();
    vi.spyOn(EqStateStore, 'loadDspRackState').mockReturnValue(rack);
    vi.spyOn(EqStateStore, 'loadChannelBalanceState').mockReturnValue(balance);
    vi.spyOn(EqStateStore, 'loadRoomCorrectionState').mockReturnValue(room);
    vi.spyOn(EqStateStore, 'getRoomCorrectionIrPath').mockReturnValue('C:\\test\\ir.wav');
    const applyBinding = vi.spyOn(EqStateStore, 'applyBoundProfileForOutput').mockReturnValue(null);
    const calls: string[] = [];
    const target = {
      setDspRackState: vi.fn(async () => { calls.push('rack'); return rack; }),
      setCompressorState: vi.fn(async () => { calls.push('compressor'); return rack.compressor; }),
      setCrossfeedState: vi.fn(async () => { calls.push('crossfeed'); return rack.crossfeed; }),
      setStereoFieldState: vi.fn(async () => { calls.push('stereo-field'); return rack.stereoField; }),
      setChannelMatrixState: vi.fn(async () => { calls.push('channel-matrix'); return rack.channelMatrix; }),
      setState: vi.fn(async () => { calls.push('eq'); return eqState; }),
      setDspHeadroom: vi.fn(async () => { calls.push('headroom'); return eqState; }),
      setDspSafetyLimiterEnabled: vi.fn(async () => { calls.push('limiter'); return eqState; }),
      setChannelBalanceState: vi.fn(async () => { calls.push('balance'); return balance; }),
      clearRoomCorrection: vi.fn(async () => { calls.push('room-clear'); return room; }),
      call: vi.fn(async (method: string) => { calls.push(method); return room; }),
    };
    const profileTarget = { outputMode: 'shared' as const, sharedBackend: 'auto' as const };

    await syncPersistedDspStateToNative(target as never, profileTarget);

    expect(applyBinding).toHaveBeenCalledWith(profileTarget);
    expect(target.setState).toHaveBeenCalledWith(eqState);
    expect(target.setDspRackState).toHaveBeenCalledWith(rack);
    expect(target.setCompressorState).toHaveBeenCalledWith(rack.compressor);
    expect(target.setCrossfeedState).toHaveBeenCalledWith(rack.crossfeed);
    expect(target.setStereoFieldState).toHaveBeenCalledWith(rack.stereoField);
    expect(target.setChannelMatrixState).toHaveBeenCalledWith(rack.channelMatrix);
    expect(target.setChannelBalanceState).toHaveBeenCalledWith(balance);
    expect(calls).toEqual([
      'rack',
      'compressor',
      'crossfeed',
      'stereo-field',
      'channel-matrix',
      'eq',
      'headroom',
      'limiter',
      'balance',
      'room-clear',
      'roomCorrection.loadIr',
      'roomCorrection.setTrim',
      'roomCorrection.setEnabled',
    ]);
  });

  it('bypasses persisted DSP and bound profiles before hydrating a host without Pro', async () => {
    entitlement.unlocked = false;
    const eqState = { ...EqStateStore.loadEqState(), enabled: true, preampDb: -6, dspHeadroomDb: 2 };
    const rack = EqStateStore.loadDspRackState();
    rack.compressor.enabled = true;
    const balance = { ...EqStateStore.loadChannelBalanceState(), enabled: true };
    const room = { ...EqStateStore.loadRoomCorrectionState(), enabled: true, irId: 'ir-test', irName: 'Test IR' };
    vi.spyOn(EqStateStore, 'loadEqState').mockReturnValue(eqState);
    vi.spyOn(EqStateStore, 'loadDspRackState').mockReturnValue(rack);
    vi.spyOn(EqStateStore, 'loadChannelBalanceState').mockReturnValue(balance);
    vi.spyOn(EqStateStore, 'loadRoomCorrectionState').mockReturnValue(room);
    vi.spyOn(EqStateStore, 'getRoomCorrectionIrPath').mockReturnValue('C:\\test\\ir.wav');
    const applyBinding = vi.spyOn(EqStateStore, 'applyBoundProfileForOutput').mockReturnValue(null);
    const target = {
      setDspRackState: vi.fn(async (state: unknown) => state),
      setCompressorState: vi.fn(async (state: unknown) => state),
      setCrossfeedState: vi.fn(async (state: unknown) => state),
      setStereoFieldState: vi.fn(async (state: unknown) => state),
      setChannelMatrixState: vi.fn(async (state: unknown) => state),
      setState: vi.fn(async (state: unknown) => state),
      setDspHeadroom: vi.fn(async () => eqState),
      setDspSafetyLimiterEnabled: vi.fn(async () => eqState),
      setChannelBalanceState: vi.fn(async (state: unknown) => state),
      clearRoomCorrection: vi.fn(async () => room),
      call: vi.fn(),
    };

    await syncPersistedDspStateToNative(target as never, { outputMode: 'shared', sharedBackend: 'auto' });

    expect(applyBinding).not.toHaveBeenCalled();
    expect(target.setState).toHaveBeenCalledWith(expect.objectContaining({ enabled: false, preampDb: 0 }));
    expect(target.setCompressorState).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }));
    expect(target.setDspSafetyLimiterEnabled).toHaveBeenCalledWith(false);
    expect(target.setChannelBalanceState).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }));
    expect(target.clearRoomCorrection).toHaveBeenCalled();
    expect(target.call).not.toHaveBeenCalled();
  });
});
