import { describe, expect, it } from 'vitest';
import {
  createLyricsBackgroundModeSelectionPatch,
  resolveLyricsBackgroundPolicy,
} from './lyricsBackgroundPolicy';

describe('resolveLyricsBackgroundPolicy', () => {
  it('keeps each lyrics style original background by default', () => {
    expect(resolveLyricsBackgroundPolicy({
      immersiveCoverStyleEnabled: false,
      pageStyle: 'roseVinyl',
      savedMode: 'theme',
      userOverrideEnabled: false,
    })).toEqual({ layoutMode: 'cover', sourceMode: 'cover' });

    expect(resolveLyricsBackgroundPolicy({
      immersiveCoverStyleEnabled: false,
      pageStyle: 'editorial',
      savedMode: 'coverColor',
      userOverrideEnabled: false,
    })).toEqual({ layoutMode: 'theme', sourceMode: 'theme' });
  });

  it('keeps the style layout while applying an explicit user background source', () => {
    expect(resolveLyricsBackgroundPolicy({
      immersiveCoverStyleEnabled: false,
      pageStyle: 'cinemaStage',
      savedMode: 'customWallpaper',
      userOverrideEnabled: true,
    })).toEqual({ layoutMode: 'cover', sourceMode: 'customWallpaper' });
  });

  it('allows a user choice to override an immersive cover background', () => {
    expect(resolveLyricsBackgroundPolicy({
      immersiveCoverStyleEnabled: true,
      pageStyle: 'default',
      savedMode: 'theme',
      userOverrideEnabled: true,
    })).toEqual({ layoutMode: 'cover', sourceMode: 'theme' });
  });

  it('marks explicit selections as overrides and default as style-owned', () => {
    expect(createLyricsBackgroundModeSelectionPatch('coverColor')).toEqual({
      lyricsBackgroundMode: 'coverColor',
      lyricsBackgroundModeOverrideEnabled: true,
    });
    expect(createLyricsBackgroundModeSelectionPatch(null)).toEqual({
      lyricsBackgroundModeOverrideEnabled: false,
    });
  });
});
