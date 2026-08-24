import { describe, expect, it } from 'vitest';
import { resolveSteamAppLocale } from './SteamAppLanguage';

describe('resolveSteamAppLocale', () => {
  it.each([
    ['english', 'en-US'],
    ['schinese', 'zh-CN'],
    ['tchinese', 'zh-TW'],
    ['japanese', 'ja-JP'],
    ['koreana', 'ko-KR'],
  ] as const)('maps Steam language %s to ECHO locale %s', (steamLanguage, appLocale) => {
    expect(resolveSteamAppLocale(steamLanguage)).toBe(appLocale);
  });

  it('normalizes whitespace and casing', () => {
    expect(resolveSteamAppLocale('  SCHINESE ')).toBe('zh-CN');
  });

  it('ignores unsupported or invalid Steam languages', () => {
    expect(resolveSteamAppLocale('german')).toBeNull();
    expect(resolveSteamAppLocale(null)).toBeNull();
  });
});
