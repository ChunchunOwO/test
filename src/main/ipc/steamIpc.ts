import { ipcMain } from 'electron';
import { IpcChannels } from '../../shared/constants/ipcChannels';
import type { AppSettings } from '../../shared/types/appSettings';
import type { SteamLeaderboardBoardId, SteamLeaderboardScope, SteamListenTogetherReactionId } from '../../shared/types/steam';
import { getSteamLeaderboardService, getSteamListenTogetherProbeService, getSteamListenTogetherService, getSteamStatus } from '../integrations/steam/SteamworksService';
import { getSteamRichPresenceStatus } from '../integrations/steam/SteamRichPresenceStatusSync';
import { getSteamCloudSettingsSyncService } from '../integrations/steam/SteamCloudSettingsSync';
import { syncSteamLeaderboardsNow } from '../integrations/steam/SteamLeaderboardStatusSync';
import { getSteamListeningStatsStatus, syncSteamListeningStatsNow } from '../integrations/steam/SteamListeningStatsStatusSync';

type SteamIpcDependencies = {
  getSettings: () => AppSettings | Record<string, unknown>;
  getLocalSettings: () => AppSettings | Record<string, unknown>;
  applySettings: (settings: Partial<AppSettings>) => Promise<AppSettings>;
};

export const registerSteamIpc = (dependencies: SteamIpcDependencies): void => {
  const listeningStatsEnabled = (): boolean => dependencies.getLocalSettings().steamListeningStatsEnabled === true;
  const leaderboardEnabled = (): boolean => dependencies.getLocalSettings().steamLeaderboardsEnabled === true;
  ipcMain.handle(IpcChannels.SteamGetStatus, () => ({
    ...getSteamStatus(),
    richPresence: getSteamRichPresenceStatus(),
  }));
  ipcMain.handle(IpcChannels.SteamCloudSettingsGetStatus, () =>
    getSteamCloudSettingsSyncService().getStatus(),
  );
  ipcMain.handle(IpcChannels.SteamCloudSettingsUpload, () =>
    getSteamCloudSettingsSyncService().upload(dependencies.getSettings()),
  );
  ipcMain.handle(IpcChannels.SteamCloudSettingsDownload, () =>
    getSteamCloudSettingsSyncService().downloadAndApply(dependencies.applySettings),
  );
  ipcMain.handle(IpcChannels.SteamListeningStatsGetStatus, () =>
    getSteamListeningStatsStatus(),
  );
  ipcMain.handle(IpcChannels.SteamListeningStatsSetEnabled, async (_event, enabled: unknown) => {
    if (typeof enabled !== 'boolean') throw new TypeError('enabled must be a boolean');
    await dependencies.applySettings({ steamListeningStatsEnabled: enabled });
    return syncSteamListeningStatsNow();
  });
  ipcMain.handle(IpcChannels.SteamListeningStatsSync, () => syncSteamListeningStatsNow());
  ipcMain.handle(IpcChannels.SteamListenTogetherProbeGetStatus, () =>
    getSteamListenTogetherProbeService().getSnapshot(),
  );
  ipcMain.handle(IpcChannels.SteamListenTogetherProbeCreateRoom, () =>
    getSteamListenTogetherProbeService().createRoom(),
  );
  ipcMain.handle(IpcChannels.SteamListenTogetherProbeJoinRoom, (_event, lobbyId: unknown) => {
    if (typeof lobbyId !== 'string') throw new TypeError('lobbyId must be a string');
    return getSteamListenTogetherProbeService().joinRoom(lobbyId);
  });
  ipcMain.handle(IpcChannels.SteamListenTogetherProbeOpenInvite, () =>
    getSteamListenTogetherProbeService().openInviteDialog(),
  );
  ipcMain.handle(IpcChannels.SteamListenTogetherProbeLeaveRoom, () =>
    getSteamListenTogetherProbeService().leaveRoom(),
  );
  ipcMain.handle(IpcChannels.SteamListenTogetherGetStatus, () =>
    getSteamListenTogetherService().getSnapshot(),
  );
  ipcMain.handle(IpcChannels.SteamListenTogetherCreateRoom, () =>
    getSteamListenTogetherService().createRoom(),
  );
  ipcMain.handle(IpcChannels.SteamListenTogetherJoinRoom, (_event, lobbyId: unknown) => {
    if (typeof lobbyId !== 'string') throw new TypeError('lobbyId must be a string');
    return getSteamListenTogetherService().joinRoom(lobbyId);
  });
  ipcMain.handle(IpcChannels.SteamListenTogetherOpenInvite, () =>
    getSteamListenTogetherService().openInviteDialog(),
  );
  ipcMain.handle(IpcChannels.SteamListenTogetherLeaveRoom, () =>
    getSteamListenTogetherService().leaveRoom(),
  );
  ipcMain.handle(IpcChannels.SteamListenTogetherSendReaction, (_event, reaction: unknown) => {
    const valid = reaction === 'heart' || reaction === 'fire' || reaction === 'headphones' || reaction === 'sparkles';
    if (!valid) throw new TypeError('invalid listen-together reaction');
    return getSteamListenTogetherService().sendReaction(reaction as SteamListenTogetherReactionId);
  });
  ipcMain.handle(IpcChannels.SteamListenTogetherRequestSync, () =>
    getSteamListenTogetherService().requestSync(),
  );
  ipcMain.handle(IpcChannels.SteamLeaderboardGetStatus, () =>
    getSteamLeaderboardService().getStatus(leaderboardEnabled()),
  );
  ipcMain.handle(IpcChannels.SteamLeaderboardSetEnabled, async (_event, enabled: unknown) => {
    if (typeof enabled !== 'boolean') throw new TypeError('enabled must be a boolean');
    await dependencies.applySettings({ steamLeaderboardsEnabled: enabled });
    return enabled
      ? syncSteamLeaderboardsNow()
      : getSteamLeaderboardService().getStatus(false);
  });
  ipcMain.handle(IpcChannels.SteamLeaderboardSync, () => syncSteamLeaderboardsNow());
  ipcMain.handle(
    IpcChannels.SteamLeaderboardGetEntries,
    (_event, boardId: unknown, scope: unknown) => {
      const validBoard = boardId === 'listening-time'
        || boardId === 'completed-tracks'
        || boardId === 'listening-streak'
        || boardId === 'deep-session'
        || boardId === 'rediscovered-tracks';
      const validScope = scope === 'global' || scope === 'friends' || scope === 'around-user';
      if (!validBoard || !validScope) throw new TypeError('invalid Steam leaderboard request');
      return getSteamLeaderboardService().getSnapshot(
        boardId as SteamLeaderboardBoardId,
        scope as SteamLeaderboardScope,
        leaderboardEnabled(),
      );
    },
  );
};
