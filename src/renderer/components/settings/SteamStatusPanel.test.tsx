// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SteamStatus } from '../../../shared/types/steam';
import { formatSteamDiagnostics, SteamStatusPanel } from './SteamStatusPanel';

vi.mock('../../i18n/I18nProvider', () => ({
  useI18n: () => ({ locale: 'en-US' }),
}));

const readyStatus: SteamStatus = {
  state: 'ready',
  appId: 123456,
  appIdSource: 'release-build',
  playerName: 'Private Steam Name',
  appBuildId: 42,
  betaName: 'qa-private',
  subscribed: true,
  runningOnSteamDeck: false,
  cloudEnabled: true,
  unavailableReason: null,
  message: 'Steamworks is connected.',
  richPresence: {
  mode: 'detailed',
  preset: 'music',
  enabled: true,
  showAlbum: false,
  showProgress: false,
  showGenre: false,
  showPlaybackOrder: false,
  showBpm: false,
  showQuality: false,
  showFormat: false,
  showBitPerfect: false,
    publicationState: 'published',
    preview: 'Playing: Private Track - Private Artist',
    lastPublishedAt: '2026-08-11T04:00:00.000Z',
    lastError: null,
  },
};

const cloudStatus = {
  enabled: true,
  available: true,
  syncState: 'synced',
  fileName: 'echo-steam-settings-v1.json',
  remoteUpdatedAt: '2026-08-14T04:00:00.000Z',
  lastAttemptedAt: '2026-08-14T04:00:00.000Z',
  lastSucceededAt: '2026-08-14T04:00:00.000Z',
  lastUploadedAt: null,
  lastDownloadedAt: null,
  nextRetryAt: null,
  retryCount: 0,
  settingsCount: 12,
  pendingUpload: false,
  lastError: null,
} as const;

describe('SteamStatusPanel', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    Object.defineProperty(window.navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
    window.echo = {
      steam: {
        getStatus: vi.fn().mockResolvedValue(readyStatus),
        getCloudSettingsStatus: vi.fn().mockResolvedValue(cloudStatus),
        uploadCloudSettings: vi.fn().mockResolvedValue({ ...cloudStatus, uploaded: true }),
        downloadCloudSettings: vi.fn().mockResolvedValue({ ...cloudStatus, applied: true, settings: { appearanceTheme: 'light' } }),
      },
    } as unknown as Window['echo'];
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  it('renders typed runtime status and copies a privacy-safe snapshot', async () => {
    render(<SteamStatusPanel />);

    expect(await screen.findByText('123456')).toBeTruthy();
    expect(screen.getByText('qa-private')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Copy safe diagnostics' }));

    await waitFor(() => expect(window.navigator.clipboard.writeText).toHaveBeenCalledTimes(1));
    const copied = vi.mocked(window.navigator.clipboard.writeText).mock.calls[0]?.[0] ?? '';
    expect(copied).toContain('buildId=42');
    expect(copied).toContain('richPresenceState=published');
    expect(copied).not.toContain(readyStatus.playerName);
    expect(copied).not.toContain(readyStatus.richPresence?.preview ?? 'Private Track');
  });

  it('keeps account identity out of the formatter', () => {
    expect(formatSteamDiagnostics(readyStatus)).not.toContain('Private Steam Name');
  });

  it('uploads and downloads the portable settings snapshot', async () => {
    render(<SteamStatusPanel />);
    await screen.findByText('Synced');

    fireEvent.click(screen.getByRole('button', { name: 'Upload settings' }));
    await waitFor(() => expect(window.echo.steam.uploadCloudSettings).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole('button', { name: 'Download and apply' }));
    await waitFor(() => expect(window.echo.steam.downloadCloudSettings).toHaveBeenCalledTimes(1));
  });
});
