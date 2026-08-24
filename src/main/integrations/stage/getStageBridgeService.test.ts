import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  settings: { obsBrowserSourceEnabled: false, stageApiEnabled: false },
  configure: vi.fn(async () => ({
    running: true,
    host: '127.0.0.1',
    port: 47669,
    url: 'http://127.0.0.1:47669',
    obsUrl: 'http://127.0.0.1:47669/obs',
    eventClients: 0,
    obsEnabled: true,
    apiEnabled: false,
  })),
  stop: vi.fn(async () => undefined),
  getServerStatus: vi.fn(() => ({
    running: true,
    host: '127.0.0.1',
    port: 47669,
    url: 'http://127.0.0.1:47669',
    obsUrl: 'http://127.0.0.1:47669/obs',
    eventClients: 0,
    obsEnabled: true,
    apiEnabled: false,
  })),
  construct: vi.fn(),
}));

vi.mock('../../app/appSettings', () => ({
  getAppSettings: () => mocks.settings,
}));

vi.mock('../../diagnostics/CrashReportService', () => ({
  getCrashReportService: () => ({ getLogger: () => null }),
}));

vi.mock('../../diagnostics/StartupDiagnostics', () => ({
  markStartupStage: vi.fn(),
}));

vi.mock('./StageBridgeService', () => ({
  StageBridgeService: class {
    constructor() {
      mocks.construct();
      return {
        configure: mocks.configure,
        stop: mocks.stop,
        getServerStatus: mocks.getServerStatus,
      };
    }
  },
}));

import {
  disposeStageBridgeIntegration,
  syncStageBridgeIntegrationFromSettings,
} from './getStageBridgeService';

describe('Stage bridge lifecycle', () => {
  beforeEach(async () => {
    await disposeStageBridgeIntegration();
    vi.clearAllMocks();
    mocks.settings.obsBrowserSourceEnabled = false;
    mocks.settings.stageApiEnabled = false;
  });

  it('does not construct the bridge while both features are disabled', async () => {
    await syncStageBridgeIntegrationFromSettings();

    expect(mocks.construct).not.toHaveBeenCalled();
  });

  it('constructs on enable and releases the singleton on disable', async () => {
    mocks.settings.obsBrowserSourceEnabled = true;
    await syncStageBridgeIntegrationFromSettings();
    expect(mocks.construct).toHaveBeenCalledTimes(1);

    mocks.settings.obsBrowserSourceEnabled = false;
    await syncStageBridgeIntegrationFromSettings();
    expect(mocks.stop).toHaveBeenCalledTimes(1);

    mocks.settings.stageApiEnabled = true;
    await syncStageBridgeIntegrationFromSettings();
    expect(mocks.construct).toHaveBeenCalledTimes(2);
  });
});
