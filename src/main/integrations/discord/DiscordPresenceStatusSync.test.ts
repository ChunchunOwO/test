import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  settings: { discordRichPresenceEnabled: false },
  audioSession: {
    getStatus: vi.fn(() => ({ state: 'idle' })),
    on: vi.fn(),
    off: vi.fn(),
  },
  service: {
    initialize: vi.fn(async () => undefined),
    updateFromAudioStatus: vi.fn(async () => undefined),
  },
  getService: vi.fn(),
  disposeService: vi.fn(async () => undefined),
}));

vi.mock('../../app/appSettings', () => ({
  getAppSettings: () => mocks.settings,
}));

vi.mock('../../audio/AudioSession', () => ({
  getAudioSession: () => mocks.audioSession,
}));

vi.mock('../../diagnostics/CrashReportService', () => ({
  getCrashReportService: () => ({ getLogger: () => null }),
}));

vi.mock('./getDiscordPresenceService', () => ({
  getDiscordPresenceService: mocks.getService,
  disposeDiscordPresenceService: mocks.disposeService,
}));

import {
  disposeDiscordPresenceIntegration,
  syncDiscordPresenceIntegrationFromSettings,
} from './DiscordPresenceStatusSync';

describe('DiscordPresenceStatusSync lifecycle', () => {
  beforeEach(async () => {
    await disposeDiscordPresenceIntegration();
    vi.clearAllMocks();
    mocks.settings.discordRichPresenceEnabled = false;
    mocks.getService.mockReturnValue(mocks.service);
  });

  it('does not instantiate Discord or AudioSession while disabled', async () => {
    await syncDiscordPresenceIntegrationFromSettings();

    expect(mocks.getService).not.toHaveBeenCalled();
    expect(mocks.audioSession.getStatus).not.toHaveBeenCalled();
    expect(mocks.audioSession.on).not.toHaveBeenCalled();
    expect(mocks.disposeService).toHaveBeenCalledTimes(1);
  });

  it('initializes once when enabled and fully detaches when disabled', async () => {
    mocks.settings.discordRichPresenceEnabled = true;
    await syncDiscordPresenceIntegrationFromSettings();
    await syncDiscordPresenceIntegrationFromSettings();

    expect(mocks.service.initialize).toHaveBeenCalledTimes(1);
    expect(mocks.audioSession.on).toHaveBeenCalledTimes(1);

    mocks.settings.discordRichPresenceEnabled = false;
    await syncDiscordPresenceIntegrationFromSettings();

    expect(mocks.audioSession.off).toHaveBeenCalledTimes(1);
    expect(mocks.disposeService).toHaveBeenCalledTimes(1);
    expect(mocks.audioSession.off.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.disposeService.mock.invocationCallOrder[0],
    );
  });
});
