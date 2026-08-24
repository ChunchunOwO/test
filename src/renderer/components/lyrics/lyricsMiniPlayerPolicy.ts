import type { LyricsPageStyle } from '../../../shared/types/appSettings';
import { resolveVisibleLyricsPageStyle } from './lyricsPageStyleAvailability';

export const isLyricsMiniPlayerRequiredForPageStyle = (
  pageStyle: LyricsPageStyle | null | undefined,
): boolean => resolveVisibleLyricsPageStyle(pageStyle ?? 'default') !== 'default';
