import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const notices = readFileSync(join(root, 'THIRD_PARTY_NOTICES.md'), 'utf8');
const packageJson = readFileSync(join(root, 'package.json'), 'utf8');
const ffmpegManifest = JSON.parse(readFileSync(join(root, 'electron-app', 'tools', 'ffmpeg-manifest.json'), 'utf8'));
const requiredComponents = ['Electron', 'FFmpeg', 'miniaudio', 'Steinberg ASIO SDK', 'OPRA', 'Outfit', 'Monocraft', 'TagLib-Wasm', 'Sharp', 'node-libraop', 'steamworks.js', 'Steamworks SDK'];
const missing = requiredComponents.filter((component) => !notices.includes(component));
const fontLicenses = [
  {
    path: 'licenses/fonts/Outfit-OFL-1.1.txt',
    copyright: 'Copyright 2021 The Outfit Project Authors (https://github.com/Outfitio/Outfit-Fonts)',
  },
  {
    path: 'licenses/fonts/Monocraft-OFL-1.1.txt',
    copyright: 'Copyright (c) 2022, Idrees Hassan (https://github.com/IdreesInc/Monocraft)',
  },
];

for (const fontLicense of fontLicenses) {
  const licensePath = join(root, ...fontLicense.path.split('/'));
  if (!existsSync(licensePath)) {
    missing.push(`missing ${fontLicense.path}`);
    continue;
  }
  const license = readFileSync(licensePath, 'utf8');
  if (
    !license.includes(fontLicense.copyright) ||
    !license.includes('SIL OPEN FONT LICENSE Version 1.1 - 26 February 2007') ||
    !license.includes('DEALINGS IN THE FONT SOFTWARE.')
  ) {
    missing.push(`incomplete ${fontLicense.path}`);
  }
  if (!notices.includes(fontLicense.path)) {
    missing.push(`${fontLicense.path} notice reference`);
  }
}

if (!packageJson.includes('"licenses/fonts/**"')) {
  missing.push('font license files must be included in the packaged app');
}

if (/electron-updater/iu.test(packageJson)) {
  missing.push('electron-updater must not be a production dependency');
}
if (ffmpegManifest.licenseFamily !== 'LGPL-3.0-or-later' || !String(ffmpegManifest.source ?? '').includes('BtbN')) {
  missing.push('FFmpeg must be pinned to the BtbN LGPL shared build');
}
if (!/^[A-F0-9]{64}$/iu.test(String(ffmpegManifest.sha256 ?? '')) || !/^[A-F0-9]{64}$/iu.test(String(ffmpegManifest.archiveSha256 ?? ''))) {
  missing.push('FFmpeg binary and archive SHA-256 pins');
}

if (missing.length > 0) {
  throw new Error(`Third-party notice inventory is incomplete: ${missing.join(', ')}`);
}

console.log(`PASS third-party notices cover ${requiredComponents.length} required shipped components and ${fontLicenses.length} bundled font licenses.`);
