import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  getSharedLibraryDatabasePath,
  readRegularEditionSharedSettings,
  resolveRegularEditionUserDataPath,
  writeRegularEditionSharedSettingsPatch,
} from './editionDataSync';

describe('editionDataSync', () => {
  let root: string;
  let previousNodeEnv: string | undefined;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'echo-edition-sync-'));
    previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    delete process.env.ECHO_DISABLE_EDITION_DATA_SYNC;
  });

  afterEach(() => {
    process.env.NODE_ENV = previousNodeEnv;
    delete process.env.ECHO_DISABLE_EDITION_DATA_SYNC;
    rmSync(root, { recursive: true, force: true });
  });

  const fakeApp = () => ({
    getPath: (name: 'appData' | 'userData') => name === 'appData' ? root : join(root, 'ECHO Steam'),
  });

  it('uses the populated regular-edition profile as the single library source', () => {
    const currentProfile = join(root, 'ECHO');
    const existingProfile = join(root, ['ECHO', 'NEXT'].join(' '));
    mkdirSync(currentProfile, { recursive: true });
    mkdirSync(existingProfile, { recursive: true });
    writeFileSync(join(currentProfile, 'echo-settings.json'), '{}\n');
    writeFileSync(join(existingProfile, 'echo-settings.json'), '{}\n');
    writeFileSync(join(existingProfile, 'echo-library.sqlite'), Buffer.alloc(4 * 1024 * 1024));

    expect(resolveRegularEditionUserDataPath(fakeApp())).toBe(existingProfile);
    expect(getSharedLibraryDatabasePath(fakeApp())).toBe(join(existingProfile, 'echo-library.sqlite'));
  });

  it('merges shared settings without modifying normal-only settings', () => {
    const profile = join(root, 'ECHO');
    const settingsPath = join(profile, 'echo-settings.json');
    mkdirSync(profile, { recursive: true });
    writeFileSync(settingsPath, JSON.stringify({ appMemoryVersion: 6, appearanceTheme: 'dark', spotifyClientId: 'normal-only', steamListeningStatsEnabled: false }));

    writeRegularEditionSharedSettingsPatch(
      { appMemoryVersion: 7, appearanceTheme: 'light', spotifyClientId: 'steam-must-not-write', steamListeningStatsEnabled: true },
      fakeApp(),
    );

    const persisted = JSON.parse(readFileSync(settingsPath, 'utf8')) as Record<string, unknown>;
    expect(persisted.appMemoryVersion).toBe(6);
    expect(persisted.appearanceTheme).toBe('light');
    expect(persisted.spotifyClientId).toBe('normal-only');
    expect(persisted.steamListeningStatsEnabled).toBe(false);
    expect(readRegularEditionSharedSettings(fakeApp())?.settings).toMatchObject({ appearanceTheme: 'light' });
    expect(readRegularEditionSharedSettings(fakeApp())?.settings).not.toHaveProperty('appMemoryVersion');
    expect(readRegularEditionSharedSettings(fakeApp())?.settings).not.toHaveProperty('spotifyClientId');
    expect(readRegularEditionSharedSettings(fakeApp())?.settings).not.toHaveProperty('steamListeningStatsEnabled');
  });
});

