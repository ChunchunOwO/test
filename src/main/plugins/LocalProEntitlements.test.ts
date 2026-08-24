import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isAuthorizationFailure } from '../../shared/ipcAuthorizationFailure';
import { getLocalProEntitlementSnapshot, requireLocalPro } from './LocalProEntitlements';

const mocks = vi.hoisted(() => ({
  appId: 654321 as number | null,
  snapshot: {
    available: true,
    baseAppSubscribed: true,
    dlcOwned: true as boolean | null,
    dlcInstalled: false as boolean | null,
  },
}));

vi.mock('electron', () => ({ app: { isPackaged: true } }));
vi.mock('../integrations/steam/SteamDlcConfig', () => ({
  getSteamProDlcConfiguration: () => ({ appId: mocks.appId, source: mocks.appId ? 'release-build' : 'none' }),
}));
vi.mock('../integrations/steam/SteamworksService', () => ({
  getSteamEntitlementService: () => ({ getSnapshot: () => ({ ...mocks.snapshot }) }),
}));

describe('local Pro entitlements', () => {
  beforeEach(() => {
    mocks.appId = 654321;
    mocks.snapshot.available = true;
    mocks.snapshot.baseAppSubscribed = true;
    mocks.snapshot.dlcOwned = true;
    mocks.snapshot.dlcInstalled = false;
  });

  it.each([
    'echo-pro',
    'dsp',
    'plugins',
    'remote-sources',
    'cover-cache',
    'hqplayer-remote-media',
    'connect',
  ] as const)('unlocks %s from Steam DLC ownership', (feature) => {
    expect(getLocalProEntitlementSnapshot(feature)).toMatchObject({
      unlocked: true,
      source: 'steam-dlc',
      feature,
    });
    expect(() => requireLocalPro(feature)).not.toThrow();
  });

  it('fails closed when the DLC App ID is missing or ownership is unavailable', () => {
    mocks.appId = null;
    expect(getLocalProEntitlementSnapshot('echo-pro')).toEqual({
      unlocked: false,
      source: 'none',
      feature: 'echo-pro',
      checkedAt: null,
    });
    expect(() => requireLocalPro('echo-pro')).toThrowError(expect.objectContaining({}));
    try {
      requireLocalPro('echo-pro');
    } catch (error) {
      expect(isAuthorizationFailure(error)).toBe(true);
    }
  });

  it('never treats the prohibited downloads surface as DLC content', () => {
    expect(getLocalProEntitlementSnapshot('downloads')).toEqual({
      unlocked: false,
      source: 'none',
      feature: 'downloads',
      checkedAt: null,
    });
  });
});
