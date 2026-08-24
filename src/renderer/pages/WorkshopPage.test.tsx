// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkshopBrowsePage, WorkshopManagerActionResult, WorkshopManagerSnapshot } from '../../shared/types/workshop';
import { navigateToWorkshopPane } from '../workshop/workshopNavigation';
import { WorkshopPage } from './WorkshopPage';

const snapshot = (state: 'disabled' | 'enabled' = 'disabled'): WorkshopManagerSnapshot => ({
  source: {
    available: true,
    items: [{
      itemId: '123',
      subscribed: true,
      installed: true,
      needsUpdate: false,
      downloading: false,
      downloadPending: false,
      locallyDisabled: false,
      install: { sizeOnDiskBytes: '4096', installedAtUnixSeconds: 1_786_400_000 },
      download: null,
      error: null,
    }],
  },
  registry: { writable: true, error: null, revision: 5 },
  catalog: { writable: true, error: null, revision: state === 'enabled' ? 1 : 0 },
  reconcile: { state: 'ready', lastReport: null },
  items: [{
    sourceId: 'steam',
    itemId: '123',
    state,
    contentId: 'echo.theme-fixture',
    contentKind: 'theme',
    version: '1.0.0',
    enabled: state === 'enabled',
    catalogReady: state === 'enabled',
    errorCode: null,
    theme: null,
    subscription: {
      itemId: '123',
      subscribed: true,
      installed: true,
      needsUpdate: false,
      downloading: false,
      downloadPending: false,
      locallyDisabled: false,
      install: { sizeOnDiskBytes: '4096', installedAtUnixSeconds: 1_786_400_000 },
      download: null,
      error: null,
    },
  }],
});

const workshopApi = {
  getSnapshot: vi.fn(async () => snapshot()),
  reconcile: vi.fn(async () => ({ ok: true, action: 'reconcile' as const, reason: null, snapshot: snapshot() })),
  requestDownload: vi.fn(),
  ingest: vi.fn(async () => ({ ok: true, action: 'ingest' as const, reason: null, snapshot: snapshot() })),
  enable: vi.fn(async () => ({ ok: true, action: 'enable' as const, reason: null, snapshot: snapshot('enabled') })),
  disable: vi.fn(),
  apply: vi.fn(async () => ({ ok: true, action: 'apply' as const, reason: null, snapshot: snapshot('enabled') })),
  use: vi.fn(async (): Promise<WorkshopManagerActionResult> => ({
    ok: true,
    action: 'use',
    reason: null,
    snapshot: snapshot('enabled'),
  })),
  browse: vi.fn(async (): Promise<WorkshopBrowsePage> => ({ available: true, page: 1, total: 0, items: [] })),
  subscribe: vi.fn(async () => ({ ok: true, action: 'subscribe' as const, reason: null, snapshot: snapshot() })),
  unsubscribe: vi.fn(async () => ({ ok: true, action: 'unsubscribe' as const, reason: null, snapshot: snapshot() })),
  openInSteam: vi.fn(async () => ({ ok: true, action: 'open-in-steam' as const, reason: null, snapshot: snapshot() })),
};

const themedSnapshot = (active: boolean): WorkshopManagerSnapshot => {
  const value = snapshot('enabled');
  value.items[0]!.theme = {
    themeId: 'workshop:theme-fixture',
    title: 'Aurora Shell',
    description: 'A complete listening-room reskin.',
    basePreset: 'classic',
    swatches: ['#10131a', '#66ccff', '#99ffcc'],
    colorModes: ['light', 'dark'],
    skin: {
      mode: 'shell',
      layout: {
        sidebarPosition: 'right',
        sidebarPresentation: 'overlay',
        sidebarWidth: 'wide',
        playerStyle: 'hero',
        titlebarStyle: 'immersive',
        contentDensity: 'editorial',
        cardStyle: 'glass',
        displayStyle: 'editorial',
        navStyle: 'pills',
        motion: 'cinematic',
      },
      stages: { home: 'cinema', lyrics: 'theater', queue: 'tickets', songs: 'poster' },
      assetCount: 4,
    },
    active,
  };
  return value;
};

beforeEach(() => {
  vi.clearAllMocks();
  workshopApi.getSnapshot.mockImplementation(async () => snapshot());
  workshopApi.use.mockImplementation(async (): Promise<WorkshopManagerActionResult> => ({
    ok: true,
    action: 'use',
    reason: null,
    snapshot: snapshot('enabled'),
  }));
  workshopApi.browse.mockImplementation(async (): Promise<WorkshopBrowsePage> => ({
    available: true,
    page: 1,
    total: 0,
    items: [],
  }));
  window.echo = { workshop: workshopApi } as unknown as Window['echo'];
});

afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
  window.echo = undefined as unknown as Window['echo'];
});

describe('WorkshopPage', () => {
  it('honors a requested pane from the community center', async () => {
    navigateToWorkshopPane('discover');
    render(<WorkshopPage />);

    expect(await screen.findByRole('tab', { name: '发现', selected: true })).toBeTruthy();
    expect(workshopApi.browse).toHaveBeenCalledWith({ page: 1, sort: 'trend' });
  });

  it('opens the built-in guide and can continue to discovery', async () => {
    render(<WorkshopPage />);

    await screen.findByText('echo.theme-fixture');
    expect(screen.getByText('在「发现」里找内容')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '查看完整指南' }));

    expect(screen.getByRole('dialog', { name: '创意工坊使用指南' })).toBeTruthy();
    expect(screen.getByText(/订阅只负责让 Steam 下载内容/)).toBeTruthy();
    expect(screen.getByText('不同内容在哪里确认生效')).toBeTruthy();
    expect(screen.getByText('按钮分别做什么')).toBeTruthy();
    expect(screen.getByText(/查看 Steam 下载队列/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '去发现内容' }));

    expect(screen.queryByRole('dialog', { name: '创意工坊使用指南' })).toBeNull();
    expect(await screen.findByRole('tab', { name: '发现', selected: true })).toBeTruthy();
  });

  it('previews an installed theme and switches it without repeating the ingestion pipeline', async () => {
    workshopApi.getSnapshot.mockResolvedValueOnce(themedSnapshot(false));
    workshopApi.apply.mockResolvedValueOnce({
      ok: true,
      action: 'apply',
      reason: null,
      snapshot: themedSnapshot(true),
    });
    render(<WorkshopPage />);

    expect(await screen.findByText('Aurora Shell')).toBeTruthy();
    expect(screen.getByText(/明暗双模式 · 完整外观外壳 · 4 个本地素材/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '切换主题' }));

    await waitFor(() => expect(workshopApi.apply).toHaveBeenCalledWith({
      sourceId: 'steam',
      itemId: '123',
    }));
    expect(await screen.findByText('当前主题')).toBeTruthy();
  });

  it('loads a typed snapshot and uses a disabled data item in one step', async () => {
    render(<WorkshopPage />);

    expect(await screen.findByText('echo.theme-fixture')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '启用并切换' }));

    await waitFor(() => expect(workshopApi.use).toHaveBeenCalledWith({
      sourceId: 'steam',
      itemId: '123',
    }));
    expect(await screen.findByRole('button', { name: '停用' })).toBeTruthy();
    expect(screen.getByText(/已开始使用/)).toBeTruthy();
  });

  it('runs the explicit safe repair command', async () => {
    render(<WorkshopPage />);

    await screen.findByText('echo.theme-fixture');
    fireEvent.click(screen.getByRole('button', { name: '安全修复' }));

    await waitFor(() => expect(workshopApi.reconcile).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('一致性检查与安全修复已完成。')).toBeTruthy();
  });

  it('can re-ingest an installed revision without conflating it with enable', async () => {
    render(<WorkshopPage />);

    await screen.findByText('echo.theme-fixture');
    fireEvent.click(screen.getByRole('button', { name: '同步已安装版本' }));

    await waitFor(() => expect(workshopApi.ingest).toHaveBeenCalledWith({
      sourceId: 'steam',
      itemId: '123',
    }));
    expect(workshopApi.enable).not.toHaveBeenCalled();
  });

  it('explicitly applies an enabled catalog contribution', async () => {
    workshopApi.getSnapshot.mockResolvedValueOnce(snapshot('enabled'));
    render(<WorkshopPage />);

    expect(await screen.findByRole('button', { name: '切换主题' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '切换主题' }));

    await waitFor(() => expect(workshopApi.apply).toHaveBeenCalledWith({
      sourceId: 'steam',
      itemId: '123',
    }));
    expect(workshopApi.use).not.toHaveBeenCalled();
    expect(screen.getByText(/已应用到 ECHO/)).toBeTruthy();
  });

  it('filters the catalog by content kind and search text', async () => {
    render(<WorkshopPage />);

    expect(await screen.findByText('echo.theme-fixture')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /DSP/ }));
    expect(screen.queryByText('echo.theme-fixture')).toBeNull();
    expect(screen.getByText('当前筛选没有内容')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '查看全部' }));
    expect(screen.getByText('echo.theme-fixture')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '主题' }));
    expect(screen.getByRole('button', { name: /主题/, pressed: true })).toBeTruthy();

    fireEvent.change(screen.getByLabelText('按状态筛选'), { target: { value: 'issue' } });
    expect(screen.getByText('当前筛选没有内容')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '查看全部' }));
    expect(screen.getByText('echo.theme-fixture')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('搜索创意工坊内容'), { target: { value: 'xyz' } });
    expect(screen.getByText('没有匹配内容')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '清空搜索' }));
    expect(screen.getByText('echo.theme-fixture')).toBeTruthy();
  });

  it('focuses search from the keyboard and runs the primary action with Enter', async () => {
    render(<WorkshopPage />);

    await screen.findByText('echo.theme-fixture');
    fireEvent.keyDown(window, { key: '/' });
    expect(document.activeElement).toBe(screen.getByLabelText('搜索创意工坊内容'));

    fireEvent.keyDown(window, { key: 'Enter' });
    await waitFor(() => expect(workshopApi.use).toHaveBeenCalledWith({
      sourceId: 'steam',
      itemId: '123',
    }));
  });

  it('can dismiss a success notice', async () => {
    render(<WorkshopPage />);

    await screen.findByText('echo.theme-fixture');
    fireEvent.click(screen.getByRole('button', { name: '启用并切换' }));
    expect(await screen.findByText(/已开始使用/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '关闭提示' }));
    expect(screen.queryByText(/已开始使用/)).toBeNull();
  });

  it('browses and subscribes from the discover pane without auto-enabling', async () => {
    workshopApi.browse.mockResolvedValue({
      available: true,
      page: 1,
      total: 1,
      items: [{
        itemId: '999',
        title: 'Mint Theme',
        description: 'A local theme pack',
        tags: ['theme'],
        subscribed: false,
        numUpvotes: 12,
        numDownvotes: 1,
        subscriptionCount: 40,
        previewUrl: 'echo-workshop://preview/?u=https%3A%2F%2Fcdn.akamai.steamstatic.com%2Fsteamcommunity%2Fpublic%2Fimages%2Fapps%2F1.png',
        updatedAtUnixSeconds: 1_786_400_000,
      }],
    });
    render(<WorkshopPage />);

    await screen.findByText('echo.theme-fixture');
    fireEvent.click(screen.getByRole('tab', { name: '发现' }));
    expect(await screen.findByText('Mint Theme')).toBeTruthy();
    expect(workshopApi.browse).toHaveBeenCalledWith({ page: 1, sort: 'trend' });
    expect(screen.getByText('92% 好评')).toBeTruthy();
    expect(screen.getByText(/更新于/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '刷新结果' }));
    await waitFor(() => expect(workshopApi.browse).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByRole('button', { name: '订阅' }));

    await waitFor(() => expect(workshopApi.subscribe).toHaveBeenCalledWith({
      sourceId: 'steam',
      itemId: '999',
    }));
    expect(workshopApi.use).not.toHaveBeenCalled();
    expect(workshopApi.enable).not.toHaveBeenCalled();
    expect(await screen.findByRole('tab', { name: '已装', selected: true })).toBeTruthy();
    expect(screen.getByText(/到已装列表点「使用」才会应用到 ECHO/)).toBeTruthy();
    await waitFor(() => expect(workshopApi.getSnapshot).toHaveBeenCalled());
  });

  it('opens discover when there is nothing installed yet', async () => {
    workshopApi.getSnapshot.mockResolvedValueOnce({
      ...snapshot(),
      source: { available: true, items: [] },
      items: [],
    });
    render(<WorkshopPage />);

    expect(await screen.findByRole('tab', { name: '发现', selected: true })).toBeTruthy();
    expect(workshopApi.browse).toHaveBeenCalled();
  });

  it('continues 使用 after a started download finishes', async () => {
    vi.useFakeTimers({ toFake: ['setInterval'] });
    const pending: WorkshopManagerSnapshot = {
      ...snapshot(),
      items: [{
        ...snapshot().items[0]!,
        state: 'not-ingested',
        subscription: {
          ...snapshot().items[0]!.subscription!,
          installed: false,
          install: null,
        },
      }],
    };
    const downloading: WorkshopManagerSnapshot = {
      ...pending,
      items: [{
        ...pending.items[0]!,
        subscription: {
          ...pending.items[0]!.subscription!,
          downloading: true,
        },
      }],
    };
    workshopApi.getSnapshot.mockImplementation(async () => pending);
    let uses = 0;
    workshopApi.use.mockImplementation(async (): Promise<WorkshopManagerActionResult> => {
      uses += 1;
      if (uses === 1) {
        return { ok: true, action: 'use', reason: 'download-started', snapshot: downloading };
      }
      return { ok: true, action: 'use', reason: null, snapshot: snapshot('enabled') };
    });

    try {
      render(<WorkshopPage />);
      fireEvent.click(await screen.findByRole('button', { name: '使用' }));
      await waitFor(() => expect(workshopApi.use).toHaveBeenCalledTimes(1));
      expect(screen.getByText(/完成后会继续使用/)).toBeTruthy();
      workshopApi.getSnapshot.mockImplementation(async () => snapshot());
      await act(async () => {
        await vi.advanceTimersByTimeAsync(3_000);
      });
      await waitFor(() => expect(workshopApi.use).toHaveBeenCalledTimes(2));
      expect(workshopApi.enable).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
