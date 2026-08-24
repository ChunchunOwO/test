// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SteamListeningStatsPanel } from './SteamListeningStatsPanel';

vi.mock('../../i18n/I18nProvider', () => ({
  useI18n: () => ({ locale: 'en-US' }),
}));

const definitions = [
  ['listening-minutes', 'ECHO_STAT_LISTEN_MINUTES', 'minutes', 'achievement'],
  ['completed-plays', 'ECHO_STAT_COMPLETED_PLAYS', 'count', 'achievement'],
  ['unique-tracks', 'ECHO_STAT_UNIQUE_TRACKS', 'count', 'achievement'],
  ['longest-streak-days', 'ECHO_STAT_LONGEST_STREAK_DAYS', 'days', 'achievement'],
  ['night-minutes', 'ECHO_STAT_NIGHT_MINUTES', 'minutes', 'achievement'],
  ['longest-session-minutes', 'ECHO_STAT_LONGEST_SESSION_MINUTES', 'minutes', 'optional'],
  ['rediscovered-tracks', 'ECHO_STAT_REDISCOVERED_TRACKS', 'count', 'optional'],
  ['completed-albums', 'ECHO_STAT_COMPLETED_ALBUMS', 'count', 'achievement'],
] as const;

const progressValues = [3_000, 125, 60, 3, 150, 90, 4, 5] as const;

const disabledStatus = {
  enabled: false,
  available: true,
  syncState: 'synced',
  pendingStore: false,
  pendingCount: 0,
  lastAttemptedAt: null,
  lastSyncedAt: '2026-08-15T08:00:00.000Z',
  nextRetryAt: null,
  retryCount: 0,
  lastUpdatedCount: 1,
  lastError: null,
  stats: definitions.map(([id, apiName, unit, syncPolicy], index) => ({
    id,
    apiName,
    unit,
    syncPolicy,
    available: syncPolicy === 'achievement',
    localValue: progressValues[index] ?? 0,
    steamValue: syncPolicy === 'achievement' ? Math.max(0, (progressValues[index] ?? 0) - 1) : null,
    lastSubmittedValue: syncPolicy === 'achievement' ? progressValues[index] ?? 0 : null,
  })),
} as const;

const enabledStatus = {
  ...disabledStatus,
  enabled: true,
  available: true,
  lastSyncedAt: '2026-08-15T08:00:00.000Z',
  lastUpdatedCount: 2,
  stats: definitions.map(([id, apiName, unit, syncPolicy], index) => ({
    id,
    apiName,
    unit,
    syncPolicy,
    available: true,
    localValue: progressValues[index] ?? 0,
    steamValue: Math.max(0, (progressValues[index] ?? 0) - 1),
    lastSubmittedValue: progressValues[index] ?? 0,
  })),
} as const;

describe('SteamListeningStatsPanel', () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    window.echo = {
      steam: {
        getListeningStatsStatus: vi.fn().mockResolvedValue(disabledStatus),
        setListeningStatsEnabled: vi.fn().mockResolvedValue(enabledStatus),
        syncListeningStats: vi.fn().mockResolvedValue(disabledStatus),
      },
    } as unknown as Window['echo'];
  });

  it('shows automatic achievement progress while extended stats stay off by default', async () => {
    render(<SteamListeningStatsPanel />);

    expect(await screen.findByText('Extended stats are off')).toBeTruthy();
    expect(screen.getByRole('progressbar', { name: 'Completed plays achievement progress' }).getAttribute('aria-valuenow')).toBe('125');
    expect(screen.queryByText('Longest session')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Enable extended stats' }));

    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('account-linked, not anonymous'));
    await waitFor(() => expect(window.echo.steam.setListeningStatsEnabled).toHaveBeenCalledWith(true));
    expect(await screen.findByText('Longest session')).toBeTruthy();
  });

  it('shows local-versus-Steam values and the next achievement milestone', async () => {
    vi.mocked(window.echo.steam.getListeningStatsStatus).mockResolvedValue(enabledStatus);
    vi.mocked(window.echo.steam.syncListeningStats).mockResolvedValue(enabledStatus);

    render(<SteamListeningStatsPanel />);

    const progress = await screen.findByRole('progressbar', { name: 'Completed plays achievement progress' });
    expect(progress.getAttribute('aria-valuenow')).toBe('125');
    expect(progress.getAttribute('aria-valuemax')).toBe('250');
    expect(screen.getByText('125 / 250')).toBeTruthy();
    expect(screen.getByText('Steam: 124')).toBeTruthy();
  });

  it('shows the Steam account value when this computer has no local progress', async () => {
    const remoteOnlyStatus = {
      ...enabledStatus,
      stats: enabledStatus.stats.map((stat, index) => ({
        ...stat,
        localValue: 0,
        steamValue: progressValues[index] ?? 0,
      })),
    };
    vi.mocked(window.echo.steam.getListeningStatsStatus).mockResolvedValue(remoteOnlyStatus);
    vi.mocked(window.echo.steam.syncListeningStats).mockResolvedValue(remoteOnlyStatus);

    render(<SteamListeningStatsPanel />);

    expect(await screen.findByText('Steam: 125')).toBeTruthy();
    expect(screen.getByRole('progressbar', { name: 'Completed plays achievement progress' }).getAttribute('aria-valuenow')).toBe('125');
  });
});
