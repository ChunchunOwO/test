import type { AudioEchoSrcFilterProfile } from './types/audio';

export const audioSdmSoundProfileIds = ['linear', 'transient', 'smooth'] as const;
export type AudioSdmSoundProfileId = (typeof audioSdmSoundProfileIds)[number];
export type AudioSdmSoundProfileSelection = AudioSdmSoundProfileId | 'custom';

export type AudioSdmSoundProfile = {
  id: AudioSdmSoundProfileId;
  filterProfile1x: AudioEchoSrcFilterProfile;
  filterProfileNx: AudioEchoSrcFilterProfile;
};

/**
 * SDM quality controls the bounded noise-shaper and stability budget. These
 * presets deliberately control a different axis: the FIR impulse/roll-off
 * presented to the modulator. The native host still receives and owns the
 * concrete FIR stages; this table is only a typed control-plane shortcut.
 */
export const audioSdmSoundProfiles: readonly AudioSdmSoundProfile[] = [
  {
    id: 'linear',
    filterProfile1x: 'sinc-long',
    filterProfileNx: 'poly-sinc-hb',
  },
  {
    id: 'transient',
    filterProfile1x: 'minringFIR-mp',
    filterProfileNx: 'poly-sinc-ext2-hires-mp',
  },
  {
    id: 'smooth',
    filterProfile1x: 'apod-gauss',
    filterProfileNx: 'poly-sinc-gauss-hires-lp',
  },
];

export const getAudioSdmSoundProfile = (id: AudioSdmSoundProfileId): AudioSdmSoundProfile =>
  audioSdmSoundProfiles.find((profile) => profile.id === id) ?? audioSdmSoundProfiles[0]!;

export const resolveAudioSdmSoundProfileSelection = (
  filterProfile1x: AudioEchoSrcFilterProfile,
  filterProfileNx: AudioEchoSrcFilterProfile,
): AudioSdmSoundProfileSelection =>
  audioSdmSoundProfiles.find((profile) =>
    profile.filterProfile1x === filterProfile1x && profile.filterProfileNx === filterProfileNx,
  )?.id ?? 'custom';
