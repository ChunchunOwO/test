import { describe, expect, it, vi } from 'vitest';
import { IpcChannels } from '../../shared/constants/ipcChannels';
import { createSteamApi } from './steamApi';

describe('Steam preload API', () => {
  it('exposes typed listen-together product and probe commands', async () => {
    const ipcRenderer = { invoke: vi.fn(async () => ({})) };
    const api = createSteamApi(ipcRenderer as never, IpcChannels);

    await api.getListenTogetherProbeStatus();
    await api.createListenTogetherProbeRoom();
    await api.joinListenTogetherProbeRoom('76561190000000000');
    await api.openListenTogetherProbeInvite();
    await api.leaveListenTogetherProbeRoom();
    await api.getListenTogetherStatus();
    await api.createListenTogetherRoom();
    await api.joinListenTogetherRoom('9001');
    await api.openListenTogetherInvite();
    await api.leaveListenTogetherRoom();
    await api.sendListenTogetherReaction('heart');
    await api.requestListenTogetherSync();

    expect(ipcRenderer.invoke.mock.calls).toEqual([
      [IpcChannels.SteamListenTogetherProbeGetStatus],
      [IpcChannels.SteamListenTogetherProbeCreateRoom],
      [IpcChannels.SteamListenTogetherProbeJoinRoom, '76561190000000000'],
      [IpcChannels.SteamListenTogetherProbeOpenInvite],
      [IpcChannels.SteamListenTogetherProbeLeaveRoom],
      [IpcChannels.SteamListenTogetherGetStatus],
      [IpcChannels.SteamListenTogetherCreateRoom],
      [IpcChannels.SteamListenTogetherJoinRoom, '9001'],
      [IpcChannels.SteamListenTogetherOpenInvite],
      [IpcChannels.SteamListenTogetherLeaveRoom],
      [IpcChannels.SteamListenTogetherSendReaction, 'heart'],
      [IpcChannels.SteamListenTogetherRequestSync],
    ]);
  });
});
