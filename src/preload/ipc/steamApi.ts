import type { IpcRenderer } from 'electron';
import type { EchoApi } from '../apiTypes';

export const createSteamApi = (
  ipcRenderer: IpcRenderer,
  IpcChannels: typeof import('../../shared/constants/ipcChannels').IpcChannels,
): EchoApi['steam'] => ({
  getStatus: () => ipcRenderer.invoke(IpcChannels.SteamGetStatus),
  getCloudSettingsStatus: () => ipcRenderer.invoke(IpcChannels.SteamCloudSettingsGetStatus),
  uploadCloudSettings: () => ipcRenderer.invoke(IpcChannels.SteamCloudSettingsUpload),
  downloadCloudSettings: () => ipcRenderer.invoke(IpcChannels.SteamCloudSettingsDownload),
  getListeningStatsStatus: () => ipcRenderer.invoke(IpcChannels.SteamListeningStatsGetStatus),
  setListeningStatsEnabled: (enabled) => ipcRenderer.invoke(IpcChannels.SteamListeningStatsSetEnabled, enabled),
  syncListeningStats: () => ipcRenderer.invoke(IpcChannels.SteamListeningStatsSync),
  getListenTogetherProbeStatus: () => ipcRenderer.invoke(IpcChannels.SteamListenTogetherProbeGetStatus),
  createListenTogetherProbeRoom: () => ipcRenderer.invoke(IpcChannels.SteamListenTogetherProbeCreateRoom),
  joinListenTogetherProbeRoom: (lobbyId) => ipcRenderer.invoke(IpcChannels.SteamListenTogetherProbeJoinRoom, lobbyId),
  openListenTogetherProbeInvite: () => ipcRenderer.invoke(IpcChannels.SteamListenTogetherProbeOpenInvite),
  leaveListenTogetherProbeRoom: () => ipcRenderer.invoke(IpcChannels.SteamListenTogetherProbeLeaveRoom),
  getListenTogetherStatus: () => ipcRenderer.invoke(IpcChannels.SteamListenTogetherGetStatus),
  createListenTogetherRoom: () => ipcRenderer.invoke(IpcChannels.SteamListenTogetherCreateRoom),
  joinListenTogetherRoom: (lobbyId) => ipcRenderer.invoke(IpcChannels.SteamListenTogetherJoinRoom, lobbyId),
  openListenTogetherInvite: () => ipcRenderer.invoke(IpcChannels.SteamListenTogetherOpenInvite),
  leaveListenTogetherRoom: () => ipcRenderer.invoke(IpcChannels.SteamListenTogetherLeaveRoom),
  sendListenTogetherReaction: (reaction) => ipcRenderer.invoke(IpcChannels.SteamListenTogetherSendReaction, reaction),
  requestListenTogetherSync: () => ipcRenderer.invoke(IpcChannels.SteamListenTogetherRequestSync),
  getLeaderboardStatus: () => ipcRenderer.invoke(IpcChannels.SteamLeaderboardGetStatus),
  setLeaderboardsEnabled: (enabled) => ipcRenderer.invoke(IpcChannels.SteamLeaderboardSetEnabled, enabled),
  syncLeaderboards: () => ipcRenderer.invoke(IpcChannels.SteamLeaderboardSync),
  getLeaderboardEntries: (boardId, scope) =>
    ipcRenderer.invoke(IpcChannels.SteamLeaderboardGetEntries, boardId, scope),
});
