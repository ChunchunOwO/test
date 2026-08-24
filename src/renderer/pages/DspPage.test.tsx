// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DspPage } from './DspPage';

const { getEqBridgeMock, refreshPlaybackStatusMock, translateMock } = vi.hoisted(() => ({
  getEqBridgeMock: vi.fn(),
  refreshPlaybackStatusMock: vi.fn(async () => undefined),
  translateMock: vi.fn((key: string) => key),
}));

vi.mock('../i18n/I18nProvider', () => ({
  useI18n: () => ({
    locale: 'zh-CN',
    t: translateMock,
  }),
}));

vi.mock('../stores/playbackStatusStore', () => ({
  refreshPlaybackStatus: refreshPlaybackStatusMock,
  useThrottledSharedPlaybackStatus: () => ({ audioStatus: null, error: null }),
}));

vi.mock('../utils/echoBridge', () => ({
  getEqBridge: () => getEqBridgeMock(),
}));

vi.mock('../components/audio/EqPanel', () => ({
  EqPanel: () => <div>EQ workbench</div>,
}));

vi.mock('../components/audio/HeadphoneCorrectionPanel', () => ({
  HeadphoneCorrectionPanel: () => <div>Headphone workbench</div>,
}));

const unlockedStatus = {
  unlocked: true,
  source: 'native-license' as const,
  checkedAt: '2026-07-19T00:00:00.000Z',
};

const installBridge = (getStatus: ReturnType<typeof vi.fn>, initialSettings: Record<string, unknown> = {}) => {
  const getSettings = vi.fn(async () => ({
    sidebarHiddenRouteIds: [],
    sidebarRouteOrder: [],
    ...initialSettings,
  }));
  const setSettings = vi.fn(async (patch) => ({ ...patch }));
  const setOutput = vi.fn(async (patch) => ({ ...patch }));
  const getPlaybackStatus = vi.fn(async () => ({ state: 'playing', positionMs: 12_000 }));
  const seek = vi.fn(async (positionSeconds: number) => ({ state: 'playing', positionMs: positionSeconds * 1_000 }));
  const openExternalUrl = vi.fn(async () => undefined);
  Object.defineProperty(window, 'echo', {
    configurable: true,
    value: {
      app: {
        getEchoProLocalEntitlementStatus: getStatus,
        getSettings,
        setSettings,
        openExternalUrl,
      },
      audio: {
        setOutput,
      },
      playback: {
        getStatus: getPlaybackStatus,
        seek,
      },
    },
  });
  return { getPlaybackStatus, getSettings, setSettings, setOutput, seek, openExternalUrl };
};

describe('DspPage Steam access', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getEqBridgeMock.mockReturnValue({
      getState: vi.fn(async () => ({
        enabled: false, preampDb: 0, dspHeadroomDb: 0, dspSafetyLimiterEnabled: true,
        presetId: 'flat', presetName: 'Flat', clippingRisk: false, bands: [],
      })),
      getRoomCorrectionState: vi.fn(async () => ({
        enabled: false, status: 'empty', irId: null, irName: null, channelMode: 'none',
        sampleRate: null, tapCount: 0, trimDb: 0, latencySamples: 0, clippingRisk: false, error: null,
      })),
      getChannelBalanceState: vi.fn(async () => ({
        enabled: false, balance: 0, leftGainDb: 0, rightGainDb: 0, bandGains: {},
        leftDelayMs: 0, rightDelayMs: 0, swapLeftRight: false, monoMode: 'off',
        invertLeft: false, invertRight: false, constantPower: true, clippingRisk: false,
      })),
    });
  });

  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    Reflect.deleteProperty(window, 'echo');
  });

  it('does not mount any DSP workbench without Pro DLC', async () => {
    const getStatus = vi.fn(async () => ({ ...unlockedStatus, unlocked: false, source: 'none' as const }));
    installBridge(getStatus);

    render(<DspPage />);

    await waitFor(() => expect(getStatus).toHaveBeenCalled());
    expect(getEqBridgeMock).not.toHaveBeenCalled();
    expect(screen.queryByText('EQ workbench')).toBeNull();
    expect(screen.queryByText('ECHO SRC')).toBeNull();
    expect(screen.queryByText('SDM')).toBeNull();
  });

  it('keeps the four specialist controls in a bottom advanced-settings group', async () => {
    installBridge(vi.fn(async () => unlockedStatus));

    render(<DspPage />);

    await waitFor(() => expect(getEqBridgeMock).toHaveBeenCalled());
    const chain = screen.getByRole('navigation', { name: 'DSP 模块链' });
    const advancedGroup = within(chain).getByRole('group', { name: '高级设置' });
    const advancedLabels = within(advancedGroup).getAllByRole('button').map((button) => button.textContent);

    expect(advancedLabels).toHaveLength(4);
    expect(advancedLabels[0]).toContain('压缩器');
    expect(advancedLabels[1]).toContain('交叉馈送');
    expect(advancedLabels[2]).toContain('立体声场');
    expect(advancedLabels[3]).toContain('声道矩阵');
    expect(within(chain).getAllByRole('button').slice(-4)).toEqual(within(advancedGroup).getAllByRole('button'));
  });

  it('applies an SDM sound profile as one atomic pair of native FIR controls', async () => {
    const getStatus = vi.fn(async () => unlockedStatus);
    const { setOutput, setSettings } = installBridge(getStatus);
    window.localStorage.setItem('echo.dsp.selected-module', 'sdm');

    render(<DspPage />);

    fireEvent.click(await screen.findByRole('combobox', { name: 'SDM 声音风格' }));
    fireEvent.click(await screen.findByRole('option', { name: /ECHO Transient/ }));

    await waitFor(() => expect(setSettings).toHaveBeenCalledWith({
      audioSdmOversamplingFilterProfile1x: 'minringFIR-mp',
      audioSdmOversamplingFilterProfileNx: 'poly-sinc-ext2-hires-mp',
    }));
    expect(setOutput).toHaveBeenCalledWith({
      sdmOversamplingFilterProfile1x: 'minringFIR-mp',
      sdmOversamplingFilterProfileNx: 'poly-sinc-ext2-hires-mp',
    });
  });

  it('warns before a DSD512 long sound profile is attempted on CPU', async () => {
    const getStatus = vi.fn(async () => unlockedStatus);
    installBridge(getStatus, {
      audioSdmTargetRate: 'dsd512',
      audioSdmComputeBackend: 'cpu',
      audioSdmOversamplingFilterProfile1x: 'minringFIR-mp',
      audioSdmOversamplingFilterProfileNx: 'poly-sinc-ext2-hires-mp',
    });
    window.localStorage.setItem('echo.dsp.selected-module', 'sdm');

    render(<DspPage />);

    expect(await screen.findByText(/CPU 未通过实时准入/)).toBeTruthy();
  });

  it('A/B compares only the Linear FIR pair and restores the selected sound profile', async () => {
    const getStatus = vi.fn(async () => unlockedStatus);
    const { getPlaybackStatus, seek, setOutput } = installBridge(getStatus);
    window.localStorage.setItem('echo.dsp.selected-module', 'sdm');

    render(<DspPage />);

    fireEvent.click(await screen.findByRole('combobox', { name: 'SDM 声音风格' }));
    fireEvent.click(await screen.findByRole('option', { name: /ECHO Transient/ }));
    await waitFor(() => expect(setOutput).toHaveBeenCalledWith({
      sdmOversamplingFilterProfile1x: 'minringFIR-mp',
      sdmOversamplingFilterProfileNx: 'poly-sinc-ext2-hires-mp',
    }));

    fireEvent.click(await screen.findByRole('button', { name: 'A/B Linear 基准' }));
    await waitFor(() => expect(setOutput).toHaveBeenCalledWith({
      sdmOversamplingFilterProfile1x: 'sinc-long',
      sdmOversamplingFilterProfileNx: 'poly-sinc-hb',
    }));
    expect(getPlaybackStatus).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(seek).toHaveBeenCalledWith(9));

    fireEvent.click(await screen.findByRole('button', { name: '恢复 ECHO Transient' }));
    await waitFor(() => expect(setOutput).toHaveBeenLastCalledWith({
      sdmOversamplingFilterProfile1x: 'minringFIR-mp',
      sdmOversamplingFilterProfileNx: 'poly-sinc-ext2-hires-mp',
    }));
    await waitFor(() => expect(seek).toHaveBeenLastCalledWith(9));
  });
});
