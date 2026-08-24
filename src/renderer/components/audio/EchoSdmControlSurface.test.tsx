// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EchoSdmControlSurface, type EchoSdmControlSurfaceProps } from './EchoSdmControlSurface';

const renderSurface = (patch: Partial<EchoSdmControlSurfaceProps> = {}) => {
  const callbacks = {
    onModeChange: vi.fn(),
    onTargetRateChange: vi.fn(),
    onQualityChange: vi.fn(),
    onComputeChange: vi.fn(),
    onSoundChange: vi.fn(),
    onFilterChange: vi.fn(),
    onDopToggle: vi.fn(),
    onCompareToggle: vi.fn(),
    onRefresh: vi.fn(),
  };
  const props: EchoSdmControlSurfaceProps = {
    mode: 'pcmToDsd',
    targetRate: 'dsd256',
    quality: 'reference',
    compute: 'cpu',
    soundProfile: 'linear',
    filter1x: 'sinc-long',
    filterNx: 'poly-sinc-hb',
    requestedDop: true,
    compareRestore: false,
    compareDisabled: false,
    busy: false,
    routeTone: 'good',
    sourceLabel: '44.1 kHz / FLAC',
    requestedLabel: 'DSD256 / Reference',
    outputLabel: 'PCM → DSD256',
    runtimeLabel: 'PCM → SDM active',
    transportLabel: '705.6 kHz',
    oversamplingLabel: 'ECHO FIR / 44.1 → 705.6 kHz',
    modulatorLabel: 'Reference 7th',
    computeLabel: 'CPU SDM active',
    computeDetail: 'FIR + SDM 0.32x realtime',
    fallbackLabel: 'None',
    capabilityLabel: 'ECHO SDM over DoP',
    performanceLabel: '0.32x realtime',
    modulatorDetails: [
      { label: 'Order', value: '7th', detail: 'NTF-7' },
      { label: 'Headroom', value: '-3.0 dB', detail: 'stability guard' },
    ],
    modeOptions: [
      { value: 'off', label: 'Off', detail: 'PCM output' },
      { value: 'dsdPassthrough', label: 'DSD passthrough', detail: 'Native DSD sources only' },
      { value: 'pcmToDsd', label: 'PCM → SDM', detail: 'Sigma-delta modulation' },
    ],
    targetOptions: [
      { value: 'dsd64', label: 'DSD64', detail: '2.8 MHz' },
      { value: 'dsd128', label: 'DSD128', detail: '5.6 MHz' },
      { value: 'dsd256', label: 'DSD256', detail: '11.2 MHz' },
      { value: 'dsd512', label: 'DSD512', detail: '22.5 MHz' },
    ],
    qualityOptions: [
      { value: 'safe', label: 'Safe', detail: 'Wide margin' },
      { value: 'hifi', label: 'HiFi', detail: 'High fidelity' },
      { value: 'reference', label: 'Reference', detail: 'Reference profile' },
      { value: 'insane', label: 'Insane', detail: 'Maximum load' },
    ],
    computeOptions: [
      { value: 'cpu', label: 'CPU SDM', detail: 'CPU backend' },
      { value: 'cuda', label: 'CUDA SDM', detail: 'GPU backend' },
    ],
    soundOptions: [
      { value: 'linear', label: 'Linear', detail: 'Linear phase' },
      { value: 'transient', label: 'Transient', detail: 'Minimum phase' },
      { value: 'smooth', label: 'Smooth', detail: 'Apodizing' },
    ],
    filterOptions: [
      { value: 'sinc-long', label: 'sinc-long', detail: 'Long sinc' },
      { value: 'poly-sinc-hb', label: 'poly-sinc-hb', detail: 'Half-band filter' },
    ],
    copy: {
      title: 'ECHO SDM / DSD',
      subtitle: 'DSD / SDM real signal path',
      source: 'Source',
      requested: 'Requested',
      output: 'Actual output',
      actual: 'Runtime',
      transport: 'Transport',
      oversampling: 'PCM oversampling',
      modulator: 'PCM → SDM modulator',
      compute: 'SDM Compute',
      fallback: 'Fallback',
      mode: 'SDM mode',
      target: 'Target DSD rate',
      quality: 'Modulator / stability',
      sound: 'SDM sound profile',
      customSound: 'Custom',
      dop: 'DoP passthrough',
      refresh: 'Refresh',
      preview: 'Noise shaping · Design preview',
      previewNote: 'Design preview only; runtime truth comes from Audio Core.',
      runtimeFacts: 'Runtime facts',
      signalPlan: 'Oversampling / modulator',
      advanced: 'Advanced',
      normal: 'Normal',
      compareLinear: 'A/B Linear',
      compareRestore: 'Restore',
      guard: 'Guard',
      guardDetail: 'Admission and stability fail closed.',
      note: 'PCM → SDM is separate from native DSD passthrough.',
    },
    ...callbacks,
    ...patch,
  };

  render(<EchoSdmControlSurface {...props} />);
  return { callbacks, props };
};

describe('EchoSdmControlSurface', () => {
  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => null);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('keeps runtime facts separate from the noise-shaping design preview', () => {
    renderSurface();

    expect(screen.getAllByText('PCM → SDM active').length).toBeGreaterThan(0);
    expect(screen.getByText('CPU SDM active')).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Noise shaping · Design preview: dsd256 reference' })).toBeTruthy();
    expect(screen.getByText('Design preview only; runtime truth comes from Audio Core.')).toBeTruthy();
  });

  it('commits mode, target, quality, compute and filter changes through typed handlers', () => {
    const { callbacks } = renderSurface();

    fireEvent.click(screen.getByRole('radio', { name: 'DSD512' }));
    fireEvent.click(screen.getByRole('radio', { name: 'HiFi' }));
    fireEvent.click(screen.getByRole('combobox', { name: 'SDM Compute' }));
    fireEvent.click(screen.getByRole('option', { name: /CUDA SDM/ }));
    fireEvent.click(screen.getByRole('combobox', { name: 'Filter Nx' }));
    fireEvent.click(screen.getByRole('option', { name: /sinc-long/ }));
    fireEvent.click(screen.getByRole('button', { name: 'DoP passthrough' }));

    expect(callbacks.onTargetRateChange).toHaveBeenCalledWith('dsd512');
    expect(callbacks.onQualityChange).toHaveBeenCalledWith('hifi');
    expect(callbacks.onComputeChange).toHaveBeenCalledWith('cuda');
    expect(callbacks.onFilterChange).toHaveBeenCalledWith('nx', 'sinc-long');
    expect(callbacks.onDopToggle).toHaveBeenCalledTimes(1);
  });

  it('supports roving arrow-key selection and exposes contextual option details', () => {
    const { callbacks } = renderSurface();
    const selectedQuality = screen.getByRole('radio', { name: 'Reference' });

    fireEvent.keyDown(selectedQuality, { key: 'ArrowRight' });

    expect(callbacks.onQualityChange).toHaveBeenCalledWith('insane');
    expect(document.activeElement).toBe(screen.getByRole('radio', { name: 'Insane' }));
    expect(screen.getByText('Reference profile')).toBeTruthy();
    expect(screen.getByText('11.2 MHz')).toBeTruthy();
  });

  it('lets pointer and keyboard users inspect the noise-shaping preview', () => {
    renderSurface();
    const preview = screen.getByRole('img', { name: 'Noise shaping · Design preview: dsd256 reference' });

    fireEvent.focus(preview);

    expect(screen.getByText('20.0 kHz')).toBeTruthy();
    expect(screen.getByText(/dB$/)).toBeTruthy();
    fireEvent.keyDown(preview, { key: 'End' });
    expect(screen.getByText('5.64 MHz')).toBeTruthy();
  });

  it('keeps safety warnings visible and marks the surface busy without hiding runtime truth', () => {
    renderSurface({ warning: 'Realtime admission requires fallback.', busy: true });

    expect(screen.getByRole('status').textContent).toContain('Realtime admission requires fallback.');
    expect(screen.getByLabelText('ECHO SDM / DSD').getAttribute('aria-busy')).toBe('true');
    expect((screen.getByRole('combobox', { name: 'SDM Compute' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Advanced' }).getAttribute('aria-expanded')).toBe('false');
  });

  it('reveals sound profiles and native modulator facts in the advanced inspector', () => {
    const { callbacks } = renderSurface();

    fireEvent.click(screen.getByRole('button', { name: 'Advanced' }));
    fireEvent.click(screen.getByRole('button', { name: /Transient/ }));

    expect(screen.getByText('7th')).toBeTruthy();
    expect(screen.getByText('-3.0 dB')).toBeTruthy();
    expect(callbacks.onSoundChange).toHaveBeenCalledWith('transient');
  });
});
