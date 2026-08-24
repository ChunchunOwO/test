import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  settings: { lastFmEnabled: false },
  audioSession: {
    getStatus: vi.fn(() => ({ state: 'idle' })),
    on: vi.fn(),
    off: vi.fn(),
  },
  service: {
    initialize: vi.fn(),
    updateFromAudioStatus: vi.fn(),
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

vi.mock('./getLastFmService', () => ({
  getLastFmService: mocks.getService,
  disposeLastFmService: mocks.disposeService,
}));

import {
  disposeLastFmIntegration,
  syncLastFmIntegrationFromSettings,
} from './LastFmStatusSync';

describe('LastFmStatusSync lifecycle', () => {
  beforeEach(async () => {
    await disposeLastFmIntegration();
    vi.clearAllMocks();
    mocks.settings.lastFmEnabled = false;
    mocks.getService.mockReturnValue(mocks.service);
  });

  it('does not instantiate Last.fm or AudioSession while disabled', async () => {
    await syncLastFmIntegrationFromSettings();

    expect(mocks.getService).not.toHaveBeenCalled();
    expect(mocks.audioSession.getStatus).not.toHaveBeenCalled();
    expect(mocks.audioSession.on).not.toHaveBeenCalled();
    expect(mocks.disposeService).toHaveBeenCalledTimes(1);
  });

  it('initializes once when enabled and fully detaches when disabled', async () => {
    mocks.settings.lastFmEnabled = true;
    await syncLastFmIntegrationFromSettings();
    await syncLastFmIntegrationFromSettings();

    expect(mocks.service.initialize).toHaveBeenCalledTimes(1);
    expect(mocks.audioSession.on).toHaveBeenCalledTimes(1);

    mocks.settings.lastFmEnabled = false;
    await syncLastFmIntegrationFromSettings();

    expect(mocks.audioSession.off).toHaveBeenCalledTimes(1);
    expect(mocks.disposeService).toHaveBeenCalledTimes(1);
    expect(mocks.audioSession.off.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.disposeService.mock.invocationCallOrder[0],
    );
  });
});
