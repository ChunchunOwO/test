import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import asar from '@electron/asar';

const root = process.cwd();
const unpackedRoot = resolve(root, process.argv[2] ?? 'dist/win-unpacked');
const resourcesRoot = join(unpackedRoot, 'resources');
const asarPath = join(resourcesRoot, 'app.asar');
const failures = [];

const forbiddenAsarMarkers = [
  '@neteasecloudmusicapienhanced',
  '@unblockneteasemusic',
  'electron-updater',
  'yt-dlp.exe',
  'yt-dlp.js',
  'youtube-dl-exec',
  'BaiduRemoteSourceAdapter',
  'BaiduOAuth',
  'remoteSources:startBaiduOAuthLogin',
  'remoteSources:exchangeBaiduAuthCode',
  'pan.baidu.com/rest/2.0/xpan',
  'openapi.baidu.com/oauth/2.0/token',
  'settings.remote.job.mv',
  'settings.remote.background.concurrency.mv',
  'mvConcurrency',
];

const forbiddenResourceMarkers = [
  ...forbiddenAsarMarkers,
  'yt-dlp',
  'yt_dlp',
  'steam_appid.txt',
  '.vdf',
];

const walkFiles = (directory) => {
  if (!existsSync(directory)) {
    return [];
  }
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = join(directory, entry.name);
    return entry.isDirectory() ? walkFiles(entryPath) : [entryPath];
  });
};

if (!existsSync(asarPath)) {
  failures.push(`missing final artifact: ${asarPath}`);
} else {
  const asarBuffer = readFileSync(asarPath);
  const asarText = asarBuffer.toString('latin1');
  for (const marker of forbiddenAsarMarkers) {
    if (asarText.toLowerCase().includes(marker.toLowerCase())) {
      failures.push(`app.asar contains forbidden marker: ${marker}`);
    }
  }
  for (const required of ['THIRD_PARTY_NOTICES.md', 'LICENSE']) {
    if (!asarText.includes(required)) {
      failures.push(`app.asar is missing required notice: ${required}`);
    }
  }
  for (const relativePath of [
    join('licenses', 'fonts', 'Outfit-OFL-1.1.txt'),
    join('licenses', 'fonts', 'Monocraft-OFL-1.1.txt'),
  ]) {
    try {
      const packagedLicense = asar.extractFile(asarPath, relativePath);
      const sourceLicense = readFileSync(join(root, relativePath));
      if (!packagedLicense.equals(sourceLicense)) {
        failures.push(`app.asar font license differs from source: ${relativePath}`);
      }
    } catch (error) {
      failures.push(`app.asar is missing required font license: ${relativePath} (${error instanceof Error ? error.message : String(error)})`);
    }
  }
}

for (const filePath of walkFiles(resourcesRoot)) {
  const relativePath = filePath.slice(resourcesRoot.length + 1).replaceAll('\\', '/').toLowerCase();
  if (filePath === asarPath) {
    continue;
  }
  for (const marker of forbiddenResourceMarkers) {
    if (relativePath.includes(marker.toLowerCase())) {
      failures.push(`resources contains forbidden path: ${relativePath}`);
    }
  }
}

for (const requiredResource of [
  'tools/echo-audio-host.exe',
  'echo-smtc-host.exe',
  'tools/avcodec-62.dll',
  'tools/avformat-62.dll',
  'tools/avutil-60.dll',
  'tools/swresample-6.dll',
  'tools/ffmpeg.exe',
  'tools/FFMPEG-LICENSE.txt',
  'app.asar.unpacked/node_modules/@lox-audioserver/node-libraop/prebuilds/win32-x64/raop_addon.node.napi.node',
  'app.asar.unpacked/node_modules/better-sqlite3/build/Release/better_sqlite3.node',
  'app.asar.unpacked/node_modules/steamworks.js/dist/win64/steamworksjs.win32-x64-msvc.node',
  'app.asar.unpacked/node_modules/steamworks.js/dist/win64/steam_api64.dll',
  'echo-steam-leaderboards.node',
]) {
  if (!existsSync(join(resourcesRoot, requiredResource))) {
    failures.push(`resources is missing required runtime: ${requiredResource}`);
  }
}

for (const workshopSdkResource of [
  'README.md',
  'package.json',
  'echo-workshop-plugin.d.ts',
  'echo-workshop-sdk.json',
  'bin/echo-workshop-sdk.mjs',
  'schemas/echo.workshop.schema.json',
  'schemas/plugin-package.schema.json',
  'templates/plugin-basic/plugin.js',
  'templates/github/validate-workshop.yml',
  'templates/catalog.json',
  'lib/project-templates.mjs',
  'lib/mock-host.mjs',
  'lib/quality-report.mjs',
  'examples/README.md',
  'examples/listen-together/plugin.js',
]) {
  const packagedPath = join(resourcesRoot, 'workshop-sdk', workshopSdkResource);
  const sourcePath = join(root, 'docs', 'workshop-sdk', workshopSdkResource);
  if (!existsSync(packagedPath)) {
    failures.push(`resources is missing Workshop SDK file: ${workshopSdkResource}`);
  } else if (!readFileSync(packagedPath).equals(readFileSync(sourcePath))) {
    failures.push(`resources Workshop SDK file differs from source: ${workshopSdkResource}`);
  }
}

for (const duplicateResource of [
  'echo-audio-host.exe',
  'avcodec-62.dll',
  'avformat-62.dll',
  'avutil-60.dll',
  'swresample-6.dll',
]) {
  if (existsSync(join(resourcesRoot, duplicateResource))) {
    failures.push(`resources contains duplicate root runtime: ${duplicateResource}`);
  }
}

for (const excludedSteamworksResource of [
  'app.asar.unpacked/node_modules/steamworks.js/dist/linux64',
  'app.asar.unpacked/node_modules/steamworks.js/dist/osx',
  'app.asar.unpacked/node_modules/steamworks.js/dist/win64/steam_api64.lib',
]) {
  if (existsSync(join(resourcesRoot, excludedSteamworksResource))) {
    failures.push(`resources contains non-runtime Steamworks payload: ${excludedSteamworksResource}`);
  }
}

for (const buildOnlyResource of [
  'app.asar.unpacked/node_modules/@lox-audioserver/node-libraop/build',
  'app.asar.unpacked/node_modules/better-sqlite3/bin',
  'app.asar.unpacked/node_modules/better-sqlite3/build/Release/obj',
  'app.asar.unpacked/node_modules/better-sqlite3/build/Release/test_extension.node',
  'app.asar.unpacked/node_modules/better-sqlite3/deps',
  'app.asar.unpacked/node_modules/better-sqlite3/src',
]) {
  if (existsSync(join(resourcesRoot, buildOnlyResource))) {
    failures.push(`resources contains build-only dependency payload: ${buildOnlyResource}`);
  }
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`PASS Steam final artifact audit: ${basename(unpackedRoot)}`);
}
