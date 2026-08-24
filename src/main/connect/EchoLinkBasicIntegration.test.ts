import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  settings: { echoLinkBasicEnabled: false },
  setBasicEnabled: vi.fn(async (enabled: boolean) => ({
    enabled,
    running: enabled,
    host: '127.0.0.1',
    port: 26789,
  })),
  getService: vi.fn(),
  getExistingService: vi.fn(),
}));

vi.mock('../app/appSettings', () => ({
  getAppSettings: () => mocks.settings,
}));

vi.mock('../diagnostics/CrashReportService', () => ({
  getCrashReportService: () => ({ getLogger: () => null }),
}));

vi.mock('../diagnostics/StartupDiagnostics', () => ({
  markStartupStage: vi.fn(),
}));

vi.mock('./EchoLinkService', () => ({
  getEchoLinkService: mocks.getService,
  getExistingEchoLinkService: mocks.getExistingService,
}));

import { syncEchoLinkBasicIntegrationFromSettings } from './EchoLinkBasicIntegration';

describe('EchoLink Basic lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.settings.echoLinkBasicEnabled = false;
    mocks.getService.mockReturnValue({ setBasicEnabled: mocks.setBasicEnabled });
    mocks.getExistingService.mockReturnValue(null);
  });

  it('does not construct EchoLink while Basic is disabled', async () => {
    await syncEchoLinkBasicIntegrationFromSettings();

    expect(mocks.getService).not.toHaveBeenCalled();
    expect(mocks.setBasicEnabled).not.toHaveBeenCalled();
  });

  it('starts when enabled and stops an existing instance when disabled', async () => {
    mocks.settings.echoLinkBasicEnabled = true;
    await syncEchoLinkBasicIntegrationFromSettings();
    expect(mocks.setBasicEnabled).toHaveBeenCalledWith(true);

    mocks.settings.echoLinkBasicEnabled = false;
    mocks.getExistingService.mockReturnValue({ setBasicEnabled: mocks.setBasicEnabled });
    await syncEchoLinkBasicIntegrationFromSettings();
    expect(mocks.setBasicEnabled).toHaveBeenLastCalledWith(false);
  });
});
