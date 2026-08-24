import {
  Accessibility,
  Captions,
  Download,
  Gamepad2,
  Gauge,
  Globe2,
  Info,
  Keyboard,
  Link2,
  MessageSquare,
  Palette,
  SlidersHorizontal,
  Trash2,
  User,
  Zap,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { AppSettings } from '../../../shared/types/appSettings';
import type { Locale, TranslationKey } from '../../i18n/locales';
import type { SettingsNavKey } from './settingsTypes';

export type SettingsNavItem = {
  key: SettingsNavKey;
  labelKey: TranslationKey;
  descriptionKey: TranslationKey;
  icon: LucideIcon;
};

export type SettingsNavGroup = {
  id: 'basics' | 'audio' | 'content' | 'extensions' | 'advanced';
  label: Record<Locale, string>;
  itemKeys: SettingsNavKey[];
};

export const settingsNavItems: SettingsNavItem[] = [
  { key: 'general', labelKey: 'settings.nav.general.label', descriptionKey: 'settings.nav.general.description', icon: MessageSquare },
  { key: 'advancedCustom', labelKey: 'settings.nav.advancedCustom.label', descriptionKey: 'settings.nav.advancedCustom.description', icon: Gauge },
  { key: 'playback', labelKey: 'settings.nav.playback.label', descriptionKey: 'settings.nav.playback.description', icon: Zap },
  { key: 'appearance', labelKey: 'settings.nav.appearance.label', descriptionKey: 'settings.nav.appearance.description', icon: Palette },
  { key: 'accessibility', labelKey: 'settings.nav.accessibility.label', descriptionKey: 'settings.nav.accessibility.description', icon: Accessibility },
  { key: 'library', labelKey: 'settings.nav.library.label', descriptionKey: 'settings.nav.library.description', icon: Download },
  { key: 'lyrics', labelKey: 'route.lyricsSettings.label', descriptionKey: 'settings.nav.lyrics.description', icon: Captions },
  { key: 'shortcuts', labelKey: 'settings.nav.shortcuts.label', descriptionKey: 'settings.nav.shortcuts.description', icon: Keyboard },
  { key: 'integrations', labelKey: 'settings.nav.integrations.label', descriptionKey: 'settings.nav.integrations.description', icon: Link2 },
  { key: 'steamPresence', labelKey: 'settings.nav.steamPresence.label', descriptionKey: 'settings.nav.steamPresence.description', icon: Gamepad2 },
  { key: 'accounts', labelKey: 'settings.nav.accounts.label', descriptionKey: 'settings.nav.accounts.description', icon: User },
  { key: 'remote', labelKey: 'settings.nav.remote.label', descriptionKey: 'settings.nav.remote.description', icon: Globe2 },
  { key: 'eq', labelKey: 'settings.nav.eq.label', descriptionKey: 'settings.nav.eq.description', icon: SlidersHorizontal },
  { key: 'about', labelKey: 'settings.nav.about.label', descriptionKey: 'settings.nav.about.description', icon: Info },
  { key: 'danger', labelKey: 'settings.nav.danger.label', descriptionKey: 'settings.nav.danger.description', icon: Trash2 },
];

export const settingsNavGroups: SettingsNavGroup[] = [
  {
    id: 'basics',
    label: { 'zh-CN': '基础', 'zh-TW': '基礎', 'ja-JP': '基本', 'en-US': 'Basics', 'ko-KR': '기본' },
    itemKeys: ['general', 'appearance', 'accessibility'],
  },
  {
    id: 'audio',
    label: { 'zh-CN': '音频与播放', 'zh-TW': '音訊與播放', 'ja-JP': 'オーディオと再生', 'en-US': 'Audio And Playback', 'ko-KR': '오디오 및 재생' },
    itemKeys: ['playback', 'eq'],
  },
  {
    id: 'content',
    label: { 'zh-CN': '内容与媒体', 'zh-TW': '內容與媒體', 'ja-JP': 'コンテンツとメディア', 'en-US': 'Content And Media', 'ko-KR': '콘텐츠 및 미디어' },
    itemKeys: ['library', 'lyrics'],
  },
  {
    id: 'extensions',
    label: { 'zh-CN': '连接与扩展', 'zh-TW': '連接與擴充', 'ja-JP': '接続と拡張', 'en-US': 'Connections And Extensions', 'ko-KR': '연결 및 확장' },
    itemKeys: ['integrations', 'steamPresence', 'accounts', 'remote'],
  },
  {
    id: 'advanced',
    label: { 'zh-CN': '高级', 'zh-TW': '進階', 'ja-JP': '詳細', 'en-US': 'Advanced', 'ko-KR': '고급' },
    itemKeys: ['shortcuts', 'advancedCustom', 'about', 'danger'],
  },
];

export const shouldShowSettingsNavItem = (key: SettingsNavKey, settings: Partial<AppSettings> | null | undefined): boolean => {
  if (key === 'accounts') {
    return false;
  }

  if (key === 'remote' || key === 'eq') {
    return settings?.settingsOptionalSectionsVisible === true;
  }

  return true;
};

export const pendingSettingsSectionStorageKey = 'echo.settings.pending-section';
export const pendingRouteStorageKey = 'echo.pending-route';
export const settingsBackNavigationEvent = 'app:navigate:settings-back';
export const settingsSectionNavigationEvent = 'app:navigate:settings-section';
export const pluginsDocumentationUrl = 'https://github.com/moekotori/echo/blob/main/docs/ECHO_PLUGINS.md';
export const settingsNavKeys = new Set<SettingsNavKey>(settingsNavItems.map((item) => item.key));

export const normalizeSettingsNavKey = (value: unknown): SettingsNavKey | null => {
  if (value === 'experimental') {
    return 'advancedCustom';
  }

  return typeof value === 'string' && settingsNavKeys.has(value as SettingsNavKey)
    ? value as SettingsNavKey
    : null;
};

export const getSettingsNavIndex = (key: SettingsNavKey): number => settingsNavItems.findIndex((item) => item.key === key);

export const isSettingsEscapeBackEditableTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return Boolean(target.closest('input, textarea, select, [contenteditable="true"], [role="textbox"]'));
};

export type SettingsEscapeAction = 'none' | 'clear-search' | 'leave-contributors' | 'leave-settings';

export const resolveSettingsEscapeAction = ({
  defaultPrevented,
  isContributorsPage,
  isEditableTarget,
  isSearchInput,
  searchQuery,
}: {
  defaultPrevented: boolean;
  isContributorsPage: boolean;
  isEditableTarget: boolean;
  isSearchInput: boolean;
  searchQuery: string;
}): SettingsEscapeAction => {
  if (defaultPrevented) {
    return 'none';
  }

  if (searchQuery.trim()) {
    return 'clear-search';
  }

  if (isContributorsPage) {
    return 'leave-contributors';
  }

  if (isEditableTarget && !isSearchInput) {
    return 'none';
  }

  return 'leave-settings';
};

export const readInitialSettingsSection = (): SettingsNavKey => {
  if (typeof window === 'undefined') {
    return 'general';
  }

  try {
    const pendingSection = window.sessionStorage.getItem(pendingSettingsSectionStorageKey) ?? window.localStorage.getItem(pendingSettingsSectionStorageKey);
    const normalizedPendingSection = normalizeSettingsNavKey(pendingSection);
    if (normalizedPendingSection) {
      window.sessionStorage.removeItem(pendingSettingsSectionStorageKey);
      window.localStorage.removeItem(pendingSettingsSectionStorageKey);
      return normalizedPendingSection;
    }
  } catch {
    // Fall through to the default section when browser storage is unavailable.
  }

  return 'general';
};

