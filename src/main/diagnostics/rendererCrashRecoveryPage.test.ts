import { describe, expect, it } from 'vitest';
import {
  createRendererCrashRecoveryHtml,
  displayCrashOutputPath,
  isSafeRendererRestoreUrl,
  mapCrashRecoveryLocale,
  rendererCrashReasonCode,
  resolveRendererCrashReason,
  resolveRendererCrashWindowKind,
} from './rendererCrashRecoveryPage';

describe('rendererCrashRecoveryPage', () => {
  it('maps window kinds from renderer URLs', () => {
    expect(resolveRendererCrashWindowKind('https://echo.local/?pet=1')).toBe('pet');
    expect(resolveRendererCrashWindowKind('https://echo.local/?miniPlayer=1')).toBe('miniPlayer');
    expect(resolveRendererCrashWindowKind('https://echo.local/?desktopLyrics=1')).toBe('desktopLyrics');
    expect(resolveRendererCrashWindowKind('https://echo.local/')).toBe('main');
  });

  it('maps crash reasons and codes', () => {
    expect(resolveRendererCrashReason('oom')).toBe('oom');
    expect(rendererCrashReasonCode('oom')).toBe('OOM');
    expect(rendererCrashReasonCode('crashed')).toBe('CRASH');
    expect(resolveRendererCrashReason('something-else')).toBe('unknown');
  });

  it('accepts only http(s) and file restore URLs', () => {
    expect(isSafeRendererRestoreUrl('http://localhost:5173/')).toBe(true);
    expect(isSafeRendererRestoreUrl('file:///C:/ECHO/index.html')).toBe(true);
    expect(isSafeRendererRestoreUrl('data:text/html,hi')).toBe(false);
    expect(isSafeRendererRestoreUrl('javascript:alert(1)')).toBe(false);
  });

  it('shows only the file name for exported paths', () => {
    expect(displayCrashOutputPath('C:\\\\Users\\\\echo\\\\echo-diagnostics.zip')).toBe('echo-diagnostics.zip');
  });

  it('escapes crash HTML and keeps a restore action for safe URLs', () => {
    const html = createRendererCrashRecoveryHtml({
      message: '<script>alert(1)</script>',
      details: { reason: 'oom', exitCode: -1 },
      restoreUrl: 'http://localhost:5173/?miniPlayer=1',
      windowKind: 'miniPlayer',
      locale: 'zh-CN',
      characterUrl: 'yokko.png',
      backdropUrl: 'station.png',
      decorationUrl: 'stickers.png',
    });

    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('OOM');
    expect(html).toContain('内存不足被系统终止');
    expect(html).toContain('观察室');
    expect(html).toContain('迷你播放器');
    expect(html).toContain('class="echo-crash-guard-character"');
    expect(html).toContain('src="yokko.png"');
    expect(html.match(/class="echo-crash-guard-sticker"/g)).toHaveLength(6);
    expect(html.match(/class="echo-crash-guard-sticker-art"/g)).toHaveLength(6);
    expect(html).toContain('data-motion="pulse"');
    expect(html).toContain('animation-duration:');
    expect(html).toContain('--cg-sticker-sprite:url("stickers.png")');
    expect(html).toContain('url("station.png")');
    expect(html).not.toContain('reason-card');
    expect(html).toContain('echo-crash-guard-chart-clip');
    expect(html).toContain('echo-crash-guard-rail-monitor');
    expect(html).toContain('echo-crash-guard-rail-board');
    expect(html.match(/<li class="echo-crash-guard-rail-board-item">/g)).toHaveLength(3);
    expect(html).toContain('echo-crash-guard-rail-ticket');
    expect(html).toContain('data-action="reload"');
    expect(html).toContain('http://localhost:5173/?miniPlayer=1');
  });

  it('omits reload when the restore URL is unsafe', () => {
    const html = createRendererCrashRecoveryHtml({
      message: 'gone',
      details: { reason: 'crashed', exitCode: 1 },
      restoreUrl: 'javascript:alert(1)',
      locale: 'en-US',
    });

    expect(html).not.toContain('data-action="reload"');
    expect(html).not.toContain('javascript:');
    expect(html).toContain('lang="en-US"');
    expect(html).toContain('The renderer fell over. I am still here.');
    expect(html).toContain('Observation room');
    expect(html).toContain('I am still here. Leave the clues with me first.');
  });

  it('maps locales from Electron language tags', () => {
    expect(mapCrashRecoveryLocale('zh-TW')).toBe('zh-TW');
    expect(mapCrashRecoveryLocale('ja-JP')).toBe('ja-JP');
    expect(mapCrashRecoveryLocale('ko')).toBe('ko-KR');
    expect(mapCrashRecoveryLocale('en-GB')).toBe('en-US');
  });
});
