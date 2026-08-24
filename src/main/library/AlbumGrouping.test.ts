import { describe, expect, it } from 'vitest';
import {
  assignStableAlbumIds,
  makeCoverBackedLooseAlbumKeys,
  mapPreviousAlbumsToNextIds,
} from './AlbumGrouping';

describe('AlbumGrouping', () => {
  it('requires matching cover evidence for loose cross-group merges', () => {
    const candidates = [
      { albumKey: 'a', title: 'Same Album', coverMatchKey: 'cover-a' },
      { albumKey: 'b', title: 'Same Album', coverMatchKey: 'cover-b' },
      { albumKey: 'c', title: 'Same Album', coverMatchKey: 'cover-a' },
      { albumKey: 'd', title: 'Same Album', coverMatchKey: null },
    ];
    const keys = makeCoverBackedLooseAlbumKeys(candidates, (candidate) => `new-${candidate.albumKey}`);

    expect(keys.get('c')).toBe(keys.get('a'));
    expect(keys.get('b')).not.toBe(keys.get('a'));
    expect(keys.get('d')).not.toBe(keys.get('a'));
  });

  it('reuses exact and overlapping album ids deterministically', () => {
    const previous = [
      { id: 'old-a', albumKey: 'same-key', trackIds: new Set(['1', '2']) },
      { id: 'old-b', albumKey: 'old-key', trackIds: new Set(['3']) },
    ];
    const next = [
      { albumKey: 'same-key', trackIds: new Set(['1', '2']) },
      { albumKey: 'new-key', trackIds: new Set(['3', '4']) },
    ];
    const ids = assignStableAlbumIds(next, previous, () => 'fresh');

    expect(ids.get('same-key')).toBe('old-a');
    expect(ids.get('new-key')).toBe('old-b');
  });

  it('maps one previous liked album to every resulting split that shares tracks', () => {
    const previous = [{ id: 'old', albumKey: 'old-key', trackIds: new Set(['1', '2']) }];
    const next = [
      { id: 'next-a', albumKey: 'a', trackIds: new Set(['1']) },
      { id: 'next-b', albumKey: 'b', trackIds: new Set(['2']) },
    ];

    expect(mapPreviousAlbumsToNextIds(previous, next).get('old')).toEqual(['next-a', 'next-b']);
  });
});
