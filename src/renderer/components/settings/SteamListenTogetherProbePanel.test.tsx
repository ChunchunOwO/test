// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SteamListenTogetherProbeSnapshot } from '../../../shared/types/steam';
import { SteamListenTogetherProbePanel } from './SteamListenTogetherProbePanel';

const idleSnapshot: SteamListenTogetherProbeSnapshot = {
  enabled: true,
  available: true,
  state: 'idle',
  role: 'none',
  lobbyId: null,
  memberCount: 0,
  transportRunning: false,
  protocolVersion: 1,
  targetKbps: 317,
  sentPackets: 0,
  sentBytes: 0,
  sendFailures: 0,
  receivedPackets: 0,
  receivedBytes: 0,
  receivedKbps: 0,
  estimatedLostPackets: 0,
  estimatedLossPercent: 0,
  averageRttMs: null,
  lastPacketAt: null,
  lastError: null,
};

describe('SteamListenTogetherProbePanel', () => {
  afterEach(() => {
    cleanup();
    Reflect.deleteProperty(window, 'echo');
  });

  it('creates a room through the typed Steam bridge', async () => {
    const createRoom = vi.fn(async () => ({
      ...idleSnapshot,
      state: 'connected' as const,
      role: 'host' as const,
      lobbyId: '99',
      memberCount: 1,
      transportRunning: true,
    }));
    window.echo = {
      steam: {
        getListenTogetherProbeStatus: vi.fn(async () => idleSnapshot),
        createListenTogetherProbeRoom: createRoom,
      },
    } as unknown as Window['echo'];

    render(<SteamListenTogetherProbePanel locale="zh-CN" />);
    fireEvent.click(await screen.findByRole('button', { name: '创建双人测试房' }));

    await waitFor(() => expect(createRoom).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('99')).toBeTruthy();
  });

  it('stays invisible when the probe flag is disabled', async () => {
    window.echo = {
      steam: {
        getListenTogetherProbeStatus: vi.fn(async () => ({ ...idleSnapshot, enabled: false, state: 'disabled' as const })),
      },
    } as unknown as Window['echo'];

    const { container } = render(<SteamListenTogetherProbePanel locale="en-US" />);
    await waitFor(() => expect(window.echo.steam.getListenTogetherProbeStatus).toHaveBeenCalled());
    expect(container.innerHTML).toBe('');
  });
});
