import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LocalWorkshopSource } from './LocalWorkshopSource';
import type { WorkshopSource } from './WorkshopSource';

describe('LocalWorkshopSource', () => {
  it('implements the same source contract without requiring Steam', () => {
    const directory = join(process.cwd(), '.fixtures', 'workshop', '123');
    const source: WorkshopSource = new LocalWorkshopSource([{
      itemId: '123',
      directory,
      sizeOnDiskBytes: '2048',
      installedAtUnixSeconds: 1_786_000_000,
    }]);

    expect(source.sourceId).toBe('local');
    expect(source.listSubscribed()).toMatchObject({
      available: true,
      items: [{ itemId: '123', subscribed: true, installed: true }],
    });
    expect(source.requestDownload('123')).toEqual({ ok: true, state: 'already-current' });
    expect(source.getInstallLocation('123')).toEqual({
      ok: true,
      itemId: '123',
      directory,
      sizeOnDiskBytes: '2048',
      installedAtUnixSeconds: 1_786_000_000,
    });
  });

  it('rejects ambiguous fixtures and unknown items fail closed', () => {
    const item = {
      itemId: '123',
      directory: process.cwd(),
      sizeOnDiskBytes: '0',
      installedAtUnixSeconds: 0,
    };
    expect(() => new LocalWorkshopSource([item, item])).toThrow('local_workshop_item_duplicate');
    expect(() => new LocalWorkshopSource([{ ...item, directory: '' }])).toThrow('local_workshop_item_invalid');

    const source = new LocalWorkshopSource([]);
    expect(source.requestDownload('456')).toEqual({ ok: false, reason: 'not-subscribed' });
    expect(source.getInstallLocation('../456')).toEqual({ ok: false, reason: 'invalid-item-id' });
  });
});
