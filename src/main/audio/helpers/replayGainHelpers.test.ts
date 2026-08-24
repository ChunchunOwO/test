import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getReplayGainAudioSettings } from './replayGainHelpers';
import { resetDspEntitlementCacheForTests } from '../AudioDspEntitlementPolicy';

const mocks = vi.hoisted(() => ({
  unlocked: false,
  settings: { replayGainEnabled: true },
}));

vi.mock('../../app/appSettings', () => ({
  getAppSettings: () => mocks.settings,
}));

vi.mock('../../plugins/LocalProEntitlements', () => ({
  isLocalProUnlocked: () => mocks.unlocked,
}));

describe('getReplayGainAudioSettings', () => {
  beforeEach(() => {
    mocks.unlocked = false;
    resetDspEntitlementCacheForTests();
  });

  it('fails ReplayGain closed without Pro while preserving the stored preference', () => {
    expect(getReplayGainAudioSettings().replayGainEnabled).toBe(false);
    expect(mocks.settings.replayGainEnabled).toBe(true);
  });

  it('enables ReplayGain for a Pro entitlement', () => {
    mocks.unlocked = true;
    expect(getReplayGainAudioSettings().replayGainEnabled).toBe(true);
  });
});
