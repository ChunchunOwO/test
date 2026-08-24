import { describe, expect, it } from 'vitest';
import { resolveRetainedRouteLru } from './retainedRouteLru';

const persistentRouteIds = new Set(['songs', 'albums', 'artists', 'playlists', 'lyrics']);

describe('resolveRetainedRouteLru', () => {
  it('keeps only the active route and the most recently used persistent route', () => {
    expect(resolveRetainedRouteLru({
      activeRouteId: 'artists',
      current: ['songs', 'albums'],
      maxMountedRoutes: 2,
      persistentRouteIds,
    })).toEqual(['albums', 'artists']);
  });

  it('preserves a transient lyrics source without exceeding two mounted routes', () => {
    expect(resolveRetainedRouteLru({
      activeRouteId: 'lyrics',
      current: ['songs', 'folders'],
      maxMountedRoutes: 2,
      persistentRouteIds,
      preservedRouteId: 'folders',
    })).toEqual(['folders', 'lyrics']);
  });

  it('reserves one slot for a non-persistent active route', () => {
    expect(resolveRetainedRouteLru({
      activeRouteId: 'settings',
      current: ['songs', 'albums'],
      maxMountedRoutes: 2,
      persistentRouteIds,
    })).toEqual(['albums']);
  });

  it('releases every retained route when a low-spec transient route owns the only slot', () => {
    expect(resolveRetainedRouteLru({
      activeRouteId: 'home',
      current: ['songs'],
      maxMountedRoutes: 1,
      persistentRouteIds,
    })).toEqual([]);
  });
});
