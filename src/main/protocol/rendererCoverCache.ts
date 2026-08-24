import { existsSync } from 'node:fs';
import { mkdir, rename, rm } from 'node:fs/promises';
import { dirname, extname, join } from 'node:path';
import sharp from 'sharp';

const pendingConversions = new Map<string, Promise<string | null>>();
const rendererOriginalFileName = 'renderer-original-lossless.webp';

const isRasterCover = (filePath: string): boolean =>
  ['.jpg', '.jpeg', '.png', '.webp', '.avif', '.gif', '.tif', '.tiff'].includes(extname(filePath).toLocaleLowerCase());

const createRendererOriginal = async (originalPath: string, outputPath: string): Promise<string | null> => {
  const temporaryPath = `${outputPath}.${process.pid}.tmp`;
  try {
    await mkdir(dirname(outputPath), { recursive: true });
    await sharp(originalPath, {
      failOn: 'error',
      limitInputPixels: 100_000_000,
      sequentialRead: true,
    })
      .rotate()
      .webp({ lossless: true, effort: 4 })
      .toFile(temporaryPath);
    await rename(temporaryPath, outputPath).catch(async (error: unknown) => {
      if (!existsSync(outputPath)) {
        throw error;
      }
      await rm(temporaryPath, { force: true });
    });
    return outputPath;
  } catch {
    await rm(temporaryPath, { force: true }).catch(() => undefined);
    return null;
  }
};

export const resolveRendererOriginalCover = async (originalPath: string): Promise<string | null> => {
  if (!isRasterCover(originalPath) || !existsSync(originalPath)) {
    return null;
  }

  const outputPath = join(dirname(originalPath), rendererOriginalFileName);
  if (existsSync(outputPath)) {
    return outputPath;
  }

  const existing = pendingConversions.get(outputPath);
  if (existing) {
    return existing;
  }

  const conversion = createRendererOriginal(originalPath, outputPath).finally(() => {
    pendingConversions.delete(outputPath);
  });
  pendingConversions.set(outputPath, conversion);
  return conversion;
};
