import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AudioStatus } from '../../shared/types/audio';
import {
  applyDefaultAudioRuntimeBaseline,
  reconcileEchoProAudioEntitlement,
  resetAudioEntitlementRuntimeForTests,
} from './AudioEntitlementRuntime';

const { entitlementMock, getStatusMock, setOutputMock } = vi.hoisted(() => ({
  entitlementMock: vi.fn(),
  getStatusMock: vi.fn(),
  setOutputMock: vi.fn(),
}));

vi.mock('../plugins/LocalProEntitlements', () => ({
  getLocalProEntitlementSnapshot: entitlementMock,
}));

vi.mock('../ipc/audioCommandQueue', () => ({
  enqueueAudioCommand: <T>(command: () => Promise<T>): Promise<T> => command(),
}));

vi.mock('./AudioDspEntitlementPolicy', () => ({
  hasConfiguredProDsp: () => false,
  setCachedDspEntitlement: vi.fn(),
}));

vi.mock('./AudioSession', () => ({
  getAudioSession: () => ({
    getStatus: getStatusMock,
    setOutput: setOutputMock,
  }),
}));

const status = (patch: Partial<AudioStatus> = {}): AudioStatus => ({
  dsdOutputModeRequested: 'pcm',
  echoSrcMode: 'off',
  sdmMode: 'off',
  ...patch,
} as AudioStatus);

describe('AudioEntitlementRuntime', () => {
  beforeEach(() => {
    entitlementMock.mockReset();
    getStatusMock.mockReset();
    setOutputMock.mockReset();
    resetAudioEntitlementRuntimeForTests();
    setOutputMock.mockResolvedValue(status());
  });

  it('does not touch a Pro user audio session after revalidation', async () => {
    entitlementMock.mockReturnValue({ unlocked: true, source: 'plugin', checkedAt: 'now' });
    getStatusMock.mockReturnValue(status({ dsdOutputModeRequested: 'dop', echoSrcMode: 'family4x' }));

    await reconcileEchoProAudioEntitlement();

    expect(setOutputMock).not.toHaveBeenCalled();
  });

  it('turns off only gated DSP when the existing entitlement is no longer valid', async () => {
    entitlementMock.mockReturnValue({ unlocked: false, source: null, checkedAt: 'now' });
    getStatusMock.mockReturnValue(status({
      dsdOutputModeRequested: 'dop',
      activeDsdOutputMode: 'dop',
      echoSrcMode: 'family4x',
      echoSrcActive: true,
      sdmMode: 'pcmToDsd',
      sdmActive: true,
    }));

    await reconcileEchoProAudioEntitlement();

    expect(setOutputMock).toHaveBeenCalledWith(expect.objectContaining({
      dsdOutputMode: 'dop',
      echoSrcMode: 'off',
      sdmMode: 'off',
      pcmDitherMode: 'off',
    }));
    expect(setOutputMock.mock.calls[0]?.[0]).not.toHaveProperty('outputMode');
  });

  it('keeps free DSD passthrough running without a Pro entitlement', async () => {
    entitlementMock.mockReturnValue({ unlocked: false, source: null, checkedAt: 'now' });
    getStatusMock.mockReturnValue(status({
      dsdOutputModeRequested: 'dop',
      activeDsdOutputMode: 'native',
      sdmMode: 'dsdPassthrough',
      sdmActive: true,
      sdmRuntimeState: 'dsd_passthrough',
    }));

    await reconcileEchoProAudioEntitlement();

    expect(setOutputMock).not.toHaveBeenCalled();
  });

  it('restarts the active route onto the safe baseline when locked EQ is still reported active', async () => {
    entitlementMock.mockReturnValue({ unlocked: false, source: null, checkedAt: 'now' });
    getStatusMock.mockReturnValue(status({ eqEnabled: true }));

    await reconcileEchoProAudioEntitlement();

    expect(setOutputMock).toHaveBeenCalledWith(expect.objectContaining({
      echoSrcMode: 'off',
      pcmDitherMode: 'off',
      sdmMode: 'off',
    }));
  });

  it('applies the full safe route when all audio settings are reset', async () => {
    await applyDefaultAudioRuntimeBaseline();

    expect(setOutputMock).toHaveBeenCalledWith(expect.objectContaining({
      automaticOutputEnabled: false,
      outputMode: 'shared',
      sharedBackend: 'auto',
      dsdOutputMode: 'pcm',
      echoSrcMode: 'off',
      sdmMode: 'off',
    }));
  });
});
