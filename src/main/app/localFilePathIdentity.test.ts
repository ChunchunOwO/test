import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { normalizeLocalFilePathKey } from './localFilePathIdentity';

describe('local file path identity', () => {
  it('preserves case on macOS while keeping Windows path identity case-insensitive', () => {
    const mixedCase = join('Music', 'Album', 'Song.FLAC');
    expect(normalizeLocalFilePathKey(mixedCase, 'darwin')).toBe(resolve(mixedCase));
    expect(normalizeLocalFilePathKey(mixedCase, 'win32')).toBe(resolve(mixedCase).toLocaleLowerCase());
  });
});
