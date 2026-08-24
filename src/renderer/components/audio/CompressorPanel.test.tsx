// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultDspRackState, type CompressorState, type CompressorTelemetry } from '../../../shared/types/dspRack';

const bridge = vi.hoisted(() => ({
  setCompressorState: vi.fn(),
  onCompressorTelemetry: vi.fn(),
}));

vi.mock('../../utils/echoBridge', () => ({ getEqBridge: () => bridge }));
vi.mock('../../i18n/I18nProvider', () => ({ useI18n: () => ({ locale: 'zh-CN' }) }));

import { CompressorPanel } from './CompressorPanel';

describe('CompressorPanel', () => {
  const initial = defaultDspRackState().compressor;

  beforeEach(() => {
    bridge.setCompressorState.mockImplementation(async (next: Partial<CompressorState>) => ({ ...initial, ...next }));
    bridge.onCompressorTelemetry.mockReturnValue(() => undefined);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('submits edited dynamics parameters through the typed control bridge', async () => {
    const onApplied = vi.fn();
    render(<CompressorPanel state={initial} onApplied={onApplied} />);

    fireEvent.change(screen.getByLabelText('阈值'), { target: { value: '-24' } });
    fireEvent.change(screen.getByLabelText('压缩比'), { target: { value: '6' } });
    fireEvent.click(screen.getByRole('button', { name: '应用参数' }));

    await waitFor(() => expect(bridge.setCompressorState).toHaveBeenCalledWith(expect.objectContaining({
      thresholdDb: -24,
      ratio: 6,
    })));
    expect(onApplied).toHaveBeenCalledWith(expect.objectContaining({ thresholdDb: -24, ratio: 6 }));
  });

  it('awaits the native state when enabling the module', async () => {
    render(<CompressorPanel state={initial} onApplied={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '已旁路' }));
    await waitFor(() => expect(bridge.setCompressorState).toHaveBeenCalledWith(expect.objectContaining({ enabled: true })));
  });

  it('submits the advanced detector, sidechain, release, range, and stereo-link controls', async () => {
    render(<CompressorPanel state={initial} onApplied={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'RMS' }));
    fireEvent.click(screen.getByRole('switch', { name: '侧链高通' }));
    fireEvent.click(screen.getByRole('switch', { name: '自动释放' }));
    fireEvent.change(screen.getByLabelText('最大压缩范围'), { target: { value: '18' } });
    fireEvent.change(screen.getByLabelText('立体声联动'), { target: { value: '0.6' } });
    fireEvent.click(screen.getByRole('button', { name: '应用参数' }));

    await waitFor(() => expect(bridge.setCompressorState).toHaveBeenCalledWith(expect.objectContaining({
      detectorMode: 'rms',
      sidechainHighpassEnabled: true,
      autoRelease: true,
      rangeDb: 18,
      stereoLink: 0.6,
    })));
  });

  it('renders native-pushed input, reduction, output, and headroom telemetry', async () => {
    let telemetryHandler: ((telemetry: CompressorTelemetry) => void) | undefined;
    bridge.onCompressorTelemetry.mockImplementation((handler: (telemetry: CompressorTelemetry) => void) => {
      telemetryHandler = handler;
      return () => undefined;
    });
    render(<CompressorPanel state={initial} onApplied={vi.fn()} />);

    telemetryHandler?.({
      ...initial,
      inputPeakDb: [-3.2, -4.1],
      inputRmsDb: [-12, -13],
      outputPeakDb: [-6.4, -7.1],
      outputRmsDb: [-15, -16],
      gainReductionDb: 7.5,
      gainReductionDbByChannel: [7.5, 6.9],
      outputHeadroomDb: 6.4,
    });

    expect(await screen.findByText('7.5')).toBeTruthy();
    expect(screen.getByText('6.4 dB')).toBeTruthy();
    expect(screen.getByRole('img', { name: '动态传输曲线' })).toBeTruthy();
    expect(screen.getByRole('img', { name: 'GR 历史' })).toBeTruthy();
  });
});
