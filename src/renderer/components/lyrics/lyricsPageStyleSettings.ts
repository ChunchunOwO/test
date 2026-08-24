import type { LyricsPageStyle } from '../../../shared/types/appSettings';

export const lyricsPageStyleWriteGuardMs = 4000;
export const fullAppSettingsSnapshotMinKeys = 12;

export type LyricsPageStyleWrite = {
  style: LyricsPageStyle;
  atMs: number;
};

export const isFullAppSettingsSnapshot = (detail: Record<string, unknown>): boolean =>
  Object.prototype.hasOwnProperty.call(detail, 'lowSpecModeEnabled') &&
  Object.keys(detail).length > fullAppSettingsSnapshotMinKeys;

const isFreshLyricsPageStyleWrite = (
  recentWrite: LyricsPageStyleWrite | null,
  nowMs: number,
): recentWrite is LyricsPageStyleWrite =>
  recentWrite !== null &&
  nowMs - recentWrite.atMs >= 0 &&
  nowMs - recentWrite.atMs < lyricsPageStyleWriteGuardMs;

export const resolveLyricsPageStyleFromSettingsEvent = ({
  currentStyle,
  incomingStyle,
  isFullSnapshot,
  recentWrite,
  nowMs,
}: {
  currentStyle: LyricsPageStyle;
  incomingStyle: LyricsPageStyle | undefined;
  isFullSnapshot: boolean;
  recentWrite: LyricsPageStyleWrite | null;
  nowMs: number;
}): LyricsPageStyle => {
  if (!isFullSnapshot && incomingStyle !== undefined) {
    return incomingStyle;
  }

  if (isFreshLyricsPageStyleWrite(recentWrite, nowMs)) {
    return recentWrite.style;
  }

  return currentStyle;
};

export const resolveLyricsPageStyleFromLoadedSettings = ({
  loadedStyle,
  recentWrite,
  nowMs,
}: {
  loadedStyle: LyricsPageStyle;
  recentWrite: LyricsPageStyleWrite | null;
  nowMs: number;
}): LyricsPageStyle =>
  isFreshLyricsPageStyleWrite(recentWrite, nowMs) ? recentWrite.style : loadedStyle;

export const overlayLyricsPageStylePatch = <T extends { lyricsPageStyle?: LyricsPageStyle | null }>(
  returned: T,
  patch: Record<string, unknown> & { lyricsPageStyle?: LyricsPageStyle },
): T =>
  patch.lyricsPageStyle === undefined
    ? returned
    : {
        ...returned,
        lyricsPageStyle: patch.lyricsPageStyle,
      };
