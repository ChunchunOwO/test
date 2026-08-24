// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EchoSrcControlSurface, type EchoSrcControlSurfaceProps } from './EchoSrcControlSurface';

const renderSurface = (patch: Partial<EchoSrcControlSurfaceProps> = {}) => {
  const callbacks = {
    onModeChange: vi.fn(),
    onQualityChange: vi.fn(),
    onAdvancedChange: vi.fn(),
    onFilterChange: vi.fn(),
    onComputeChange: vi.fn(),
    onDitherChange: vi.fn(),
    onLadderApply: vi.fn(),
    onCompareToggle: vi.fn(),
    onRefresh: vi.fn(),
  };
  const props: EchoSrcControlSurfaceProps = {
    mode: 'family8x',
    quality: 'transparent',
    advanced: false,
    filter1x: 'poly-sinc-hb',
    filterNx: 'poly-sinc-ext2-long',
    compute: 'cpu',
    dither: 'off',
    activeFilterSlot: '1x',
    routeTone: 'good',
    routeLabel: '正在升频',
    sourceRate: '44.1 kHz',
    targetRate: '352.8 kHz',
    engineLabel: 'CPU FIR',
    qualityLabel: '透明',
    precisionLabel: '4096 taps / linear',
    computeStatus: 'CPU FIR active',
    ditherStatus: '关闭',
    advancedStatus: 'CPU FIR active',
    busy: false,
    compareDisabled: false,
    compareRestore: false,
    modeOptions: [
      { value: 'off', label: '关闭', detail: '保持源采样率' },
      { value: 'family4x', label: '4×', detail: '四倍频' },
      { value: 'family8x', label: '8×', detail: '八倍频' },
    ],
    qualityOptions: [
      { value: 'transparent', label: '透明', detail: '最高精度' },
      { value: 'balanced', label: '均衡', detail: '质量与延迟平衡' },
      { value: 'lowLatency', label: '低延迟', detail: '较低开销' },
    ],
    filterOptions: [
      { value: 'poly-sinc-hb', label: 'poly-sinc-hb', detail: '基础滤波器' },
      { value: 'poly-sinc-ext2-long', label: 'poly-sinc-ext2-long', detail: '长抽头滤波器' },
    ],
    computeOptions: [
      { value: 'cpu', label: 'CPU SIMD', detail: 'CPU 后端' },
      { value: 'cuda', label: 'CUDA', detail: 'GPU 后端' },
    ],
    ditherOptions: [
      { value: 'off', label: 'Off', detail: '关闭抖动' },
      { value: 'tpdf', label: 'TPDF', detail: '整数输出抖动' },
    ],
    ladderOptions: [
      { id: 'reference', label: '参考', detail: '高精度配置', meta: '高延迟', active: true },
    ],
    copy: {
      eyebrow: '采样率转换',
      title: 'ECHO SRC / 升频',
      subtitle: '本机 PCM 采样率转换。',
      route: '路径',
      sourceRate: '源采样率',
      targetRate: '目标采样率',
      engine: '引擎',
      quality: '质量策略',
      precision: '精度',
      mode: '升频倍率',
      normal: '普通',
      advanced: '高级设置',
      filterPreview: '滤波响应 · 设计预览',
      filterPreviewNote: '这是配置预览，实际状态来自运行时。',
      runtimeFacts: '实时状态',
      filterPlan: '滤波器配置',
      compute: '计算后端',
      dither: 'PCM 抖动',
      refresh: '刷新状态',
      abBypass: 'A/B 原生',
      abRestore: '恢复升频',
      note: '只处理 PCM；共享、DSD 或外部接管时自动旁路。',
      advancedSummary: '高级配置以播放链路实际状态为准。',
    },
    ...callbacks,
    ...patch,
  };

  render(<EchoSrcControlSurface {...props} />);
  return { callbacks, props };
};

describe('EchoSrcControlSurface', () => {
  afterEach(cleanup);

  it('shows native runtime facts separately from the filter design preview', () => {
    renderSurface();

    expect(screen.getByText('44.1 kHz')).toBeTruthy();
    expect(screen.getByText('352.8 kHz')).toBeTruthy();
    expect(screen.getByText('CPU FIR')).toBeTruthy();
    expect(screen.getByRole('img', { name: '滤波响应 · 设计预览: poly-sinc-hb' })).toBeTruthy();
    expect(screen.getByText('这是配置预览，实际状态来自运行时。')).toBeTruthy();
  });

  it('commits mode, quality, filter and compute selections through typed callbacks', () => {
    const { callbacks } = renderSurface();

    fireEvent.click(screen.getByRole('button', { name: '4×' }));
    fireEvent.click(screen.getByRole('button', { name: '均衡' }));
    fireEvent.click(screen.getByRole('combobox', { name: 'Filter Nx' }));
    fireEvent.click(screen.getByRole('option', { name: /poly-sinc-hb/ }));
    fireEvent.click(screen.getByRole('combobox', { name: '计算后端' }));
    fireEvent.click(screen.getByRole('option', { name: /CUDA/ }));

    expect(callbacks.onModeChange).toHaveBeenCalledWith('family4x');
    expect(callbacks.onQualityChange).toHaveBeenCalledWith('balanced');
    expect(callbacks.onFilterChange).toHaveBeenCalledWith('nx', 'poly-sinc-hb');
    expect(callbacks.onComputeChange).toHaveBeenCalledWith('cuda');
  });

  it('keeps quality ladders behind the advanced control', () => {
    const { callbacks } = renderSurface({ advanced: true });

    fireEvent.click(screen.getByRole('button', { name: /参考/ }));
    fireEvent.click(screen.getByRole('button', { name: /普通/ }));

    expect(callbacks.onLadderApply).toHaveBeenCalledWith('reference');
    expect(callbacks.onAdvancedChange).toHaveBeenCalledWith(false);
  });
});
