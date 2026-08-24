import type { LyricsPageStyle } from '../../../shared/types/appSettings';

const hiddenLyricsPageStyles = new Set<LyricsPageStyle>(['cutBoard']);

export const isLyricsPageStyleVisible = (style: LyricsPageStyle): boolean =>
  !hiddenLyricsPageStyles.has(style);

export const resolveVisibleLyricsPageStyle = (style: LyricsPageStyle): LyricsPageStyle =>
  isLyricsPageStyleVisible(style) ? style : 'default';
