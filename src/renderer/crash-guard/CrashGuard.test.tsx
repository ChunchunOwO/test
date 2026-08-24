// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { CrashGuard } from './CrashGuard';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.echo = undefined as unknown as Window['echo'];
});

const CrashOnce = (): JSX.Element => {
  throw new Error('visual preview exploded');
};

describe('CrashGuard', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  it('shows recovery actions and window facts after a render crash', () => {
    window.echo = {
      diagnostics: {
        exportDiagnosticsZip: vi.fn(),
        openCrashReport: vi.fn(),
        relaunchApp: vi.fn(),
        reportRendererError: vi.fn().mockResolvedValue(undefined),
      },
      app: {
        quit: vi.fn(),
      },
    } as unknown as Window['echo'];

    render(
      <CrashGuard label="mini-player">
        <CrashOnce />
      </CrashGuard>,
    );

    expect(screen.getByRole('heading', { name: '界面有点不舒服，我来看着。' })).toBeTruthy();
    expect(screen.getByText('观察室')).toBeTruthy();
    expect(screen.getByText('先别急着重启，把现场交给我吧。')).toBeTruthy();
    expect(screen.getAllByText('迷你播放器')).toHaveLength(2);
    expect(screen.getByRole('button', { name: '导出诊断包' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '复制摘要' })).toBeTruthy();
    expect(screen.getByText('先留线索')).toBeTruthy();
    expect(screen.getByText('再恢复')).toBeTruthy();
    expect(document.querySelector('.echo-crash-guard-character')).toBeTruthy();
    expect(document.querySelectorAll('.echo-crash-guard-sticker')).toHaveLength(6);
    expect(document.querySelectorAll('.echo-crash-guard-sticker-art')).toHaveLength(6);
    expect(new Set(Array.from(document.querySelectorAll('.echo-crash-guard-sticker-art')).map((sticker) => sticker.getAttribute('data-motion'))).size).toBe(6);
    expect(new Set(Array.from(document.querySelectorAll('.echo-crash-guard-sticker')).map((sticker) => sticker.getAttribute('data-slot'))).size).toBe(6);
    expect(document.querySelector('.echo-crash-guard-rail-monitor')).toBeTruthy();
    expect(document.querySelector('.echo-crash-guard-rail-board')).toBeTruthy();
    expect(document.querySelectorAll('.echo-crash-guard-rail-board-item')).toHaveLength(3);
    expect(document.querySelector('.echo-crash-guard-rail-ticket')).toBeTruthy();
    expect(document.querySelector('.echo-crash-guard-chart-clip')).toBeTruthy();
    expect(screen.getByText('导出')).toBeTruthy();
  });

  it('copies the error summary without requiring the diagnostics bridge', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(
      <CrashGuard label="main-window">
        <CrashOnce />
      </CrashGuard>,
    );

    fireEvent.click(screen.getByRole('button', { name: '复制摘要' }));
    expect(writeText).toHaveBeenCalled();
    expect(String(writeText.mock.calls[0]?.[0])).toContain('visual preview exploded');
  });
});
