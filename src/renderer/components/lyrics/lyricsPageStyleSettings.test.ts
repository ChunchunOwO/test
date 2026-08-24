import { describe, expect, it } from 'vitest';
import {
  fullAppSettingsSnapshotMinKeys,
  isFullAppSettingsSnapshot,
  lyricsPageStyleWriteGuardMs,
  overlayLyricsPageStylePatch,
  resolveLyricsPageStyleFromLoadedSettings,
  resolveLyricsPageStyleFromSettingsEvent,
} from './lyricsPageStyleSettings';

const focusedNowMs = 10_000;

describe('lyrics page style settings', () => {
  it('treats bulky payloads with lowSpecModeEnabled as full snapshots', () => {
    const focused = { lyricsPageStyle: 'roseVinyl' };
    const bulky = {
      lowSpecModeEnabled: false,
      lyricsPageStyle: 'default',
      ...Object.fromEntries(Array.from({ length: fullAppSettingsSnapshotMinKeys }, (_, index) => [`key${index}`, index])),
    };

    expect(isFullAppSettingsSnapshot(focused)).toBe(false);
    expect(isFullAppSettingsSnapshot({ lowSpecModeEnabled: false, lyricsFontSizePx: 40 })).toBe(false);
    expect(isFullAppSettingsSnapshot(bulky)).toBe(true);
  });

  it('applies focused style patches including an explicit return to default', () => {
    expect(
      resolveLyricsPageStyleFromSettingsEvent({
        currentStyle: 'default',
        incomingStyle: 'cinemaStage',
        isFullSnapshot: false,
        recentWrite: null,
        nowMs: focusedNowMs,
      }),
    ).toBe('cinemaStage');

    expect(
      resolveLyricsPageStyleFromSettingsEvent({
        currentStyle: 'cinemaStage',
        incomingStyle: 'default',
        isFullSnapshot: false,
        recentWrite: { style: 'cinemaStage', atMs: focusedNowMs - 20 },
        nowMs: focusedNowMs,
      }),
    ).toBe('default');
  });

  it('ignores lyrics page style on full snapshots and keeps the current choice', () => {
    expect(
      resolveLyricsPageStyleFromSettingsEvent({
        currentStyle: 'coverStage',
        incomingStyle: 'default',
        isFullSnapshot: true,
        recentWrite: { style: 'coverStage', atMs: focusedNowMs - 50 },
        nowMs: focusedNowMs,
      }),
    ).toBe('coverStage');

    expect(
      resolveLyricsPageStyleFromSettingsEvent({
        currentStyle: 'cinemaStage',
        incomingStyle: 'editorial',
        isFullSnapshot: true,
        recentWrite: { style: 'cinemaStage', atMs: focusedNowMs - 80 },
        nowMs: focusedNowMs,
      }),
    ).toBe('cinemaStage');

    expect(
      resolveLyricsPageStyleFromSettingsEvent({
        currentStyle: 'roseVinyl',
        incomingStyle: 'kineticPoster',
        isFullSnapshot: true,
        recentWrite: null,
        nowMs: focusedNowMs,
      }),
    ).toBe('roseVinyl');
  });

  it('keeps the current style when a full snapshot omits lyricsPageStyle', () => {
    expect(
      resolveLyricsPageStyleFromSettingsEvent({
        currentStyle: 'folded',
        incomingStyle: undefined,
        isFullSnapshot: true,
        recentWrite: { style: 'folded', atMs: focusedNowMs - 10 },
        nowMs: focusedNowMs,
      }),
    ).toBe('folded');
  });

  it('keeps a fresh local write when getSettings still returns the previous style', () => {
    expect(
      resolveLyricsPageStyleFromLoadedSettings({
        loadedStyle: 'default',
        recentWrite: { style: 'kineticPoster', atMs: focusedNowMs - 250 },
        nowMs: focusedNowMs,
      }),
    ).toBe('kineticPoster');
  });

  it('accepts loaded settings after the local write guard expires', () => {
    expect(
      resolveLyricsPageStyleFromLoadedSettings({
        loadedStyle: 'editorial',
        recentWrite: { style: 'coverStage', atMs: focusedNowMs - lyricsPageStyleWriteGuardMs },
        nowMs: focusedNowMs,
      }),
    ).toBe('editorial');

    expect(
      resolveLyricsPageStyleFromLoadedSettings({
        loadedStyle: 'default',
        recentWrite: { style: 'coverStage', atMs: focusedNowMs - lyricsPageStyleWriteGuardMs + 1 },
        nowMs: focusedNowMs,
      }),
    ).toBe('coverStage');
  });

  it('overlays the written lyrics page style onto a stale setSettings response', () => {
    expect(
      overlayLyricsPageStylePatch(
        { lyricsPageStyle: 'default', lyricsFontSizePx: 42 },
        { lyricsPageStyle: 'roseVinyl' },
      ),
    ).toEqual({ lyricsPageStyle: 'roseVinyl', lyricsFontSizePx: 42 });

    expect(
      overlayLyricsPageStylePatch(
        { lyricsPageStyle: 'cinemaStage', lyricsFontSizePx: 42 },
        { lyricsFontSizePx: 48 },
      ),
    ).toEqual({ lyricsPageStyle: 'cinemaStage', lyricsFontSizePx: 42 });
  });
});
