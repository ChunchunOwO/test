import { createHash } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { getLibraryService } from '../library/LibraryService';

const pendingWebpConversions = new Set<string>();

/**
 * Returns a file Direct2D/GDI+ can decode for the native taskbar host.
 * WebP conversion is deliberately lazy and cached: the floating player can
 * stay native while still showing the same library artwork as the full UI.
 */
export const resolveTaskbarCoverPath = (coverId: string | null | undefined): string => {
  if (!coverId) return '';

  try {
    const variants = ['large', 'album', 'thumb'] as const;
    let rawPath = '';
    for (const variant of variants) {
      const asset = getLibraryService().resolveCoverAsset(coverId, variant);
      if (asset?.filePath) {
        rawPath = asset.filePath;
        break;
      }
    }
    if (!rawPath || !rawPath.toLowerCase().endsWith('.webp')) return rawPath;

    const tempDir = join(tmpdir(), 'echo-taskbar-covers');
    const hash = createHash('md5').update(rawPath).digest('hex').slice(0, 16);
    const tempPngPath = join(tempDir, `${hash}-${basename(rawPath, '.webp')}.png`);
    if (existsSync(tempPngPath)) return tempPngPath;

    if (!pendingWebpConversions.has(tempPngPath)) {
      pendingWebpConversions.add(tempPngPath);
      try {
        if (!existsSync(tempDir)) mkdirSync(tempDir, { recursive: true });
        void import('sharp')
          .then((sharp) => sharp.default(rawPath).resize(128, 128, { fit: 'cover' }).png().toFile(tempPngPath))
          .catch(() => undefined)
          .finally(() => pendingWebpConversions.delete(tempPngPath));
      } catch {
        pendingWebpConversions.delete(tempPngPath);
      }
    }

    // The native host may be able to show it directly; the next low-rate
    // state refresh replaces this with the cached PNG once ready.
    return rawPath;
  } catch {
    return '';
  }
};
