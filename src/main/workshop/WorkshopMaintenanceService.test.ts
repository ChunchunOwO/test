import { mkdir, mkdtemp, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WorkshopMaintenanceService } from './WorkshopMaintenanceService';

let root = '';

beforeEach(async () => { root = await mkdtemp(join(tmpdir(), 'echo-workshop-maintenance-')); });
afterEach(async () => { await rm(root, { recursive: true, force: true }); });

describe('WorkshopMaintenanceService', () => {
  it('previews and removes only unreferenced revisions and stale staging directories', async () => {
    const referenced = join(root, 'installed', 'item-a', 'content', '1.0.0', 'a');
    const orphan = join(root, 'installed', 'item-a', 'content', '2.0.0', 'b');
    const staging = join(root, 'staging', 'old.tmp');
    for (const directory of [referenced, orphan, staging]) await mkdir(directory, { recursive: true });
    await writeFile(join(referenced, 'echo.workshop.json'), '{}');
    await writeFile(join(orphan, 'echo.workshop.json'), '{}');
    await writeFile(join(staging, 'file.tmp'), 'old');
    const old = new Date('2026-08-01T00:00:00.000Z');
    await utimes(staging, old, old);
    const registry = { getSnapshot: () => ({ records: [{
      candidateRevision: { directory: referenced }, activeRevision: null, lastKnownGoodRevision: null,
    }] }) } as never;
    const service = new WorkshopMaintenanceService(registry, {
      rootDirectory: root,
      now: () => new Date('2026-08-17T00:00:00.000Z'),
    });
    const preview = await service.previewCleanup();
    expect(preview.candidates.map((candidate) => candidate.kind).sort()).toEqual(['revision', 'staging']);
    const result = await service.cleanup(preview.token);
    expect(result).toMatchObject({ removed: 2, failed: [] });
    const next = await service.previewCleanup();
    expect(next.candidates).toEqual([]);
  });

  it('requires the exact unexpired preview token', async () => {
    const service = new WorkshopMaintenanceService({ getSnapshot: () => ({ records: [] }) } as never, { rootDirectory: root });
    await service.previewCleanup();
    await expect(service.cleanup('wrong-token')).rejects.toThrow('workshop_cleanup_preview_expired');
  });
});
