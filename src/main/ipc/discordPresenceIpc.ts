import { ipcMain } from 'electron';
import { IpcChannels } from '../../shared/constants/ipcChannels';
import { getDiscordPresenceService, setDiscordPresenceEnabled } from '../integrations/discord/getDiscordPresenceService';
import { syncDiscordPresenceIntegrationFromSettings } from '../integrations/discord/DiscordPresenceStatusSync';

export const registerDiscordPresenceIpc = (): void => {
  ipcMain.handle(IpcChannels.DiscordPresenceGetStatus, () => getDiscordPresenceService().getStatus());
  ipcMain.handle(IpcChannels.DiscordPresenceSetEnabled, async (_event, enabled: unknown) => {
    const status = await setDiscordPresenceEnabled(enabled === true);
    await syncDiscordPresenceIntegrationFromSettings();
    return status;
  });
};
