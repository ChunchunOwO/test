import type { LyricsBackgroundMode, LyricsPageStyle } from '../../../shared/types/appSettings';

type LyricsBackgroundPolicyInput = {
  immersiveCoverStyleEnabled: boolean;
  pageStyle: LyricsPageStyle;
  savedMode: LyricsBackgroundMode;
  userOverrideEnabled: boolean;
};

export type LyricsBackgroundPolicy = {
  layoutMode: LyricsBackgroundMode;
  sourceMode: LyricsBackgroundMode;
};

export const createLyricsBackgroundModeSelectionPatch = (
  mode: LyricsBackgroundMode | null,
): { lyricsBackgroundModeOverrideEnabled: boolean; lyricsBackgroundMode?: LyricsBackgroundMode } =>
  mode === null
    ? { lyricsBackgroundModeOverrideEnabled: false }
    : {
        lyricsBackgroundMode: mode,
        lyricsBackgroundModeOverrideEnabled: true,
      };

const coverBackedPageStyles = new Set<LyricsPageStyle>([
  'folded',
  'roseVinyl',
  'cinemaStage',
  'kineticPoster',
  'coverStage',
  'cutBoard',
]);

export const resolveLyricsBackgroundPolicy = ({
  immersiveCoverStyleEnabled,
  pageStyle,
  savedMode,
  userOverrideEnabled,
}: LyricsBackgroundPolicyInput): LyricsBackgroundPolicy => {
  const styleDefaultMode: LyricsBackgroundMode = immersiveCoverStyleEnabled || coverBackedPageStyles.has(pageStyle)
    ? 'cover'
    : pageStyle === 'editorial'
      ? 'theme'
      : savedMode;

  return {
    layoutMode: styleDefaultMode,
    sourceMode: userOverrideEnabled ? savedMode : styleDefaultMode,
  };
};
