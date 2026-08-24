import type { AppLocale } from '../../../shared/types/appSettings';

const appLocaleBySteamLanguage: Readonly<Record<string, AppLocale>> = {
  english: 'en-US',
  japanese: 'ja-JP',
  koreana: 'ko-KR',
  schinese: 'zh-CN',
  tchinese: 'zh-TW',
};

export const resolveSteamAppLocale = (value: unknown): AppLocale | null => {
  if (typeof value !== 'string') {
    return null;
  }

  return appLocaleBySteamLanguage[value.trim().toLowerCase()] ?? null;
};
