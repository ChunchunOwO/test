// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { AppTitleBar } from './AppTitleBar';
import { I18nProvider } from '../../i18n/I18nProvider';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('AppTitleBar', () => {
  const renderTitleBar = (props: Parameters<typeof AppTitleBar>[0]): void => {
    render(
      <I18nProvider>
        <AppTitleBar {...props} />
      </I18nProvider>,
    );
  };

  it('keeps album and import file out of the titlebar quick actions', () => {
    const onRouteChange = vi.fn();

    renderTitleBar({
      activeRouteId: 'songs',
      onRouteChange,
      onOpenAudioSettings: vi.fn(),
      onMinimize: vi.fn(),
      onHideToTray: vi.fn(),
      onToggleMaximize: vi.fn(),
      onClose: vi.fn(),
    });

    expect(screen.queryByRole('button', { name: 'Albums' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Import File' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Plugin commands|插件命令/u })).toBeNull();
    expect(screen.getByLabelText('Steam version').textContent).toBe('Steam Ver.');
    expect(onRouteChange).not.toHaveBeenCalled();
  });

  it('shows the Steam edition instead of a Pro badge', () => {
    renderTitleBar({
      activeRouteId: 'songs',
      onRouteChange: vi.fn(),
      onOpenAudioSettings: vi.fn(),
      onMinimize: vi.fn(),
      onHideToTray: vi.fn(),
      onToggleMaximize: vi.fn(),
      onClose: vi.fn(),
    });

    expect(screen.getByLabelText('Steam version').textContent).toBe('Steam Ver.');
    expect(screen.queryByLabelText('ECHO Pro unlocked')).toBeNull();
  });

  it('shows the normalized app version directly after the Steam edition label', async () => {
    window.echo = {
      app: {
        getVersion: vi.fn().mockResolvedValue('26.7.18'),
      },
    } as unknown as Window['echo'];

    renderTitleBar({
      activeRouteId: 'songs',
      onRouteChange: vi.fn(),
      onOpenAudioSettings: vi.fn(),
      onMinimize: vi.fn(),
      onHideToTray: vi.fn(),
      onToggleMaximize: vi.fn(),
      onClose: vi.fn(),
    });

    const version = await screen.findByLabelText('ECHO app version v26.7.18');
    expect(version.textContent).toBe('v26.7.18');
    expect(version.previousElementSibling?.textContent).toBe('Steam Ver.');
  });

  it('keeps navigation buttons as route changes', () => {
    const onRouteChange = vi.fn();

    renderTitleBar({
      activeRouteId: 'songs',
      onRouteChange,
      onOpenAudioSettings: vi.fn(),
      onMinimize: vi.fn(),
      onHideToTray: vi.fn(),
      onToggleMaximize: vi.fn(),
      onClose: vi.fn(),
    });

    fireEvent.click(screen.getByRole('button', { name: /^(Settings|设置)$/u }));

    expect(onRouteChange).toHaveBeenCalledWith('settings');
  });

  it('preloads settings when the titlebar settings button is approached', () => {
    const onPreloadSettings = vi.fn();
    renderTitleBar({
      activeRouteId: 'songs',
      onRouteChange: vi.fn(),
      onPreloadSettings,
      onOpenAudioSettings: vi.fn(),
      onMinimize: vi.fn(),
      onHideToTray: vi.fn(),
      onToggleMaximize: vi.fn(),
      onClose: vi.fn(),
    });

    fireEvent.pointerEnter(screen.getByRole('button', { name: /^(Settings|设置)$/u }));

    expect(onPreloadSettings).toHaveBeenCalledTimes(1);
  });

  it('opens the audio drawer from the audio settings button', () => {
    const onRouteChange = vi.fn();
    const onOpenAudioSettings = vi.fn();

    renderTitleBar({
      activeRouteId: 'songs',
      onRouteChange,
      onOpenAudioSettings,
      onMinimize: vi.fn(),
      onHideToTray: vi.fn(),
      onToggleMaximize: vi.fn(),
      onClose: vi.fn(),
    });

    fireEvent.click(screen.getByRole('button', { name: /^(Audio Settings|音频设置)$/u }));

    expect(onOpenAudioSettings).toHaveBeenCalledTimes(1);
    expect(onRouteChange).not.toHaveBeenCalled();
  });

  it('does not expose an MV settings button', () => {
    renderTitleBar({
      activeRouteId: 'songs',
      onRouteChange: vi.fn(),
      onOpenAudioSettings: vi.fn(),
      onMinimize: vi.fn(),
      onHideToTray: vi.fn(),
      onToggleMaximize: vi.fn(),
      onClose: vi.fn(),
    });

    expect(screen.queryByRole('button', { name: 'MV Settings' })).toBeNull();
  });


  it('wires window control buttons to provided handlers', () => {
    const onMinimize = vi.fn();
    const onHideToTray = vi.fn();
    const onToggleMaximize = vi.fn();
    const onToggleFullscreen = vi.fn();
    const onClose = vi.fn();

    renderTitleBar({
      activeRouteId: 'songs',
      onRouteChange: vi.fn(),
      onOpenAudioSettings: vi.fn(),
      onMinimize,
      onHideToTray,
      onToggleMaximize,
      onToggleFullscreen,
      onClose,
    });

    fireEvent.click(screen.getByRole('button', { name: /^(Fullscreen|全屏)$/u }));
    fireEvent.click(screen.getByRole('button', { name: /^(Hide to tray|隐藏到托盘)$/u }));
    fireEvent.click(screen.getByRole('button', { name: /^(Minimize|最小化)$/u }));
    fireEvent.click(screen.getByRole('button', { name: /^(Maximize|最大化)$/u }));
    fireEvent.click(screen.getByRole('button', { name: /^(Close|关闭)$/u }));

    expect(onMinimize).toHaveBeenCalledTimes(1);
    expect(onHideToTray).toHaveBeenCalledTimes(1);
    expect(onToggleMaximize).toHaveBeenCalledTimes(1);
    expect(onToggleFullscreen).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows an exit fullscreen control while the window is fullscreen', () => {
    const onToggleFullscreen = vi.fn();

    renderTitleBar({
      activeRouteId: 'songs',
      isWindowFullscreen: true,
      onRouteChange: vi.fn(),
      onOpenAudioSettings: vi.fn(),
      onMinimize: vi.fn(),
      onHideToTray: vi.fn(),
      onToggleMaximize: vi.fn(),
      onToggleFullscreen,
      onClose: vi.fn(),
    });

    expect(screen.queryByRole('button', { name: /^(Fullscreen|全屏)$/u })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /^(Exit fullscreen|退出全屏)$/u }));

    expect(onToggleFullscreen).toHaveBeenCalledTimes(1);
  });

  it('shows a restore control while the window is maximized', () => {
    const onToggleMaximize = vi.fn();

    renderTitleBar({
      activeRouteId: 'songs',
      isWindowMaximized: true,
      onRouteChange: vi.fn(),
      onOpenAudioSettings: vi.fn(),
      onMinimize: vi.fn(),
      onHideToTray: vi.fn(),
      onToggleMaximize,
      onClose: vi.fn(),
    });

    expect(screen.queryByRole('button', { name: /^(Maximize|最大化)$/u })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /^(Restore|还原)$/u }));

    expect(onToggleMaximize).toHaveBeenCalledTimes(1);
  });

  it('returns from Settings when the titlebar settings button is clicked again', () => {
    const onRouteChange = vi.fn();
    const onSettingsBack = vi.fn();

    renderTitleBar({
      activeRouteId: 'settings',
      onRouteChange,
      onOpenAudioSettings: vi.fn(),
      onSettingsBack,
      onMinimize: vi.fn(),
      onHideToTray: vi.fn(),
      onToggleMaximize: vi.fn(),
      onClose: vi.fn(),
    });

    fireEvent.click(screen.getByRole('button', { name: /^(Settings|设置)$/u }));
    expect(onSettingsBack).toHaveBeenCalledTimes(1);
    expect(onRouteChange).not.toHaveBeenCalled();
  });

  it('keeps the settings back button out of the titlebar by default', () => {
    renderTitleBar({
      activeRouteId: 'settings',
      onRouteChange: vi.fn(),
      onOpenAudioSettings: vi.fn(),
      onMinimize: vi.fn(),
      onHideToTray: vi.fn(),
      onToggleMaximize: vi.fn(),
      onClose: vi.fn(),
    });

    expect(screen.queryByRole('button', { name: /返回上一页|Back to previous page/u })).toBeNull();
  });
});
