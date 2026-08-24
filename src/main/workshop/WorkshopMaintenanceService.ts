import { randomUUID } from 'node:crypto';
import { readdir, rm, stat } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';
import type {
  WorkshopMaintenanceCandidate,
  WorkshopMaintenanceCleanupResult,
  WorkshopMaintenancePreview,
} from '../../shared/types/workshop';
import type { WorkshopRegistry } from './WorkshopRegistry';
import { WorkshopInstallLayout } from './WorkshopInstallLayout';

type WorkshopMaintenanceRegistryPort = Pick<WorkshopRegistry, 'getSnapshot'>;

type StoredPreview = WorkshopMaintenancePreview & { paths: Map<string, string> };

const previewLifetimeMs = 10 * 60 * 1_000;
const staleStagingAgeMs = 24 * 60 * 60 * 1_000;

const isStrictDescendant = (root: string, candidate: string): boolean => {
  const value = relative(root, candidate);
  return Boolean(value) && !value.startsWith('..') && !isAbsolute(value);
};

const directoryBytes = async (directory: string): Promise<number> => {
  let total = 0;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) total += await directoryBytes(path);
    else if (entry.isFile()) total += (await stat(path)).size;
  }
  return total;
};

const findRevisionDirectories = async (root: string, depth = 0): Promise<string[]> => {
  if (depth > 5) return [];
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }
  if (entries.some((entry) => entry.isFile() && entry.name === 'echo.workshop.json')) return [root];
  const nested = await Promise.all(entries
    .filter((entry) => entry.isDirectory() && !entry.isSymbolicLink())
    .map((entry) => findRevisionDirectories(resolve(root, entry.name), depth + 1)));
  return nested.flat();
};

export class WorkshopMaintenanceService {
  private readonly layout: WorkshopInstallLayout;
  private preview: StoredPreview | null = null;

  constructor(
    private readonly registry: WorkshopMaintenanceRegistryPort,
    options: { rootDirectory?: string; now?: () => Date } = {},
  ) {
    this.layout = new WorkshopInstallLayout({ rootDirectory: options.rootDirectory });
    this.now = options.now ?? (() => new Date());
  }

  private readonly now: () => Date;

  async previewCleanup(): Promise<WorkshopMaintenancePreview> {
    const referenced = new Set(this.registry.getSnapshot().records.flatMap((record) =>
      [record.candidateRevision, record.activeRevision, record.lastKnownGoodRevision]
        .flatMap((revision) => revision ? [resolve(revision.directory)] : [])));
    const candidates: WorkshopMaintenanceCandidate[] = [];
    const paths = new Map<string, string>();
    for (const directory of await findRevisionDirectories(this.layout.installedRootDirectory)) {
      const resolved = resolve(directory);
      if (!isStrictDescendant(this.layout.installedRootDirectory, resolved) || referenced.has(resolved)) continue;
      const relativePath = relative(this.layout.rootDirectory, resolved).replaceAll('\\', '/');
      const metadata = await stat(resolved);
      const candidate: WorkshopMaintenanceCandidate = {
        relativePath,
        kind: 'revision',
        bytes: await directoryBytes(resolved),
        modifiedAt: metadata.mtime.toISOString(),
      };
      candidates.push(candidate);
      paths.set(relativePath, resolved);
    }
    let stagingEntries: Array<{
      name: string;
      isDirectory: () => boolean;
      isSymbolicLink: () => boolean;
    }> = [];
    try {
      stagingEntries = await readdir(this.layout.stagingRootDirectory, { withFileTypes: true });
    } catch {
      stagingEntries = [];
    }
    const nowMs = this.now().getTime();
    for (const entry of stagingEntries) {
      if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
      const resolved = resolve(this.layout.stagingRootDirectory, entry.name);
      if (!isStrictDescendant(this.layout.stagingRootDirectory, resolved)) continue;
      const metadata = await stat(resolved);
      if (nowMs - metadata.mtimeMs < staleStagingAgeMs) continue;
      const relativePath = relative(this.layout.rootDirectory, resolved).replaceAll('\\', '/');
      candidates.push({
        relativePath,
        kind: 'staging',
        bytes: await directoryBytes(resolved),
        modifiedAt: metadata.mtime.toISOString(),
      });
      paths.set(relativePath, resolved);
    }
    candidates.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
    const createdAt = this.now();
    this.preview = {
      token: randomUUID(),
      createdAt: createdAt.toISOString(),
      expiresAt: new Date(createdAt.getTime() + previewLifetimeMs).toISOString(),
      candidates,
      totalBytes: candidates.reduce((total, candidate) => total + candidate.bytes, 0),
      paths,
    };
    const { paths: _paths, ...publicPreview } = this.preview;
    return publicPreview;
  }

  async cleanup(token: string): Promise<WorkshopMaintenanceCleanupResult> {
    const preview = this.preview;
    this.preview = null;
    if (!preview || token !== preview.token || this.now().getTime() > Date.parse(preview.expiresAt)) {
      throw new Error('workshop_cleanup_preview_expired');
    }
    let removed = 0;
    let reclaimedBytes = 0;
    const failed: string[] = [];
    for (const candidate of preview.candidates) {
      const path = preview.paths.get(candidate.relativePath);
      if (!path) continue;
      try {
        await rm(path, { recursive: true, force: true });
        removed += 1;
        reclaimedBytes += candidate.bytes;
      } catch {
        failed.push(candidate.relativePath);
      }
    }
    return { removed, reclaimedBytes, failed };
  }
}
