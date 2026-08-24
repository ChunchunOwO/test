import { extname } from 'node:path';
import { normalizeWorkshopRelativePath } from './WorkshopManifest';

export const workshopRasterAssetExtensions = new Set(['.png', '.jpg', '.jpeg', '.webp']);
export const workshopUiRuntimeExtensions = new Set([
  '.html',
  '.css',
  '.js',
  '.mjs',
  '.json',
  '.woff',
  '.woff2',
  ...workshopRasterAssetExtensions,
]);
export const maxWorkshopRasterAssets = 16;
export const maxWorkshopRasterAssetBytes = 2 * 1024 * 1024;
export const maxWorkshopUiRuntimeFileBytes = 4 * 1024 * 1024;

export type WorkshopUiRuntimeMimeType =
  | 'text/html; charset=utf-8'
  | 'text/css; charset=utf-8'
  | 'text/javascript; charset=utf-8'
  | 'application/json; charset=utf-8'
  | 'font/woff'
  | 'font/woff2'
  | 'image/png'
  | 'image/jpeg'
  | 'image/webp';

const pngMagic = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const jpegMagic = Buffer.from([0xff, 0xd8, 0xff]);
const webpMagic = Buffer.from('WEBP', 'ascii');
const riffMagic = Buffer.from('RIFF', 'ascii');

export const isWorkshopRasterAssetPath = (path: string): boolean =>
  workshopRasterAssetExtensions.has(extname(path).toLowerCase());

export const detectWorkshopUiRuntimeMime = (path: string): WorkshopUiRuntimeMimeType | null => {
  switch (extname(path).toLowerCase()) {
    case '.html': return 'text/html; charset=utf-8';
    case '.css': return 'text/css; charset=utf-8';
    case '.js':
    case '.mjs': return 'text/javascript; charset=utf-8';
    case '.json': return 'application/json; charset=utf-8';
    case '.woff': return 'font/woff';
    case '.woff2': return 'font/woff2';
    default: return null;
  }
};

export const normalizeWorkshopAssetPath = (value: unknown, field: string): string => {
  const path = normalizeWorkshopRelativePath(value, field);
  if (!isWorkshopRasterAssetPath(path)) {
    throw new Error(`workshop_data_${field}_invalid`);
  }
  return path;
};

export const detectWorkshopRasterAssetMime = (bytes: Buffer): 'image/png' | 'image/jpeg' | 'image/webp' | null => {
  if (bytes.length >= pngMagic.length && bytes.subarray(0, pngMagic.length).equals(pngMagic)) {
    return 'image/png';
  }
  if (bytes.length >= jpegMagic.length && bytes.subarray(0, jpegMagic.length).equals(jpegMagic)) {
    return 'image/jpeg';
  }
  if (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).equals(riffMagic) &&
    bytes.subarray(8, 12).equals(webpMagic)
  ) {
    return 'image/webp';
  }
  return null;
};

export const buildWorkshopAssetUrl = (sourceId: string, itemId: string, assetPath: string): string => {
  const url = new URL('echo-workshop://asset/');
  url.searchParams.set('source', sourceId);
  url.searchParams.set('item', itemId);
  url.searchParams.set('path', assetPath);
  return url.toString();
};

export const buildWorkshopUiRuntimeUrl = (sourceId: string, itemId: string, assetPath: string): string => {
  const safePath = normalizeWorkshopRelativePath(assetPath, 'theme_runtime_entry');
  const segments = [sourceId, itemId, ...safePath.split('/')].map(encodeURIComponent);
  return `echo-workshop://ui/${segments.join('/')}`;
};
