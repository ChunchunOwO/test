import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { prepareSteamDepot } from './prepare-steam-depot.mjs';

const createContentRoot = () => {
  const root = mkdtempSync(join(tmpdir(), 'echo-steam-depot-'));
  mkdirSync(join(root, 'resources'));
  writeFileSync(join(root, 'ECHO.exe'), 'fixture');
  writeFileSync(join(root, 'resources', 'app.asar'), 'fixture');
  return root;
};

describe('prepareSteamDepot', () => {
  it('creates a preview plan by default without setting a live branch', () => {
    const root = mkdtempSync(join(tmpdir(), 'echo-steam-plan-'));
    const plan = prepareSteamDepot({
      env: {
        ECHO_STEAM_RELEASE_APP_ID: '123456',
        ECHO_STEAM_DEPOT_ID: '123457',
        ECHO_STEAM_CONTENT_ROOT: createContentRoot(),
        ECHO_STEAM_GENERATED_ROOT: root,
      },
    });
    const appConfig = readFileSync(plan.appConfigPath, 'utf8');

    expect(appConfig).toContain('"Preview" "1"');
    expect(appConfig).not.toContain('"SetLive"');
  });

  it('requires explicit approval and rejects public branches', () => {
    const baseEnv = {
      ECHO_STEAM_RELEASE_APP_ID: '123456',
      ECHO_STEAM_DEPOT_ID: '123457',
      ECHO_STEAM_CONTENT_ROOT: createContentRoot(),
      ECHO_STEAM_GENERATED_ROOT: mkdtempSync(join(tmpdir(), 'echo-steam-plan-')),
      ECHO_STEAM_PRIVATE_BRANCH: 'public',
    };

    expect(() => prepareSteamDepot({ env: baseEnv, upload: true })).toThrow(/private beta branch/u);
    expect(() => prepareSteamDepot({
      env: { ...baseEnv, ECHO_STEAM_PRIVATE_BRANCH: 'qa-private' },
      upload: true,
    })).toThrow(/ECHO_STEAM_UPLOAD_APPROVED/u);
  });

  it('refuses to package steam_appid.txt', () => {
    const contentRoot = createContentRoot();
    writeFileSync(join(contentRoot, 'steam_appid.txt'), '480');

    expect(() => prepareSteamDepot({
      env: {
        ECHO_STEAM_RELEASE_APP_ID: '123456',
        ECHO_STEAM_DEPOT_ID: '123457',
        ECHO_STEAM_CONTENT_ROOT: contentRoot,
        ECHO_STEAM_GENERATED_ROOT: mkdtempSync(join(tmpdir(), 'echo-steam-plan-')),
      },
    })).toThrow(/must not contain steam_appid\.txt/u);
  });
});
