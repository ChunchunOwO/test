import { resolve } from 'node:path';

/** Preserve case on case-sensitive platforms; only Windows path identity is
 * intentionally case-insensitive. */
export const normalizeLocalFilePathKey = (
  filePath: string,
  platform: NodeJS.Platform | string = process.platform,
): string => {
  const resolved = resolve(filePath);
  return platform === 'win32' ? resolved.toLocaleLowerCase() : resolved;
};
