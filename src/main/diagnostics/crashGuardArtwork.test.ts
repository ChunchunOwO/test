import { describe, expect, it } from 'vitest';
import { loadCrashGuardArtworkDataUrls, resetCrashGuardArtworkCacheForTests } from './crashGuardArtwork';

describe('crashGuardArtwork', () => {
  it('loads the nurse-rabbit crash artwork as data URLs', () => {
    resetCrashGuardArtworkCacheForTests();
    const artwork = loadCrashGuardArtworkDataUrls();
    expect(artwork.characterUrl.startsWith('data:image/png;base64,')).toBe(true);
    expect(artwork.backdropUrl.startsWith('data:image/png;base64,')).toBe(true);
    expect(artwork.decorationUrl.startsWith('data:image/png;base64,')).toBe(true);
    expect(artwork.characterUrl.length).toBeGreaterThan(1000);
    expect(artwork.backdropUrl.length).toBeGreaterThan(1000);
    expect(artwork.decorationUrl.length).toBeGreaterThan(1000);
  });
});
