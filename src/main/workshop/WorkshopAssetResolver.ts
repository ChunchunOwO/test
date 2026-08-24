import { lstat, readFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';
import { normalizeWorkshopRelativePath } from './WorkshopManifest';
import {
  detectWorkshopRasterAssetMime,
  detectWorkshopUiRuntimeMime,
  isWorkshopRasterAssetPath,
  maxWorkshopRasterAssetBytes,
  maxWorkshopUiRuntimeFileBytes,
  type WorkshopUiRuntimeMimeType,
} from './WorkshopAssetPolicy';
import type { WorkshopRegistry } from './WorkshopRegistry';

type WorkshopAssetRegistryPort = Pick<WorkshopRegistry, 'get'>;

const isStrictDescendant = (rootDirectory: string, candidate: string): boolean => {
  const relativePath = relative(rootDirectory, candidate);
  return Boolean(relativePath) && !relativePath.startsWith('..') && !isAbsolute(relativePath);
};

export class WorkshopAssetResolver {
  constructor(private readonly registry: WorkshopAssetRegistryPort) {}

  async resolve(
    sourceId: string,
    itemId: string,
    assetPathInput: string,
  ): Promise<{ filePath: string; mimeType: 'image/png' | 'image/jpeg' | 'image/webp' } | null> {
    const record = this.registry.get(sourceId, itemId);
    const directory = record?.activeRevision?.directory;
    if (!record || record.state !== 'enabled' || !directory) {
      return null;
    }
    let assetPath: string;
    try {
      assetPath = normalizeWorkshopRelativePath(assetPathInput, 'asset_path');
    } catch {
      return null;
    }
    if (!isWorkshopRasterAssetPath(assetPath)) {
      return null;
    }
    const filePath = resolve(directory, assetPath);
    if (!isStrictDescendant(directory, filePath)) {
      return null;
    }
    try {
      const bytes = await readFile(filePath);
      if (bytes.byteLength > maxWorkshopRasterAssetBytes) {
        return null;
      }
      const mimeType = detectWorkshopRasterAssetMime(bytes);
      if (!mimeType) {
        return null;
      }
      return { filePath, mimeType };
    } catch {
      return null;
    }
  }

  async resolveUiRuntime(
    sourceId: string,
    itemId: string,
    assetPathInput: string,
  ): Promise<{ filePath: string; mimeType: WorkshopUiRuntimeMimeType } | null> {
    const record = this.registry.get(sourceId, itemId);
    const directory = record?.activeRevision?.directory;
    if (
      !record || record.state !== 'enabled' || !directory ||
      record.activeRevision?.contentKind !== 'theme'
    ) {
      return null;
    }
    let assetPath: string;
    try {
      assetPath = normalizeWorkshopRelativePath(assetPathInput, 'theme_runtime_asset_path');
    } catch {
      return null;
    }
    const filePath = resolve(directory, assetPath);
    if (!isStrictDescendant(directory, filePath)) {
      return null;
    }
    try {
      const status = await lstat(filePath);
      if (!status.isFile() || status.isSymbolicLink() || status.size > maxWorkshopUiRuntimeFileBytes) {
        return null;
      }
      if (isWorkshopRasterAssetPath(assetPath)) {
        const bytes = await readFile(filePath);
        const mimeType = detectWorkshopRasterAssetMime(bytes);
        return mimeType ? { filePath, mimeType } : null;
      }
      const mimeType = detectWorkshopUiRuntimeMime(assetPath);
      return mimeType ? { filePath, mimeType } : null;
    } catch {
      return null;
    }
  }
}

let boundResolver: WorkshopAssetResolver | null = null;

export const bindWorkshopAssetResolver = (resolver: WorkshopAssetResolver): void => {
  boundResolver = resolver;
};

export const getWorkshopAssetResolver = (): WorkshopAssetResolver | null => boundResolver;
