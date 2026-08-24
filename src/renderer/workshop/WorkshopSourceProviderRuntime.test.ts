import { describe, expect, it } from 'vitest';
import {
  sanitizeWorkshopResolvedSource,
  sanitizeWorkshopSourceSearchRequest,
  sanitizeWorkshopSourceSearchResult,
} from './WorkshopSourceProviderRuntime';

describe('WorkshopSourceProviderRuntime', () => {
  it('bounds search inputs and strips unsupported result fields', () => {
    expect(sanitizeWorkshopSourceSearchRequest({ query: `  ${'x'.repeat(300)}  `, page: -2, pageSize: 999 })).toEqual({
      query: 'x'.repeat(240),
      page: 1,
      pageSize: 50,
    });
    expect(sanitizeWorkshopSourceSearchResult({
      tracks: [{
        providerTrackId: 'station-1',
        title: ' Community Radio ',
        artist: 'Host',
        path: 'C:\\private\\station.mp3',
        headers: { authorization: 'secret' },
      }],
      total: 1,
    })).toEqual({
      tracks: [{
        providerTrackId: 'station-1',
        title: 'Community Radio',
        artist: 'Host',
        album: null,
        durationSeconds: null,
        source: null,
        playable: true,
        unavailableReason: null,
      }],
      total: 1,
      hasMore: false,
    });
  });

  it('accepts only the direct playback handoff fields', () => {
    expect(sanitizeWorkshopResolvedSource({
      url: 'https://radio.example/live.mp3',
      title: 'Live',
      live: true,
      headers: { cookie: 'secret' },
      requiresProxy: true,
    })).toEqual({
      url: 'https://radio.example/live.mp3',
      title: 'Live',
      artist: null,
      album: null,
      live: true,
    });
  });
});
