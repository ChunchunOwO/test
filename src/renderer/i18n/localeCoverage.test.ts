import { describe, expect, it } from 'vitest';
import { fallbackTranslations, loadTranslations } from './locales';
import { enUS } from './locales/enUS';
import type { Locale, TranslationDictionary } from './locales';

const locales: Locale[] = ['zh-CN', 'zh-TW', 'ja-JP', 'en-US', 'ko-KR'];

const loadAll = async (): Promise<Record<Locale, TranslationDictionary>> => {
  const loaded = {
    'zh-CN': fallbackTranslations,
    'zh-TW': await loadTranslations('zh-TW'),
    'ja-JP': await loadTranslations('ja-JP'),
    'en-US': enUS,
    'ko-KR': await loadTranslations('ko-KR'),
  };
  return loaded;
};

const looksLikeEnglishSentence = (key: string, value: string): boolean => {
  if (
    key.startsWith('lyricsSettings.provider.')
    || key.startsWith('likedPage.empty.source.')
    || key.includes('themePreset.')
    || key.includes('accountProvider.')
    || key.endsWith('Placeholder')
    || key === 'settings.integrations.stage.title'
    || key.startsWith('settings.remote.provider.smb.')
  ) {
    return false;
  }
  if (/^https?:\/\//.test(value)) {
    return false;
  }
  if (/ECHO|WASAPI|HQPlayer|AirPlay|DLNA|ASIO|Spotify|Equalizer APO|Discord|Steam|Bluetooth|DirectSound|ReplayGain|DoP|DSD|FIFO|HTTP|TCP|JSON|URL|HWID|SDK|PCM|EQ |PEQ|SOXR|miniaudio|Electron|Windows Audio|Pink Floyd|Nyan Cat|Album Sea|NetEase|KuGou|Kuwo|AMLL TTML|Stage API/.test(value)) {
    return false;
  }
  if (/^[A-Z][A-Z0-9 /&-]{2,}(?: [A-Z0-9 /&-]{2,})+$/.test(value)) {
    return true;
  }
  return /^[A-Za-z][A-Za-z0-9 .,'’/()\-+%:;!?#]+$/.test(value) && (value.match(/[A-Za-z]{3,}/g) ?? []).length >= 4;
};

describe('locale coverage quality', () => {
  it('covers every English key in all languages without empty strings', async () => {
    const loaded = await loadAll();
    const enKeys = Object.keys(enUS);

    for (const locale of locales) {
      const dict = loaded[locale];
      const missing = enKeys.filter((key) => !(key in dict));
      const empty = Object.entries(dict)
        .filter(([, value]) => typeof value !== 'string' || value.trim() === '')
        .map(([key]) => key);

      expect(missing, `${locale} missing keys`).toEqual([]);
      expect(empty, `${locale} empty strings`).toEqual([]);
    }

    expect(Object.keys(loaded['zh-CN']).length).toBeGreaterThan(4000);
    expect(Object.keys(loaded['zh-TW']).length).toBeGreaterThan(4000);
    expect(Object.keys(loaded['ja-JP']).length).toBeGreaterThan(4000);
    expect(Object.keys(loaded['ko-KR']).length).toBeGreaterThan(4000);
    expect(Object.keys(loaded['en-US']).length).toBeGreaterThan(4000);
  });

  it('does not leak another writing system into Japanese or Korean', async () => {
    const loaded = await loadAll();
    const jaHangul = Object.entries(loaded['ja-JP'])
      .filter(([, value]) => /[\uac00-\ud7af]/.test(value ?? ''))
      .map(([key]) => key);
    const koKana = Object.entries(loaded['ko-KR'])
      .filter(([, value]) => /[\u3040-\u30ff]/.test(value ?? ''))
      .map(([key]) => key);
    const koChineseOnly = Object.entries(loaded['ko-KR'])
      .filter(([, value]) => {
        if (!value) {
          return false;
        }
        return /[\u4e00-\u9fff]/.test(value) && !/[\uac00-\ud7af]/.test(value) && !/[A-Za-z]/.test(value);
      })
      .map(([key, value]) => `${key}=${value}`);

    expect(jaHangul).toEqual([]);
    expect(koKana).toEqual([]);
    expect(koChineseOnly).toEqual([]);
  });

  it('keeps Japanese and Korean UI from falling back to leftover English sentences', async () => {
    const loaded = await loadAll();
    const leftover: Record<string, string[]> = { 'ja-JP': [], 'ko-KR': [], 'zh-CN': [], 'zh-TW': [] };

    for (const locale of ['ja-JP', 'ko-KR', 'zh-CN', 'zh-TW'] as const) {
      leftover[locale] = Object.entries(loaded[locale])
        .filter(([key, value]) => typeof value === 'string' && looksLikeEnglishSentence(key, value))
        .map(([key, value]) => `${key}: ${value}`);
    }

    expect(leftover['ja-JP'].slice(0, 40), leftover['ja-JP'].join('\n')).toEqual([]);
    expect(leftover['ko-KR'].slice(0, 40), leftover['ko-KR'].join('\n')).toEqual([]);
    expect(leftover['zh-CN'].slice(0, 20), leftover['zh-CN'].join('\n')).toEqual([]);
    expect(leftover['zh-TW'].slice(0, 20), leftover['zh-TW'].join('\n')).toEqual([]);
  });
});
