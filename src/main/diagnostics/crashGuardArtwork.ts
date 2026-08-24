import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const moduleDir = dirname(fileURLToPath(import.meta.url));

const crashGuardArtworkFiles = {
  character: 'yokko-result-standing-trimmed.png',
  backdrop: 'crash-guard-medical-station-background.png',
  decoration: 'crash-guard-medical-stickers.png',
} as const;

export type CrashGuardArtworkDataUrls = {
  backdropUrl: string;
  characterUrl: string;
  decorationUrl: string;
};

const artworkSearchDirs = (): string[] => [
  join(process.cwd(), 'src/renderer/assets'),
  join(moduleDir, '../../renderer/assets'),
  join(moduleDir, '../renderer/assets'),
  join(moduleDir, '../../../src/renderer/assets'),
];

const findArtworkFile = (fileName: string): string | null => {
  const stem = fileName.replace(/\.png$/iu, '');
  for (const directory of artworkSearchDirs()) {
    const exactPath = join(directory, fileName);
    if (existsSync(exactPath)) {
      return exactPath;
    }
    if (!existsSync(directory)) {
      continue;
    }
    const hashedName = readdirSync(directory).find(
      (entry) => entry.startsWith(`${stem}-`) && entry.endsWith('.png'),
    );
    if (hashedName) {
      return join(directory, hashedName);
    }
  }
  return null;
};

const toPngDataUrl = (fileName: string): string => {
  const filePath = findArtworkFile(fileName);
  if (!filePath) {
    return '';
  }
  return `data:image/png;base64,${readFileSync(filePath).toString('base64')}`;
};

let cachedArtwork: CrashGuardArtworkDataUrls | null = null;

export const loadCrashGuardArtworkDataUrls = (): CrashGuardArtworkDataUrls => {
  if (cachedArtwork) {
    return cachedArtwork;
  }

  cachedArtwork = {
    characterUrl: toPngDataUrl(crashGuardArtworkFiles.character),
    backdropUrl: toPngDataUrl(crashGuardArtworkFiles.backdrop),
    decorationUrl: toPngDataUrl(crashGuardArtworkFiles.decoration),
  };
  return cachedArtwork;
};

export const resetCrashGuardArtworkCacheForTests = (): void => {
  cachedArtwork = null;
};
