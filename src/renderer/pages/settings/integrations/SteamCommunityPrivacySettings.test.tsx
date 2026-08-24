// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SteamCommunityPrivacySettings } from './SteamCommunityPrivacySettings';

vi.mock('../../../i18n/I18nProvider', () => ({
  useI18n: () => ({ locale: 'en-US' }),
}));

const statsStatus = {
  enabled: true,
  available: true,
  syncState: 'synced',
  pendingStore: false,
  pendingCount: 0,
  lastAttemptedAt: null,
  lastSyncedAt: null,
  nextRetryAt: null,
  retryCount: 0,
  lastUpdatedCount: 0,
  lastError: null,
  stats: [],
} as const;

const leaderboardStatus = {
  enabled: false,
  available: true,
  lastSyncedAt: null,
  lastError: null,
  boards: [],
} as const;

const cloudStatus = {
  enabled: true,
  available: true,
  syncState: 'synced',
  fileName: 'echo-steam-settings-v1.json',
  remoteUpdatedAt: '2026-08-17T01:00:00.000Z',
  lastAttemptedAt: '2026-08-17T01:00:00.000Z',
  lastSucceededAt: '2026-08-17T01:00:00.000Z',
  lastUploadedAt: null,
  lastDownloadedAt: null,
  nextRetryAt: null,
  retryCount: 0,
  settingsCount: 12,
  pendingUpload: false,
  lastError: null,
} as const;

describe('SteamCommunityPrivacySettings', () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    window.echo = {
      steam: {
        getListeningStatsStatus: vi.fn().mockResolvedValue(statsStatus),
        syncListeningStats: vi.fn().mockResolvedValue(statsStatus),
        getCloudSettingsStatus: vi.fn().mockResolvedValue(cloudStatus),
        setListeningStatsEnabled: vi.fn().mockResolvedValue({ ...statsStatus, enabled: false }),
        getLeaderboardStatus: vi.fn().mockResolvedValue(leaderboardStatus),
        setLeaderboardsEnabled: vi.fn().mockResolvedValue({ ...leaderboardStatus, enabled: true }),
      },
    } as unknown as Window['echo'];
  });

  it('shows automatic progress and keeps extended stats and leaderboards independently configurable', async () => {
    render(<SteamCommunityPrivacySettings />);

    expect(await screen.findByText('Steam account synced')).toBeTruthy();
    expect(screen.getByText('Portable settings synced')).toBeTruthy();
    expect(await screen.findByText('Enabled')).toBeTruthy();
    expect(screen.getByText('Disabled')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Toggle Steam extended personal stats' }));
    await waitFor(() => expect(window.echo.steam.setListeningStatsEnabled).toHaveBeenCalledWith(false));

    fireEvent.click(screen.getByRole('button', { name: 'Toggle Steam listening leaderboards' }));
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('account-linked aggregate scores'));
    await waitFor(() => expect(window.echo.steam.setLeaderboardsEnabled).toHaveBeenCalledWith(true));
  });
});
