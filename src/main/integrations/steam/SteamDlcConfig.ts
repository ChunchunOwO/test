export type SteamProDlcConfiguration = {
  appId: number | null;
  source: 'release-build' | 'development-environment' | 'none';
};

type ResolveSteamProDlcConfigurationOptions = {
  isPackaged: boolean;
  bundledProDlcAppId?: string | null;
  developmentProDlcAppId?: string | null;
};

const parsePositiveInteger = (value: string | null | undefined): number | null => {
  const normalized = value?.trim() ?? '';
  if (!/^[1-9]\d*$/u.test(normalized)) {
    return null;
  }

  const parsed = Number(normalized);
  return Number.isSafeInteger(parsed) ? parsed : null;
};

export const resolveSteamProDlcConfiguration = (
  options: ResolveSteamProDlcConfigurationOptions,
): SteamProDlcConfiguration => {
  if (options.isPackaged) {
    const appId = parsePositiveInteger(options.bundledProDlcAppId);
    return appId === null
      ? { appId: null, source: 'none' }
      : { appId, source: 'release-build' };
  }

  const developmentAppId = parsePositiveInteger(options.developmentProDlcAppId);
  if (developmentAppId !== null) {
    return { appId: developmentAppId, source: 'development-environment' };
  }

  const bundledAppId = parsePositiveInteger(options.bundledProDlcAppId);
  return bundledAppId === null
    ? { appId: null, source: 'none' }
    : { appId: bundledAppId, source: 'release-build' };
};

export const getSteamProDlcConfiguration = (isPackaged: boolean): SteamProDlcConfiguration =>
  resolveSteamProDlcConfiguration({
    isPackaged,
    bundledProDlcAppId: process.env.ECHO_STEAM_PRO_DLC_APP_ID_BUNDLED,
    developmentProDlcAppId: process.env.ECHO_STEAM_PRO_DLC_APP_ID,
  });
