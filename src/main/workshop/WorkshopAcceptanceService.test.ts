import { describe, expect, it, vi } from 'vitest';
import type { WorkshopManagerSnapshot } from '../../shared/types/workshop';
import { WorkshopAcceptanceService } from './WorkshopAcceptanceService';

const item = {
  sourceId: 'steam',
  itemId: '123',
  state: 'enabled' as const,
  contentId: 'echo.acceptance',
  contentKind: 'theme' as const,
  version: '1.0.0',
  previousVersion: null,
  enabled: true,
  catalogReady: true,
  errorCode: null,
  subscription: {
    itemId: '123', subscribed: true, installed: true, needsUpdate: false,
    downloading: false, downloadPending: false, locallyDisabled: false,
    install: { sizeOnDiskBytes: '1', installedAtUnixSeconds: 1 }, download: null, error: null,
  },
  theme: null,
  lyricsStyle: null,
  audioPluginProfile: null,
};

const snapshot = (items = [item]): WorkshopManagerSnapshot => ({
  source: { available: true, items: items.map((entry) => entry.subscription!) },
  registry: { writable: true, error: null, revision: 1 },
  catalog: { writable: true, error: null, revision: 1 },
  reconcile: { state: 'ready', lastReport: null },
  items,
});

describe('WorkshopAcceptanceService', () => {
  it('runs the installed ordinary-user path without removing a pre-existing subscription', async () => {
    const manager = {
      getSnapshot: vi.fn(() => snapshot()),
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
      disable: vi.fn(),
      use: vi.fn(async () => ({ ok: true, action: 'use', reason: null, snapshot: snapshot() })),
    };
    const service = new WorkshopAcceptanceService(manager as never, () => new Date('2026-08-17T00:00:00.000Z'));

    const result = await service.run({ itemId: '123', cleanupSubscription: true });

    expect(result.ok).toBe(true);
    expect(result.steps.map((step) => step.id)).toEqual(['source', 'subscribe', 'download', 'ingest-enable', 'verify']);
    expect(manager.subscribe).not.toHaveBeenCalled();
    expect(manager.unsubscribe).not.toHaveBeenCalled();
  });
});
