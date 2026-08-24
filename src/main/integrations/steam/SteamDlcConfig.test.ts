import { describe, expect, it } from 'vitest';
import { resolveSteamProDlcConfiguration } from './SteamDlcConfig';

describe('resolveSteamProDlcConfiguration', () => {
  it('uses only the bundled DLC App ID in packaged builds', () => {
    expect(resolveSteamProDlcConfiguration({
      isPackaged: true,
      bundledProDlcAppId: ' 654321 ',
      developmentProDlcAppId: '480',
    })).toEqual({ appId: 654321, source: 'release-build' });
  });

  it('fails closed when a packaged build has no DLC App ID', () => {
    expect(resolveSteamProDlcConfiguration({
      isPackaged: true,
      bundledProDlcAppId: '',
      developmentProDlcAppId: '480',
    })).toEqual({ appId: null, source: 'none' });
  });

  it('allows an explicit development DLC App ID', () => {
    expect(resolveSteamProDlcConfiguration({
      isPackaged: false,
      developmentProDlcAppId: '654321',
    })).toEqual({ appId: 654321, source: 'development-environment' });
  });
});
