// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SteamLeaderboardPanel } from './SteamLeaderboardPanel';

vi.mock('../../i18n/I18nProvider', () => ({
  useI18n: () => ({ locale: 'en-US' }),
}));

const disabledStatus = {
  enabled: false,
  available: false,
  lastSyncedAt: null,
  lastError: null,
  boards: [
    { id: 'listening-time', apiName: 'ECHO_LISTENING_SECONDS_V1', scoreUnit: 'seconds', available: false, lastSubmittedScore: null, lastGlobalRank: null },
    { id: 'completed-tracks', apiName: 'ECHO_COMPLETED_TRACKS_V1', scoreUnit: 'count', available: false, lastSubmittedScore: null, lastGlobalRank: null },
    { id: 'listening-streak', apiName: 'ECHO_LONGEST_STREAK_DAYS_V1', scoreUnit: 'count', available: false, lastSubmittedScore: null, lastGlobalRank: null },
    { id: 'deep-session', apiName: 'ECHO_LONGEST_SESSION_SECONDS_V1', scoreUnit: 'seconds', available: false, lastSubmittedScore: null, lastGlobalRank: null },
    { id: 'rediscovered-tracks', apiName: 'ECHO_REDISCOVERED_TRACKS_V1', scoreUnit: 'count', available: false, lastSubmittedScore: null, lastGlobalRank: null },
  ],
} as const;

const enabledStatus = {
  ...disabledStatus,
  enabled: true,
  available: true,
  lastSyncedAt: '2026-08-15T05:00:00.000Z',
  boards: [
    { ...disabledStatus.boards[0], available: true, lastSubmittedScore: 7_261, lastGlobalRank: 8 },
    { ...disabledStatus.boards[1], available: true, lastSubmittedScore: 42, lastGlobalRank: 12 },
    { ...disabledStatus.boards[2], available: true, lastSubmittedScore: 5, lastGlobalRank: 18 },
    { ...disabledStatus.boards[3], available: true, lastSubmittedScore: 1_800, lastGlobalRank: 7 },
    { ...disabledStatus.boards[4], available: true, lastSubmittedScore: 3, lastGlobalRank: 21 },
  ],
} as const;

describe('SteamLeaderboardPanel', () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    window.echo = {
      steam: {
        getLeaderboardStatus: vi.fn().mockResolvedValue(disabledStatus),
        setLeaderboardsEnabled: vi.fn().mockResolvedValue(enabledStatus),
        syncLeaderboards: vi.fn().mockResolvedValue(enabledStatus),
        getLeaderboardEntries: vi.fn().mockResolvedValue({
          status: enabledStatus,
          boardId: 'listening-time',
          scope: 'around-user',
          entries: [
            {
              rank: 8,
              score: 7_261,
              playerName: '\u{E0021}\u{E0021}\u{E0021}',
              isCurrentUser: true,
              details: {
                completedUniqueTracks: 42,
                listeningSessionCount: 12,
                longestListeningSessionSeconds: 1_800,
                longestListeningStreakDays: 5,
                nightListeningSeconds: 120,
                rediscoveredTrackCount: 3,
                completedShortUniqueTracks: 18,
              },
            },
          ],
        }),
      },
    } as unknown as Window['echo'];
  });

  it('stays off by default and explains the aggregate-only upload before joining', async () => {
    render(<SteamLeaderboardPanel />);

    expect(await screen.findByText('Off by default')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Join leaderboards' }));

    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('five account-linked aggregate scores'));
    await waitFor(() => expect(window.echo.steam.setLeaderboardsEnabled).toHaveBeenCalledWith(true));
    expect(await screen.findByText('Steam player')).toBeTruthy();
    expect(screen.getByText('12 sessions · 2m after midnight')).toBeTruthy();
    expect(screen.getAllByText('2h 01m')).toHaveLength(2);
  });
});
