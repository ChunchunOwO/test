import { lstat, readFile, realpath } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import type { ValidatedWorkshopContent } from './WorkshopContentValidator';

const maximumWorkshopDataEntryBytes = 256 * 1024;

const isStrictDescendant = (rootDirectory: string, candidate: string): boolean => {
  const relativePath = relative(rootDirectory, candidate);
  return Boolean(relativePath) && !relativePath.startsWith('..') && !isAbsolute(relativePath);
};

export const readWorkshopDataEntry = async (
  content: ValidatedWorkshopContent,
): Promise<unknown> => {
  const entryFile = content.files.find((file) =>
    file.path.toLowerCase() === content.manifest.content.entry.toLowerCase());
  if (!entryFile || entryFile.size > maximumWorkshopDataEntryBytes) {
    throw new Error('workshop_data_entry_size_invalid');
  }
  const rootDirectory = await realpath(content.rootDirectory);
  const entryPath = resolve(
    content.rootDirectory,
    ...content.manifest.content.entry.split('/'),
  );
  const status = await lstat(entryPath);
  const canonicalEntryPath = await realpath(entryPath);
  if (
    !status.isFile() ||
    status.isSymbolicLink() ||
    !isStrictDescendant(rootDirectory, canonicalEntryPath)
  ) {
    throw new Error('workshop_data_entry_path_invalid');
  }
  try {
    return JSON.parse(await readFile(join(entryPath), 'utf8')) as unknown;
  } catch {
    throw new Error('workshop_data_entry_json_invalid');
  }
};
