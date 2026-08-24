import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createPackage } from '@electron/asar';
import { describe, expect, it } from 'vitest';
import {
  parseMacosDocumentExtensions,
  parseOtoolDependencies,
  verifyMacosDevApp,
} from './verify-macos-dev-app.mjs';

const writeFixtureFile = (path, executable = false) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, 'fixture');
  if (executable) chmodSync(path, 0o755);
};

const createFixtureBundle = async (arch = 'arm64') => {
  const root = mkdtempSync(join(tmpdir(), 'echo-macos-dev-app-'));
  const appPath = join(root, 'ECHO.app');
  const contents = join(appPath, 'Contents');
  const resources = join(contents, 'Resources');
  const unpackedRoot = join(resources, 'app.asar.unpacked');
  const steamworksRoot = join(unpackedRoot, 'node_modules', 'steamworks.js', 'dist', 'osx');
  const asarSource = join(root, 'asar-source');

  writeFixtureFile(join(contents, 'Info.plist'));
  writeFixtureFile(join(contents, 'MacOS', 'ECHO'), true);
  writeFixtureFile(join(resources, 'echo-audio-host'), true);
  writeFixtureFile(join(resources, 'echo-native-scanner'), true);
  writeFixtureFile(join(unpackedRoot, 'node_modules', 'better-sqlite3', 'build', 'Release', 'better_sqlite3.node'));
  writeFixtureFile(join(steamworksRoot, 'libsteam_api.dylib'));
  writeFixtureFile(join(steamworksRoot, `steamworksjs.darwin-${arch}.node`));
  writeFixtureFile(join(asarSource, 'out', 'main', 'index.js'));
  writeFixtureFile(join(asarSource, 'package.json'));
  writeFixtureFile(join(asarSource, 'THIRD_PARTY_NOTICES.md'));
  await createPackage(asarSource, join(resources, 'app.asar'));
  return { appPath, resources };
};

describe('verify macOS development app', () => {
  it('reads Finder document associations from Info.plist JSON', () => {
    expect(parseMacosDocumentExtensions(JSON.stringify([
      { CFBundleTypeExtensions: ['FLAC', 'mp3', 'cue'] },
      { CFBundleTypeExtensions: ['m4a', 'flac'] },
    ]))).toEqual(['cue', 'flac', 'm4a', 'mp3']);
  });

  it('parses Mach-O dependencies for portable-runtime auditing', () => {
    expect(parseOtoolDependencies([
      '/tmp/echo-audio-host:',
      '\t/System/Library/Frameworks/CoreAudio.framework/Versions/A/CoreAudio (compatibility version 1.0.0, current version 1.0.0)',
      '\t/opt/homebrew/opt/ffmpeg/lib/libavcodec.62.dylib (compatibility version 62.0.0, current version 62.1.0)',
      '\t@rpath/libsteam_api.dylib (compatibility version 1.0.0, current version 1.0.0)',
    ].join('\n'))).toEqual([
      '/System/Library/Frameworks/CoreAudio.framework/Versions/A/CoreAudio',
      '/opt/homebrew/opt/ffmpeg/lib/libavcodec.62.dylib',
      '@rpath/libsteam_api.dylib',
    ]);
  });

  it('accepts a structurally complete local development bundle', async () => {
    const { appPath } = await createFixtureBundle();
    const report = verifyMacosDevApp({ appPath, arch: 'arm64', platform: 'win32' });
    expect(report).toMatchObject({
      result: 'pass',
      kind: 'unsigned-local-development-app',
      arch: 'arm64',
    });
  });

  it('rejects Windows native payloads in the macOS bundle', async () => {
    const { appPath, resources } = await createFixtureBundle();
    writeFixtureFile(join(resources, 'app.asar.unpacked', 'node_modules', 'steamworks.js', 'dist', 'win64', 'steam_api64.dll'));
    expect(() => verifyMacosDevApp({ appPath, arch: 'arm64', platform: 'win32' })).toThrow(/Windows\/local-only files/u);
  });
});
