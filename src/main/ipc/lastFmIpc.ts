import { shell, ipcMain } from 'electron';
import { IpcChannels } from '../../shared/constants/ipcChannels';
import { getLastFmService } from '../integrations/lastfm/getLastFmService';
import { syncLastFmIntegrationFromSettings } from '../integrations/lastfm/LastFmStatusSync';

const normalizeString = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

export const registerLastFmIpc = (): void => {
  ipcMain.handle(IpcChannels.LastFmGetStatus, () => getLastFmService().getStatus());
  ipcMain.handle(IpcChannels.LastFmSetEnabled, async (_event, enabled: unknown) => {
    const status = getLastFmService().setEnabled(enabled === true);
    await syncLastFmIntegrationFromSettings();
    return status;
  });
  ipcMain.handle(IpcChannels.LastFmSetNowPlayingEnabled, (_event, enabled: unknown) =>
    getLastFmService().setNowPlayingEnabled(enabled === true),
  );
  ipcMain.handle(IpcChannels.LastFmSetScrobbleEnabled, (_event, enabled: unknown) =>
    getLastFmService().setScrobbleEnabled(enabled === true),
  );
  ipcMain.handle(IpcChannels.LastFmCreateAuthToken, () => getLastFmService().createAuthToken());
  ipcMain.handle(IpcChannels.LastFmOpenAuthUrl, (_event, token: unknown) => {
    const authUrl = getLastFmService().getAuthorizationUrl(normalizeString(token));
    return shell.openExternal(authUrl);
  });
  ipcMain.handle(IpcChannels.LastFmCompleteAuth, async (_event, token: unknown) => {
    const status = await getLastFmService().completeAuth(normalizeString(token));
    if (status.enabled) {
      await syncLastFmIntegrationFromSettings();
    }
    return status;
  });
  ipcMain.handle(IpcChannels.LastFmAuthenticatePassword, async (_event, username: unknown, password: unknown) => {
    const status = await getLastFmService().authenticateWithPassword(normalizeString(username), normalizeString(password));
    if (status.enabled) {
      await syncLastFmIntegrationFromSettings();
    }
    return status;
  });
  ipcMain.handle(IpcChannels.LastFmDisconnect, () => getLastFmService().disconnect());
};
