import { describe, expect, it } from 'vitest';
import { resolveSteamRuntimeConfiguration } from './SteamRuntimeConfig';

describe('resolveSteamRuntimeConfiguration', () => {
  it('uses the immutable build-time App ID for packaged releases', () => {
    expect(resolveSteamRuntimeConfiguration({
      isPackaged: true,
      bundledReleaseAppId: ' 123456 ',
      developmentAppId: '480',
    })).toEqual({
      appId: 123456,
      source: 'release-build',
      missingReason: null,
    });
  });

  it('does not trust the development App ID in a packaged release', () => {
    expect(resolveSteamRuntimeConfiguration({
      isPackaged: true,
      bundledReleaseAppId: '',
      developmentAppId: '480',
    })).toEqual({
      appId: null,
      source: 'none',
      missingReason: 'release_app_id_missing',
    });
  });

  it('allows a development App ID without committing steam_appid.txt', () => {
    expect(resolveSteamRuntimeConfiguration({
      isPackaged: false,
      developmentAppId: '480',
    })).toEqual({
      appId: 480,
      source: 'development-environment',
      missingReason: null,
    });
  });

  it('rejects invalid App IDs', () => {
    expect(resolveSteamRuntimeConfiguration({
      isPackaged: false,
      developmentAppId: '0',
      bundledReleaseAppId: 'not-a-number',
    })).toEqual({
      appId: null,
      source: 'none',
      missingReason: 'development_app_id_missing',
    });
  });
});
