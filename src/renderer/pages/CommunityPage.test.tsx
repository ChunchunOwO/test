// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WorkshopBrowsePage, WorkshopManagerSnapshot } from '../../shared/types/workshop';
import { consumePendingWorkshopPane } from '../workshop/workshopNavigation';
import { CommunityPage } from './CommunityPage';

const workshopSnapshot: WorkshopManagerSnapshot = {
  source: {
    available: true,
    items: [
      {
        itemId: '101',
        subscribed: true,
        installed: true,
        needsUpdate: false,
        downloading: false,
        downloadPending: false,
        locallyDisabled: false,
        install: { sizeOnDiskBytes: '2048', installedAtUnixSeconds: 1_786_400_000 },
        download: null,
        error: null,
      },
      {
        itemId: '102',
        subscribed: true,
        installed: false,
        needsUpdate: false,
        downloading: true,
        downloadPending: false,
        locallyDisabled: false,
        install: null,
        download: { downloadedBytes: '512', totalBytes: '2048' },
        error: null,
      },
    ],
  },
  registry: { writable: true, error: null, revision: 2 },
  catalog: { writable: true, error: null, revision: 1 },
  reconcile: { state: 'ready', lastReport: null },
  items: [
    {
      sourceId: 'steam',
      itemId: '101',
      state: 'enabled',
      contentId: 'echo.theme-one',
      contentKind: 'theme',
      version: '1.0.0',
      enabled: true,
      catalogReady: true,
      errorCode: null,
      subscription: null,
      theme: null,
    },
    {
      sourceId: 'steam',
      itemId: '102',
      state: 'downloading',
      contentId: null,
      contentKind: null,
      version: null,
      enabled: false,
      catalogReady: false,
      errorCode: null,
      subscription: {
        itemId: '102',
        subscribed: true,
        installed: false,
        needsUpdate: false,
        downloading: true,
        downloadPending: false,
        locallyDisabled: false,
        install: null,
        download: { downloadedBytes: '512', totalBytes: '2048' },
        error: null,
      },
      theme: null,
    },
  ],
};

const workshopBrowsePage: WorkshopBrowsePage = {
  available: true,
  page: 1,
  total: 16,
  items: [{
    itemId: '999',
    title: 'Lunar Bloom',
    description: 'A calm community theme.',
    tags: ['theme', 'dark'],
    subscribed: false,
    numUpvotes: 128,
    numDownvotes: 2,
    subscriptionCount: 2400,
    previewUrl: null,
    updatedAtUnixSeconds: 1_786_400_000,
  }],
};

const createWorkshopApi = () => ({
  getSnapshot: vi.fn(async () => workshopSnapshot),
  browse: vi.fn(async () => workshopBrowsePage),
  openInSteam: vi.fn(async () => ({ ok: true, action: 'open-in-steam' as const, reason: null, snapshot: workshopSnapshot })),
});

const installBridge = (
  openExternalUrl = vi.fn(async () => undefined),
  workshop = createWorkshopApi(),
) => {
  Object.defineProperty(window, 'echo', {
    configurable: true,
    value: { app: { openExternalUrl }, workshop },
  });
  return { openExternalUrl, workshop };
};

describe('CommunityPage', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    window.sessionStorage.clear();
    Reflect.deleteProperty(window, 'echo');
  });

  it('opens the in-app Workshop from the primary action', () => {
    installBridge();
    const navigate = vi.fn();
    window.addEventListener('app:navigate:route', navigate);

    render(<CommunityPage />);
    fireEvent.click(screen.getByRole('button', { name: /进入创意工坊/ }));

    expect(navigate).toHaveBeenCalledTimes(1);
    expect((navigate.mock.calls[0]?.[0] as CustomEvent).detail).toBe('workshop');
    expect(consumePendingWorkshopPane()).toBe('discover');
    window.removeEventListener('app:navigate:route', navigate);
  });

  it('shows live local Workshop metrics and Steam spotlight content', async () => {
    const { workshop } = installBridge();
    render(<CommunityPage />);

    expect(await screen.findByText('Lunar Bloom')).toBeTruthy();
    expect(screen.getByText('16 个可发现项目')).toBeTruthy();
    expect(screen.getByRole('button', { name: /已订阅.*2.*查看内容/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /已启用.*1.*管理状态/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /待处理.*1.*检查项目/ })).toBeTruthy();
    expect(workshop.getSnapshot).toHaveBeenCalledTimes(1);
    expect(workshop.browse).toHaveBeenCalledWith({ page: 1, sort: 'trend' });

    fireEvent.click(screen.getByRole('button', { name: '在 Steam 中查看 Lunar Bloom' }));
    await waitFor(() => expect(workshop.openInSteam).toHaveBeenCalledWith({ sourceId: 'steam', itemId: '999' }));
  });

  it('opens community destinations through the desktop bridge', async () => {
    const { openExternalUrl } = installBridge();
    render(<CommunityPage />);

    fireEvent.click(screen.getByRole('button', { name: /打开 Steam 社区/ }));
    fireEvent.click(screen.getByRole('button', { name: /Discord/ }));
    fireEvent.click(screen.getByRole('button', { name: /QQ 交流群/ }));
    fireEvent.click(screen.getByRole('button', { name: /问题反馈/ }));

    await waitFor(() => expect(openExternalUrl).toHaveBeenCalledTimes(4));
    expect(openExternalUrl).toHaveBeenCalledWith('https://steamcommunity.com/app/5105090');
    expect(openExternalUrl).toHaveBeenCalledWith('https://discord.gg/g7v4WMRq3K');
    expect(openExternalUrl).toHaveBeenCalledWith('https://qm.qq.com/q/KrJE8PIqSQ');
    expect(openExternalUrl).toHaveBeenCalledWith('https://github.com/Moekotori/ECHO/issues');
  });

  it('shows a local error when an external destination cannot open', async () => {
    installBridge(vi.fn(async () => Promise.reject(new Error('blocked'))));
    render(<CommunityPage />);

    fireEvent.click(screen.getByRole('button', { name: /打开 Steam 社区/ }));

    expect((await screen.findByRole('alert')).textContent).toContain('暂时无法打开链接');
  });
});
