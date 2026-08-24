import { describe, expect, it } from 'vitest';
import {
  albumCoverUrlFromCachedVariant,
  largeCoverUrlFromCachedVariant,
  localCoverBackgroundUrl,
  localCoverDisplayUrl,
  originalCoverUrlFromCachedVariant,
  playerCoverDisplayUrl,
  remoteCoverUrlAtSize,
} from './coverDisplayUrl';

describe('coverDisplayUrl', () => {
  it('uses the album-sized local variant for blurred artwork surfaces', () => {
    expect(albumCoverUrlFromCachedVariant('echo-cover://large/cover-1')).toBe(
      'echo-cover://album/cover-1',
    );
    expect(albumCoverUrlFromCachedVariant('https://example.test/cover.jpg')).toBeNull();
  });

  it('uses the static large variant for local renderer artwork', () => {
    expect(localCoverDisplayUrl('cover 1')).toBe('echo-cover://large/cover%201');
    expect(largeCoverUrlFromCachedVariant('echo-cover://original/cover%201')).toBe('echo-cover://large/cover%201');
    expect(largeCoverUrlFromCachedVariant('echo-cover://thumb/cover%201')).toBe('echo-cover://large/cover%201');
  });

  it('uses the renderer-safe original variant for full-window backgrounds', () => {
    expect(localCoverBackgroundUrl('cover 1')).toBe('echo-cover://original/cover%201');
    expect(originalCoverUrlFromCachedVariant('echo-cover://large/cover%201')).toBe('echo-cover://original/cover%201');
    expect(localCoverBackgroundUrl(null, 'echo-cover://thumb/cover%201')).toBe('echo-cover://original/cover%201');
  });

  it('does not rewrite remote or inline artwork as a local cover', () => {
    expect(localCoverDisplayUrl(null, 'https://example.com/cover.jpg')).toBeNull();
    expect(localCoverBackgroundUrl(null, 'https://example.com/cover.jpg')).toBeNull();
    expect(largeCoverUrlFromCachedVariant('data:image/png;base64,AAAA')).toBeNull();
  });

  it('upgrades the current Subsonic artwork without changing its cache identity', () => {
    const source = 'echo-image://subsonic-cover/track-1?size=160&cacheKey=album-1';
    expect(remoteCoverUrlAtSize(source, 512)).toBe(
      'echo-image://subsonic-cover/track-1?size=512&cacheKey=album-1',
    );
    expect(playerCoverDisplayUrl(null, source)).toBe(
      'echo-image://subsonic-cover/track-1?size=512&cacheKey=album-1',
    );
    expect(playerCoverDisplayUrl(null, 'https://example.com/cover.jpg')).toBe('https://example.com/cover.jpg');
  });
});
