import { describe, expect, it, vi } from 'vitest';
import {
  getWorkshopLyricsProvidersSnapshot,
  publishWorkshopLyricsProviders,
  searchWorkshopLyricsProvider,
} from './WorkshopLyricsProviderRegistry';

describe('WorkshopLyricsProviderRegistry', () => {
  it('publishes only ready providers and routes a sanitized track request to the host invoker', async () => {
    const provider = {
      key: 'steam:1:plugin:1.0.0:lyrics',
      sourceId: 'steam',
      itemId: '1',
      pluginId: 'plugin',
      pluginName: 'Plugin',
      id: 'lyrics',
      title: 'Lyrics',
      description: null,
      ready: true,
    };
    const invoke = vi.fn(async () => [{ id: 'one', title: 'Song', lrc: '[00:00.00]Hello' }]);
    const dispose = publishWorkshopLyricsProviders([provider], invoke);

    expect(getWorkshopLyricsProvidersSnapshot()).toEqual([provider]);
    await expect(searchWorkshopLyricsProvider(provider.key, {
      track: { id: 'track-1', title: 'Song', artist: 'Artist', album: null, durationSeconds: 120 },
    })).resolves.toEqual([{ id: 'one', title: 'Song', lrc: '[00:00.00]Hello' }]);
    expect(invoke).toHaveBeenCalledWith(provider, expect.objectContaining({
      track: expect.not.objectContaining({ path: expect.anything() }),
    }));

    dispose();
    expect(getWorkshopLyricsProvidersSnapshot()).toEqual([]);
  });
});
