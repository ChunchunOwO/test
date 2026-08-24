import { app } from 'electron';
import { createPublicAuthorizationRequiredError } from '../../shared/ipcAuthorizationFailure';
import { getSteamProDlcConfiguration } from '../integrations/steam/SteamDlcConfig';
import { getSteamEntitlementService } from '../integrations/steam/SteamworksService';

export type LocalProFeature =
  | 'echo-pro'
  | 'dsp'
  | 'plugins'
  | 'remote-sources'
  | 'cover-cache'
  | 'hqplayer-remote-media'
  | 'connect'
  | 'downloads';

export type LocalProEntitlementSnapshot = {
  unlocked: boolean;
  source: 'steam-dlc' | 'none';
  feature: LocalProFeature;
  checkedAt: string | null;
};

export const getLocalProEntitlementSnapshot = (
  feature: LocalProFeature = 'echo-pro',
): LocalProEntitlementSnapshot => {
  // Downloading and platform extraction remain outside the Steam distribution boundary.
  if (feature === 'downloads') {
    return { unlocked: false, source: 'none', feature, checkedAt: null };
  }

  const configuration = getSteamProDlcConfiguration(app.isPackaged);
  if (configuration.appId === null) {
    return { unlocked: false, source: 'none', feature, checkedAt: null };
  }

  const snapshot = getSteamEntitlementService().getSnapshot(configuration.appId);
  return {
    unlocked: snapshot.available && snapshot.baseAppSubscribed && snapshot.dlcOwned === true,
    source: 'steam-dlc',
    feature,
    checkedAt: new Date().toISOString(),
  };
};

export const isLocalProUnlocked = (feature: LocalProFeature = 'echo-pro'): boolean =>
  getLocalProEntitlementSnapshot(feature).unlocked;

export const requireLocalPro = (feature: LocalProFeature = 'echo-pro'): void => {
  if (!isLocalProUnlocked(feature)) {
    throw createPublicAuthorizationRequiredError();
  }
};
