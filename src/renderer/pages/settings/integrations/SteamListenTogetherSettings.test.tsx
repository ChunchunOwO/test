// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SteamListenTogetherSnapshot } from '../../../../shared/types/steam';
import { SteamListenTogetherSettings } from './SteamListenTogetherSettings';

vi.mock('../../../i18n/I18nProvider', () => ({
  useI18n: () => ({ locale: 'zh-CN' }),
}));

const idleSnapshot: SteamListenTogetherSnapshot = {
  available: true,
  state: 'idle',
  role: 'none',
  lobbyId: null,
  memberCount: 0,
  memberLimit: 4,
  localPlayerName: 'Listener',
  syncState: 'not-in-room',
  playback: null,
  recentReactions: [],
  lastHostUpdateAt: null,
  lastError: null,
};

const connectedSnapshot: SteamListenTogetherSnapshot = {
  ...idleSnapshot,
  state: 'connected',
  role: 'guest',
  lobbyId: '9001',
  memberCount: 2,
  syncState: 'synced',
  playback: {
    state: 'playing',
    positionSeconds: 42,
    durationSeconds: 225,
    playbackRate: 1,
    track: { key: 'track-key', title: 'Starlight', artist: 'ECHO', album: 'Night Drive', durationSeconds: 225 },
    receivedAt: '2026-08-17T00:00:00.000Z',
  },
};

describe('SteamListenTogetherSettings', () => {
  afterEach(cleanup);

  beforeEach(() => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn(async () => undefined) } });
  });

  it('keeps the idle surface compact and creates an explicit friends room', async () => {
    const createRoom = vi.fn(async () => ({ ...connectedSnapshot, role: 'host' as const, syncState: 'host' as const }));
    window.echo = {
      steam: {
        getListenTogetherStatus: vi.fn(async () => idleSnapshot),
        createListenTogetherRoom: createRoom,
      },
    } as unknown as Window['echo'];

    const { container } = render(<SteamListenTogetherSettings />);
    expect(await screen.findByText('未加入房间')).toBeTruthy();
    expect(container.querySelector('.steam-listen-together__session')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /创建房间/u }));
    await waitFor(() => expect(createRoom).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('Starlight')).toBeTruthy();
  });

  it('shows synchronized track truth and sends only allowlisted reactions', async () => {
    const sendReaction = vi.fn(async () => ({
      ...connectedSnapshot,
      recentReactions: [{ id: 'r1', reaction: 'heart' as const, senderName: 'Listener', receivedAt: new Date().toISOString() }],
    }));
    window.echo = {
      steam: {
        getListenTogetherStatus: vi.fn(async () => connectedSnapshot),
        sendListenTogetherReaction: sendReaction,
        leaveListenTogetherRoom: vi.fn(async () => idleSnapshot),
        requestListenTogetherSync: vi.fn(async () => connectedSnapshot),
      },
    } as unknown as Window['echo'];

    render(<SteamListenTogetherSettings />);
    expect(await screen.findByText('已与房主同步')).toBeTruthy();
    expect(screen.getByText('ECHO · Night Drive')).toBeTruthy();
    expect(screen.getByText('0:42 / 3:45')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'heart' }));
    await waitFor(() => expect(sendReaction).toHaveBeenCalledWith('heart'));
    expect(await screen.findByText(/Listener/u)).toBeTruthy();
  });
});
