import { describe, expect, it } from 'vitest';
import {
  audioSdmSoundProfiles,
  getAudioSdmSoundProfile,
  resolveAudioSdmSoundProfileSelection,
} from './audioSdmSoundProfiles';

describe('audioSdmSoundProfiles', () => {
  it('keeps sound voicing independent from SDM quality by resolving concrete FIR pairs', () => {
    expect(audioSdmSoundProfiles.map((profile) => profile.id)).toEqual(['linear', 'transient', 'smooth']);
    expect(getAudioSdmSoundProfile('linear')).toMatchObject({
      filterProfile1x: 'sinc-long',
      filterProfileNx: 'poly-sinc-hb',
    });
    expect(getAudioSdmSoundProfile('transient')).toMatchObject({
      filterProfile1x: 'minringFIR-mp',
      filterProfileNx: 'poly-sinc-ext2-hires-mp',
    });
    expect(getAudioSdmSoundProfile('smooth')).toMatchObject({
      filterProfile1x: 'apod-gauss',
      filterProfileNx: 'poly-sinc-gauss-hires-lp',
    });
  });

  it('reports custom when the two persisted FIR slots do not match one sound preset', () => {
    expect(resolveAudioSdmSoundProfileSelection('minringFIR-mp', 'poly-sinc-ext2-hires-mp')).toBe('transient');
    expect(resolveAudioSdmSoundProfileSelection('minringFIR-mp', 'poly-sinc-hb')).toBe('custom');
  });
});
