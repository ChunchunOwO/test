import { AppWindow, Captions, EyeOff, FolderOpen, Gauge, Heart, Headphones, KeyRound, ListMusic, Locate, Lock, PawPrint, PictureInPicture2, Play, Repeat, RotateCcw, RotateCw, Search, Settings, Shuffle, SkipBack, SkipForward, SlidersHorizontal, Square, Undo2, Volume2, VolumeX } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  globalShortcutActions,
  type GlobalShortcutAction,
  type GlobalShortcutSettings,
  type LocalShortcutSettings,
} from '../../../../shared/types/globalShortcuts';
import type { TranslationKey } from '../../../i18n/locales';

export {
  acceleratorFromKeyboardEvent,
  acceleratorFromMouseEvent,
  formatAcceleratorForDisplay,
  normalizeShortcutEventKey,
} from '../../../utils/shortcutAccelerator';

export const shortcutMouseDisplayKeys = {
  MouseButton3: 'settings.shortcuts.mouse.middle',
  MouseButton4: 'settings.shortcuts.mouse.back',
  MouseButton5: 'settings.shortcuts.mouse.forward',
} as const satisfies Record<string, TranslationKey>;

export const globalShortcutActionMeta: Array<{
  action: GlobalShortcutAction;
  titleKey: TranslationKey;
  descriptionKey: TranslationKey;
}> = [
  { action: 'playPause', titleKey: 'settings.shortcuts.action.playPause.title', descriptionKey: 'settings.shortcuts.action.playPause.description' },
  { action: 'previousTrack', titleKey: 'settings.shortcuts.action.previousTrack.title', descriptionKey: 'settings.shortcuts.action.previousTrack.description' },
  { action: 'nextTrack', titleKey: 'settings.shortcuts.action.nextTrack.title', descriptionKey: 'settings.shortcuts.action.nextTrack.description' },
  { action: 'stop', titleKey: 'settings.shortcuts.action.stop.title', descriptionKey: 'settings.shortcuts.action.stop.description' },
  { action: 'volumeUp', titleKey: 'settings.shortcuts.action.volumeUp.title', descriptionKey: 'settings.shortcuts.action.volumeUp.description' },
  { action: 'volumeDown', titleKey: 'settings.shortcuts.action.volumeDown.title', descriptionKey: 'settings.shortcuts.action.volumeDown.description' },
  { action: 'seekBackward', titleKey: 'settings.shortcuts.action.seekBackward.title', descriptionKey: 'settings.shortcuts.action.seekBackward.description' },
  { action: 'seekForward', titleKey: 'settings.shortcuts.action.seekForward.title', descriptionKey: 'settings.shortcuts.action.seekForward.description' },
  { action: 'replayCurrentTrack', titleKey: 'settings.shortcuts.action.replayCurrentTrack.title', descriptionKey: 'settings.shortcuts.action.replayCurrentTrack.description' },
  { action: 'toggleCurrentTrackLiked', titleKey: 'settings.shortcuts.action.toggleCurrentTrackLiked.title', descriptionKey: 'settings.shortcuts.action.toggleCurrentTrackLiked.description' },
  { action: 'openLiked', titleKey: 'settings.shortcuts.action.openLiked.title', descriptionKey: 'settings.shortcuts.action.openLiked.description' },
  { action: 'openPlaybackQueue', titleKey: 'settings.shortcuts.action.openPlaybackQueue.title', descriptionKey: 'settings.shortcuts.action.openPlaybackQueue.description' },
  { action: 'openSearch', titleKey: 'settings.shortcuts.action.openSearch.title', descriptionKey: 'settings.shortcuts.action.openSearch.description' },
  { action: 'openSettings', titleKey: 'settings.shortcuts.action.openSettings.title', descriptionKey: 'settings.shortcuts.action.openSettings.description' },
  { action: 'toggleShuffle', titleKey: 'settings.shortcuts.action.toggleShuffle.title', descriptionKey: 'settings.shortcuts.action.toggleShuffle.description' },
  { action: 'cycleRepeatMode', titleKey: 'settings.shortcuts.action.cycleRepeatMode.title', descriptionKey: 'settings.shortcuts.action.cycleRepeatMode.description' },
  { action: 'toggleMute', titleKey: 'settings.shortcuts.action.toggleMute.title', descriptionKey: 'settings.shortcuts.action.toggleMute.description' },
  { action: 'toggleMiniPlayer', titleKey: 'settings.shortcuts.action.toggleMiniPlayer.title', descriptionKey: 'settings.shortcuts.action.toggleMiniPlayer.description' },
  { action: 'togglePet', titleKey: 'settings.shortcuts.action.togglePet.title', descriptionKey: 'settings.shortcuts.action.togglePet.description' },
  { action: 'showMainWindow', titleKey: 'settings.shortcuts.action.showMainWindow.title', descriptionKey: 'settings.shortcuts.action.showMainWindow.description' },
  { action: 'bossKey', titleKey: 'settings.shortcuts.action.bossKey.title', descriptionKey: 'settings.shortcuts.action.bossKey.description' },
  { action: 'speedUp', titleKey: 'settings.shortcuts.action.speedUp.title', descriptionKey: 'settings.shortcuts.action.speedUp.description' },
  { action: 'speedDown', titleKey: 'settings.shortcuts.action.speedDown.title', descriptionKey: 'settings.shortcuts.action.speedDown.description' },
  { action: 'resetPlaybackSpeed', titleKey: 'settings.shortcuts.action.resetPlaybackSpeed.title', descriptionKey: 'settings.shortcuts.action.resetPlaybackSpeed.description' },
  { action: 'openAudioSettings', titleKey: 'settings.shortcuts.action.openAudioSettings.title', descriptionKey: 'settings.shortcuts.action.openAudioSettings.description' },
  { action: 'toggleEq', titleKey: 'settings.shortcuts.action.toggleEq.title', descriptionKey: 'settings.shortcuts.action.toggleEq.description' },
  { action: 'openLyricsSettings', titleKey: 'settings.shortcuts.action.openLyricsSettings.title', descriptionKey: 'settings.shortcuts.action.openLyricsSettings.description' },
  { action: 'toggleLyrics', titleKey: 'settings.shortcuts.action.toggleLyrics.title', descriptionKey: 'settings.shortcuts.action.toggleLyrics.description' },
  { action: 'locateCurrentTrack', titleKey: 'settings.shortcuts.action.locateCurrentTrack.title', descriptionKey: 'settings.shortcuts.action.locateCurrentTrack.description' },
  { action: 'revealCurrentTrackInFolder', titleKey: 'settings.shortcuts.action.revealCurrentTrackInFolder.title', descriptionKey: 'settings.shortcuts.action.revealCurrentTrackInFolder.description' },
  { action: 'toggleDesktopLyrics', titleKey: 'settings.shortcuts.action.toggleDesktopLyrics.title', descriptionKey: 'settings.shortcuts.action.toggleDesktopLyrics.description' },
  { action: 'toggleDesktopLyricsLock', titleKey: 'settings.shortcuts.action.toggleDesktopLyricsLock.title', descriptionKey: 'settings.shortcuts.action.toggleDesktopLyricsLock.description' },
];

export const shortcutActionIcons: Partial<Record<GlobalShortcutAction, LucideIcon>> = {
  playPause: Play,
  previousTrack: SkipBack,
  nextTrack: SkipForward,
  stop: Square,
  volumeUp: Volume2,
  volumeDown: VolumeX,
  seekBackward: RotateCcw,
  seekForward: RotateCw,
  replayCurrentTrack: Undo2,
  toggleCurrentTrackLiked: Heart,
  openLiked: Heart,
  openPlaybackQueue: ListMusic,
  openSearch: Search,
  openSettings: Settings,
  toggleShuffle: Shuffle,
  cycleRepeatMode: Repeat,
  toggleMute: VolumeX,
  toggleMiniPlayer: PictureInPicture2,
  togglePet: PawPrint,
  showMainWindow: AppWindow,
  bossKey: EyeOff,
  speedUp: Gauge,
  speedDown: Gauge,
  resetPlaybackSpeed: Gauge,
  openAudioSettings: Headphones,
  toggleEq: SlidersHorizontal,
  toggleLyrics: Captions,
  locateCurrentTrack: Locate,
  revealCurrentTrackInFolder: FolderOpen,
  toggleDesktopLyricsLock: Lock,
};

export const shortcutCategories = ['playback', 'volume', 'speed', 'library', 'audio', 'lyrics', 'windows'] as const;
export type ShortcutCategory = (typeof shortcutCategories)[number];

export const shortcutCategoryMeta: Array<{
  category: ShortcutCategory;
  titleKey: TranslationKey;
  icon: LucideIcon;
}> = [
  { category: 'playback', titleKey: 'settings.shortcuts.group.playback', icon: Play },
  { category: 'volume', titleKey: 'settings.shortcuts.group.volume', icon: Volume2 },
  { category: 'speed', titleKey: 'settings.shortcuts.group.speed', icon: Gauge },
  { category: 'library', titleKey: 'settings.shortcuts.group.library', icon: Heart },
  { category: 'audio', titleKey: 'settings.shortcuts.group.audio', icon: Headphones },
  { category: 'lyrics', titleKey: 'settings.shortcuts.group.lyrics', icon: Captions },
  { category: 'windows', titleKey: 'settings.shortcuts.group.windows', icon: AppWindow },
];

export const shortcutActionCategory = {
  playPause: 'playback',
  previousTrack: 'playback',
  nextTrack: 'playback',
  stop: 'playback',
  seekBackward: 'playback',
  seekForward: 'playback',
  replayCurrentTrack: 'playback',
  toggleShuffle: 'playback',
  cycleRepeatMode: 'playback',
  volumeUp: 'volume',
  volumeDown: 'volume',
  toggleMute: 'volume',
  speedUp: 'speed',
  speedDown: 'speed',
  resetPlaybackSpeed: 'speed',
  toggleCurrentTrackLiked: 'library',
  openLiked: 'library',
  openPlaybackQueue: 'library',
  openSearch: 'library',
  locateCurrentTrack: 'library',
  revealCurrentTrackInFolder: 'library',
  openAudioSettings: 'audio',
  openMvSettings: 'audio',
  toggleEq: 'audio',
  toggleLyrics: 'lyrics',
  openLyricsSettings: 'lyrics',
  toggleDesktopLyrics: 'lyrics',
  toggleDesktopLyricsLock: 'lyrics',
  toggleMiniPlayer: 'windows',
  togglePet: 'windows',
  showMainWindow: 'windows',
  bossKey: 'windows',
  openSettings: 'windows',
} satisfies Record<GlobalShortcutAction, ShortcutCategory>;

export type ShortcutActionMeta = (typeof globalShortcutActionMeta)[number];
export type ShortcutCategoryGroup = {
  category: ShortcutCategory;
  titleKey: TranslationKey;
  icon: LucideIcon;
  items: ShortcutActionMeta[];
};

export const matchesShortcutFilter = (
  filter: ShortcutFilter,
  localBinding: LocalShortcutSettings[GlobalShortcutAction] | undefined,
  globalBinding: GlobalShortcutSettings[GlobalShortcutAction] | undefined,
  hasIssue: boolean,
): boolean => {
  switch (filter) {
    case 'enabled':
      return Boolean(localBinding?.enabled || globalBinding?.enabled);
    case 'unbound':
      return !localBinding?.accelerator && !globalBinding?.accelerator;
    case 'issues':
      return hasIssue;
    case 'all':
    default:
      return true;
  }
};

export const groupShortcutActionMeta = (items: ShortcutActionMeta[]): ShortcutCategoryGroup[] =>
  shortcutCategoryMeta
    .map((group) => ({
      ...group,
      items: items.filter((item) => shortcutActionCategory[item.action] === group.category),
    }))
    .filter((group) => group.items.length > 0);

export const fallbackShortcutActionIcon = KeyRound;

export type ShortcutScope = 'local' | 'global';
export type ShortcutFilter = 'all' | 'enabled' | 'unbound' | 'issues';
export type RecordingShortcutTarget = {
  action: GlobalShortcutAction;
  scope: ShortcutScope;
};
export type ShortcutMessageKey = `${ShortcutScope}:${GlobalShortcutAction}`;

export const shortcutMessageKey = (scope: ShortcutScope, action: GlobalShortcutAction): ShortcutMessageKey => `${scope}:${action}`;
export const localShortcutUnavailableActions = new Set<GlobalShortcutAction>(['showMainWindow']);
export const shortcutFilterOptions: Array<{ filter: ShortcutFilter; labelKey: TranslationKey }> = [
  { filter: 'all', labelKey: 'settings.shortcuts.filter.all' },
  { filter: 'enabled', labelKey: 'settings.shortcuts.filter.enabled' },
  { filter: 'unbound', labelKey: 'settings.shortcuts.filter.unbound' },
  { filter: 'issues', labelKey: 'settings.shortcuts.filter.issues' },
];

export const findDuplicateShortcutAction = (
  shortcuts: GlobalShortcutSettings | LocalShortcutSettings,
  action: GlobalShortcutAction,
  accelerator: string,
): GlobalShortcutAction | null => {
  const normalized = accelerator.toLowerCase();
  return (
    globalShortcutActions.find(
      (candidate) => candidate !== action && shortcuts[candidate]?.accelerator?.toLowerCase() === normalized,
    ) ?? null
  );
};

export const mergeShortcutSettings = <T extends GlobalShortcutSettings | LocalShortcutSettings>(
  defaults: T,
  saved: Partial<T> | null | undefined,
): T =>
  Object.fromEntries(
    globalShortcutActions.map((action) => [
      action,
      {
        ...defaults[action],
        ...(saved?.[action] ?? {}),
      },
    ]),
  ) as T;

