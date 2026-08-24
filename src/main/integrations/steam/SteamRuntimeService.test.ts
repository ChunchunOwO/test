import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SteamClient, SteamworksBindings } from './SteamRuntimeService';
import { SteamRuntimeService } from './SteamRuntimeService';

vi.mock('electron', () => ({
  app: { isPackaged: false, quit: vi.fn() },
}));

const createClient = (overrides: Partial<SteamClient> = {}): SteamClient => ({
  apps: {
    isSubscribed: vi.fn(() => true),
    appBuildId: vi.fn(() => 1234),
    currentBetaName: vi.fn(() => 'private-test'),
  },
  cloud: {
    isEnabledForAccount: vi.fn(() => true),
    isEnabledForApp: vi.fn(() => true),
  },
  localplayer: {
    getName: vi.fn(() => 'Steam Tester'),
  },
  utils: {
    getAppId: vi.fn(() => 765432),
    isSteamRunningOnSteamDeck: vi.fn(() => false),
  },
  ...overrides,
} as unknown as SteamClient);

describe('SteamRuntimeService', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('initializes once and reports sanitized runtime diagnostics', () => {
    const client = createClient();
    const bindings = {
      electronEnableSteamOverlay: vi.fn(),
      restartAppIfNecessary: vi.fn(() => false),
      init: vi.fn(() => client),
    } as unknown as SteamworksBindings;
    const service = new SteamRuntimeService({
      electronApp: { isPackaged: true, quit: vi.fn() },
      configuration: { appId: 765432, source: 'release-build', missingReason: null },
      loadBindings: () => bindings,
      logger: { info: vi.fn(), warn: vi.fn() },
    });

    expect(service.initialize()).toEqual({
      state: 'ready',
      appId: 765432,
      appIdSource: 'release-build',
      playerName: 'Steam Tester',
      appBuildId: 1234,
      betaName: 'private-test',
      subscribed: true,
      runningOnSteamDeck: false,
      cloudEnabled: true,
      unavailableReason: null,
      message: 'Steamworks is connected.',
    });
    expect(service.initialize()).toBe(service.getStatus());
    expect(bindings.electronEnableSteamOverlay).toHaveBeenCalledTimes(1);
    expect(bindings.init).toHaveBeenCalledWith(765432);
  });

  it('reads the current game language only from an initialized Steam client', () => {
    const client = createClient({
      apps: {
        ...createClient().apps,
        currentGameLanguage: vi.fn(() => 'schinese'),
      } as SteamClient['apps'],
    });
    const service = new SteamRuntimeService({
      electronApp: { isPackaged: true, quit: vi.fn() },
      configuration: { appId: 5105090, source: 'release-build', missingReason: null },
      loadBindings: () => ({
        init: vi.fn(() => client),
        restartAppIfNecessary: vi.fn(() => false),
        electronEnableSteamOverlay: vi.fn(),
      }),
      logger: { info: vi.fn(), warn: vi.fn() },
    });

    expect(service.getCurrentGameLanguage()).toBeNull();
    service.initialize();
    expect(service.getCurrentGameLanguage()).toBe('schinese');
  });

  it('quits immediately when Steam requests a packaged relaunch', () => {
    const quit = vi.fn();
    const bindings = {
      electronEnableSteamOverlay: vi.fn(),
      restartAppIfNecessary: vi.fn(() => true),
      init: vi.fn(),
    } as unknown as SteamworksBindings;
    const service = new SteamRuntimeService({
      electronApp: { isPackaged: true, quit },
      configuration: { appId: 765432, source: 'release-build', missingReason: null },
      loadBindings: () => bindings,
      logger: { info: vi.fn(), warn: vi.fn() },
    });

    expect(service.initialize().state).toBe('restarting');
    expect(quit).toHaveBeenCalledOnce();
    expect(bindings.init).not.toHaveBeenCalled();
  });

  it('classifies native module loading failures without exposing an error message', () => {
    const warn = vi.fn();
    const service = new SteamRuntimeService({
      electronApp: { isPackaged: true, quit: vi.fn() },
      configuration: { appId: 765432, source: 'release-build', missingReason: null },
      loadBindings: () => {
        throw new Error('C:\\Users\\private-user\\secret-path');
      },
      logger: { info: vi.fn(), warn },
    });

    expect(service.initialize()).toMatchObject({
      state: 'error',
      unavailableReason: 'native_module_load_failed',
    });
    expect(warn).toHaveBeenCalledWith('[Steamworks] Initialization failed', {
      reason: 'native_module_load_failed',
      errorName: 'Error',
    });
  });
});
