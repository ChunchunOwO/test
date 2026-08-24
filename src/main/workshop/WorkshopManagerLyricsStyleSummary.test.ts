import { describe, expect, it } from 'vitest';
import type { WorkshopDataCatalogRecord } from './WorkshopDataContributionTypes';
import { buildWorkshopManagerLyricsStyleSummary } from './WorkshopManagerLyricsStyleSummary';

describe('WorkshopManagerLyricsStyleSummary', () => {
  it('exposes only the validated title, description and scene availability', () => {
    const record = {
      sourceId: 'steam',
      itemId: '123',
      contentId: 'echo.lyrics-theme',
      contentKind: 'lyrics-style',
      version: '1.0.0',
      manifestSha256: 'a'.repeat(64),
      entryPath: 'lyrics-scene.json',
      activatedAt: '2026-08-16T00:00:00.000Z',
      contribution: {
        type: 'echo-workshop-lyrics-style',
        schemaVersion: 1,
        id: 'echo.lyrics-theme',
        title: 'Lyrics Theme',
        description: 'A scene',
        scene: {
          schemaVersion: 1,
          background: 'theme',
          root: { id: 'root', type: 'group', children: [] },
        },
      },
    } satisfies WorkshopDataCatalogRecord;

    expect(buildWorkshopManagerLyricsStyleSummary(record)).toEqual({
      styleId: 'echo.lyrics-theme',
      title: 'Lyrics Theme',
      description: 'A scene',
      hasScene: true,
    });
  });
});
