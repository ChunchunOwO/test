import { beforeEach, describe, expect, it, vi } from 'vitest';
import { patchEnablesEchoProDsp, requireEchoProForAudioDspPatch } from './audioProFeatureGate';

const requireLocalProMock = vi.hoisted(() => vi.fn());

vi.mock('../plugins/LocalProEntitlements', () => ({
  requireLocalPro: requireLocalProMock,
}));

describe('audioProFeatureGate', () => {
  beforeEach(() => {
    requireLocalProMock.mockReset();
  });

  it('detects every Pro audio-processing enable patch', async () => {
    expect(patchEnablesEchoProDsp({ audioEchoSrcMode: 'off' })).toBe(false);
    expect(patchEnablesEchoProDsp({ audioSdmMode: 'off', audioDsdOutputMode: 'pcm' })).toBe(false);
    expect(patchEnablesEchoProDsp({ audioSdmMode: 'dsdPassthrough', audioDsdOutputMode: 'dop' })).toBe(false);
    expect(patchEnablesEchoProDsp({ audioDsdOutputMode: 'dop' })).toBe(false);
    expect(patchEnablesEchoProDsp({ dsdOutputMode: 'dop' })).toBe(false);
    expect(patchEnablesEchoProDsp({ audioPcmDitherMode: 'off', replayGainEnabled: false })).toBe(false);
    expect(patchEnablesEchoProDsp({
      sdmMode: 'off',
      sdmOversamplingFilterProfile1x: 'poly-sinc-ext2-long',
      sdmOversamplingFilterProfileNx: 'poly-sinc-ext2-hires-lp',
    })).toBe(false);
    expect(patchEnablesEchoProDsp({ sdmTargetRate: 'dsd512' } as never)).toBe(false);

    expect(patchEnablesEchoProDsp({ audioEchoSrcMode: 'family4x' })).toBe(true);
    expect(patchEnablesEchoProDsp({ audioPcmDitherMode: 'ns-9' })).toBe(true);
    expect(patchEnablesEchoProDsp({ pcmDitherMode: 'tpdf' })).toBe(true);
    expect(patchEnablesEchoProDsp({ replayGainEnabled: true })).toBe(true);
    expect(patchEnablesEchoProDsp({ sdmMode: 'pcmToDsd' })).toBe(true);
    expect(patchEnablesEchoProDsp({ sdmOversamplingFilterProfile1x: 'poly-sinc-ext2-long' })).toBe(true);

    await requireEchoProForAudioDspPatch({ sdmMode: 'dsdPassthrough', dsdOutputMode: 'dop' });
    await requireEchoProForAudioDspPatch({ echoSrcMode: 'family2x' });
    await requireEchoProForAudioDspPatch({ sdmMode: 'pcmToDsd' });
    await requireEchoProForAudioDspPatch({ pcmDitherMode: 'tpdf' });
    await requireEchoProForAudioDspPatch({ replayGainEnabled: true });
    expect(requireLocalProMock).toHaveBeenCalledTimes(4);
    expect(requireLocalProMock).toHaveBeenCalledWith('dsp');
  });

  it('does not require Pro when a patch only disables Pro DSP', async () => {
    await expect(requireEchoProForAudioDspPatch({ dsdOutputMode: 'pcm', echoSrcMode: 'off', sdmMode: 'off' }))
      .resolves.toBeUndefined();
    expect(requireLocalProMock).not.toHaveBeenCalled();
  });
});
