export type SteamRuntimeConfiguration = {
  appId: number | null;
  source: 'release-build' | 'development-environment' | 'none';
  missingReason: 'release_app_id_missing' | 'development_app_id_missing' | null;
};

type ResolveSteamRuntimeConfigurationOptions = {
  isPackaged: boolean;
  bundledReleaseAppId?: string | null;
  developmentAppId?: string | null;
};

const parsePositiveInteger = (value: string | null | undefined): number | null => {
  const normalized = value?.trim() ?? '';
  if (!/^[1-9]\d*$/u.test(normalized)) {
    return null;
  }

  const parsed = Number(normalized);
  return Number.isSafeInteger(parsed) ? parsed : null;
};

export const resolveSteamRuntimeConfiguration = (
  options: ResolveSteamRuntimeConfigurationOptions,
): SteamRuntimeConfiguration => {
  if (options.isPackaged) {
    const appId = parsePositiveInteger(options.bundledReleaseAppId);
    return appId === null
      ? { appId: null, source: 'none', missingReason: 'release_app_id_missing' }
      : { appId, source: 'release-build', missingReason: null };
  }

  const developmentAppId = parsePositiveInteger(options.developmentAppId);
  if (developmentAppId !== null) {
    return { appId: developmentAppId, source: 'development-environment', missingReason: null };
  }

  const bundledReleaseAppId = parsePositiveInteger(options.bundledReleaseAppId);
  return bundledReleaseAppId === null
    ? { appId: null, source: 'none', missingReason: 'development_app_id_missing' }
    : { appId: bundledReleaseAppId, source: 'release-build', missingReason: null };
};

export const getSteamRuntimeConfiguration = (isPackaged: boolean): SteamRuntimeConfiguration =>
  resolveSteamRuntimeConfiguration({
    isPackaged,
    bundledReleaseAppId: process.env.ECHO_STEAM_RELEASE_APP_ID_BUNDLED,
    developmentAppId: process.env.ECHO_STEAM_APP_ID,
  });
