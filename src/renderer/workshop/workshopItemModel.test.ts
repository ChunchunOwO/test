import { describe, expect, it } from 'vitest';
import type { WorkshopManagerItem } from '../../shared/types/workshop';
import {
  formatWorkshopActionNotice,
  matchesWorkshopQuery,
  resolveWorkshopRowActions,
} from './workshopItemModel';

const item = (overrides: Partial<WorkshopManagerItem>): WorkshopManagerItem => ({
  sourceId: 'steam',
  itemId: '123',
  state: 'disabled',
  contentId: 'echo.theme-fixture',
  contentKind: 'theme',
  version: '1.0.0',
  enabled: false,
  catalogReady: false,
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
  ...overrides,
});

describe('workshopItemModel', () => {
  it('keeps 使用 as the primary command before the item is ingested', () => {
    expect(resolveWorkshopRowActions(item({
      state: 'not-ingested',
      subscription: {
        itemId: '123',
        subscribed: true,
        installed: false,
        needsUpdate: false,
        downloading: false,
        downloadPending: false,
        locallyDisabled: false,
        install: null,
        download: null,
        error: null,
      },
    }))).toEqual([{ action: 'use', label: '使用', primary: true }]);
  });

  it('switches an enabled theme through apply without calling the heavy use pipeline', () => {
    expect(resolveWorkshopRowActions(item({
      state: 'enabled',
      enabled: true,
      catalogReady: true,
    }))).toEqual([
      { action: 'ingest', label: '同步已安装版本', primary: false },
      { action: 'apply', label: '切换主题', primary: true },
      { action: 'disable', label: '停用', primary: false },
    ]);
  });

  it('marks the current theme without offering a redundant apply action', () => {
    expect(resolveWorkshopRowActions(item({
      state: 'enabled',
      enabled: true,
      catalogReady: true,
      theme: {
        themeId: 'workshop:active',
        title: 'Active Theme',
        description: null,
        basePreset: 'classic',
        swatches: ['#10131a', '#66ccff'],
        colorModes: ['dark'],
        skin: null,
        active: true,
      },
    }))).toEqual([
      { action: 'ingest', label: '同步已安装版本', primary: false },
      { action: 'disable', label: '停用', primary: false },
    ]);
  });

  it('explains that a started download will continue the same 使用 command', () => {
    expect(formatWorkshopActionNotice('use', item({ state: 'not-ingested' }), 'download-started'))
      .toBe('echo.theme-fixture：已开始下载。完成后会继续使用。');
  });

  it('matches installed items by pinyin and kind labels', () => {
    const themeItem = item({ contentKind: 'theme', contentId: 'echo.theme-night' });
    expect(matchesWorkshopQuery(themeItem, 'zhuti')).toBe(true);
    expect(matchesWorkshopQuery(themeItem, 'theme-night')).toBe(true);
    expect(matchesWorkshopQuery(themeItem, 'buffer')).toBe(false);
  });
});
