// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EqState } from '../../../shared/types/eq';
import type { OpraHeadphoneCorrectionBrowseResult, OpraHeadphoneCorrectionPreview } from '../../../shared/types/opra';

const bridge = vi.hoisted(() => ({
  applyHeadphoneCorrection: vi.fn(),
  browseHeadphoneCorrections: vi.fn(),
  setEnabled: vi.fn(),
}));

const appBridge = vi.hoisted(() => ({ openExternalUrl: vi.fn() }));

vi.mock('../../utils/echoBridge', () => ({
  getEchoBridge: () => ({ app: appBridge }),
  getEqBridge: () => bridge,
}));

vi.mock('../../i18n/I18nProvider', () => ({
  useOptionalI18n: () => ({ locale: 'zh-CN' }),
}));

import { HeadphoneCorrectionPanel } from './HeadphoneCorrectionPanel';

const bands = [
  { frequencyHz: 100, gainDb: -2, q: 0.8, filterType: 'peaking' as const, enabled: true },
  { frequencyHz: 3000, gainDb: 3, q: 1.1, filterType: 'peaking' as const, enabled: true },
];

const initialEqState: EqState = {
  enabled: false,
  preampDb: 0,
  bands,
  presetId: 'flat',
  presetName: '原音如初',
  clippingRisk: false,
};

const preview = (overrides: Partial<OpraHeadphoneCorrectionPreview> = {}): OpraHeadphoneCorrectionPreview => ({
  eqId: 'eq-auto',
  productId: 'hd-650',
  productName: 'HD 650',
  productSubtype: null,
  vendorId: 'sennheiser',
  vendorName: 'Sennheiser',
  author: 'AutoEQ',
  details: 'Harman OE 2018',
  link: 'https://example.com/hd650',
  preset: { name: '耳机校正 - Sennheiser / HD 650 / AutoEQ', preampDb: -6.5, bands },
  originalBandCount: 2,
  importedBandCount: 2,
  skippedBandCount: 0,
  adjustedBandCount: 0,
  warnings: [],
  ...overrides,
});

const browseResult: OpraHeadphoneCorrectionBrowseResult = {
  query: '',
  vendorId: null,
  productId: null,
  vendors: [{
    vendorId: 'sennheiser',
    vendorName: 'Sennheiser',
    productCount: 1,
    eqCount: 2,
    logoUrl: null,
    sampleAssetUrl: null,
  }],
  products: [{
    productId: 'hd-650',
    productName: 'HD 650',
    productSubtype: null,
    vendorId: 'sennheiser',
    vendorName: 'Sennheiser',
    assetUrl: null,
    eqs: [preview(), preview({ eqId: 'eq-oratory', author: 'Oratory1990' })],
  }],
  selectedProduct: null,
  status: {
    source: 'cache',
    fetchedAt: '2026-08-13T00:00:00.000Z',
    vendorCount: 1,
    productCount: 1,
    eqCount: 2,
  },
};

describe('HeadphoneCorrectionPanel', () => {
  beforeEach(() => {
    window.localStorage.clear();
    bridge.browseHeadphoneCorrections.mockImplementation(async (request = {}) => ({
      ...browseResult,
      query: request.query ?? '',
      vendorId: request.vendorId ?? null,
    }));
    bridge.applyHeadphoneCorrection.mockResolvedValue({
      preview: preview(),
      preset: {
        id: 'headphone-hd650',
        name: '耳机校正 - Sennheiser / HD 650 / AutoEQ',
        preampDb: -6.5,
        bands,
        createdAt: 'now',
        updatedAt: 'now',
        readonly: true,
      },
      state: {
        ...initialEqState,
        enabled: true,
        preampDb: -6.5,
        presetId: 'headphone-hd650',
        presetName: '耳机校正 - Sennheiser / HD 650 / AutoEQ',
      },
    });
    bridge.setEnabled.mockImplementation(async (enabled: boolean) => ({
      ...initialEqState,
      enabled,
      presetId: 'headphone-hd650',
      presetName: '耳机校正 - Sennheiser / HD 650 / AutoEQ',
    }));
  });

  it('lists manufacturers first, then opens the selected manufacturer models', async () => {
    render(<HeadphoneCorrectionPanel eqState={initialEqState} showTitle={false} />);

    const vendorButton = await screen.findByRole('button', { name: /Sennheiser/ });
    fireEvent.click(vendorButton);

    await waitFor(() => expect(bridge.browseHeadphoneCorrections).toHaveBeenLastCalledWith(expect.objectContaining({
      vendorId: 'sennheiser',
      productId: null,
      query: '',
    })));
    expect(await screen.findByText('HD 650')).toBeTruthy();
  });

  it('moves from search to the first result with ArrowDown and clears back to brands with Escape', async () => {
    render(<HeadphoneCorrectionPanel eqState={initialEqState} showTitle={false} />);

    const search = screen.getByRole('textbox', { name: '按型号或生产商搜索' });
    const vendorButton = await screen.findByRole('button', { name: /Sennheiser/ });
    fireEvent.keyDown(search, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(vendorButton);

    fireEvent.change(search, { target: { value: 'HD 650' } });
    await waitFor(() => expect(bridge.browseHeadphoneCorrections).toHaveBeenLastCalledWith(expect.objectContaining({ query: 'HD 650' })));
    fireEvent.keyDown(search, { key: 'Escape' });

    expect((search as HTMLInputElement).value).toBe('');
    await waitFor(() => expect(bridge.browseHeadphoneCorrections).toHaveBeenLastCalledWith(expect.objectContaining({
      vendorId: null,
      productId: null,
      query: '',
    })));
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('searches, previews, and applies a correction through the existing EQ bridge', async () => {
    const onApplied = vi.fn();
    const onAppliedStatusRefresh = vi.fn();
    render(
      <HeadphoneCorrectionPanel
        eqState={initialEqState}
        showTitle={false}
        onApplied={onApplied}
        onAppliedStatusRefresh={onAppliedStatusRefresh}
      />,
    );

    fireEvent.change(screen.getByRole('textbox', { name: '按型号或生产商搜索' }), { target: { value: 'HD 650' } });
    await waitFor(() => expect(bridge.browseHeadphoneCorrections).toHaveBeenLastCalledWith(expect.objectContaining({
      query: 'HD 650',
      vendorId: null,
      productId: null,
    })));

    const modelLabel = await screen.findByText('HD 650');
    const resultButton = modelLabel.closest('button');
    expect(resultButton).toBeTruthy();
    fireEvent.click(resultButton!);
    expect(screen.getByText('EQ 频率响应')).toBeTruthy();
    expect(screen.getByRole('button', { name: /AutoEQ/ }).getAttribute('data-active')).toBe('true');
    expect(screen.queryByRole('button', { name: '使用此校正' })).toBeNull();
    expect(screen.queryByRole('button', { name: '查看数据来源' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '应用' }));
    expect(screen.getByRole('button', { name: '处理中…' }).hasAttribute('disabled')).toBe(true);
    await waitFor(() => expect(bridge.applyHeadphoneCorrection).toHaveBeenCalledWith({ eqId: 'eq-auto', enableEq: true }));
    expect(onApplied).toHaveBeenCalledWith(expect.objectContaining({ enabled: true }));
    expect(onAppliedStatusRefresh).toHaveBeenCalledTimes(1);
    expect((await screen.findByRole('status')).textContent).toContain('已应用 Sennheiser HD 650');

    fireEvent.click(screen.getByRole('tab', { name: /最近使用/ }));
    expect(await screen.findByRole('button', { name: /HD 650/ })).toBeTruthy();
  });

  it('persists favorite models and restores them on the dedicated favorites page', async () => {
    const view = render(<HeadphoneCorrectionPanel eqState={initialEqState} showTitle={false} />);

    fireEvent.change(screen.getByRole('textbox', { name: '按型号或生产商搜索' }), { target: { value: 'HD 650' } });
    const modelLabel = await screen.findByText('HD 650');
    fireEvent.click(modelLabel.closest('button')!);
    const favoriteButton = screen.getByRole('button', { name: '收藏型号' });
    fireEvent.click(favoriteButton);

    expect(window.localStorage.getItem('echo.opra.favoriteProducts')).toContain('hd-650');
    expect(favoriteButton.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('status').textContent).toContain('已收藏 HD 650');
    view.unmount();
    render(<HeadphoneCorrectionPanel eqState={initialEqState} showTitle={false} />);

    expect(screen.queryByText('HD 650')).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: /收藏/ }));
    expect(await screen.findByRole('button', { name: /HD 650/ })).toBeTruthy();
  });

  it('uses the existing EQ bridge for the master switch', async () => {
    const onApplied = vi.fn();
    render(
      <HeadphoneCorrectionPanel
        eqState={{
          ...initialEqState,
          presetId: 'headphone-hd650',
          presetName: '耳机校正 - Sennheiser / HD 650 / AutoEQ',
        }}
        showTitle={false}
        onApplied={onApplied}
      />,
    );

    fireEvent.click(screen.getByRole('checkbox', { name: '耳机校正总开关' }));
    await waitFor(() => expect(bridge.setEnabled).toHaveBeenCalledWith(true));
    expect(onApplied).toHaveBeenCalledWith(expect.objectContaining({ enabled: true }));
  });

  it('turns the selected applied correction off from the model action', async () => {
    const onApplied = vi.fn();
    render(
      <HeadphoneCorrectionPanel
        eqState={{
          ...initialEqState,
          enabled: true,
          presetId: 'headphone-hd650',
          presetName: '耳机校正 - Sennheiser / HD 650 / AutoEQ',
        }}
        showTitle={false}
        onApplied={onApplied}
      />,
    );

    fireEvent.change(screen.getByRole('textbox', { name: '按型号或生产商搜索' }), { target: { value: 'HD 650' } });
    const modelLabel = await screen.findByText('HD 650');
    fireEvent.click(modelLabel.closest('button')!);
    fireEvent.click(screen.getByRole('button', { name: '关闭' }));

    await waitFor(() => expect(bridge.setEnabled).toHaveBeenCalledWith(false));
    expect(onApplied).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }));
  });
});
