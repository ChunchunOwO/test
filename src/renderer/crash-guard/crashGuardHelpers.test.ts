import { describe, expect, it } from 'vitest';
import { buildCrashClipboardText, crashGuardWindowKey, displayCrashOutputPath } from './crashGuardHelpers';

describe('crashGuardHelpers', () => {
  it('maps crash guard window labels', () => {
    expect(crashGuardWindowKey('main-window')).toBe('crashGuard.window.main');
    expect(crashGuardWindowKey('mini-player')).toBe('crashGuard.window.miniPlayer');
    expect(crashGuardWindowKey('desktop-lyrics')).toBe('crashGuard.window.desktopLyrics');
    expect(crashGuardWindowKey('pet')).toBe('crashGuard.window.pet');
  });

  it('shows only the file name from diagnostic output paths', () => {
    expect(displayCrashOutputPath('D:\\\\ECHO\\\\logs\\\\echo-diagnostics.zip')).toBe('echo-diagnostics.zip');
    expect(displayCrashOutputPath('/tmp/echo-diagnostics.zip')).toBe('echo-diagnostics.zip');
  });

  it('builds a clipboard payload from the error message and stack', () => {
    const error = Object.assign(new Error('boom'), { stack: 'Error: boom\n    at App' });
    expect(buildCrashClipboardText(error)).toContain('boom');
    expect(buildCrashClipboardText(error)).toContain('at App');
  });
});
