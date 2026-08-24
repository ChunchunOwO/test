import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packageJson = JSON.parse(readFileSync(resolve(projectRoot, 'package.json'), 'utf8'));

describe('macOS packaging foundation contract', () => {
  it('keeps platform-native dependencies out of the global ASAR file set', () => {
    expect(packageJson.build.files).toContain('!node_modules/steamworks.js/dist/**');
    expect(packageJson.build.files).toContain('!node_modules/@lox-audioserver/node-libraop/prebuilds/**');
    expect(packageJson.build.asarUnpack).not.toEqual(
      expect.arrayContaining([
        expect.stringContaining('steamworks.js/dist/win64'),
        expect.stringContaining('node-libraop/prebuilds/win32'),
      ]),
    );
  });

  it('routes each supported platform native payload through its platform config', () => {
    const windowsResources = packageJson.build.win.extraResources;
    const macResources = packageJson.build.mac.extraResources;

    expect(windowsResources).toEqual(expect.arrayContaining([
      expect.objectContaining({
        from: 'node_modules/steamworks.js/dist/win64/steam_api64.dll',
        to: 'app.asar.unpacked/node_modules/steamworks.js/dist/win64/steam_api64.dll',
      }),
      expect.objectContaining({
        from: 'node_modules/@lox-audioserver/node-libraop/prebuilds/win32-x64',
      }),
    ]));
    expect(macResources).toEqual(expect.arrayContaining([
      expect.objectContaining({
        from: 'node_modules/steamworks.js/dist/osx',
        to: 'app.asar.unpacked/node_modules/steamworks.js/dist/osx',
      }),
      expect.objectContaining({ from: 'electron-app/build/echo-audio-host' }),
      expect.objectContaining({ from: 'electron-app/build/echo-native-scanner' }),
    ]));
  });

  it('allows only an arm64 directory target during the foundation phase', () => {
    expect(packageJson.build.mac.identity).toBeNull();
    expect(packageJson.build.mac.hardenedRuntime).toBe(false);
    expect(packageJson.build.mac.target).toEqual([
      {
        target: 'dir',
        arch: ['arm64'],
      },
    ]);
  });

  it('shares audio document associations across Windows and macOS packaging', () => {
    expect(packageJson.build.win.fileAssociations).toBeUndefined();
    expect(packageJson.build.fileAssociations).toEqual([
      expect.objectContaining({
        role: 'Viewer',
        ext: expect.arrayContaining(['flac', 'mp3', 'm4a', 'aiff', 'cue']),
      }),
    ]);
  });
});
