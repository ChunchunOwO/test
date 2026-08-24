import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  applyMainWindowBackgroundMaterial,
  isMainWindowAcrylicSupportedPlatform,
  resolveMainWindowBackgroundColor,
} from './windowBackgroundMaterial';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('main window background material', () => {
  it('uses a transparent native background for acrylic and preserves the opaque startup fallback otherwise', () => {
    expect(resolveMainWindowBackgroundColor(true, '#74d3e5')).toBe('#00000000');
    expect(resolveMainWindowBackgroundColor(false, '#74d3e5')).toBe('#74d3e5');
  });

  it('only enables native acrylic on Windows 11 22H2 or newer', () => {
    expect(isMainWindowAcrylicSupportedPlatform('win32', '10.0.22621')).toBe(true);
    expect(isMainWindowAcrylicSupportedPlatform('win32', '10.0.26100')).toBe(true);
    expect(isMainWindowAcrylicSupportedPlatform('win32', '10.0.22000')).toBe(false);
    expect(isMainWindowAcrylicSupportedPlatform('linux', '6.8.0')).toBe(false);
  });

  it('removes the opaque native tint before exposing Windows acrylic', () => {
    const window = {
      isDestroyed: vi.fn(() => false),
      setBackgroundColor: vi.fn(),
      setBackgroundMaterial: vi.fn(),
    };

    applyMainWindowBackgroundMaterial(window as never, { appWindowAcrylicEnabled: true }, true);

    expect(window.setBackgroundMaterial).toHaveBeenCalledWith('acrylic');
    expect(window.setBackgroundColor).toHaveBeenCalledWith('#00000000');
  });

  it('restores an opaque neutral background when acrylic is disabled', () => {
    const window = {
      isDestroyed: vi.fn(() => false),
      setBackgroundColor: vi.fn(),
      setBackgroundMaterial: vi.fn(),
    };

    applyMainWindowBackgroundMaterial(window as never, { appWindowAcrylicEnabled: false }, true);

    expect(window.setBackgroundColor).toHaveBeenCalledWith('#f7f9fc');
    expect(window.setBackgroundMaterial).toHaveBeenCalledWith('none');
  });

  it('keeps an opaque neutral fallback when native acrylic is unsupported', () => {
    const window = {
      isDestroyed: vi.fn(() => false),
      setBackgroundColor: vi.fn(),
      setBackgroundMaterial: vi.fn(),
    };

    applyMainWindowBackgroundMaterial(window as never, { appWindowAcrylicEnabled: true }, false);

    expect(window.setBackgroundColor).toHaveBeenCalledWith('#f7f9fc');
    expect(window.setBackgroundMaterial).not.toHaveBeenCalled();
  });
});
