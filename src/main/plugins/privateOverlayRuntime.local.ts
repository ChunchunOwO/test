import type { DownloadFeatureUnlockStatus } from '../../shared/constants/featureUnlocks';
import type { ConnectDonatorUnlockStatus } from '../../shared/constants/featureUnlocks';
import {
  connectDonatorUnlockFeatureId,
  connectDonatorUnlockPluginId,
  connectDonatorUnlockVersion,
  downloadFeatureUnlockFeatureId,
  downloadFeatureUnlockPluginId,
  downloadFeatureUnlockVersion,
} from '../../shared/constants/featureUnlocks';
import type { EchoProCloudLibrarySyncPayload } from '../../shared/types/echoProAccount';
import type { PrivateFeatureId, PrivateSettingsCloudApplyInput, PrivateSettingsCloudSaveInput } from './privateEntitlements';
import { installPrivateEntitlementsProvider } from './privateEntitlements';
import { getEchoProAccountService } from './EchoProAccountService';
import { getEchoProMachineHwidHash } from './MachineIdentity';
import type { PrivateOverlayRuntimeInstallResult } from './privateOverlayRuntime';

const nowIso = (): string => new Date().toISOString();

const createEmptyLibrarySync = (): EchoProCloudLibrarySyncPayload => ({
  version: 1,
  savedAt: nowIso(),
  streamingPlaylists: [],
  streamingFavorites: {
    version: 1,
    updatedAt: nowIso(),
    providers: {
      bilibili: [],
      youtube: [],
      soundcloud: [],
    },
    collections: [],
  },
});

const requireActivePro = async (_feature: PrivateFeatureId): Promise<void> => undefined;

const getSteamDownloadStatus = (): DownloadFeatureUnlockStatus => ({
  featureId: downloadFeatureUnlockFeatureId,
  pluginId: downloadFeatureUnlockPluginId,
  requiredVersion: downloadFeatureUnlockVersion,
  unlocked: true,
  pluginInstalled: true,
  pluginEnabled: true,
  reason: 'unlocked',
  checkedAt: nowIso(),
});

const getConnectStatus = (): ConnectDonatorUnlockStatus => {
  return {
    featureId: connectDonatorUnlockFeatureId,
    pluginId: connectDonatorUnlockPluginId,
    requiredVersion: connectDonatorUnlockVersion,
    unlocked: true,
    pluginInstalled: true,
    pluginEnabled: true,
    hwidHash: getEchoProMachineHwidHash(),
    reason: 'unlocked',
    checkedAt: nowIso(),
  };
};

const refreshConnectStatus = async (): Promise<ConnectDonatorUnlockStatus> => {
  return getConnectStatus();
};

export const installPrivateOverlayRuntime = (): PrivateOverlayRuntimeInstallResult => {
  installPrivateEntitlementsProvider({
    requireFeature: requireActivePro,
    getConnectStatus,
    refreshConnectStatus,
    getAccountStatus: (options) => getEchoProAccountService().refreshStatus(options),
    loginAccount: (credentials) => getEchoProAccountService().login(credentials),
    registerAccount: (credentials) => getEchoProAccountService().register(credentials),
    logoutAccount: () => getEchoProAccountService().logout(),
    redeemKey: (key) => getEchoProAccountService().redeemKey(key),
    releaseDevices: (password) => getEchoProAccountService().releaseAllDevices(password),
    getSettingsCloudStatus: () => getEchoProAccountService().getSettingsCloudStatus(),
    saveSettingsCloud: (input: PrivateSettingsCloudSaveInput) =>
      getEchoProAccountService().saveSettingsCloud({
        ...input,
        librarySync: createEmptyLibrarySync(),
      }),
    pullSettingsCloud: () => getEchoProAccountService().pullSettingsCloud(),
    applySettingsCloud: async (input: PrivateSettingsCloudApplyInput) => {
      const pulled = await getEchoProAccountService().pullSettingsCloud();
      if (pulled.settings) {
        await input.applySettings(pulled.settings);
      }
      return {
        ...pulled,
        lastAppliedAt: nowIso(),
        appliedAt: nowIso(),
      };
    },
    getDownloadStatus: getSteamDownloadStatus,
  });

  return {
    installed: true,
    source: 'private-overlay',
    features: ['echo-pro-account', 'echo-pro-key', 'echo-pro-hwid', 'echo-pro-cloud-settings'],
  };
};
