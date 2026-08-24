import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { fallbackTranslations, getLoadedTranslations, loadTranslations } from './locales';
import { enUS } from './locales/enUS';

describe('locale loading', () => {
  it('keeps the Simplified Chinese fallback available synchronously', () => {
    expect(fallbackTranslations['app.window.restore']).toBeTruthy();
    expect(getLoadedTranslations('zh-CN')).toBe(fallbackTranslations);
  });

  it('keeps non-default dictionaries out of the synchronous renderer entry', () => {
    const source = readFileSync('src/renderer/i18n/locales.ts', 'utf8');
    const rendererEntry = readFileSync('src/renderer/main.tsx', 'utf8');

    expect(source).toContain("import { zhCN } from './locales/zhCN';");
    for (const localeModule of ['zhTW', 'jaJP', 'enUS', 'koKR']) {
      expect(source).not.toContain(`import { ${localeModule} } from './locales/${localeModule}';`);
      expect(source).toContain(`import('./locales/${localeModule}')`);
    }
    expect(rendererEntry).not.toContain("from './i18n/I18nProvider';");
    expect(rendererEntry).toContain("import('./i18n/I18nProvider')");
  });

  it('loads non-default dictionaries on demand and caches them', async () => {
    const translations = await loadTranslations('en-US');

    expect(translations['app.window.restore']).toBe('Restore');
    expect(getLoadedTranslations('en-US')).toBe(translations);
    await expect(loadTranslations('en-US')).resolves.toBe(translations);
  });

  it('loads Korean dictionary with first-run description', async () => {
    const translations = await loadTranslations('ko-KR');

    expect(translations['firstRun.language.ko-KR.description']).toContain('한국어');
    expect(getLoadedTranslations('ko-KR')).toBe(translations);
  });

  it('keeps Japanese library pages localized instead of English family fallbacks', async () => {
    const translations = await loadTranslations('ja-JP');

    expect(translations['mediaLibrary.folders.action.addScan']).toBe('追加してスキャン');
    expect(translations['likedPage.title']).toBe('お気に入り');
    expect(translations['mediaLibrary.settings.liveUpdates.title']).toBe('ライブラリのリアルタイム更新');
    expect(translations['settings.about.links.documentation']).toBe('ドキュメント');
  });

  it('uses natural Korean for common like and play actions', async () => {
    const translations = await loadTranslations('ko-KR');

    expect(translations['albumDetail.action.playNow']).toBe('지금 재생');
    expect(translations['albumDetail.action.unlikeAlbum']).toBe('앨범 좋아요 취소');
    expect(translations['albumDetail.action.openSource']).toBe('원본 폴더 열기');
    expect(translations['common.build']).toBe('빌드');
    expect(translations['firstRun.detail.accounts.local']).toContain('로컬 라이브러리');
    expect(translations['connectPage.radio.emptyTitle']).toBe('라이브 스트림 URL 추가');
  });

  it('keeps Japanese settings labels localized instead of leftover English', async () => {
    const translations = await loadTranslations('ja-JP');

    expect(translations['settings.appearance.themeCustom.title']).toBe('現在のテーマを調整');
    expect(translations['settings.shortcuts.action.openPlaybackQueue.title']).toBe('キューを開く');
    expect(translations['connectPage.preflight.title']).toBe('機器接続の準備');
    expect(translations['connectPage.outgoing.empty']).toBe('まだ機器からの要求はありません');
    expect(translations['inboxPage.smartCrates.kicker']).toBe('スマートクレート');
  });

  it('keeps Korean Connect errors as readable sentences', async () => {
    const translations = await loadTranslations('ko-KR');

    expect(translations['connectPage.error.airplayBridge']).toBe('AirPlay 수신을 사용할 수 없습니다.');
    expect(translations['connectPage.echoLink.backgroundType']).toBe('종류');
    expect(translations['historyPage.summary.today.count']).toBe('오늘 재생');
    expect(translations['connectPage.preflight.title']).toBe('기기 연결 준비');
    expect(translations['queue.page.selection.select']).toBe('선택');
    expect(translations['connectPage.lock.copyHwid']).toBe('HWID 복사');
    expect(translations['connectPage.nowPlaying.aria']).toBe('현재 전송');
    expect(translations['connectPage.hqplayer.localModeHint']).toContain('루프백');
    expect(translations['playerDacArrival.eyebrow']).toBe('DAC 도착');
    expect(translations['settings.playback.hqplayer.defaultBackend.hqplayer']).toBe('HQPlayer 우선');
  });

  it('keeps Traditional Chinese Connect coverage without falling back to Simplified-only keys', async () => {
    const translations = await loadTranslations('zh-TW');

    expect(translations['connectPage.preflight.title']).toBe('準備連線裝置');
    expect(translations['connectPage.trust.returnLocal']).toBe('返回本機播放');
    expect(translations['inboxPage.smartCrates.kicker']).toBe('智慧唱片箱');
    expect(translations['artistDetail.aroundWeb.heading']).toBe('網路上');
  });

  it('keeps Simplified Chinese Connect kickers in Chinese', async () => {
    expect(fallbackTranslations['connectPage.devices.kicker']).toBe('局域网数播');
    expect(fallbackTranslations['connectPage.header.kicker']).toBe('无线播放');
  });

  it('keeps English Connect copy human instead of title-cased keys', async () => {
    const translations = await loadTranslations('en-US');

    expect(translations['connectPage.radio.emptyTitle']).toBe('Add a live-stream URL');
    expect(translations['home.hero.kicker']).toBe("Today's ECHO");
    expect(translations['connectPage.lock.copyHwid']).toBe('Copy HWID');
  });

  it('keeps every non-Chinese dictionary aligned with the English dictionary', async () => {
    for (const locale of ['zh-TW', 'ja-JP', 'ko-KR'] as const) {
      const translations = await loadTranslations(locale);
      const missingKeys = Object.keys(enUS).filter((key) => !(key in translations));

      expect(missingKeys, `${locale} is missing translation keys`).toEqual([]);
    }
  });
});
