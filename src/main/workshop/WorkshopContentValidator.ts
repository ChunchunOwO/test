import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, readFile, readdir } from 'node:fs/promises';
import { extname, relative, resolve, sep } from 'node:path';
import {
  workshopManifestFileName,
  type WorkshopItemManifest,
  type WorkshopManifestFile,
} from '../../shared/types/workshop';
import {
  defaultWorkshopManifestPolicy,
  normalizeWorkshopItemManifest,
  type WorkshopManifestPolicy,
} from './WorkshopManifest';
import {
  isWorkshopRasterAssetPath,
  maxWorkshopRasterAssetBytes,
  maxWorkshopRasterAssets,
  maxWorkshopUiRuntimeFileBytes,
  workshopUiRuntimeExtensions,
} from './WorkshopAssetPolicy';

const maxManifestBytes = 128 * 1024;

export const blockedWorkshopFileExtensions = new Set([
  '.bat',
  '.cmd',
  '.com',
  '.clap',
  '.dll',
  '.dylib',
  '.exe',
  '.jar',
  '.msi',
  '.node',
  '.ps1',
  '.scr',
  '.so',
  '.sys',
  '.vbs',
  '.vst3',
]);

export type ValidatedWorkshopContent = {
  rootDirectory: string;
  manifest: WorkshopItemManifest;
  files: WorkshopManifestFile[];
  totalBytes: number;
};

const toManifestPath = (rootDirectory: string, absolutePath: string): string =>
  relative(rootDirectory, absolutePath).split(sep).join('/');

const sha256File = async (path: string): Promise<string> => {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) {
    hash.update(chunk as Buffer);
  }
  return hash.digest('hex');
};

const collectRegularFiles = async (
  rootDirectory: string,
  directory: string,
  maximumFiles: number,
  result: Map<string, string>,
): Promise<void> => {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const absolutePath = resolve(directory, entry.name);
    const manifestPath = toManifestPath(rootDirectory, absolutePath);
    if (!manifestPath || manifestPath.startsWith('../') || manifestPath === '..') {
      throw new Error('workshop_content_path_escape');
    }
    if (entry.isSymbolicLink()) {
      throw new Error('workshop_content_symlink_forbidden');
    }
    if (entry.isDirectory()) {
      await collectRegularFiles(rootDirectory, absolutePath, maximumFiles, result);
      continue;
    }
    if (!entry.isFile()) {
      throw new Error('workshop_content_special_file_forbidden');
    }
    if (result.size >= maximumFiles) {
      throw new Error('workshop_content_file_limit_exceeded');
    }
    const normalizedKey = manifestPath.toLowerCase();
    if (result.has(normalizedKey)) {
      throw new Error('workshop_content_case_collision');
    }
    result.set(normalizedKey, absolutePath);
  }
};

export const validateWorkshopContentDirectory = async (
  inputDirectory: string,
  policy: WorkshopManifestPolicy = defaultWorkshopManifestPolicy,
): Promise<ValidatedWorkshopContent> => {
  const rootDirectory = resolve(inputDirectory);
  const rootStatus = await lstat(rootDirectory);
  if (!rootStatus.isDirectory() || rootStatus.isSymbolicLink()) {
    throw new Error('workshop_content_root_invalid');
  }

  const manifestPath = resolve(rootDirectory, workshopManifestFileName);
  const manifestStatus = await lstat(manifestPath);
  if (!manifestStatus.isFile() || manifestStatus.isSymbolicLink() || manifestStatus.size > maxManifestBytes) {
    throw new Error('workshop_content_manifest_invalid');
  }

  let manifestInput: unknown;
  try {
    manifestInput = JSON.parse(await readFile(manifestPath, 'utf8')) as unknown;
  } catch {
    throw new Error('workshop_content_manifest_invalid');
  }
  const manifest = normalizeWorkshopItemManifest(manifestInput, policy);

  const actualFiles = new Map<string, string>();
  await collectRegularFiles(rootDirectory, rootDirectory, policy.maxFiles + 1, actualFiles);
  const expectedPaths = new Set([
    workshopManifestFileName.toLowerCase(),
    ...manifest.files.map((file) => file.path.toLowerCase()),
  ]);
  for (const actualPath of actualFiles.keys()) {
    if (!expectedPaths.has(actualPath)) {
      throw new Error(`workshop_content_undeclared_file:${actualPath}`);
    }
  }
  if (actualFiles.size !== expectedPaths.size) {
    throw new Error('workshop_content_declared_file_missing');
  }

  for (const file of manifest.files) {
    if (extname(file.path).toLowerCase() === '.svg') {
      throw new Error(`workshop_content_svg_forbidden:${file.path}`);
    }
    if (blockedWorkshopFileExtensions.has(extname(file.path).toLowerCase())) {
      throw new Error(`workshop_content_executable_forbidden:${file.path}`);
    }
    const absolutePath = actualFiles.get(file.path.toLowerCase());
    if (!absolutePath) {
      throw new Error(`workshop_content_declared_file_missing:${file.path}`);
    }
    const status = await lstat(absolutePath);
    if (!status.isFile() || status.isSymbolicLink() || status.size !== file.size) {
      throw new Error(`workshop_content_file_size_mismatch:${file.path}`);
    }
    if (await sha256File(absolutePath) !== file.sha256) {
      throw new Error(`workshop_content_checksum_mismatch:${file.path}`);
    }
  }

  const rasterAssets = manifest.files.filter((file) => isWorkshopRasterAssetPath(file.path));
  if (rasterAssets.length > maxWorkshopRasterAssets) {
    throw new Error('workshop_content_raster_asset_limit_exceeded');
  }
  if (rasterAssets.some((file) => file.size > maxWorkshopRasterAssetBytes)) {
    throw new Error('workshop_content_raster_asset_too_large');
  }
  if (
    manifest.content.kind === 'theme' &&
    manifest.files.some((file) =>
      workshopUiRuntimeExtensions.has(extname(file.path).toLowerCase()) &&
      !isWorkshopRasterAssetPath(file.path) &&
      file.size > maxWorkshopUiRuntimeFileBytes)
  ) {
    throw new Error('workshop_content_ui_runtime_asset_too_large');
  }

  return {
    rootDirectory,
    manifest,
    files: manifest.files,
    totalBytes: manifest.files.reduce((total, file) => total + file.size, 0),
  };
};
