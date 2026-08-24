import { createHash } from 'node:crypto';
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { unzipSync } from 'fflate';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = join(projectRoot, 'electron-app', 'tools', 'ffmpeg-manifest.json');

const fail = (message) => {
  console.error(`[prepare:win-ffmpeg] ${message}`);
  process.exit(1);
};

if (process.platform !== 'win32') {
  fail(`This script prepares Windows ffmpeg and must run on Windows. Current platform is ${process.platform}/${process.arch}.`);
}

if (!existsSync(manifestPath)) {
  fail(`Missing manifest at ${manifestPath}`);
}

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const sourceUrl = typeof manifest.sourceUrl === 'string' ? manifest.sourceUrl.trim() : '';
const mirrorPrefix = (process.env.ECHO_FFMPEG_MIRROR_PREFIX ?? 'https://gh-proxy.com/').trim();
const sourceUrls = [
  mirrorPrefix && sourceUrl.startsWith('https://github.com/') ? `${mirrorPrefix}${sourceUrl}` : null,
  sourceUrl,
].filter((url, index, urls) => url && urls.indexOf(url) === index);
const targetFfmpeg = resolve(projectRoot, String(manifest.artifact ?? ''));
const targetDir = dirname(targetFfmpeg);
const expectedHash = String(manifest.sha256 ?? '').toUpperCase();
const expectedArchiveHash = String(manifest.archiveSha256 ?? '').toUpperCase();
const developmentRootName = String(manifest.developmentRoot ?? '').trim();
const developmentCacheKey = String(manifest.developmentCacheKey ?? developmentRootName).trim();

if (!sourceUrl) {
  fail('Manifest sourceUrl is empty; cannot download Windows ffmpeg.');
}

if (!/^[A-F0-9]{64}$/u.test(expectedHash)) {
  fail(`Manifest SHA256 is not configured for ${targetFfmpeg}`);
}
if (!/^[A-F0-9]{64}$/u.test(expectedArchiveHash)) {
  fail(`Manifest archiveSha256 is not configured for ${sourceUrl}`);
}
if (!developmentRootName || /[\\/]/u.test(developmentRootName)) {
  fail('Manifest developmentRoot must be a single archive root directory name.');
}
if (!developmentCacheKey || /[\\/]/u.test(developmentCacheKey)) {
  fail('Manifest developmentCacheKey must be a single cache directory name.');
}

const hashFileSha256 = (filePath) => createHash('sha256').update(readFileSync(filePath)).digest('hex').toUpperCase();

if (existsSync(targetFfmpeg) && statSync(targetFfmpeg).isFile()) {
  const currentHash = hashFileSha256(targetFfmpeg);
  if (currentHash === expectedHash) {
    console.log(`[prepare:win-ffmpeg] Reusing ${targetFfmpeg} sha256=${currentHash}; refreshing pinned runtime dependencies.`);
  } else {
    console.warn(`[prepare:win-ffmpeg] replacing ${targetFfmpeg}; expected ${expectedHash}, got ${currentHash}`);
  }
}

const cacheRoot = process.env.ECHO_FFMPEG_CACHE_DIR
  ? resolve(projectRoot, process.env.ECHO_FFMPEG_CACHE_DIR)
  : join(projectRoot, '.electron-cache', 'ffmpeg');
const sourceName = new URL(sourceUrl).pathname.split('/').filter(Boolean).pop() || 'ffmpeg.zip';
const zipPath = join(cacheRoot, sourceName);

const downloadFile = async (url, destination) => {
  mkdirSync(dirname(destination), { recursive: true });
  const temporaryPath = `${destination}.tmp-${process.pid}`;
  rmSync(temporaryPath, { force: true });
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'ECHODev-build-prep',
      },
    });

    if (!response.ok || !response.body) {
      await response.body?.cancel();
      throw new Error(`Download failed for ${url}: HTTP ${response.status} ${response.statusText}`);
    }

    await pipeline(Readable.fromWeb(response.body), createWriteStream(temporaryPath));
    renameSync(temporaryPath, destination);
  } finally {
    rmSync(temporaryPath, { force: true });
  }
};

const downloadArchive = async () => {
  let lastError = null;
  for (const url of sourceUrls) {
    try {
      console.log(`[prepare:win-ffmpeg] downloading ${url}`);
      await downloadFile(url, zipPath);
      const archiveHash = hashFileSha256(zipPath);
      if (archiveHash !== expectedArchiveHash) {
        throw new Error(`Archive SHA256 mismatch for ${zipPath}; expected ${expectedArchiveHash}, got ${archiveHash}`);
      }
      unzipSync(readFileSync(zipPath));
      return;
    } catch (error) {
      lastError = error;
      rmSync(zipPath, { force: true });
      console.warn(`[prepare:win-ffmpeg] source failed, trying next: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  fail(`All download sources failed: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
};

const readZipEntries = async () => {
  if (!existsSync(zipPath) || statSync(zipPath).size === 0) {
    await downloadArchive();
  }

  try {
    const archiveHash = hashFileSha256(zipPath);
    if (archiveHash !== expectedArchiveHash) {
      console.warn(`[prepare:win-ffmpeg] cached archive hash differs; downloading again: expected ${expectedArchiveHash}, got ${archiveHash}`);
      rmSync(zipPath, { force: true });
      await downloadArchive();
    }
    return unzipSync(readFileSync(zipPath));
  } catch (error) {
    console.warn(`[prepare:win-ffmpeg] cached archive is invalid, downloading again: ${error instanceof Error ? error.message : String(error)}`);
    rmSync(zipPath, { force: true });
    await downloadArchive();
    return unzipSync(readFileSync(zipPath));
  }
};

const normalizeZipPath = (path) => path.replace(/\\/gu, '/');

const findToolEntry = (entries, fileName) => {
  const lowerFileName = fileName.toLowerCase();
  const candidates = Object.entries(entries).filter(([name]) => {
    const normalized = normalizeZipPath(name).toLowerCase();
    return normalized.endsWith(`/bin/${lowerFileName}`) || normalized.split('/').pop() === lowerFileName;
  });
  return candidates.sort(([left], [right]) => left.localeCompare(right))[0] ?? null;
};

const developmentRoot = join(cacheRoot, 'development', developmentCacheKey);
const writeDevelopmentRoot = (entries) => {
  const requiredDevelopmentFiles = [
    'include/libavcodec/avcodec.h',
    'lib/avcodec.lib',
    'bin/avcodec-62.dll',
  ];
  for (const [archivePath, content] of Object.entries(entries)) {
    const normalized = normalizeZipPath(archivePath);
    const prefix = `${developmentRootName}/`;
    if (!normalized.startsWith(prefix)) {
      continue;
    }
    if (normalized.endsWith('/')) {
      continue;
    }
    const relativePath = normalized.slice(prefix.length);
    if (!relativePath) {
      continue;
    }
    if (relativePath.split('/').some((segment) => segment === '..' || segment === '.')) {
      fail(`Unsafe development archive path: ${archivePath}`);
    }
    const destination = join(developmentRoot, ...relativePath.split('/'));
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, content);
  }

  if (!requiredDevelopmentFiles.every((relativePath) => existsSync(join(developmentRoot, relativePath)))) {
    fail(`Archive does not provide a complete FFmpeg shared development root: ${developmentRootName}`);
  }
};

const entries = await readZipEntries();
writeDevelopmentRoot(entries);
const ffmpegEntry = findToolEntry(entries, 'ffmpeg.exe');
if (!ffmpegEntry) {
  fail(`Archive does not contain ffmpeg.exe: ${zipPath}`);
}

mkdirSync(targetDir, { recursive: true });
writeFileSync(targetFfmpeg, ffmpegEntry[1]);

const actualHash = hashFileSha256(targetFfmpeg);
if (actualHash !== expectedHash) {
  rmSync(targetFfmpeg, { force: true });
  fail(`SHA256 mismatch for ${targetFfmpeg}; expected ${expectedHash}, got ${actualHash}`);
}

const ffprobeEntry = findToolEntry(entries, 'ffprobe.exe');
if (ffprobeEntry) {
  writeFileSync(join(targetDir, 'ffprobe.exe'), ffprobeEntry[1]);
}

for (const [archivePath, content] of Object.entries(entries)) {
  const normalized = normalizeZipPath(archivePath);
  if (normalized.startsWith(`${developmentRootName}/bin/`) && /\.dll$/iu.test(normalized)) {
    writeFileSync(join(targetDir, normalized.split('/').pop()), content);
  }
}

const licenseEntry = Object.entries(entries).find(([archivePath]) => normalizeZipPath(archivePath) === `${developmentRootName}/LICENSE.txt`);
if (!licenseEntry) {
  fail(`Archive does not contain ${developmentRootName}/LICENSE.txt`);
}
writeFileSync(join(targetDir, 'FFMPEG-LICENSE.txt'), licenseEntry[1]);

console.log(`[prepare:win-ffmpeg] Prepared ${targetFfmpeg} sha256=${actualHash}; development root=${developmentRoot}`);
