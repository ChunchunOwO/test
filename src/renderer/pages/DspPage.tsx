import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import '../styles/dsp.css';
import { Activity, AudioWaveform, CheckCircle2, Clock3, FileAudio, Gauge, Headphones, Info, Loader2, Pencil, RadioTower, RefreshCw, RotateCcw, Route, Save, ShieldCheck, SlidersHorizontal, Trash2, Waves, X, Zap } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type {
  AudioDsdOutputMode,
  AudioEchoSrcComputeBackend,
  AudioEchoSrcFilterProfile,
  AudioEchoSrcMode,
  AudioEchoSrcQualityProfile,
  AudioEchoSrcRuntimeBackend,
  AudioOutputSettings,
  AudioPcmDitherMode,
  AudioSdmComputeBackend,
  AudioSdmMode,
  AudioSdmQualityProfile,
  AudioSdmTargetRate,
  AudioStatus,
  ChannelBalanceBandId,
  ChannelBalanceMonoMode,
  ChannelBalanceState,
} from '../../shared/types/audio';
import type { EqState, RoomCorrectionState } from '../../shared/types/eq';
import type { AppSettings } from '../../shared/types/appSettings';
import { channelBalanceBandIds, channelBalanceBandMaxGainDb, channelBalanceBandMinGainDb, channelBalanceMaxDelayMs, channelBalanceMaxGainDb, channelBalanceMinDelayMs, channelBalanceMinGainDb } from '../../shared/types/audio';
import { dspHeadroomMaxDb, dspHeadroomMinDb, roomCorrectionMaxTrimDb, roomCorrectionMinTrimDb } from '../../shared/types/eq';
import { EqPanel } from '../components/audio/EqPanel';
import { EchoSdmControlSurface } from '../components/audio/EchoSdmControlSurface';
import { EchoSrcControlSurface } from '../components/audio/EchoSrcControlSurface';
import { HeadphoneCorrectionPanel } from '../components/audio/HeadphoneCorrectionPanel';
import { DspRackPanel } from '../components/audio/DspRackPanel';
import { CompressorPanel } from '../components/audio/CompressorPanel';
import { ChannelMatrixPanel, CrossfeedPanel, StereoFieldPanel } from '../components/audio/SpatialDspPanel';
import {
  defaultDspRackState,
  type ChannelMatrixState,
  type CompressorState,
  type CrossfeedState,
  type StereoFieldState,
} from '../../shared/types/dspRack';
import { useI18n } from '../i18n/I18nProvider';
import type { TranslationKey } from '../i18n/locales';
import { refreshPlaybackStatus, useThrottledSharedPlaybackStatus } from '../stores/playbackStatusStore';
import { useEchoProEntitlement } from '../hooks/useEchoProEntitlement';
import { dispatchAudioErrorNotice } from '../utils/audioErrorNotice';
import { getEqBridge } from '../utils/echoBridge';
import { formatUserFacingError } from '../utils/userFacingError';
import {
  audioSdmSoundProfiles,
  getAudioSdmSoundProfile,
  resolveAudioSdmSoundProfileSelection,
  type AudioSdmSoundProfileId,
  type AudioSdmSoundProfileSelection,
} from '../../shared/audioSdmSoundProfiles';

type DspModuleId = 'rack' | 'headroom' | 'src' | 'sdm' | 'eq' | 'compressor' | 'crossfeed' | 'stereoField' | 'channelMatrix' | 'headphone' | 'room' | 'channel' | 'safety';

type SdmSoundFilterPair = {
  filterProfile1x: AudioEchoSrcFilterProfile;
  filterProfileNx: AudioEchoSrcFilterProfile;
};

const dspPlaybackStatusUiIntervalMs = 250;
const dspSelectedModuleStorageKey = 'echo.dsp.selected-module';
const dspModuleIds: readonly DspModuleId[] = ['rack', 'headroom', 'src', 'sdm', 'eq', 'compressor', 'crossfeed', 'stereoField', 'channelMatrix', 'headphone', 'room', 'channel', 'safety'];
const dspAdvancedModuleIds: readonly DspModuleId[] = ['compressor', 'crossfeed', 'stereoField', 'channelMatrix'];

const isDspModuleId = (value: unknown): value is DspModuleId =>
  typeof value === 'string' && (dspModuleIds as readonly string[]).includes(value);

const isDspAdvancedModule = (module: DspModule): boolean =>
  dspAdvancedModuleIds.includes(module.id);

const formatDspActionError = (error: unknown): string =>
  formatUserFacingError(error, { context: 'audio' });

const createSettingsRollbackPatch = <T extends Partial<AppSettings>>(patch: T, previous: AppSettings): T =>
  Object.fromEntries(
    Object.keys(patch).map((key) => [key, previous[key as keyof AppSettings]]),
  ) as T;

const readStoredDspModuleId = (): DspModuleId => {
  if (typeof window === 'undefined') {
    return 'eq';
  }

  try {
    const storage = window.localStorage;
    if (!storage) {
      return 'eq';
    }

    const stored = storage.getItem(dspSelectedModuleStorageKey);
    return isDspModuleId(stored) ? stored : 'eq';
  } catch {
    return 'eq';
  }
};

const writeStoredDspModuleId = (moduleId: DspModuleId): void => {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage?.setItem(dspSelectedModuleStorageKey, moduleId);
  } catch {
    // UI-only memory; localStorage failures should never block DSP controls.
  }
};

type DspModule = {
  id: DspModuleId;
  stageKey: string;
  title: string;
  subtitle: string;
  description: string;
  icon: LucideIcon;
  enabled: boolean;
  accent: 'blue' | 'violet' | 'green' | 'amber';
};

const fallbackEqState: EqState = {
  enabled: false,
  preampDb: 0,
  dspHeadroomDb: 0,
  dspSafetyLimiterEnabled: true,
  presetId: 'flat',
  presetName: 'Flat',
  clippingRisk: false,
  bands: [],
};

const fallbackRoomCorrection: RoomCorrectionState = {
  enabled: false,
  status: 'empty',
  irId: null,
  irName: null,
  channelMode: 'none',
  sampleRate: null,
  tapCount: 0,
  trimDb: 0,
  latencySamples: 0,
  clippingRisk: false,
  error: null,
};

const fallbackChannelBalance: ChannelBalanceState = {
  enabled: false,
  balance: 0,
  leftGainDb: 0,
  rightGainDb: 0,
  bandGains: {
    low: { leftGainDb: 0, rightGainDb: 0 },
    mid: { leftGainDb: 0, rightGainDb: 0 },
    high: { leftGainDb: 0, rightGainDb: 0 },
  },
  leftDelayMs: 0,
  rightDelayMs: 0,
  swapLeftRight: false,
  monoMode: 'off',
  invertLeft: false,
  invertRight: false,
  constantPower: true,
  clippingRisk: false,
};

const monoModeKeyMap: Record<ChannelBalanceMonoMode, string> = {
  off: 'dsp.panel.channel.mono.off',
  sum: 'dsp.panel.channel.mono.sum',
  left: 'dsp.panel.channel.mono.left',
  right: 'dsp.panel.channel.mono.right',
};

const channelTrimSteps = [0.25, 0.5, 1] as const;
const electrostaticTrimSteps = [0.1, 0.25] as const;
const channelPresetStorageKey = 'echo:dsp-channel-presets:v1';
const maxChannelPresetCount = 6;
const defaultBandGains: NonNullable<ChannelBalanceState['bandGains']> = {
  low: { leftGainDb: 0, rightGainDb: 0 },
  mid: { leftGainDb: 0, rightGainDb: 0 },
  high: { leftGainDb: 0, rightGainDb: 0 },
};
const channelBandLabels: Record<ChannelBalanceBandId, { titleKey: string; range: string }> = {
  low: { titleKey: 'dsp.panel.channel.bandLow', range: '20-200 Hz' },
  mid: { titleKey: 'dsp.panel.channel.bandMid', range: '200 Hz-2 kHz' },
  high: { titleKey: 'dsp.panel.channel.bandHigh', range: '2 kHz-10 kHz' },
};
type ChannelPanelMode = 'simple' | 'pro';

type ChannelBalancePreset = {
  id: string;
  name: string;
  state: ChannelBalanceState;
  createdAt: string;
};

const echoSrcModeOptions: Array<{ mode: AudioEchoSrcMode; titleKey: string; detailKey: string }> = [
  { mode: 'off', titleKey: 'dsp.panel.src.mode.off', detailKey: 'dsp.panel.src.mode.offDetail' },
  { mode: 'compatibility48', titleKey: 'dsp.panel.src.mode.compatibility48', detailKey: 'dsp.panel.src.mode.compatibility48Detail' },
  { mode: 'family2x', titleKey: 'dsp.panel.src.mode.family2x', detailKey: 'dsp.panel.src.mode.family2xDetail' },
  { mode: 'family4x', titleKey: 'dsp.panel.src.mode.family4x', detailKey: 'dsp.panel.src.mode.family4xDetail' },
  { mode: 'family8x', titleKey: 'dsp.panel.src.mode.family8x', detailKey: 'dsp.panel.src.mode.family8xDetail' },
];

const echoSrcQualityOptions: Array<{ profile: AudioEchoSrcQualityProfile; titleKey: string; detailKey: string; precision: string }> = [
  { profile: 'transparent', titleKey: 'dsp.panel.src.quality.transparent', detailKey: 'dsp.panel.src.quality.transparentDetail', precision: 'SOXR precision 28' },
  { profile: 'balanced', titleKey: 'dsp.panel.src.quality.balanced', detailKey: 'dsp.panel.src.quality.balancedDetail', precision: 'SOXR precision 20' },
  { profile: 'lowLatency', titleKey: 'dsp.panel.src.quality.lowLatency', detailKey: 'dsp.panel.src.quality.lowLatencyDetail', precision: 'SOXR precision 16' },
];

const echoSrcAdvancedFilterOptions: Array<{
  id: AudioEchoSrcFilterProfile;
  label: string;
  detailKey: string;
  loadKey: string;
  gpuKey?: string;
  featured?: boolean;
}> = [
  {
    id: 'poly-sinc-hb',
    label: 'poly-sinc-hb',
    detailKey: 'dsp.panel.src.filter.polySincHbDetail',
    loadKey: 'dsp.panel.src.filter.loadLight',
    gpuKey: 'dsp.panel.src.filter.gpuCpu',
    featured: true,
  },
  {
    id: 'poly-sinc-ext2-short',
    label: 'poly-sinc-ext2-short',
    detailKey: 'dsp.panel.src.filter.polySincExt2ShortDetail',
    loadKey: 'dsp.panel.src.filter.loadMedium',
  },
  {
    id: 'poly-sinc-ext2-medium',
    label: 'poly-sinc-ext2-medium',
    detailKey: 'dsp.panel.src.filter.polySincExt2MediumDetail',
    loadKey: 'dsp.panel.src.filter.loadHigh',
    gpuKey: 'dsp.panel.src.filter.gpuRtx5060',
  },
  {
    id: 'poly-sinc-ext2-long',
    label: 'poly-sinc-ext2-long',
    detailKey: 'dsp.panel.src.filter.polySincExt2LongDetail',
    loadKey: 'dsp.panel.src.filter.loadHigh',
    gpuKey: 'dsp.panel.src.filter.gpuRtx5070',
    featured: true,
  },
  {
    id: 'poly-sinc-ext2-xla',
    label: 'poly-sinc-ext2-xla',
    detailKey: 'dsp.panel.src.filter.polySincExt2XlaDetail',
    loadKey: 'dsp.panel.src.filter.loadVeryHigh',
    gpuKey: 'dsp.panel.src.filter.gpuRtx5070Ti',
  },
  {
    id: 'poly-sinc-ext2-xl',
    label: 'poly-sinc-ext2-xl',
    detailKey: 'dsp.panel.src.filter.polySincExt2XlDetail',
    loadKey: 'dsp.panel.src.filter.loadExtreme',
    gpuKey: 'dsp.panel.src.filter.gpuRtx5080',
  },
  {
    id: 'poly-sinc-ext2-hires-lp',
    label: 'poly-sinc-ext2-hires-lp',
    detailKey: 'dsp.panel.src.filter.polySincExt2HiresLpDetail',
    loadKey: 'dsp.panel.src.filter.loadVeryHigh',
    gpuKey: 'dsp.panel.src.filter.gpuRtx5070Ti',
  },
  {
    id: 'poly-sinc-ext2-hires-mp',
    label: 'poly-sinc-ext2-hires-mp',
    detailKey: 'dsp.panel.src.filter.polySincExt2HiresMpDetail',
    loadKey: 'dsp.panel.src.filter.loadVeryHigh',
    gpuKey: 'dsp.panel.src.filter.gpuRtx5070Ti',
  },
  {
    id: 'poly-sinc-ext3-long',
    label: 'poly-sinc-ext3-long',
    detailKey: 'dsp.panel.src.filter.polySincExt3LongDetail',
    loadKey: 'dsp.panel.src.filter.loadVeryHigh',
    gpuKey: 'dsp.panel.src.filter.gpuRtx5080',
  },
  {
    id: 'poly-sinc-ext3-xla',
    label: 'poly-sinc-ext3-xla',
    detailKey: 'dsp.panel.src.filter.polySincExt3XlaDetail',
    loadKey: 'dsp.panel.src.filter.loadExtreme',
    gpuKey: 'dsp.panel.src.filter.gpuRtx5090',
  },
  {
    id: 'poly-sinc-gauss-long',
    label: 'poly-sinc-gauss-long',
    detailKey: 'dsp.panel.src.filter.polySincGaussLongDetail',
    loadKey: 'dsp.panel.src.filter.loadHigh',
    gpuKey: 'dsp.panel.src.filter.gpuRtx5060',
    featured: true,
  },
  {
    id: 'poly-sinc-gauss-xla',
    label: 'poly-sinc-gauss-xla',
    detailKey: 'dsp.panel.src.filter.polySincGaussXlaDetail',
    loadKey: 'dsp.panel.src.filter.loadVeryHigh',
    gpuKey: 'dsp.panel.src.filter.gpuRtx5070Ti',
  },
  {
    id: 'poly-sinc-gauss-xl',
    label: 'poly-sinc-gauss-xl',
    detailKey: 'dsp.panel.src.filter.polySincGaussXlDetail',
    loadKey: 'dsp.panel.src.filter.loadExtreme',
    gpuKey: 'dsp.panel.src.filter.gpuRtx5080',
  },
  {
    id: 'poly-sinc-gauss-hires-lp',
    label: 'poly-sinc-gauss-hires-lp',
    detailKey: 'dsp.panel.src.filter.polySincGaussHiresLpDetail',
    loadKey: 'dsp.panel.src.filter.loadMedium',
  },
  {
    id: 'poly-sinc-gauss-hires-mp',
    label: 'poly-sinc-gauss-hires-mp',
    detailKey: 'dsp.panel.src.filter.polySincGaussHiresMpDetail',
    loadKey: 'dsp.panel.src.filter.loadHigh',
    gpuKey: 'dsp.panel.src.filter.gpuRtx5060',
  },
  {
    id: 'poly-sinc-gauss-xtr-long',
    label: 'poly-sinc-gauss-xtr-long',
    detailKey: 'dsp.panel.src.filter.polySincGaussXtrLongDetail',
    loadKey: 'dsp.panel.src.filter.loadVeryHigh',
    gpuKey: 'dsp.panel.src.filter.gpuRtx5080',
  },
  {
    id: 'poly-sinc-gauss-xtr-xla',
    label: 'poly-sinc-gauss-xtr-xla',
    detailKey: 'dsp.panel.src.filter.polySincGaussXtrXlaDetail',
    loadKey: 'dsp.panel.src.filter.loadExtreme',
    gpuKey: 'dsp.panel.src.filter.gpuRtx5090',
  },
  {
    id: 'poly-sinc-xtr-mp',
    label: 'poly-sinc-xtr-mp',
    detailKey: 'dsp.panel.src.filter.polySincXtrMpDetail',
    loadKey: 'dsp.panel.src.filter.loadHigh',
    gpuKey: 'dsp.panel.src.filter.gpuRtx5070',
  },
  {
    id: 'poly-sinc-xtr-short-lp',
    label: 'poly-sinc-xtr-short-lp',
    detailKey: 'dsp.panel.src.filter.polySincXtrShortLpDetail',
    loadKey: 'dsp.panel.src.filter.loadHigh',
  },
  {
    id: 'poly-sinc-xtr-short-mp',
    label: 'poly-sinc-xtr-short-mp',
    detailKey: 'dsp.panel.src.filter.polySincXtrShortMpDetail',
    loadKey: 'dsp.panel.src.filter.loadHigh',
    gpuKey: 'dsp.panel.src.filter.gpuRtx5060',
  },
  {
    id: 'poly-sinc-xtr-lp',
    label: 'poly-sinc-xtr-lp',
    detailKey: 'dsp.panel.src.filter.polySincXtrLpDetail',
    loadKey: 'dsp.panel.src.filter.loadHigh',
    gpuKey: 'dsp.panel.src.filter.gpuRtx5070',
  },
  {
    id: 'poly-sinc-xtr-xla',
    label: 'poly-sinc-xtr-xla',
    detailKey: 'dsp.panel.src.filter.polySincXtrXlaDetail',
    loadKey: 'dsp.panel.src.filter.loadExtreme',
    gpuKey: 'dsp.panel.src.filter.gpuRtx5090',
  },
  {
    id: 'minringFIR-lp',
    label: 'minringFIR-lp',
    detailKey: 'dsp.panel.src.filter.minringFirLpDetail',
    loadKey: 'dsp.panel.src.filter.loadMedium',
  },
  {
    id: 'minringFIR-mp',
    label: 'minringFIR-mp',
    detailKey: 'dsp.panel.src.filter.minringFirMpDetail',
    loadKey: 'dsp.panel.src.filter.loadHigh',
    gpuKey: 'dsp.panel.src.filter.gpuRtx5060',
    featured: true,
  },
  {
    id: 'minringFIR-xla',
    label: 'minringFIR-xla',
    detailKey: 'dsp.panel.src.filter.minringFirXlaDetail',
    loadKey: 'dsp.panel.src.filter.loadVeryHigh',
    gpuKey: 'dsp.panel.src.filter.gpuRtx5070Ti',
  },
  {
    id: 'minringFIR-soft',
    label: 'minringFIR-soft',
    detailKey: 'dsp.panel.src.filter.minringFirSoftDetail',
    loadKey: 'dsp.panel.src.filter.loadVeryHigh',
    gpuKey: 'dsp.panel.src.filter.gpuRtx5070Ti',
  },
  {
    id: 'minringFIR-extreme',
    label: 'minringFIR-extreme',
    detailKey: 'dsp.panel.src.filter.minringFirExtremeDetail',
    loadKey: 'dsp.panel.src.filter.loadExtreme',
    gpuKey: 'dsp.panel.src.filter.gpuRtx5090',
  },
  {
    id: 'apod-fast',
    label: 'apod-fast',
    detailKey: 'dsp.panel.src.filter.apodFastDetail',
    loadKey: 'dsp.panel.src.filter.loadHigh',
    gpuKey: 'dsp.panel.src.filter.gpuRtx5060',
    featured: true,
  },
  {
    id: 'apod-long',
    label: 'apod-long',
    detailKey: 'dsp.panel.src.filter.apodLongDetail',
    loadKey: 'dsp.panel.src.filter.loadVeryHigh',
    gpuKey: 'dsp.panel.src.filter.gpuRtx5070Ti',
  },
  {
    id: 'apod-minring',
    label: 'apod-minring',
    detailKey: 'dsp.panel.src.filter.apodMinringDetail',
    loadKey: 'dsp.panel.src.filter.loadVeryHigh',
    gpuKey: 'dsp.panel.src.filter.gpuRtx5070Ti',
    featured: true,
  },
  {
    id: 'apod-gauss',
    label: 'apod-gauss',
    detailKey: 'dsp.panel.src.filter.apodGaussDetail',
    loadKey: 'dsp.panel.src.filter.loadVeryHigh',
    gpuKey: 'dsp.panel.src.filter.gpuRtx5070',
  },
  {
    id: 'apod-xtr',
    label: 'apod-xtr',
    detailKey: 'dsp.panel.src.filter.apodXtrDetail',
    loadKey: 'dsp.panel.src.filter.loadExtreme',
    gpuKey: 'dsp.panel.src.filter.gpuRtx5080',
  },
  {
    id: 'apod-extreme',
    label: 'apod-extreme',
    detailKey: 'dsp.panel.src.filter.apodExtremeDetail',
    loadKey: 'dsp.panel.src.filter.loadExtreme',
    gpuKey: 'dsp.panel.src.filter.gpuRtx5090',
  },
  {
    id: 'brickwall-long',
    label: 'brickwall-long',
    detailKey: 'dsp.panel.src.filter.brickwallLongDetail',
    loadKey: 'dsp.panel.src.filter.loadVeryHigh',
    gpuKey: 'dsp.panel.src.filter.gpuRtx5080',
  },
  {
    id: 'soft-knee-long',
    label: 'soft-knee-long',
    detailKey: 'dsp.panel.src.filter.softKneeLongDetail',
    loadKey: 'dsp.panel.src.filter.loadVeryHigh',
    gpuKey: 'dsp.panel.src.filter.gpuRtx5070Ti',
  },
  {
    id: 'closed-form',
    label: 'closed-form',
    detailKey: 'dsp.panel.src.filter.closedFormDetail',
    loadKey: 'dsp.panel.src.filter.loadResearch',
  },
  {
    id: 'sinc-M',
    label: 'sinc-M',
    detailKey: 'dsp.panel.src.filter.sincMDetail',
    loadKey: 'dsp.panel.src.filter.loadMedium',
  },
  {
    id: 'sinc-L',
    label: 'sinc-L',
    detailKey: 'dsp.panel.src.filter.sincLDetail',
    loadKey: 'dsp.panel.src.filter.loadHigh',
    gpuKey: 'dsp.panel.src.filter.gpuRtx5060',
  },
  {
    id: 'sinc-long',
    label: 'sinc-long',
    detailKey: 'dsp.panel.src.filter.sincLongDetail',
    loadKey: 'dsp.panel.src.filter.loadMedium',
    gpuKey: 'dsp.panel.src.filter.gpuCpu',
    featured: true,
  },
  {
    id: 'sinc-long-h',
    label: 'sinc-long-h',
    detailKey: 'dsp.panel.src.filter.sincLongHDetail',
    loadKey: 'dsp.panel.src.filter.loadHigh',
    gpuKey: 'dsp.panel.src.filter.gpuRtx5070',
  },
  {
    id: 'sinc-xla',
    label: 'sinc-xla',
    detailKey: 'dsp.panel.src.filter.sincXlaDetail',
    loadKey: 'dsp.panel.src.filter.loadVeryHigh',
    gpuKey: 'dsp.panel.src.filter.gpuRtx5070Ti',
  },
];

const echoSrcAdvancedComputeOptions: Array<{
  id: AudioEchoSrcComputeBackend;
  label: string;
  detailKey: string;
  badgeKey: string;
}> = [
  {
    id: 'cpu',
    label: 'CPU SIMD',
    detailKey: 'dsp.panel.src.compute.cpuDetail',
    badgeKey: 'dsp.panel.src.recommended',
  },
  {
    id: 'cuda',
    label: 'GPU Compute / CUDA',
    detailKey: 'dsp.panel.src.compute.gpuDetail',
    badgeKey: 'dsp.panel.src.compute.gpuBadge',
  },
];

type EchoSrcQualityLadderId = 'realtimeSafe' | 'hifi' | 'reference' | 'insane';

type EchoSrcQualityLadderOption = {
  id: EchoSrcQualityLadderId;
  titleKey: string;
  detailKey: string;
  mode: AudioEchoSrcMode;
  qualityProfile: AudioEchoSrcQualityProfile;
  filter1x: AudioEchoSrcFilterProfile;
  filterNx: AudioEchoSrcFilterProfile;
  computeBackend: AudioEchoSrcComputeBackend;
  latencyKey: string;
  gpuKey: string;
};

const echoSrcQualityLadderOptions: EchoSrcQualityLadderOption[] = [
  {
    id: 'realtimeSafe',
    titleKey: 'dsp.panel.src.ladder.realtimeSafe',
    detailKey: 'dsp.panel.src.ladder.realtimeSafeDetail',
    mode: 'family4x',
    qualityProfile: 'lowLatency',
    filter1x: 'poly-sinc-hb',
    filterNx: 'poly-sinc-hb',
    computeBackend: 'cpu',
    latencyKey: 'dsp.panel.src.ladder.latencyLow',
    gpuKey: 'dsp.panel.src.filter.gpuCpu',
  },
  {
    id: 'hifi',
    titleKey: 'dsp.panel.src.ladder.hifi',
    detailKey: 'dsp.panel.src.ladder.hifiDetail',
    mode: 'family4x',
    qualityProfile: 'balanced',
    filter1x: 'poly-sinc-gauss-long',
    filterNx: 'poly-sinc-hb',
    computeBackend: 'cpu',
    latencyKey: 'dsp.panel.src.ladder.latencyMedium',
    gpuKey: 'dsp.panel.src.filter.gpuCpu',
  },
  {
    id: 'reference',
    titleKey: 'dsp.panel.src.ladder.reference',
    detailKey: 'dsp.panel.src.ladder.referenceDetail',
    mode: 'family8x',
    qualityProfile: 'transparent',
    filter1x: 'apod-minring',
    filterNx: 'poly-sinc-ext2-long',
    computeBackend: 'cuda',
    latencyKey: 'dsp.panel.src.ladder.latencyHigh',
    gpuKey: 'dsp.panel.src.filter.gpuRtx5070Ti',
  },
  {
    id: 'insane',
    titleKey: 'dsp.panel.src.ladder.insane',
    detailKey: 'dsp.panel.src.ladder.insaneDetail',
    mode: 'family8x',
    qualityProfile: 'transparent',
    filter1x: 'apod-long',
    filterNx: 'poly-sinc-ext2-xl',
    computeBackend: 'cuda',
    latencyKey: 'dsp.panel.src.ladder.latencyExtreme',
    gpuKey: 'dsp.panel.src.filter.gpuRtx5080',
  },
];

const pcmDitherOptions: Array<{ mode: AudioPcmDitherMode; label: string; detailKey: string; badgeKey: string }> = [
  { mode: 'off', label: 'Off', detailKey: 'dsp.panel.src.dither.offDetail', badgeKey: 'dsp.panel.src.dither.floatSafe' },
  { mode: 'tpdf', label: 'TPDF', detailKey: 'dsp.panel.src.dither.tpdfDetail', badgeKey: 'dsp.panel.src.dither.integerOnly' },
  { mode: 'highpass-tpdf', label: 'High-pass TPDF', detailKey: 'dsp.panel.src.dither.highpassDetail', badgeKey: 'dsp.panel.src.dither.integerOnly' },
  { mode: 'ns-5', label: 'NS-5', detailKey: 'dsp.panel.src.dither.ns5Detail', badgeKey: 'dsp.panel.src.dither.integerOnly' },
  { mode: 'ns-9', label: 'NS-9', detailKey: 'dsp.panel.src.dither.ns9Detail', badgeKey: 'dsp.panel.src.dither.integerOnly' },
  { mode: 'ultra-shaped', label: 'Ultra shaped', detailKey: 'dsp.panel.src.dither.ultraDetail', badgeKey: 'dsp.panel.src.dither.integerOnly' },
];

const sdmModeOptions: Array<{ mode: AudioSdmMode; labelKey: string; detailKey: string; badgeKey: string }> = [
  { mode: 'off', labelKey: 'dsp.panel.sdm.mode.off', detailKey: 'dsp.panel.sdm.mode.offDetail', badgeKey: 'dsp.panel.sdm.badge.safe' },
  {
    mode: 'dsdPassthrough',
    labelKey: 'dsp.panel.sdm.mode.dsdPassthrough',
    detailKey: 'dsp.panel.sdm.mode.dsdPassthroughDetail',
    badgeKey: 'dsp.panel.sdm.badge.real',
  },
  {
    mode: 'pcmToDsd',
    labelKey: 'dsp.panel.sdm.mode.pcmToDsd',
    detailKey: 'dsp.panel.sdm.mode.pcmToDsdDetail',
    badgeKey: 'dsp.panel.sdm.badge.planned',
  },
];

const sdmTargetRateOptions: Array<{ rate: AudioSdmTargetRate; label: string; detailKey: string }> = [
  { rate: 'dsd64', label: 'DSD64', detailKey: 'dsp.panel.sdm.target.dsd64Detail' },
  { rate: 'dsd128', label: 'DSD128', detailKey: 'dsp.panel.sdm.target.dsd128Detail' },
  { rate: 'dsd256', label: 'DSD256', detailKey: 'dsp.panel.sdm.target.dsd256Detail' },
  { rate: 'dsd512', label: 'DSD512', detailKey: 'dsp.panel.sdm.target.dsd512Detail' },
];

const sdmSoundProfileOptions: Array<{
  id: AudioSdmSoundProfileId;
  labelKey: string;
  detailKey: string;
  badgeKey: string;
}> = audioSdmSoundProfiles.map((profile) => ({
  id: profile.id,
  labelKey: `dsp.panel.sdm.sound.${profile.id}`,
  detailKey: `dsp.panel.sdm.sound.${profile.id}Detail`,
  badgeKey: `dsp.panel.sdm.sound.${profile.id}Badge`,
}));

const sdmQualityProfileOptions: Array<{ profile: AudioSdmQualityProfile; labelKey: string; detailKey: string }> = [
  { profile: 'safe', labelKey: 'dsp.panel.sdm.quality.safe', detailKey: 'dsp.panel.sdm.quality.safeDetail' },
  { profile: 'hifi', labelKey: 'dsp.panel.sdm.quality.hifi', detailKey: 'dsp.panel.sdm.quality.hifiDetail' },
  { profile: 'reference', labelKey: 'dsp.panel.sdm.quality.reference', detailKey: 'dsp.panel.sdm.quality.referenceDetail' },
  { profile: 'insane', labelKey: 'dsp.panel.sdm.quality.insane', detailKey: 'dsp.panel.sdm.quality.insaneDetail' },
];

const sdmComputeBackendOptions: Array<{ backend: AudioSdmComputeBackend; label: string; detailKey: string }> = [
  { backend: 'cpu', label: 'CPU SDM', detailKey: 'dsp.panel.sdm.compute.cpuDetail' },
  { backend: 'cuda', label: 'CUDA SDM', detailKey: 'dsp.panel.sdm.compute.cudaDetail' },
];

const normalizeEchoSrcMode = (mode: unknown): AudioEchoSrcMode =>
  mode === 'compatibility48' || mode === 'family2x' || mode === 'family4x' || mode === 'family8x' ? mode : 'off';

const normalizeEchoSrcQualityProfile = (profile: unknown): AudioEchoSrcQualityProfile =>
  profile === 'balanced' || profile === 'lowLatency' ? profile : 'transparent';

const normalizeEchoSrcAdvancedFilter = (value: unknown): AudioEchoSrcFilterProfile =>
  typeof value === 'string' && echoSrcAdvancedFilterOptions.some((option) => option.id === value)
    ? value as AudioEchoSrcFilterProfile
    : 'poly-sinc-gauss-long';

const normalizeEchoSrcAdvancedCompute = (value: unknown): AudioEchoSrcComputeBackend =>
  value === 'cuda' ? 'cuda' : 'cpu';

const normalizePcmDitherMode = (value: unknown): AudioPcmDitherMode =>
  typeof value === 'string' && pcmDitherOptions.some((option) => option.mode === value)
    ? value as AudioPcmDitherMode
    : 'off';

const normalizeSdmMode = (value: unknown): AudioSdmMode =>
  typeof value === 'string' && sdmModeOptions.some((option) => option.mode === value)
    ? value as AudioSdmMode
    : 'off';

const normalizeSdmTargetRate = (value: unknown): AudioSdmTargetRate =>
  typeof value === 'string' && sdmTargetRateOptions.some((option) => option.rate === value)
    ? value as AudioSdmTargetRate
    : 'dsd128';

const normalizeSdmQualityProfile = (value: unknown): AudioSdmQualityProfile =>
  typeof value === 'string' && sdmQualityProfileOptions.some((option) => option.profile === value)
    ? value as AudioSdmQualityProfile
    : 'safe';

const normalizeSdmComputeBackend = (value: unknown): AudioSdmComputeBackend =>
  value === 'cuda' ? 'cuda' : 'cpu';

const dspLocalTextZhCN: Record<string, string> = {
  'dsp.panel.sdm.sound.compare': '声音风格 A/B',
  'dsp.panel.sdm.sound.compareDetail': '比较时只切换 FIR；DSD 目标、调制器、余量与输出路径保持不变。播放中会回到同一个带 3 秒前导的片段，避免比较到不同乐句。',
  'dsp.panel.sdm.sound.compareLinear': 'A/B Linear 基准',
  'dsp.panel.sdm.sound.compareRestore': '恢复',
  'dsp.panel.sdm.sound.dsd512CudaRequired': 'DSD512 的 Transient / Smooth 使用高辨识度长 FIR；CPU 未通过实时准入。请切换 CUDA，宿主会在开设备前再次验证实际余量。',
  'dsp.action.clear': '清除',
  'dsp.action.disableChannel': '关闭声道补偿',
  'dsp.action.disableFir': '关闭 FIR',
  'dsp.action.enableChannel': '开启声道补偿',
  'dsp.action.enableFir': '启用 FIR',
  'dsp.action.enableFirSafely': '安全启用',
  'dsp.action.importIr': '导入 IR',
  'dsp.action.refresh': '刷新状态',
  'dsp.action.reset': '重置',
  'dsp.action.save': '保存',
  'dsp.aria.chain': 'DSP 模块链',
  'dsp.aria.modules': 'DSP 模块',
  'dsp.aria.pipeline': 'DSP 路径',
  'dsp.aria.workspace': 'DSP 工作区',
  'dsp.brand.subtitle': 'Signal Control',
  'dsp.section.advanced': '高级设置',
  'dsp.module.src.description': 'PCM 采样率转换',
  'dsp.module.src.title': 'ECHO SRC / 升频',
  'dsp.panel.src.abBypass': 'A/B 原生',
  'dsp.panel.src.abRestore': '恢复升频',
  'dsp.panel.src.active': '正在升频',
  'dsp.panel.src.bypassDsd': 'DSD 输出旁路',
  'dsp.panel.src.bypassShared': '共享输出旁路',
  'dsp.panel.src.detail': '独立于 HQPlayer 的本机 ECHO SRC。默认关闭；开启后会进入 DSP 路径并不再标记 bit-perfect。',
  'dsp.panel.src.engine': '引擎',
  'dsp.panel.src.advanced': '高级',
  'dsp.panel.src.advancedSummary': '高级模式显示 poly-sinc / FIR / GPU 计划；播放时以实时 Signal Path 的 active/fallback 状态为准。',
  'dsp.panel.src.compute': 'Compute',
  'dsp.panel.src.compute.cpuDetail': '默认实时路径：稳定、低调度风险，先保证播放可靠。',
  'dsp.panel.src.compute.cpuStatus': 'CPU 实时路径，未请求 CUDA。',
  'dsp.panel.src.compute.gpuBadge': '显卡',
  'dsp.panel.src.compute.gpuDetail': '实验路径：给超长 filter / 大缓冲规划，接入前必须单独验证延迟和掉帧。',
  'dsp.panel.src.dither.activeStatus': '整数输出已生效 / {bits}-bit',
  'dsp.panel.src.dither.floatSafe': 'Float 输出不处理',
  'dsp.panel.src.dither.floatStatus': '当前是 float 输出，dither 自动旁路',
  'dsp.panel.src.dither.highpassDetail': '高通 TPDF：把抖动能量推离低频，适合 16-bit 输出和安静尾音。',
  'dsp.panel.src.dither.integerOnly': '仅整数输出',
  'dsp.panel.src.dither.ns5Detail': '5 阶 noise shaping：轻量塑形，降低中低频量化感。',
  'dsp.panel.src.dither.ns9Detail': '9 阶 noise shaping：更激进地推高频噪声，适合 24-bit/高余量链路。',
  'dsp.panel.src.dither.offDetail': '保持 Float32 PCM 链路原样；默认关闭，避免无意义加噪。',
  'dsp.panel.src.dither.offStatus': '关闭',
  'dsp.panel.src.dither.pendingStatus': '等待整数输出格式',
  'dsp.panel.src.dither.title': 'PCM Dither / Noise Shaping',
  'dsp.panel.src.dither.tpdfDetail': '标准 TPDF：最稳妥的量化抖动，适合 16-bit/24-bit 整数输出。',
  'dsp.panel.src.dither.ultraDetail': 'Ultra shaped：最高阶塑形，尾音更干净但更挑输出链路和余量。',
  'dsp.panel.src.ladder.hifi': 'HiFi',
  'dsp.panel.src.ladder.hifiDetail': '4x / gauss-long 1x / hb Nx / CPU，听感更柔和，实时压力适中。',
  'dsp.panel.src.ladder.insane': 'Insane / Offline-like',
  'dsp.panel.src.ladder.insaneDetail': '8x / apod-long + ext2-xl / CUDA，超吃配置，用来冲击接近离线的 PCM 体验。',
  'dsp.panel.src.ladder.latencyExtreme': '超高延迟',
  'dsp.panel.src.ladder.latencyHigh': '高延迟',
  'dsp.panel.src.ladder.latencyLow': '低延迟',
  'dsp.panel.src.ladder.latencyMedium': '中等延迟',
  'dsp.panel.src.ladder.realtimeSafe': 'Realtime Safe',
  'dsp.panel.src.ladder.realtimeSafeDetail': '4x / hb 1x+Nx / CPU，优先不卡顿和 UI 可控。',
  'dsp.panel.src.ladder.reference': 'Reference',
  'dsp.panel.src.ladder.referenceDetail': '8x / apod-minring 1x / ext2-long Nx / CUDA，优先听感差异和透明度。',
  'dsp.panel.src.ladder.title': 'CPU/GPU Quality Ladder',
  'dsp.panel.src.cuda.pending': 'CUDA runtime ready; FIR worker pending.',
  'dsp.panel.src.cuda.ready': '{device} / {memory} / Driver {driver} / CUDA {cuda}',
  'dsp.panel.src.cuda.lowUtilization': '实时音频是小块低延迟任务，GPU 占用低不代表没生效；以当前播放状态里的 CUDA FIR active 为准。',
  'dsp.panel.src.cuda.unavailable': 'CUDA 不可用：{reason}',
  'dsp.panel.src.cuda.guide.driverStep1': '安装或更新 NVIDIA App / 官方 GeForce、Studio、RTX 驱动。',
  'dsp.panel.src.cuda.guide.driverStep2': '安装完成后重启 Windows，再重新打开 ECHO。',
  'dsp.panel.src.cuda.guide.driverStep3': '回到这里刷新状态；如果仍不可用，确认系统里能运行 nvidia-smi。',
  'dsp.panel.src.cuda.guide.driverTitle': '需要安装 NVIDIA 驱动',
  'dsp.panel.src.cuda.guide.genericStep1': '先更新 NVIDIA 官方驱动并重启系统。',
  'dsp.panel.src.cuda.guide.genericStep2': '重新打开 ECHO 后刷新状态。',
  'dsp.panel.src.cuda.guide.genericStep3': '若仍失败，暂时使用 CPU FIR / SOXR 并查看诊断原因。',
  'dsp.panel.src.cuda.guide.genericTitle': 'CUDA 需要检查',
  'dsp.panel.src.cuda.guide.problem': '检测结果：{reason}',
  'dsp.panel.src.cuda.guide.runtimeStep1': '更新 NVIDIA 驱动后重启系统。',
  'dsp.panel.src.cuda.guide.runtimeStep2': '先改用较轻 filter 或降低升频倍率测试稳定性。',
  'dsp.panel.src.cuda.guide.runtimeStep3': '如果继续失败，ECHO 会自动回落 CPU FIR，不会静默假装 GPU 生效。',
  'dsp.panel.src.cuda.guide.runtimeTitle': 'CUDA 运行时失败',
  'dsp.panel.src.cuda.guide.title': 'CUDA 安装指引',
  'dsp.panel.src.cuda.guide.workerStep1': '这通常不是用户驱动问题，而是当前 ECHO 包内缺少 CUDA FIR 组件。',
  'dsp.panel.src.cuda.guide.workerStep2': '安装带 CUDA FIR worker 的 ECHO 版本，或用 CUDA 构建配置重新打包。',
  'dsp.panel.src.cuda.guide.workerStep3': '在组件补齐前会自动回落 CPU FIR / SOXR。',
  'dsp.panel.src.cuda.guide.workerTitle': 'ECHO CUDA 组件缺失',
  'dsp.panel.src.cuda.reason.driverMissing': '未检测到 NVIDIA 驱动或 nvidia-smi',
  'dsp.panel.src.cuda.reason.driverUnreadable': 'NVIDIA 驱动可执行文件返回异常',
  'dsp.panel.src.cuda.reason.workerCpuOnly': 'ECHO CUDA worker 不是 CUDA 构建',
  'dsp.panel.src.cuda.reason.workerMissing': 'ECHO CUDA worker 未随安装包提供',
  'dsp.panel.src.cuda.reason.workerRuntime': 'CUDA worker 播放中失败或超时',
  'dsp.panel.src.cuda.reason.workerStopped': 'CUDA worker 已随暂停或切换停止，等待下一次播放状态',
  'dsp.panel.src.filter': 'Filter',
  'dsp.panel.src.filter.apodFastDetail': 'apodizing 快速档：较早 cutoff / 中等 taps，用来压老录音或 MP3 残留 ringing。',
  'dsp.panel.src.filter.apodGaussDetail': 'apodizing 高斯窗：更柔和的提前滚降，声音会更顺滑但高频边缘更克制。',
  'dsp.panel.src.filter.apodLongDetail': 'apodizing 长 taps：提前滚降 + 高 stopband，优先处理旧 ADC / brickwall 前振铃。',
  'dsp.panel.src.filter.apodMinringDetail': 'apodizing minimum phase：降低前振铃并主动衰减源文件 ringing，听感变化最明显。',
  'dsp.panel.src.filter.closedFormDetail': '封闭形式 sinc 插值方向，后续做基准对照。',
  'dsp.panel.src.filter.collapse': '收起精选',
  'dsp.panel.src.filter.expand': '展开全部',
  'dsp.panel.src.filter.gpuCpu': 'CPU / 入门 GPU',
  'dsp.panel.src.filter.gpuRtx5060': '建议 RTX 5060+',
  'dsp.panel.src.filter.gpuRtx5070': '建议 RTX 5070+',
  'dsp.panel.src.filter.gpuRtx5070Ti': '建议 RTX 5070 Ti+',
  'dsp.panel.src.filter.gpuRtx5080': '建议 RTX 5080+',
  'dsp.panel.src.filter.gpuRtx5090': '建议 RTX 5090 / 32GB',
  'dsp.panel.src.filter.loadHigh': '高负载',
  'dsp.panel.src.filter.loadExtreme': '极高负载',
  'dsp.panel.src.filter.loadLight': '轻负载',
  'dsp.panel.src.filter.loadMedium': '中负载',
  'dsp.panel.src.filter.loadResearch': '研究',
  'dsp.panel.src.filter.loadVeryHigh': '很高',
  'dsp.panel.src.filter.minringFirLpDetail': 'minimum-ringing FIR，低预振铃，声音更贴近。',
  'dsp.panel.src.filter.minringFirMpDetail': 'minimum-ringing 中等精度档，降低前振铃并保留更多透明度。',
  'dsp.panel.src.filter.minringFirXlaDetail': 'minimum-ringing 超长档，偏自然听感但计算量明显更高。',
  'dsp.panel.src.filter.minringFirSoftDetail': 'minimum-ringing soft：高斯窗 + minimum phase，偏柔和、靠前、少刺激。',
  'dsp.panel.src.filter.minringFirExtremeDetail': 'minimum-ringing extreme：3071 taps minimum phase，冲听感变化和瞬态自然感。',
  'dsp.panel.src.filter.polySincExt2HiresLpDetail': 'ext2 高采样率线性相位档，给 Nx 路径准备的高精度版本。',
  'dsp.panel.src.filter.polySincExt2HiresMpDetail': 'ext2 高采样率 minimum phase 档，降低前振铃并保留空气感。',
  'dsp.panel.src.filter.polySincExt3LongDetail': 'ext3 长 taps 线性相位：更窄 transition、更高 stopband，透明度优先但延迟明显。',
  'dsp.panel.src.filter.polySincExt3XlaDetail': 'ext3 4095 taps 极限线性相位：给 RTX 5090 / 离线感 A/B 的压力档。',
  'dsp.panel.src.filter.polySincExt2ShortDetail': 'ext2 短 taps 档，保留高精度方向但更适合实时。',
  'dsp.panel.src.filter.polySincExt2LongDetail': '长 taps 线性相位，透明优先，接近 long 档方向。',
  'dsp.panel.src.filter.polySincExt2MediumDetail': 'ext2 中 taps 档，透明度和负载更平衡。',
  'dsp.panel.src.filter.polySincExt2XlDetail': 'ext2 3071 taps 极限档，给高端 CUDA 和离线级听感测试。',
  'dsp.panel.src.filter.polySincExt2XlaDetail': '超长 taps，面向 8x / Ultra 的后续高精度档。',
  'dsp.panel.src.filter.polySincGaussHiresLpDetail': '高分辨率线性相位高斯窗，柔和但保持定位。',
  'dsp.panel.src.filter.polySincGaussHiresMpDetail': '高分辨率 minimum phase 高斯窗，降低前振铃感。',
  'dsp.panel.src.filter.polySincGaussLongDetail': '高斯窗 poly-sinc，听感更柔和，兼顾瞬态。',
  'dsp.panel.src.filter.polySincGaussXlDetail': '高斯 3071 taps 极限档，柔和取向但非常吃显卡。',
  'dsp.panel.src.filter.polySincGaussXlaDetail': '高斯超长档，给 A/B 和测量对照准备。',
  'dsp.panel.src.filter.polySincGaussXtrLongDetail': 'gauss-xtr 长档：更强高斯整形，声音更顺滑、边缘更收。',
  'dsp.panel.src.filter.polySincGaussXtrXlaDetail': 'gauss-xtr 4095 taps：极柔和超长档，用来试“厚、顺、暗一点”的方向。',
  'dsp.panel.src.filter.polySincHbDetail': '半带 poly-sinc，适合 2x/4x 先做稳定实时版。',
  'dsp.panel.src.filter.polySincXtrLpDetail': 'xtr 线性相位长档，透明取向，对实时性能要求更高。',
  'dsp.panel.src.filter.polySincXtrShortLpDetail': 'xtr short 线性相位，给实时和透明度之间的折中。',
  'dsp.panel.src.filter.polySincXtrShortMpDetail': 'xtr short minimum phase，偏自然听感和低前振铃。',
  'dsp.panel.src.filter.polySincXtrXlaDetail': 'xtr xla minimum phase 极限档，偏听感但非常吃配置。',
  'dsp.panel.src.filter.polySincXtrMpDetail': '中相位方向，减少前振铃感，适合听感取向。',
  'dsp.panel.src.filter.apodXtrDetail': 'apodizing xtr：3071 taps 提前滚降，强力清理旧 brickwall/filter ringing。',
  'dsp.panel.src.filter.apodExtremeDetail': 'apodizing extreme：4095 taps minimum phase，最大化“源 ringing 清理”听感。',
  'dsp.panel.src.filter.brickwallLongDetail': 'brickwall-long：高截止、窄 transition、强 stopband，用来对照最硬最透明方向。',
  'dsp.panel.src.filter.softKneeLongDetail': 'soft-knee-long：提前缓慢滚降，牺牲一点边缘换顺滑和耐听。',
  'dsp.panel.src.filter.selected': '已选 Filter',
  'dsp.panel.src.filter.sincLDetail': 'sinc 大档，作为高精度基准和听感对照。',
  'dsp.panel.src.filter.sincLongHDetail': 'sinc-long 高精度版，作为更重的线性相位基准。',
  'dsp.panel.src.filter.sincLongDetail': '长 sinc 基线，用来校准 FIR 设计和听感差异。',
  'dsp.panel.src.filter.sincMDetail': 'sinc 中档，负载较低的基准参考。',
  'dsp.panel.src.filter.sincXlaDetail': 'sinc xla 超长基准档，用来压力测试和对照极限 filter。',
  'dsp.panel.src.kicker': '采样率转换',
  'dsp.panel.src.mode': '模式',
  'dsp.panel.src.mode.family2x': '2x PCM',
  'dsp.panel.src.mode.family2xDetail': '44.1k 家族升到 88.2k，48k 家族升到 96k。',
  'dsp.panel.src.mode.family4x': '4x PCM',
  'dsp.panel.src.mode.family4xDetail': '44.1k 家族升到 176.4k，48k 家族升到 192k。',
  'dsp.panel.src.mode.family8x': '8x Ultra',
  'dsp.panel.src.mode.family8xDetail': '实验档：44.1k 家族升到 352.8k，48k 家族升到 384k。',
  'dsp.panel.src.mode.compatibility48': '48 kHz 兼容',
  'dsp.panel.src.mode.compatibility48Detail': '将 PCM 固定转换到 48 kHz，适合只接受 48 kHz 的独占耳机或声卡；默认关闭。',
  'dsp.panel.src.mode.off': '关闭',
  'dsp.panel.src.mode.offDetail': '保持源采样率，Bit-perfect 条件不受 ECHO SRC 影响。',
  'dsp.panel.src.modeSwitch': 'ECHO SRC 控制模式',
  'dsp.panel.src.native': '原生直通',
  'dsp.panel.src.normal': '普通',
  'dsp.panel.src.notConnected': '未接入播放链路',
  'dsp.panel.src.note': '只处理 PCM。共享输出、DSD 输出或 HQPlayer 接管时不会叠加升频。',
  'dsp.panel.src.pending': '等待下一次播放规划',
  'dsp.panel.src.precision': '精度',
  'dsp.panel.src.quality': '质量策略',
  'dsp.panel.src.quality.balanced': 'Balanced',
  'dsp.panel.src.quality.balancedDetail': '保持原有 SOXR 档位，兼顾稳定和开销。',
  'dsp.panel.src.quality.lowLatency': 'Low latency',
  'dsp.panel.src.quality.lowLatencyDetail': '降低 SRC 开销，适合低延迟输出。',
  'dsp.panel.src.quality.transparent': 'Transparent',
  'dsp.panel.src.quality.transparentDetail': '最高精度 SOXR，优先透明和低失真。',
  'dsp.panel.src.recommended': '推荐',
  'dsp.panel.src.route': '路径',
  'dsp.panel.src.sourceRate': '源采样率',
  'dsp.panel.src.targetRate': '目标采样率',
  'dsp.stage.src': '采样率',
  'dsp.error.channelBridge': '声道工具不可用。',
  'dsp.error.desktopBridge': '桌面桥接不可用。',
  'dsp.error.dspBridge': 'DSP 桥接不可用。',
  'dsp.error.firBridge': 'FIR 桥接不可用。',
  'dsp.label.bitPerfect': 'Bit-perfect',
  'dsp.label.currentModule': '当前模块',
  'dsp.label.module': 'DSP 模块',
  'dsp.label.moduleStatus': '模块状态',
  'dsp.label.output': '输出',
  'dsp.metric.bitPerfect': 'Bit-perfect',
  'dsp.metric.clipping': '削波',
  'dsp.metric.dsp': 'DSP',
  'dsp.metric.inputPeak': '输入峰值',
  'dsp.metric.ir': 'IR',
  'dsp.metric.latency': '延迟',
  'dsp.metric.liveHeadroom': '实时余量',
  'dsp.metric.truePeak': 'True Peak',
  'dsp.metric.mode': '模式',
  'dsp.metric.outputEstimate': '输出估算',
  'dsp.metric.reason': '原因',
  'dsp.metric.sampleRate': '采样率',
  'dsp.metric.taps': 'Taps',
  'dsp.module.channel.description': '平衡、延迟、Mono',
  'dsp.module.channel.title': '声道工具',
  'dsp.module.eq.description': '频段、前级、预设',
  'dsp.module.eq.title': '参数 EQ',
  'dsp.module.headroom.description': 'DSP 前余量预留',
  'dsp.module.headroom.title': 'Headroom',
  'dsp.module.headphone.description': 'OPRA 耳机曲线',
  'dsp.module.headphone.title': '耳机校正',
  'dsp.module.room.description': '只处理 IR 卷积',
  'dsp.module.room.title': 'FIR / 房间校正',
  'dsp.module.safety.description': '只监控输出链',
  'dsp.module.safety.title': '输出安全',
  'dsp.module.sdm.description': 'DSD / SDM 真实链路',
  'dsp.module.sdm.title': 'ECHO SDM / DSD（测试版）',
  'dsp.panel.sdm.capability': 'Capability',
  'dsp.panel.sdm.capabilityDetail': 'ECHO 现在可验证 Native DSD、DoP 及独立 PCM -> SDM；SDM 不依赖实验室里的 DSD 直通开关。',
  'dsp.panel.sdm.detail': '显示当前这首歌是否真的走 DSD/DoP/native DSD，或是否实际进入独立 PCM -> SDM 链路。',
  'dsp.panel.sdm.dop': 'DoP passthrough',
  'dsp.panel.sdm.dopDetail': '本地 DSF 在 Exclusive 下尝试 DoP，失败会明确 fallback 到 PCM。',
  'dsp.panel.sdm.fallback': 'Fallback',
  'dsp.panel.sdm.guard': 'Guard',
  'dsp.panel.sdm.guardDetail': 'PCM -> SDM 会自动套用该档位建议 headroom，并对极弱信号进入 DSD idle 以压低底噪。',
  'dsp.panel.sdm.kicker': 'DSD / sigma-delta monitor',
  'dsp.panel.sdm.modulator': 'PCM -> SDM modulator',
  'dsp.panel.sdm.modulatorCoefficients': '反馈系数',
  'dsp.panel.sdm.modulatorDither': 'Dither',
  'dsp.panel.sdm.modulatorHeadroom': '建议余量',
  'dsp.panel.sdm.modulatorOrder': '阶数',
  'dsp.panel.sdm.modulatorProfile': 'Modulator 参数',
  'dsp.panel.sdm.modulatorStability': '稳定限制',
  'dsp.panel.sdm.modulatorPending': '未路由，查看 Fallback',
  'dsp.panel.sdm.nativeDsd': 'Native DSD',
  'dsp.panel.sdm.noDsdSource': '当前不是 DSD 源',
  'dsp.panel.sdm.note': 'PCM -> SDM 使用独立 ECHO SDM 链路；实验室里的 DSD 直通只服务原生 DSD 源。',
  'dsp.panel.sdm.output': 'Actual output',
  'dsp.panel.sdm.oversampling': 'PCM oversampling',
  'dsp.panel.sdm.oversampling1x': 'Oversampling 1x',
  'dsp.panel.sdm.oversampling1xDetail': '低采样率 PCM 入口滤波倾向；CUDA 4x/8x 会作为第一段 ECHO FIR 执行。',
  'dsp.panel.sdm.oversamplingEffective': '当前槽位',
  'dsp.panel.sdm.oversamplingNx': 'Oversampling Nx',
  'dsp.panel.sdm.oversamplingNxDetail': '高采样率或多倍频阶段滤波倾向；CUDA 4x/8x 会作为后续 ECHO FIR 阶段执行。',
  'dsp.panel.sdm.oversamplingRoute': '前端上采样',
  'dsp.panel.sdm.oversamplingTruth': '真实执行以 native host 回报的 FIR stages、backend 与 fallback 为准。',
  'dsp.panel.sdm.pcmFallback': 'PCM fallback',
  'dsp.panel.sdm.requested': 'Requested',
  'dsp.panel.sdm.source': 'Source',
  'dsp.panel.sdm.transport': 'Transport',
  'dsp.panel.sdm.actual': '实际生效',
  'dsp.panel.sdm.badge.planned': '实验链路',
  'dsp.panel.sdm.badge.real': '真实链路',
  'dsp.panel.sdm.badge.safe': '旁路安全',
  'dsp.panel.sdm.compute': 'SDM Compute',
  'dsp.panel.sdm.compute.cpuDetail': 'CPU 实时路径已接入第一版 PCM -> SDM DoP。',
  'dsp.panel.sdm.compute.cudaDetail': '包含原生 CUDA 递归调制器与真机性能准入；若 CPU 更快，CUDA 仍可加速 FIR 过采样。',
  'dsp.panel.sdm.mode': 'SDM 模式',
  'dsp.panel.sdm.mode.dsdPassthrough': 'DSD Passthrough',
  'dsp.panel.sdm.mode.dsdPassthroughDetail': '只处理原生 DSD 源，走 DoP，不经过 PCM 升频。',
  'dsp.panel.sdm.mode.off': '关闭 SDM',
  'dsp.panel.sdm.mode.offDetail': 'PCM 和 ECHO SRC 保持独立；不会启动 DSD/SDM 输出。',
  'dsp.panel.sdm.mode.pcmToDsd': 'PCM -> SDM',
  'dsp.panel.sdm.mode.pcmToDsdDetail': '将 PCM 调制为 1-bit SDM；DSD64-256 可走 DoP，实验性 ASIO 链路可走 Native DSD。',
  'dsp.panel.sdm.sound': 'SDM 声音风格',
  'dsp.panel.sdm.sound.detail': '声音风格改变送入调制器前的 FIR 相位、振铃与滚降；Quality 只负责调制稳定性和超声频噪声，不再冒充“音色档位”。',
  'dsp.panel.sdm.sound.linear': 'ECHO Linear',
  'dsp.panel.sdm.sound.linearDetail': '线性相位、陡峭滚降；保留对称瞬态和最宽带宽，适合作为中性基准。',
  'dsp.panel.sdm.sound.linearBadge': '中性 / 对称振铃',
  'dsp.panel.sdm.sound.transient': 'ECHO Transient',
  'dsp.panel.sdm.sound.transientDetail': '最小相位、前置振铃显著减少；击鼓和拨弦更靠前，代价是相位不再线性。',
  'dsp.panel.sdm.sound.transientBadge': '瞬态 / 最小相位',
  'dsp.panel.sdm.sound.smooth': 'ECHO Smooth',
  'dsp.panel.sdm.sound.smoothDetail': 'Apodizing + Gaussian 渐进滚降；更主动清理源文件数字振铃，高频带宽取舍也更明显。',
  'dsp.panel.sdm.sound.smoothBadge': '柔和 / Apodizing',
  'dsp.panel.sdm.sound.custom': 'Custom FIR',
  'dsp.panel.sdm.quality': '调制器 / 稳定性',
  'dsp.panel.sdm.quality.hifi': 'HiFi',
  'dsp.panel.sdm.quality.hifiDetail': '6 阶有界 NTF，固定 6 dB 调制安全余量；日常质量档。',
  'dsp.panel.sdm.quality.insane': 'Insane',
  'dsp.panel.sdm.quality.insaneDetail': '8 阶有界 NTF，固定 6 dB 调制安全余量；高负载实验档。',
  'dsp.panel.sdm.quality.reference': 'Reference',
  'dsp.panel.sdm.quality.referenceDetail': '7 阶有界 NTF，固定 6 dB 调制安全余量；测量与对照档。',
  'dsp.panel.sdm.quality.safe': 'Realtime Safe',
  'dsp.panel.sdm.quality.safeDetail': '3 阶有界 NTF，固定 6 dB 调制安全余量；稳定性优先。',
  'dsp.panel.sdm.runtime.dsdPassthrough': '当前曲目正在走 DSD passthrough',
  'dsp.panel.sdm.runtime.off': '当前曲目没有走 SDM',
  'dsp.panel.sdm.runtime.pcmToSdmActive': 'PCM -> SDM 正在实际生效',
  'dsp.panel.sdm.runtime.pcmToSdmNotRouted': '当前链路未路由 PCM -> SDM，请看 Fallback 原因',
  'dsp.panel.sdm.separateNote': 'SDM 与 PCM/ECHO SRC 分开保存；只有当前播放链路满足条件时才会实际接管 PCM。',
  'dsp.panel.sdm.target': 'Target DSD rate',
  'dsp.panel.sdm.target.dsd128Detail': '常用实时目标；PCM -> SDM 由 ECHO SDM 独立链路实际接管。',
  'dsp.panel.sdm.target.dsd256Detail': '高倍率实时 PCM -> SDM 目标；避免走普通 DoP 直出。',
  'dsp.panel.sdm.target.dsd512Detail': '32x FIR / 22.5792 或 24.576 MHz Native DSD；仅 ASIO 实验链路准入，其他输出会明确拒绝。',
  'dsp.panel.sdm.target.dsd64Detail': '轻量目标；用于验证 ECHO SDM 链路是否能稳定出声。',
  'dsp.panel.channel.advanced': '高级声道',
  'dsp.panel.channel.balance': '声像平衡',
  'dsp.panel.channel.bandCompensation': '分频段左右补偿',
  'dsp.panel.channel.bandHigh': '高频',
  'dsp.panel.channel.bandLow': '低频',
  'dsp.panel.channel.bandMid': '中频',
  'dsp.panel.channel.centered': '中心稳定',
  'dsp.panel.channel.compensationDetail': '默认只降低偏响一侧，适合不可维修的耳机偏音补偿。',
  'dsp.panel.channel.compensationOff': '已关闭',
  'dsp.panel.channel.compensationOn': '已开启',
  'dsp.panel.channel.compensationTitle': '偏音补偿',
  'dsp.panel.channel.constantPower': '恒功率',
  'dsp.panel.channel.delaySkew': '延迟差',
  'dsp.panel.channel.he90Hint': '建议从 0.25 dB 开始，边听居中人声边微调。',
  'dsp.panel.channel.invertLeft': '左声道反相',
  'dsp.panel.channel.invertRight': '右声道反相',
  'dsp.panel.channel.kicker': '声道工具',
  'dsp.panel.channel.leansLeft': '偏左 {value}',
  'dsp.panel.channel.leansRight': '偏右 {value}',
  'dsp.panel.channel.leftDelay': '左声道延迟',
  'dsp.panel.channel.leftGain': '左声道增益',
  'dsp.panel.channel.leftOutput': '左输出',
  'dsp.panel.channel.leftTooLoud': '左侧偏响',
  'dsp.panel.channel.monoTools': 'Mono / 检查',
  'dsp.panel.channel.mono.left': '只听左声道',
  'dsp.panel.channel.mono.off': '关闭 Mono',
  'dsp.panel.channel.mono.right': '只听右声道',
  'dsp.panel.channel.mono.sum': '合并 Mono',
  'dsp.panel.channel.note': '声道工具已从参数 EQ 中分离，适合检查声像、左右耳差异和单声道兼容。',
  'dsp.panel.channel.modePro': 'Pro',
  'dsp.panel.channel.modeSimple': 'Simple',
  'dsp.panel.channel.presetDefaultName': '耳机偏音补偿',
  'dsp.panel.channel.presetEmpty': '还没有保存的声道方案。',
  'dsp.panel.channel.presetName': '方案名称',
  'dsp.panel.channel.presetPrompt': '给这个耳机方案起个名字',
  'dsp.panel.channel.presets': '耳机方案',
  'dsp.panel.channel.phaseTools': '相位 / 路由',
  'dsp.panel.channel.removePreset': '移除',
  'dsp.panel.channel.saveCurrent': '保存当前参数',
  'dsp.panel.channel.selectPreset': '选择方案',
  'dsp.panel.channel.switchPreset': '切换',
  'dsp.panel.channel.renamePreset': '重命名',
  'dsp.panel.channel.renamePrompt': '重命名这个耳机方案',
  'dsp.panel.channel.rightDelay': '右声道延迟',
  'dsp.panel.channel.rightGain': '右声道增益',
  'dsp.panel.channel.rightOutput': '右输出',
  'dsp.panel.channel.rightTooLoud': '右侧偏响',
  'dsp.panel.channel.step': '步进',
  'dsp.panel.channel.swap': '交换左右',
  'dsp.panel.channel.swapCompensation': '交换补偿方向',
  'dsp.panel.channel.safeAttenuation': '静电耳机建议使用衰减补偿，避免提高输出电平。',
  'dsp.panel.channel.compare': 'A/B 对比',
  'dsp.panel.channel.compareActive': '正在旁路',
  'dsp.panel.channel.compareHint': '临时关闭声道处理，用来对比补偿前后的声像。',
  'dsp.panel.channel.monoHint': '合并 Mono 会两边都响；只听左/右会静音另一边。',
  'dsp.panel.channel.trimCenter': '偏音清零',
  'dsp.panel.headroom.applyRecommended': '应用建议',
  'dsp.panel.headroom.applyRecommendedValue': '采用建议值 {value}',
  'dsp.panel.headroom.budgetAria': 'Headroom 预算',
  'dsp.panel.headroom.clipCount': '削波次数',
  'dsp.panel.headroom.clipCountValue': '{count} 次',
  'dsp.panel.headroom.guardActive': '已启用',
  'dsp.panel.headroom.guardDirect': '直通',
  'dsp.panel.headroom.guardStandby': '待命',
  'dsp.panel.headroom.guardState': '保护状态',
  'dsp.panel.headroom.kicker': 'Headroom 管理',
  'dsp.panel.headroom.heroSubtitle': '预留余量，保护瞬态与 DSP 动态。',
  'dsp.panel.headroom.history': '最近 60 秒',
  'dsp.panel.headroom.inputTrace': '输入',
  'dsp.panel.headroom.lastClip': '最近削波',
  'dsp.panel.headroom.makeConservative': '设为 -6 dB',
  'dsp.panel.headroom.makeSafe': '设为 {value}',
  'dsp.panel.headroom.modeAria': 'Headroom 模式',
  'dsp.panel.headroom.modeDaily': '日常',
  'dsp.panel.headroom.modeDailyDetail': '轻量 DSP 预留。',
  'dsp.panel.headroom.modeDirect': '直通',
  'dsp.panel.headroom.modeDirectDetail': '不额外降低电平。',
  'dsp.panel.headroom.modeDsp': 'DSP',
  'dsp.panel.headroom.modeDspDetail': '给 EQ/FIR 留出安全空间。',
  'dsp.panel.headroom.nextDirect': '保持直通',
  'dsp.panel.headroom.nextDirectDetail': '当前没有需要预留的 DSP 风险。',
  'dsp.panel.headroom.nextHoldRisk': '先降低余量',
  'dsp.panel.headroom.nextHoldRiskDetail': '检测到削波风险，建议先预留 Headroom。',
  'dsp.panel.headroom.nextProtect': '应用保护余量',
  'dsp.panel.headroom.nextProtectDetail': '当前输出接近满幅，建议立即降低。',
  'dsp.panel.headroom.nextReady': '继续监听',
  'dsp.panel.headroom.nextReadyDetail': 'DSP 已有安全余量。',
  'dsp.panel.headroom.nextStandby': '保持待命',
  'dsp.panel.headroom.nextStandbyDetail': '有 DSP 模块开启，但暂未检测到风险。',
  'dsp.panel.headroom.nextStep': '下一步',
  'dsp.panel.headroom.nextWatch': '观察输出',
  'dsp.panel.headroom.nextWatchDetail': '输出接近上限，建议留意削波。',
  'dsp.panel.headroom.noClip': '无记录',
  'dsp.panel.headroom.note': 'Headroom 只负责预留电平空间，不再混进 EQ 或 FIR 的具体调音。',
  'dsp.panel.headroom.outputTrace': '输出估算',
  'dsp.panel.headroom.presetsAria': 'Headroom 预设',
  'dsp.panel.headroom.primaryAction': '应用 {value}',
  'dsp.panel.headroom.reasonChannel': '声道工具可能提高电平。',
  'dsp.panel.headroom.reasonClipping': '检测到削波。',
  'dsp.panel.headroom.reasonDirect': 'Headroom 只在 DSP 路径生效；当前 EQ / FIR / 声道工具都未启用，原生直通不会被它处理。',
  'dsp.panel.headroom.reasonEq': 'EQ 曲线可能提高电平。',
  'dsp.panel.headroom.reasonLive': '实时余量偏低。',
  'dsp.panel.headroom.reasonOutput': '输出估算接近满幅。',
  'dsp.panel.headroom.reasonSrcTruePeak': 'ECHO SRC / FIR 可能暴露 intersample peak，建议至少预留 -3 dB。',
  'dsp.panel.headroom.reasonRoom': 'FIR / 房间校正可能提高电平。',
  'dsp.panel.headroom.reasonSafe': '当前信号安全。',
  'dsp.panel.headroom.recommendation': '建议',
  'dsp.panel.headroom.recommendationSafe': '安全',
  'dsp.panel.headroom.reserve': '预留余量',
  'dsp.panel.headroom.restoreDirect': '恢复直通',
  'dsp.panel.headroom.safePolicy': '安全优先',
  'dsp.panel.headroom.safetyActions': '快速保护',
  'dsp.panel.headroom.status': '状态',
  'dsp.panel.headroom.statusClose': '接近上限',
  'dsp.panel.headroom.statusRisk': '存在风险',
  'dsp.panel.headroom.statusSafe': '安全',
  'dsp.panel.headroom.transparentNote': '只降低数字电平，不改变音色。',
  'dsp.panel.headroom.waitingSignal': '等待播放信号',
  'dsp.panel.room.future.recent': '最近 IR',
  'dsp.panel.room.future.response': '响应预览',
  'dsp.panel.room.hero.activeDetail': '卷积正在参与输出链。',
  'dsp.panel.room.hero.activeTitle': 'FIR 已启用',
  'dsp.panel.room.hero.emptyDetail': '导入 IR 后才能启用房间校正。',
  'dsp.panel.room.hero.emptyTitle': '未载入 IR',
  'dsp.panel.room.hero.loadedDetail': 'IR 已载入，可以启用。',
  'dsp.panel.room.hero.loadedTitle': 'IR 已载入',
  'dsp.panel.room.hero.state': '状态',
  'dsp.panel.room.kicker': '空间处理',
  'dsp.panel.room.nextEnable': '启用 FIR',
  'dsp.panel.room.nextEnableDetail': 'IR 已准备好，可以试听。',
  'dsp.panel.room.nextImport': '导入 IR',
  'dsp.panel.room.nextImportDetail': '先选择一个卷积文件。',
  'dsp.panel.room.nextListen': '继续试听',
  'dsp.panel.room.nextListenDetail': '确认校正后音量和相位正常。',
  'dsp.panel.room.nextTrim': '降低 Trim',
  'dsp.panel.room.nextTrimDetail': 'FIR 输出存在削波风险。',
  'dsp.panel.room.note': 'FIR / 房间校正只处理卷积和 IR，不再和 EQ 预设混在一起。',
  'dsp.panel.room.quickTrim': '快速 Trim',
  'dsp.panel.room.routeTitle': '路径',
  'dsp.panel.room.safeEnableHint': '先预留 -6 dB Headroom，再启用 FIR。',
  'dsp.panel.room.safetyRisk': '请降低 Trim 或 Headroom。',
  'dsp.panel.room.safetySafe': '输出链当前安全。',
  'dsp.panel.room.safetyTitle': '安全',
  'dsp.panel.room.trim': 'Trim',
  'dsp.panel.safety.kicker': '输出安全',
  'dsp.panel.safety.heroProtectedTitle': '输出链路受保护',
  'dsp.panel.safety.heroProtectedDetail': 'DSP 正在参与播放，输出安全会持续监控削波、余量和 bit-perfect 路径。',
  'dsp.panel.safety.heroRiskTitle': '检测到输出风险',
  'dsp.panel.safety.heroRiskDetail': '当前链路有削波或余量风险，先降低 Headroom、EQ 增益或 FIR Trim。',
  'dsp.panel.safety.heroDirectTitle': '原生直通',
  'dsp.panel.safety.heroDirectDetail': '没有启用 DSP 模块时，播放保持 bit-perfect 候选路径，输出安全只做状态观察。',
  'dsp.panel.safety.chainTitle': '当前链路',
  'dsp.panel.safety.checkTitle': '安全检查',
  'dsp.panel.safety.nextTitle': '建议动作',
  'dsp.panel.safety.nextRisk': '先处理余量',
  'dsp.panel.safety.nextRiskDetail': '有风险时不要继续叠加 EQ / FIR 增益，优先降 Headroom 或相关模块 Trim。',
  'dsp.panel.safety.nextProtected': '继续监听',
  'dsp.panel.safety.nextProtectedDetail': '链路处于 DSP 路径但没有发现削波风险，可以继续观察实时输出。',
  'dsp.panel.safety.nextDirect': '保持直通',
  'dsp.panel.safety.nextDirectDetail': '当前没有 DSP 处理，适合确认原始输出、设备采样率和 bit-perfect 候选状态。',
  'dsp.panel.safety.routeInput': '输入',
  'dsp.panel.safety.routeHeadroom': '余量',
  'dsp.panel.safety.routeProcess': '处理',
  'dsp.panel.safety.routeOutput': '输出',
  'dsp.panel.safety.checkBitPerfect': 'Bit-perfect',
  'dsp.panel.safety.checkLimiter': '保护限制器',
  'dsp.panel.safety.disableLimiter': '关闭保护限制器',
  'dsp.panel.safety.enableLimiter': '启用保护限制器',
  'dsp.panel.safety.limiterBypassed': '已旁路',
  'dsp.panel.safety.limiterBypassedDetail': '最终保护限制器已关闭，热输出可能削波或失真。',
  'dsp.panel.safety.limiterToggleTitle': '保护限制器',
  'dsp.panel.safety.checkRoom': 'FIR',
  'dsp.panel.safety.checkChannel': '声道工具',
  'dsp.panel.safety.note': '削波保护显示仅供参考；最终仍要用耳朵听是否失真、刺耳或压缩感过强。',
  'dsp.room.status.active': '已启用',
  'dsp.room.status.empty': '未载入',
  'dsp.room.status.error': '错误',
  'dsp.room.status.loaded': '已载入',
  'dsp.stage.input': '输入',
  'dsp.stage.output': '输出',
  'dsp.stage.shape': '塑形',
  'dsp.stage.space': '空间',
  'dsp.stage.stereo': '声道',
  'dsp.status.active': '已启用',
  'dsp.status.auto': '自动',
  'dsp.status.balanceActive': '声道处理中',
  'dsp.status.bypassed': '已旁路',
  'dsp.status.candidate': '候选',
  'dsp.status.clear': '正常',
  'dsp.status.direct': '直通',
  'dsp.status.disabledByDsp': 'DSP 路径',
  'dsp.status.dspPath': 'DSP 路径',
  'dsp.status.flat': 'Flat',
  'dsp.status.headroomRisk': '余量风险',
  'dsp.status.limiterArmed': '待命',
  'dsp.status.limiting': '正在限幅',
  'dsp.status.modulesActive': '{count} 个模块启用',
  'dsp.status.nativeDirect': 'Bit-perfect 路径',
  'dsp.status.noIr': '无 IR',
  'dsp.status.none': '无',
  'dsp.status.protected': '已保护',
  'dsp.status.ready': '就绪',
  'dsp.status.risk': '风险',
  'dsp.status.riskDetected': '检测到风险',
  'dsp.status.shared': 'shared',
  'dsp.status.signalProtected': '信号安全',
  'dsp.status.stereoDirect': '立体声直通',
  'dsp.status.systemOutput': '系统输出',
};

const dspLocalTextEnUS: Record<string, string> = {
  'dsp.panel.sdm.sound.compare': 'Sound profile A/B',
  'dsp.panel.sdm.sound.compareDetail': 'A/B changes only the FIR; DSD target, modulator, headroom, and output path stay unchanged. During playback it returns to the same excerpt with a 3-second lead-in.',
  'dsp.panel.sdm.sound.compareLinear': 'A/B Linear reference',
  'dsp.panel.sdm.sound.compareRestore': 'Restore',
  ...dspLocalTextZhCN,
  'dsp.panel.sdm.sound.dsd512CudaRequired': 'DSD512 Transient / Smooth use distinctive long FIRs that do not pass CPU realtime admission. Select CUDA; the native host verifies actual headroom before opening the device.',
  'dsp.action.clear': 'Clear',
  'dsp.action.disableChannel': 'Disable channel compensation',
  'dsp.action.disableFir': 'Disable FIR',
  'dsp.action.enableChannel': 'Enable channel compensation',
  'dsp.action.enableFir': 'Enable FIR',
  'dsp.action.enableFirSafely': 'Enable safely',
  'dsp.action.importIr': 'Import IR',
  'dsp.action.refresh': 'Refresh status',
  'dsp.action.reset': 'Reset',
  'dsp.action.save': 'Save',
  'dsp.aria.chain': 'DSP module chain',
  'dsp.aria.modules': 'DSP modules',
  'dsp.aria.pipeline': 'DSP pipeline',
  'dsp.aria.workspace': 'DSP workspace',
  'dsp.brand.subtitle': 'Signal Control',
  'dsp.section.advanced': 'Advanced settings',
  'dsp.module.src.description': 'PCM sample-rate conversion',
  'dsp.module.src.title': 'ECHO SRC / Upsampling',
  'dsp.panel.src.abBypass': 'A/B native',
  'dsp.panel.src.abRestore': 'Restore upsampling',
  'dsp.panel.src.active': 'Upsampling active',
  'dsp.panel.src.bypassDsd': 'DSD output bypass',
  'dsp.panel.src.bypassShared': 'Shared output bypass',
  'dsp.panel.src.detail': 'A local ECHO SRC engine independent from HQPlayer. It is off by default; once enabled it enters the DSP path and no longer reports bit-perfect.',
  'dsp.panel.src.engine': 'Engine',
  'dsp.panel.src.advanced': 'Advanced',
  'dsp.panel.src.advancedSummary': 'Advanced mode shows poly-sinc / FIR / GPU planning; live playback follows the active/fallback state in Signal Path.',
  'dsp.panel.src.compute': 'Compute',
  'dsp.panel.src.compute.cpuDetail': 'Default realtime path: stable, low scheduling risk, and playback-safe first.',
  'dsp.panel.src.compute.cpuStatus': 'CPU realtime path. CUDA is not requested.',
  'dsp.panel.src.compute.gpuBadge': 'GPU',
  'dsp.panel.src.compute.gpuDetail': 'Experimental path for very long filters and larger buffers; latency and underruns must be verified before engine hookup.',
  'dsp.panel.src.dither.activeStatus': 'Active on integer output / {bits}-bit',
  'dsp.panel.src.dither.floatSafe': 'Bypass float output',
  'dsp.panel.src.dither.floatStatus': 'Current output is float, so dither is bypassed',
  'dsp.panel.src.dither.highpassDetail': 'High-pass TPDF pushes dither energy away from low frequencies for 16-bit output and quiet tails.',
  'dsp.panel.src.dither.integerOnly': 'Integer output only',
  'dsp.panel.src.dither.ns5Detail': '5th-order noise shaping lowers mid/low-band quantization texture with modest risk.',
  'dsp.panel.src.dither.ns9Detail': '9th-order noise shaping pushes more noise upward for 24-bit or high-headroom chains.',
  'dsp.panel.src.dither.offDetail': 'Keep the Float32 PCM path untouched. Off by default to avoid pointless added noise.',
  'dsp.panel.src.dither.offStatus': 'Off',
  'dsp.panel.src.dither.pendingStatus': 'Waiting for integer output format',
  'dsp.panel.src.dither.title': 'PCM Dither / Noise Shaping',
  'dsp.panel.src.dither.tpdfDetail': 'Standard TPDF, the safest quantization dither for 16-bit or 24-bit integer output.',
  'dsp.panel.src.dither.ultraDetail': 'Ultra-shaped profile with the strongest shaping; cleaner tails, but more demanding of headroom and output chain.',
  'dsp.panel.src.ladder.hifi': 'HiFi',
  'dsp.panel.src.ladder.hifiDetail': '4x / gauss-long 1x / hb Nx / CPU. Softer presentation with moderate realtime pressure.',
  'dsp.panel.src.ladder.insane': 'Insane / Offline-like',
  'dsp.panel.src.ladder.insaneDetail': '8x / apod-long plus ext2-xl / CUDA. Very heavy, meant for near-offline PCM experiments.',
  'dsp.panel.src.ladder.latencyExtreme': 'Extreme latency',
  'dsp.panel.src.ladder.latencyHigh': 'High latency',
  'dsp.panel.src.ladder.latencyLow': 'Low latency',
  'dsp.panel.src.ladder.latencyMedium': 'Medium latency',
  'dsp.panel.src.ladder.realtimeSafe': 'Realtime Safe',
  'dsp.panel.src.ladder.realtimeSafeDetail': '4x / hb 1x+Nx / CPU. Prioritizes no stutter and responsive UI.',
  'dsp.panel.src.ladder.reference': 'Reference',
  'dsp.panel.src.ladder.referenceDetail': '8x / apod-minring 1x / ext2-long Nx / CUDA. Prioritizes audible change and transparency.',
  'dsp.panel.src.ladder.title': 'CPU/GPU Quality Ladder',
  'dsp.panel.src.cuda.pending': 'CUDA runtime is ready; FIR worker is not active yet.',
  'dsp.panel.src.cuda.ready': '{device} / {memory} / Driver {driver} / CUDA {cuda}',
  'dsp.panel.src.cuda.lowUtilization': 'Real-time audio uses small low-latency blocks, so low GPU utilization does not mean CUDA is inactive; trust CUDA FIR active in the live playback state.',
  'dsp.panel.src.cuda.unavailable': 'CUDA unavailable: {reason}',
  'dsp.panel.src.cuda.guide.driverStep1': 'Install or update NVIDIA App / official GeForce, Studio, or RTX drivers.',
  'dsp.panel.src.cuda.guide.driverStep2': 'Restart Windows after installation, then reopen ECHO.',
  'dsp.panel.src.cuda.guide.driverStep3': 'Refresh status here; if it is still unavailable, confirm nvidia-smi runs in Windows.',
  'dsp.panel.src.cuda.guide.driverTitle': 'NVIDIA driver required',
  'dsp.panel.src.cuda.guide.genericStep1': 'Update the official NVIDIA driver first, then restart the system.',
  'dsp.panel.src.cuda.guide.genericStep2': 'Reopen ECHO and refresh status.',
  'dsp.panel.src.cuda.guide.genericStep3': 'If it still fails, use CPU FIR / SOXR and check the diagnostic reason.',
  'dsp.panel.src.cuda.guide.genericTitle': 'CUDA needs attention',
  'dsp.panel.src.cuda.guide.problem': 'Detected: {reason}',
  'dsp.panel.src.cuda.guide.runtimeStep1': 'Update the NVIDIA driver and restart the system.',
  'dsp.panel.src.cuda.guide.runtimeStep2': 'Try a lighter filter or a lower upsampling factor to verify stability.',
  'dsp.panel.src.cuda.guide.runtimeStep3': 'If it keeps failing, ECHO falls back to CPU FIR instead of pretending GPU is active.',
  'dsp.panel.src.cuda.guide.runtimeTitle': 'CUDA runtime failed',
  'dsp.panel.src.cuda.guide.title': 'CUDA installation guide',
  'dsp.panel.src.cuda.guide.workerStep1': 'This is usually not a user driver issue; the current ECHO package is missing the CUDA FIR component.',
  'dsp.panel.src.cuda.guide.workerStep2': 'Install an ECHO build that includes the CUDA FIR worker, or rebuild with CUDA enabled.',
  'dsp.panel.src.cuda.guide.workerStep3': 'Until the component exists, playback falls back to CPU FIR / SOXR.',
  'dsp.panel.src.cuda.guide.workerTitle': 'ECHO CUDA component missing',
  'dsp.panel.src.cuda.reason.driverMissing': 'NVIDIA driver or nvidia-smi was not detected',
  'dsp.panel.src.cuda.reason.driverUnreadable': 'NVIDIA driver probe returned an unexpected result',
  'dsp.panel.src.cuda.reason.workerCpuOnly': 'ECHO CUDA worker was built without CUDA',
  'dsp.panel.src.cuda.reason.workerMissing': 'ECHO CUDA worker is not bundled',
  'dsp.panel.src.cuda.reason.workerRuntime': 'CUDA worker failed or timed out during playback',
  'dsp.panel.src.cuda.reason.workerStopped': 'CUDA worker stopped with pause or route switching; waiting for the next playback state',
  'dsp.panel.src.filter': 'Filter',
  'dsp.panel.src.filter.apodFastDetail': 'Fast apodizing profile: earlier cutoff with medium taps to suppress ringing left by old filters or MP3 sources.',
  'dsp.panel.src.filter.apodGaussDetail': 'Gaussian apodizing profile: softer early rolloff for a smoother presentation with calmer treble edges.',
  'dsp.panel.src.filter.apodLongDetail': 'Long-tap apodizing profile: early rolloff plus high stopband rejection for old ADC / brickwall pre-ringing.',
  'dsp.panel.src.filter.apodMinringDetail': 'Minimum-phase apodizing profile: lowers pre-ringing and attenuates source ringing for the most audible PCM change.',
  'dsp.panel.src.filter.closedFormDetail': 'Closed-form sinc interpolation direction for later baseline comparison.',
  'dsp.panel.src.filter.collapse': 'Show curated',
  'dsp.panel.src.filter.expand': 'Show all',
  'dsp.panel.src.filter.gpuCpu': 'CPU / entry GPU',
  'dsp.panel.src.filter.gpuRtx5060': 'RTX 5060+ suggested',
  'dsp.panel.src.filter.gpuRtx5070': 'RTX 5070+ suggested',
  'dsp.panel.src.filter.gpuRtx5070Ti': 'RTX 5070 Ti+ suggested',
  'dsp.panel.src.filter.gpuRtx5080': 'RTX 5080+ suggested',
  'dsp.panel.src.filter.gpuRtx5090': 'RTX 5090 / 32GB suggested',
  'dsp.panel.src.filter.loadHigh': 'High load',
  'dsp.panel.src.filter.loadExtreme': 'Extreme load',
  'dsp.panel.src.filter.loadLight': 'Light load',
  'dsp.panel.src.filter.loadMedium': 'Medium load',
  'dsp.panel.src.filter.loadResearch': 'Research',
  'dsp.panel.src.filter.loadVeryHigh': 'Very high',
  'dsp.panel.src.filter.minringFirLpDetail': 'Minimum-ringing FIR with low pre-ringing and a closer presentation.',
  'dsp.panel.src.filter.minringFirMpDetail': 'Minimum-ringing medium-precision profile with lower pre-ringing and more transparency.',
  'dsp.panel.src.filter.minringFirXlaDetail': 'Extra-long minimum-ringing profile for natural presentation with much higher compute cost.',
  'dsp.panel.src.filter.minringFirSoftDetail': 'Gaussian-windowed minimum-ringing profile for a softer, closer, less aggressive presentation.',
  'dsp.panel.src.filter.minringFirExtremeDetail': '3071-tap minimum-ringing profile for stronger audible change and more natural transients.',
  'dsp.panel.src.filter.polySincExt2HiresLpDetail': 'Hi-res ext2 linear-phase profile prepared for the Nx path.',
  'dsp.panel.src.filter.polySincExt2HiresMpDetail': 'Hi-res ext2 minimum-phase profile that lowers pre-ringing while preserving air.',
  'dsp.panel.src.filter.polySincExt3LongDetail': 'Long-tap ext3 linear-phase profile with a narrower transition band and stronger stopband rejection.',
  'dsp.panel.src.filter.polySincExt3XlaDetail': '4095-tap ext3 extreme linear-phase profile for RTX 5090 or offline-like A/B stress tests.',
  'dsp.panel.src.filter.polySincExt2ShortDetail': 'Short-tap ext2 profile that keeps the high-precision direction more realtime-friendly.',
  'dsp.panel.src.filter.polySincExt2LongDetail': 'Long-tap linear-phase target, transparency first, close to a long profile direction.',
  'dsp.panel.src.filter.polySincExt2MediumDetail': 'Medium-tap ext2 profile balancing transparency and compute cost.',
  'dsp.panel.src.filter.polySincExt2XlDetail': '3071-tap ext2 extreme profile for high-end CUDA and offline-grade listening tests.',
  'dsp.panel.src.filter.polySincExt2XlaDetail': 'Extra-long taps for future 8x / Ultra precision profiles.',
  'dsp.panel.src.filter.polySincGaussHiresLpDetail': 'Hi-res linear-phase gaussian window with a smoother sound while preserving placement.',
  'dsp.panel.src.filter.polySincGaussHiresMpDetail': 'Hi-res minimum-phase gaussian window aimed at lower pre-ringing feel.',
  'dsp.panel.src.filter.polySincGaussLongDetail': 'Gaussian-windowed poly-sinc for a smoother presentation while preserving transients.',
  'dsp.panel.src.filter.polySincGaussXlDetail': '3071-tap gaussian extreme profile with a smooth direction and very high GPU demand.',
  'dsp.panel.src.filter.polySincGaussXlaDetail': 'Extra-long gaussian profile prepared for A/B and measurement comparison.',
  'dsp.panel.src.filter.polySincGaussXtrLongDetail': 'Long gauss-xtr profile with stronger gaussian shaping for smoother edges.',
  'dsp.panel.src.filter.polySincGaussXtrXlaDetail': '4095-tap gauss-xtr profile for a very smooth, thicker, less edgy direction.',
  'dsp.panel.src.filter.polySincHbDetail': 'Halfband poly-sinc suited to a stable realtime 2x/4x first pass.',
  'dsp.panel.src.filter.polySincXtrLpDetail': 'Long xtr linear-phase profile with a transparent target and higher realtime demands.',
  'dsp.panel.src.filter.polySincXtrShortLpDetail': 'Short xtr linear-phase profile for realtime transparency tradeoffs.',
  'dsp.panel.src.filter.polySincXtrShortMpDetail': 'Short xtr minimum-phase profile for natural feel and lower pre-ringing.',
  'dsp.panel.src.filter.polySincXtrXlaDetail': 'Extreme xtr minimum-phase profile, listening-oriented and very hardware hungry.',
  'dsp.panel.src.filter.polySincXtrMpDetail': 'Medium-phase direction that reduces pre-ringing feel for a listening-oriented profile.',
  'dsp.panel.src.filter.apodXtrDetail': '3071-tap apodizing profile with early rolloff for stronger old-filter ringing cleanup.',
  'dsp.panel.src.filter.apodExtremeDetail': '4095-tap minimum-phase apodizing profile for the strongest source-ringing cleanup direction.',
  'dsp.panel.src.filter.brickwallLongDetail': 'Hard comparison profile: high cutoff, narrow transition, and strong stopband rejection.',
  'dsp.panel.src.filter.softKneeLongDetail': 'Soft-knee comparison profile with earlier gentle rolloff for smoother long-session listening.',
  'dsp.panel.src.filter.selected': 'Selected filter',
  'dsp.panel.src.filter.sincLDetail': 'Large sinc baseline for high-precision reference and listening comparison.',
  'dsp.panel.src.filter.sincLongHDetail': 'Higher-precision sinc-long variant for a heavier linear-phase baseline.',
  'dsp.panel.src.filter.sincLongDetail': 'Long sinc baseline for calibrating FIR design and listening differences.',
  'dsp.panel.src.filter.sincMDetail': 'Medium sinc baseline with lower compute cost.',
  'dsp.panel.src.filter.sincXlaDetail': 'Extra-long sinc baseline for stress testing and comparing extreme filters.',
  'dsp.panel.src.kicker': 'Sample-rate conversion',
  'dsp.panel.src.mode': 'Mode',
  'dsp.panel.src.mode.family2x': '2x PCM',
  'dsp.panel.src.mode.family2xDetail': 'Upsample the 44.1k family to 88.2k and the 48k family to 96k.',
  'dsp.panel.src.mode.family4x': '4x PCM',
  'dsp.panel.src.mode.family4xDetail': 'Upsample the 44.1k family to 176.4k and the 48k family to 192k.',
  'dsp.panel.src.mode.family8x': '8x Ultra',
  'dsp.panel.src.mode.family8xDetail': 'Experimental: upsample the 44.1k family to 352.8k and the 48k family to 384k.',
  'dsp.panel.src.mode.compatibility48': '48 kHz compatibility',
  'dsp.panel.src.mode.compatibility48Detail': 'Convert PCM to a fixed 48 kHz for exclusive headphones or audio devices that only accept 48 kHz. Off by default.',
  'dsp.panel.src.mode.off': 'Off',
  'dsp.panel.src.mode.offDetail': 'Keep the source sample rate. ECHO SRC does not affect bit-perfect conditions.',
  'dsp.panel.src.modeSwitch': 'ECHO SRC control mode',
  'dsp.panel.src.native': 'Native direct',
  'dsp.panel.src.normal': 'Normal',
  'dsp.panel.src.notConnected': 'Not connected to playback',
  'dsp.panel.src.note': 'PCM only. Upsampling is not stacked when shared output, DSD output, or HQPlayer takes over.',
  'dsp.panel.src.pending': 'Waiting for the next playback plan',
  'dsp.panel.src.precision': 'Precision',
  'dsp.panel.src.quality': 'Quality profile',
  'dsp.panel.src.quality.balanced': 'Balanced',
  'dsp.panel.src.quality.balancedDetail': 'Keep the existing SOXR profile while balancing stability and cost.',
  'dsp.panel.src.quality.lowLatency': 'Low latency',
  'dsp.panel.src.quality.lowLatencyDetail': 'Reduce SRC cost for low-latency output.',
  'dsp.panel.src.quality.transparent': 'Transparent',
  'dsp.panel.src.quality.transparentDetail': 'Highest precision SOXR, prioritizing transparency and low distortion.',
  'dsp.panel.src.recommended': 'Recommended',
  'dsp.panel.src.route': 'Route',
  'dsp.panel.src.sourceRate': 'Source rate',
  'dsp.panel.src.targetRate': 'Target rate',
  'dsp.stage.src': 'Sample rate',
  'dsp.error.channelBridge': 'Channel tools are unavailable.',
  'dsp.error.desktopBridge': 'Desktop bridge is unavailable.',
  'dsp.error.dspBridge': 'DSP bridge is unavailable.',
  'dsp.error.firBridge': 'FIR bridge is unavailable.',
  'dsp.label.bitPerfect': 'Bit-perfect',
  'dsp.label.currentModule': 'Current module',
  'dsp.label.module': 'DSP module',
  'dsp.label.moduleStatus': 'Module status',
  'dsp.label.output': 'Output',
  'dsp.metric.bitPerfect': 'Bit-perfect',
  'dsp.metric.clipping': 'Clipping',
  'dsp.metric.dsp': 'DSP',
  'dsp.metric.inputPeak': 'Input peak',
  'dsp.metric.ir': 'IR',
  'dsp.metric.latency': 'Latency',
  'dsp.metric.liveHeadroom': 'Live headroom',
  'dsp.metric.truePeak': 'True Peak',
  'dsp.metric.mode': 'Mode',
  'dsp.metric.outputEstimate': 'Output estimate',
  'dsp.metric.reason': 'Reason',
  'dsp.metric.sampleRate': 'Sample rate',
  'dsp.metric.taps': 'Taps',
  'dsp.module.channel.description': 'Balance, delay, mono',
  'dsp.module.channel.title': 'Channel tools',
  'dsp.module.eq.description': 'Bands, preamp, presets',
  'dsp.module.eq.title': 'Parametric EQ',
  'dsp.module.headroom.description': 'Reserve DSP headroom',
  'dsp.module.headroom.title': 'Headroom',
  'dsp.module.headphone.description': 'OPRA headphone curves',
  'dsp.module.headphone.title': 'Headphone correction',
  'dsp.module.room.description': 'IR convolution only',
  'dsp.module.room.title': 'FIR / Room correction',
  'dsp.module.safety.description': 'Final output monitor',
  'dsp.module.safety.title': 'Output safety',
  'dsp.module.sdm.description': 'DSD / SDM truth path',
  'dsp.module.sdm.title': 'ECHO SDM / DSD (Beta)',
  'dsp.panel.sdm.capability': 'Capability',
  'dsp.panel.sdm.capabilityDetail': 'ECHO can verify Native DSD, DoP, and independent PCM -> SDM. SDM does not depend on the Lab DSD passthrough switch.',
  'dsp.panel.sdm.detail': 'Shows whether the current track really uses DSD, DoP, native DSD, or the independent PCM -> SDM path.',
  'dsp.panel.sdm.dop': 'DoP passthrough',
  'dsp.panel.sdm.dopDetail': 'Local DSF attempts DoP under Exclusive; failures are explicit PCM fallback.',
  'dsp.panel.sdm.fallback': 'Fallback',
  'dsp.panel.sdm.guard': 'Guard',
  'dsp.panel.sdm.guardDetail': 'PCM -> SDM applies this tier headroom automatically and locks very low-level signals to DSD idle to reduce hiss.',
  'dsp.panel.sdm.kicker': 'DSD / sigma-delta monitor',
  'dsp.panel.sdm.modulator': 'PCM -> SDM modulator',
  'dsp.panel.sdm.modulatorCoefficients': 'Feedback coefficients',
  'dsp.panel.sdm.modulatorDither': 'Dither',
  'dsp.panel.sdm.modulatorHeadroom': 'Headroom target',
  'dsp.panel.sdm.modulatorOrder': 'Order',
  'dsp.panel.sdm.modulatorProfile': 'Modulator profile',
  'dsp.panel.sdm.modulatorStability': 'Stability limit',
  'dsp.panel.sdm.modulatorPending': 'Not routed; check Fallback',
  'dsp.panel.sdm.nativeDsd': 'Native DSD',
  'dsp.panel.sdm.noDsdSource': 'Current source is not DSD',
  'dsp.panel.sdm.note': 'PCM -> SDM uses the independent ECHO SDM path; the Lab DSD passthrough switch is only for native DSD sources.',
  'dsp.panel.sdm.output': 'Actual output',
  'dsp.panel.sdm.oversampling': 'PCM oversampling',
  'dsp.panel.sdm.oversampling1x': 'Oversampling 1x',
  'dsp.panel.sdm.oversampling1xDetail': 'Low-rate PCM entry filter intent; CUDA 4x/8x runs this as the first ECHO FIR stage.',
  'dsp.panel.sdm.oversamplingEffective': 'Effective slot',
  'dsp.panel.sdm.oversamplingNx': 'Oversampling Nx',
  'dsp.panel.sdm.oversamplingNxDetail': 'High-rate or already-oversampled stage intent; CUDA 4x/8x runs this as later ECHO FIR stages.',
  'dsp.panel.sdm.oversamplingRoute': 'Front-end upsample',
  'dsp.panel.sdm.oversamplingTruth': 'The native host report for FIR stages, backend, and fallback is the active truth.',
  'dsp.panel.sdm.pcmFallback': 'PCM fallback',
  'dsp.panel.sdm.requested': 'Requested',
  'dsp.panel.sdm.source': 'Source',
  'dsp.panel.sdm.transport': 'Transport',
  'dsp.panel.sdm.actual': 'Runtime',
  'dsp.panel.sdm.badge.planned': 'Experimental',
  'dsp.panel.sdm.badge.real': 'Real path',
  'dsp.panel.sdm.badge.safe': 'Bypass safe',
  'dsp.panel.sdm.compute': 'SDM Compute',
  'dsp.panel.sdm.compute.cpuDetail': 'CPU realtime path is routed for the first PCM -> SDM DoP implementation.',
  'dsp.panel.sdm.compute.cudaDetail': 'Includes a native CUDA recursive modulator with device admission; CUDA can still accelerate FIR oversampling when the CPU modulator is faster.',
  'dsp.panel.sdm.mode': 'SDM mode',
  'dsp.panel.sdm.mode.dsdPassthrough': 'DSD passthrough',
  'dsp.panel.sdm.mode.dsdPassthroughDetail': 'Handles native DSD sources through DoP without PCM upsampling.',
  'dsp.panel.sdm.mode.off': 'Off',
  'dsp.panel.sdm.mode.offDetail': 'PCM and ECHO SRC stay independent; no DSD/SDM output is requested.',
  'dsp.panel.sdm.mode.pcmToDsd': 'PCM -> SDM',
  'dsp.panel.sdm.mode.pcmToDsdDetail': 'Modulates PCM to 1-bit SDM. DSD64-256 can use DoP; the experimental ASIO path can use native DSD.',
  'dsp.panel.sdm.sound': 'SDM sound profile',
  'dsp.panel.sdm.sound.detail': 'Sound profiles change FIR phase, ringing, and roll-off before modulation. Quality controls stability and ultrasonic noise instead of pretending to be a tone preset.',
  'dsp.panel.sdm.sound.linear': 'ECHO Linear',
  'dsp.panel.sdm.sound.linearDetail': 'Linear phase and steep roll-off preserve symmetric transients and maximum bandwidth as the neutral reference.',
  'dsp.panel.sdm.sound.linearBadge': 'Neutral / symmetric',
  'dsp.panel.sdm.sound.transient': 'ECHO Transient',
  'dsp.panel.sdm.sound.transientDetail': 'Minimum phase sharply reduces pre-ringing so attacks move forward, with non-linear phase as the trade-off.',
  'dsp.panel.sdm.sound.transientBadge': 'Attack / minimum phase',
  'dsp.panel.sdm.sound.smooth': 'ECHO Smooth',
  'dsp.panel.sdm.sound.smoothDetail': 'Apodizing plus Gaussian roll-off more actively cleans source ringing, with a clearly more conservative high-frequency bandwidth.',
  'dsp.panel.sdm.sound.smoothBadge': 'Soft / apodizing',
  'dsp.panel.sdm.sound.custom': 'Custom FIR',
  'dsp.panel.sdm.quality': 'Modulator / stability',
  'dsp.panel.sdm.quality.hifi': 'HiFi',
  'dsp.panel.sdm.quality.hifiDetail': 'Bounded 6th-order NTF with 4.5 dB modulation safety headroom for daily quality.',
  'dsp.panel.sdm.quality.insane': 'Insane',
  'dsp.panel.sdm.quality.insaneDetail': 'Bounded 8th-order NTF retains 6 dB modulation safety headroom; experimental high-load tier.',
  'dsp.panel.sdm.quality.reference': 'Reference',
  'dsp.panel.sdm.quality.referenceDetail': 'Bounded 7th-order NTF with 4.5 dB modulation safety headroom for measurement and comparison.',
  'dsp.panel.sdm.quality.safe': 'Realtime Safe',
  'dsp.panel.sdm.quality.safeDetail': 'Bounded 3rd-order NTF with 3 dB modulation safety headroom; louder while remaining stress-tested.',
  'dsp.panel.sdm.runtime.dsdPassthrough': 'Current track is using DSD passthrough',
  'dsp.panel.sdm.runtime.off': 'Current track is not using SDM',
  'dsp.panel.sdm.runtime.pcmToSdmActive': 'PCM -> SDM is active in the current path',
  'dsp.panel.sdm.runtime.pcmToSdmNotRouted': 'PCM -> SDM is not routed in the current path; check Fallback',
  'dsp.panel.sdm.separateNote': 'SDM is saved separately from PCM/ECHO SRC; it takes over PCM only when the active playback path qualifies.',
  'dsp.panel.sdm.target': 'Target DSD rate',
  'dsp.panel.sdm.target.dsd128Detail': 'Common realtime target; PCM -> SDM is handled by the independent ECHO SDM path.',
  'dsp.panel.sdm.target.dsd256Detail': 'Higher-rate realtime PCM -> SDM target; avoid regular DoP passthrough.',
  'dsp.panel.sdm.target.dsd512Detail': '32x FIR and 22.5792/24.576 MHz native DSD; admitted only on the experimental ASIO path, with explicit rejection elsewhere.',
  'dsp.panel.sdm.target.dsd64Detail': 'Light target for validating whether the ECHO SDM path can output stably.',
  'dsp.panel.channel.advanced': 'Advanced channel',
  'dsp.panel.channel.balance': 'Stereo balance',
  'dsp.panel.channel.bandCompensation': 'Band compensation',
  'dsp.panel.channel.bandHigh': 'High',
  'dsp.panel.channel.bandLow': 'Low',
  'dsp.panel.channel.bandMid': 'Mid',
  'dsp.panel.channel.centered': 'Centered',
  'dsp.panel.channel.compare': 'A/B compare',
  'dsp.panel.channel.compareActive': 'Bypassing',
  'dsp.panel.channel.compareHint': 'Temporarily bypass channel processing to compare the stereo image before and after compensation.',
  'dsp.panel.channel.compensationDetail': 'Defaults to attenuating the louder side, useful for headphone channel imbalance that cannot be repaired.',
  'dsp.panel.channel.compensationOff': 'Off',
  'dsp.panel.channel.compensationOn': 'On',
  'dsp.panel.channel.compensationTitle': 'Imbalance compensation',
  'dsp.panel.channel.constantPower': 'Constant power',
  'dsp.panel.channel.delaySkew': 'Delay skew',
  'dsp.panel.channel.he90Hint': 'Start from 0.25 dB and fine tune while listening to centered vocals.',
  'dsp.panel.channel.invertLeft': 'Invert left',
  'dsp.panel.channel.invertRight': 'Invert right',
  'dsp.panel.channel.kicker': 'Channel tools',
  'dsp.panel.channel.leansLeft': 'Left {value}',
  'dsp.panel.channel.leansRight': 'Right {value}',
  'dsp.panel.channel.leftDelay': 'Left delay',
  'dsp.panel.channel.leftGain': 'Left gain',
  'dsp.panel.channel.leftOutput': 'Left output',
  'dsp.panel.channel.leftTooLoud': 'Left side louder',
  'dsp.panel.channel.modePro': 'Pro',
  'dsp.panel.channel.modeSimple': 'Simple',
  'dsp.panel.channel.mono.left': 'Left only',
  'dsp.panel.channel.mono.off': 'Mono off',
  'dsp.panel.channel.mono.right': 'Right only',
  'dsp.panel.channel.mono.sum': 'Sum mono',
  'dsp.panel.channel.monoHint': 'Sum mono plays both sides; left-only or right-only mutes the other side.',
  'dsp.panel.channel.monoTools': 'Mono / Check',
  'dsp.panel.channel.note': 'Channel tools are separated from Parametric EQ, for checking stereo image, left/right differences, and mono compatibility.',
  'dsp.panel.channel.phaseTools': 'Phase / Routing',
  'dsp.panel.channel.presetDefaultName': 'Headphone imbalance compensation',
  'dsp.panel.channel.presetEmpty': 'No saved channel profiles yet.',
  'dsp.panel.channel.presetName': 'Profile name',
  'dsp.panel.channel.presetPrompt': 'Name this headphone profile',
  'dsp.panel.channel.presets': 'Headphone profiles',
  'dsp.panel.channel.removePreset': 'Remove',
  'dsp.panel.channel.renamePreset': 'Rename',
  'dsp.panel.channel.renamePrompt': 'Rename this headphone profile',
  'dsp.panel.channel.rightDelay': 'Right delay',
  'dsp.panel.channel.rightGain': 'Right gain',
  'dsp.panel.channel.rightOutput': 'Right output',
  'dsp.panel.channel.rightTooLoud': 'Right side louder',
  'dsp.panel.channel.safeAttenuation': 'For electrostatic headphones, prefer attenuation compensation to avoid raising output level.',
  'dsp.panel.channel.saveCurrent': 'Save current settings',
  'dsp.panel.channel.selectPreset': 'Select profile',
  'dsp.panel.channel.step': 'Step',
  'dsp.panel.channel.swap': 'Swap left/right',
  'dsp.panel.channel.swapCompensation': 'Swap compensation direction',
  'dsp.panel.channel.switchPreset': 'Switch',
  'dsp.panel.channel.trimCenter': 'Clear imbalance',
  'dsp.panel.headroom.applyRecommended': 'Apply recommendation',
  'dsp.panel.headroom.applyRecommendedValue': 'Apply recommendation {value}',
  'dsp.panel.headroom.budgetAria': 'Headroom budget',
  'dsp.panel.headroom.clipCount': 'Clip count',
  'dsp.panel.headroom.clipCountValue': '{count} times',
  'dsp.panel.headroom.guardActive': 'Active',
  'dsp.panel.headroom.guardDirect': 'Direct',
  'dsp.panel.headroom.guardStandby': 'Standby',
  'dsp.panel.headroom.guardState': 'Guard state',
  'dsp.panel.headroom.kicker': 'Headroom management',
  'dsp.panel.headroom.heroSubtitle': 'Reserve space for transients and DSP movement.',
  'dsp.panel.headroom.history': 'Last 60 seconds',
  'dsp.panel.headroom.inputTrace': 'Input',
  'dsp.panel.headroom.lastClip': 'Last clip',
  'dsp.panel.headroom.makeConservative': 'Set to -6 dB',
  'dsp.panel.headroom.makeSafe': 'Set to {value}',
  'dsp.panel.headroom.modeAria': 'Headroom mode',
  'dsp.panel.headroom.modeDaily': 'Daily',
  'dsp.panel.headroom.modeDailyDetail': 'Light DSP reserve.',
  'dsp.panel.headroom.modeDirect': 'Direct',
  'dsp.panel.headroom.modeDirectDetail': 'No extra level reduction.',
  'dsp.panel.headroom.modeDsp': 'DSP',
  'dsp.panel.headroom.modeDspDetail': 'Leave safe space for EQ/FIR.',
  'dsp.panel.headroom.nextDirect': 'Keep direct',
  'dsp.panel.headroom.nextDirectDetail': 'No DSP reserve risk is currently needed.',
  'dsp.panel.headroom.nextHoldRisk': 'Reduce headroom first',
  'dsp.panel.headroom.nextHoldRiskDetail': 'Clipping risk detected. Reserve headroom first.',
  'dsp.panel.headroom.nextProtect': 'Apply protection headroom',
  'dsp.panel.headroom.nextProtectDetail': 'Output is near full scale. Reduce level immediately.',
  'dsp.panel.headroom.nextReady': 'Keep monitoring',
  'dsp.panel.headroom.nextReadyDetail': 'DSP already has safe headroom.',
  'dsp.panel.headroom.nextStandby': 'Keep standby',
  'dsp.panel.headroom.nextStandbyDetail': 'DSP modules are enabled, but no risk is detected yet.',
  'dsp.panel.headroom.nextStep': 'Next step',
  'dsp.panel.headroom.nextWatch': 'Watch output',
  'dsp.panel.headroom.nextWatchDetail': 'Output is close to the limit. Watch for clipping.',
  'dsp.panel.headroom.noClip': 'No record',
  'dsp.panel.headroom.note': 'Headroom only reserves level space; it no longer mixes specific EQ or FIR tuning here.',
  'dsp.panel.headroom.outputTrace': 'Output estimate',
  'dsp.panel.headroom.presetsAria': 'Headroom presets',
  'dsp.panel.headroom.primaryAction': 'Apply {value}',
  'dsp.panel.headroom.reasonChannel': 'Channel tools may increase level.',
  'dsp.panel.headroom.reasonClipping': 'Clipping detected.',
  'dsp.panel.headroom.reasonDirect': 'Headroom only works in the DSP path; when EQ, FIR, and channel tools are all off, native direct is not processed by it.',
  'dsp.panel.headroom.reasonEq': 'EQ curves may increase level.',
  'dsp.panel.headroom.reasonLive': 'Live headroom is low.',
  'dsp.panel.headroom.reasonOutput': 'Estimated output is near full scale.',
  'dsp.panel.headroom.reasonSrcTruePeak': 'ECHO SRC / FIR can reveal intersample peaks; reserve at least -3 dB.',
  'dsp.panel.headroom.reasonRoom': 'FIR / room correction may increase level.',
  'dsp.panel.headroom.reasonSafe': 'Current signal is safe.',
  'dsp.panel.headroom.recommendation': 'Recommendation',
  'dsp.panel.headroom.recommendationSafe': 'Safe',
  'dsp.panel.headroom.reserve': 'Reserve headroom',
  'dsp.panel.headroom.restoreDirect': 'Restore direct',
  'dsp.panel.headroom.safePolicy': 'Safety first',
  'dsp.panel.headroom.safetyActions': 'Quick protection',
  'dsp.panel.headroom.status': 'Status',
  'dsp.panel.headroom.statusClose': 'Near limit',
  'dsp.panel.headroom.statusRisk': 'Risk detected',
  'dsp.panel.headroom.statusSafe': 'Safe',
  'dsp.panel.headroom.transparentNote': 'Lowers digital level only. Tonality stays unchanged.',
  'dsp.panel.headroom.waitingSignal': 'Waiting for playback signal',
  'dsp.panel.room.future.recent': 'Recent IR',
  'dsp.panel.room.future.response': 'Response preview',
  'dsp.panel.room.hero.activeDetail': 'Convolution is participating in the output chain.',
  'dsp.panel.room.hero.activeTitle': 'FIR enabled',
  'dsp.panel.room.hero.emptyDetail': 'Import an IR before enabling room correction.',
  'dsp.panel.room.hero.emptyTitle': 'No IR loaded',
  'dsp.panel.room.hero.loadedDetail': 'IR is loaded and ready to enable.',
  'dsp.panel.room.hero.loadedTitle': 'IR loaded',
  'dsp.panel.room.hero.state': 'State',
  'dsp.panel.room.kicker': 'Spatial processing',
  'dsp.panel.room.nextEnable': 'Enable FIR',
  'dsp.panel.room.nextEnableDetail': 'IR is ready. Try listening.',
  'dsp.panel.room.nextImport': 'Import IR',
  'dsp.panel.room.nextImportDetail': 'Choose a convolution file first.',
  'dsp.panel.room.nextListen': 'Keep listening',
  'dsp.panel.room.nextListenDetail': 'Confirm volume and phase are normal after correction.',
  'dsp.panel.room.nextTrim': 'Lower trim',
  'dsp.panel.room.nextTrimDetail': 'FIR output has clipping risk.',
  'dsp.panel.room.note': 'FIR / room correction only handles convolution and IR; it is no longer mixed with EQ presets.',
  'dsp.panel.room.quickTrim': 'Quick trim',
  'dsp.panel.room.routeTitle': 'Route',
  'dsp.panel.room.safeEnableHint': 'Reserve -6 dB headroom before enabling FIR.',
  'dsp.panel.room.safetyRisk': 'Lower Trim or Headroom.',
  'dsp.panel.room.safetySafe': 'The output chain is currently safe.',
  'dsp.panel.room.safetyTitle': 'Safety',
  'dsp.panel.room.trim': 'Trim',
  'dsp.panel.safety.kicker': 'Output safety',
  'dsp.panel.safety.heroProtectedTitle': 'Output chain protected',
  'dsp.panel.safety.heroProtectedDetail': 'DSP is participating in playback, so output safety continues monitoring clipping, headroom, and bit-perfect route status.',
  'dsp.panel.safety.heroRiskTitle': 'Output risk detected',
  'dsp.panel.safety.heroRiskDetail': 'The current chain has clipping or headroom risk. Lower Headroom, EQ gain, or FIR Trim first.',
  'dsp.panel.safety.heroDirectTitle': 'Native direct',
  'dsp.panel.safety.heroDirectDetail': 'When no DSP module is enabled, playback stays on the bit-perfect candidate route and output safety only observes status.',
  'dsp.panel.safety.chainTitle': 'Current chain',
  'dsp.panel.safety.checkTitle': 'Safety check',
  'dsp.panel.safety.nextTitle': 'Suggested action',
  'dsp.panel.safety.nextRisk': 'Handle headroom first',
  'dsp.panel.safety.nextRiskDetail': 'Do not keep stacking EQ / FIR gain while risk exists. Lower Headroom or the related module Trim first.',
  'dsp.panel.safety.nextProtected': 'Keep monitoring',
  'dsp.panel.safety.nextProtectedDetail': 'The chain is in the DSP path and no clipping risk was found. Continue watching live output.',
  'dsp.panel.safety.nextDirect': 'Keep direct',
  'dsp.panel.safety.nextDirectDetail': 'No DSP processing is active. This is suitable for checking original output, device sample rate, and bit-perfect candidate status.',
  'dsp.panel.safety.routeInput': 'Input',
  'dsp.panel.safety.routeHeadroom': 'Headroom',
  'dsp.panel.safety.routeProcess': 'Process',
  'dsp.panel.safety.routeOutput': 'Output',
  'dsp.panel.safety.checkBitPerfect': 'Bit-perfect',
  'dsp.panel.safety.checkLimiter': 'Protection limiter',
  'dsp.panel.safety.disableLimiter': 'Disable protection limiter',
  'dsp.panel.safety.enableLimiter': 'Enable protection limiter',
  'dsp.panel.safety.limiterBypassed': 'Bypassed',
  'dsp.panel.safety.limiterBypassedDetail': 'The final protection limiter is off. Hot output may clip or distort.',
  'dsp.panel.safety.limiterToggleTitle': 'Protection limiter',
  'dsp.panel.safety.checkRoom': 'FIR',
  'dsp.panel.safety.checkChannel': 'Channel tools',
  'dsp.panel.safety.note': 'Clipping-protection readouts are only a reference; trust your ears for distortion, harshness, or excessive compression.',
  'dsp.room.status.active': 'Active',
  'dsp.room.status.empty': 'Not loaded',
  'dsp.room.status.error': 'Error',
  'dsp.room.status.loaded': 'Loaded',
  'dsp.stage.input': 'Input',
  'dsp.stage.output': 'Output',
  'dsp.stage.shape': 'Shape',
  'dsp.stage.space': 'Space',
  'dsp.stage.stereo': 'Stereo',
  'dsp.status.active': 'Enabled',
  'dsp.status.auto': 'Auto',
  'dsp.status.balanceActive': 'Channel processing',
  'dsp.status.bypassed': 'Bypassed',
  'dsp.status.candidate': 'Candidate',
  'dsp.status.clear': 'Clear',
  'dsp.status.direct': 'Direct',
  'dsp.status.disabledByDsp': 'DSP path',
  'dsp.status.dspPath': 'DSP path',
  'dsp.status.flat': 'Flat',
  'dsp.status.headroomRisk': 'Headroom risk',
  'dsp.status.limiterArmed': 'Armed',
  'dsp.status.limiting': 'Limiting',
  'dsp.status.modulesActive': '{count} modules active',
  'dsp.status.nativeDirect': 'Bit-perfect path',
  'dsp.status.noIr': 'No IR',
  'dsp.status.none': 'None',
  'dsp.status.protected': 'Protected',
  'dsp.status.ready': 'Ready',
  'dsp.status.risk': 'Risk',
  'dsp.status.riskDetected': 'Risk detected',
  'dsp.status.shared': 'shared',
  'dsp.status.signalProtected': 'Signal protected',
  'dsp.status.stereoDirect': 'Stereo direct',
  'dsp.status.systemOutput': 'System output',
};

const dspLocalTextZhTW: Record<string, string> = {
  'dsp.panel.sdm.sound.compare': '聲音風格 A/B',
  'dsp.panel.sdm.sound.compareDetail': '比較時只切換 FIR；DSD 目標、調變器、餘量與輸出路徑保持不變。播放中會回到同一個帶 3 秒前導的片段，避免比較到不同樂句。',
  'dsp.panel.sdm.sound.compareLinear': 'A/B Linear 基準',
  'dsp.panel.sdm.sound.compareRestore': '恢復',
  'dsp.panel.sdm.sound.dsd512CudaRequired': 'DSD512 的 Transient / Smooth 使用高辨識度長 FIR；CPU 未通過即時准入。請切換 CUDA，宿主會在開啟裝置前再次驗證實際餘量。',
  // Traditional Chinese (OpenCC from zh-CN)
  'dsp.action.clear': '清除',
  'dsp.action.disableChannel': '關閉聲道補償',
  'dsp.action.disableFir': '關閉 FIR',
  'dsp.action.enableChannel': '開啟聲道補償',
  'dsp.action.enableFir': '啟用 FIR',
  'dsp.action.enableFirSafely': '安全啟用',
  'dsp.action.importIr': '匯入 IR',
  'dsp.action.refresh': '重新整理狀態',
  'dsp.action.reset': '重置',
  'dsp.action.save': '儲存',
  'dsp.aria.chain': 'DSP 模組鏈',
  'dsp.aria.modules': 'DSP 模組',
  'dsp.aria.pipeline': 'DSP 路徑',
  'dsp.aria.workspace': 'DSP 工作區',
  'dsp.brand.subtitle': 'Signal Control',
  'dsp.section.advanced': '進階設定',
  'dsp.module.src.description': 'PCM 取樣率轉換',
  'dsp.module.src.title': 'ECHO SRC / 升頻',
  'dsp.panel.src.abBypass': 'A/B 原生',
  'dsp.panel.src.abRestore': '恢復升頻',
  'dsp.panel.src.active': '正在升頻',
  'dsp.panel.src.bypassDsd': 'DSD 輸出旁路',
  'dsp.panel.src.bypassShared': '共享輸出旁路',
  'dsp.panel.src.detail': '獨立於 HQPlayer 的本機 ECHO SRC。預設關閉；開啟後會進入 DSP 路徑並不再標記 bit-perfect。',
  'dsp.panel.src.engine': '引擎',
  'dsp.panel.src.advanced': '高階',
  'dsp.panel.src.advancedSummary': '高階模式顯示 poly-sinc / FIR / GPU 計劃；播放時以即時 Signal Path 的 active/fallback 狀態為準。',
  'dsp.panel.src.compute': 'Compute',
  'dsp.panel.src.compute.cpuDetail': '預設即時路徑：穩定、低排程風險，先保證播放可靠。',
  'dsp.panel.src.compute.cpuStatus': 'CPU 即時路徑，未請求 CUDA。',
  'dsp.panel.src.compute.gpuBadge': '顯示卡',
  'dsp.panel.src.compute.gpuDetail': '實驗路徑：給超長 filter / 大緩衝規劃，接入前必須單獨驗證延遲和掉幀。',
  'dsp.panel.src.dither.activeStatus': '整數輸出已生效 / {bits}-bit',
  'dsp.panel.src.dither.floatSafe': 'Float 輸出不處理',
  'dsp.panel.src.dither.floatStatus': '當前是 float 輸出，dither 自動旁路',
  'dsp.panel.src.dither.highpassDetail': '高通 TPDF：把抖動能量推離低頻，適合 16-bit 輸出和安靜尾音。',
  'dsp.panel.src.dither.integerOnly': '僅整數輸出',
  'dsp.panel.src.dither.ns5Detail': '5 階 noise shaping：輕量塑形，降低中低頻量化感。',
  'dsp.panel.src.dither.ns9Detail': '9 階 noise shaping：更激進地推高頻噪聲，適合 24-bit/高餘量鏈路。',
  'dsp.panel.src.dither.offDetail': '保持 Float32 PCM 鏈路原樣；預設關閉，避免無意義加噪。',
  'dsp.panel.src.dither.offStatus': '關閉',
  'dsp.panel.src.dither.pendingStatus': '等待整數輸出格式',
  'dsp.panel.src.dither.title': 'PCM Dither / Noise Shaping',
  'dsp.panel.src.dither.tpdfDetail': '標準 TPDF：最穩妥的量化抖動，適合 16-bit/24-bit 整數輸出。',
  'dsp.panel.src.dither.ultraDetail': 'Ultra shaped：最高階塑形，尾音更乾淨但更挑輸出鏈路和餘量。',
  'dsp.panel.src.ladder.hifi': 'HiFi',
  'dsp.panel.src.ladder.hifiDetail': '4x / gauss-long 1x / hb Nx / CPU，聽感更柔和，即時壓力適中。',
  'dsp.panel.src.ladder.insane': 'Insane / Offline-like',
  'dsp.panel.src.ladder.insaneDetail': '8x / apod-long + ext2-xl / CUDA，超吃配置，用來衝擊接近離線的 PCM 體驗。',
  'dsp.panel.src.ladder.latencyExtreme': '超高延遲',
  'dsp.panel.src.ladder.latencyHigh': '高延遲',
  'dsp.panel.src.ladder.latencyLow': '低延遲',
  'dsp.panel.src.ladder.latencyMedium': '中等延遲',
  'dsp.panel.src.ladder.realtimeSafe': 'Realtime Safe',
  'dsp.panel.src.ladder.realtimeSafeDetail': '4x / hb 1x+Nx / CPU，優先不卡頓和 UI 可控。',
  'dsp.panel.src.ladder.reference': 'Reference',
  'dsp.panel.src.ladder.referenceDetail': '8x / apod-minring 1x / ext2-long Nx / CUDA，優先聽感差異和透明度。',
  'dsp.panel.src.ladder.title': 'CPU/GPU Quality Ladder',
  'dsp.panel.src.cuda.pending': 'CUDA runtime ready; FIR worker pending.',
  'dsp.panel.src.cuda.ready': '{device} / {memory} / Driver {driver} / CUDA {cuda}',
  'dsp.panel.src.cuda.lowUtilization': '即時音訊是小塊低延遲任務，GPU 佔用低不代表沒生效；以當前播放狀態裡的 CUDA FIR active 為準。',
  'dsp.panel.src.cuda.unavailable': 'CUDA 不可用：{reason}',
  'dsp.panel.src.cuda.guide.driverStep1': '安裝或更新 NVIDIA App / 官方 GeForce、Studio、RTX 驅動。',
  'dsp.panel.src.cuda.guide.driverStep2': '安裝完成後重啟 Windows，再重新開啟 ECHO。',
  'dsp.panel.src.cuda.guide.driverStep3': '回到這裡重新整理狀態；如果仍不可用，確認系統裡能執行 nvidia-smi。',
  'dsp.panel.src.cuda.guide.driverTitle': '需要安裝 NVIDIA 驅動',
  'dsp.panel.src.cuda.guide.genericStep1': '先更新 NVIDIA 官方驅動並重啟系統。',
  'dsp.panel.src.cuda.guide.genericStep2': '重新開啟 ECHO 後重新整理狀態。',
  'dsp.panel.src.cuda.guide.genericStep3': '若仍失敗，暫時使用 CPU FIR / SOXR 並檢視診斷原因。',
  'dsp.panel.src.cuda.guide.genericTitle': 'CUDA 需要檢查',
  'dsp.panel.src.cuda.guide.problem': '檢測結果：{reason}',
  'dsp.panel.src.cuda.guide.runtimeStep1': '更新 NVIDIA 驅動後重啟系統。',
  'dsp.panel.src.cuda.guide.runtimeStep2': '先改用較輕 filter 或降低升頻倍率測試穩定性。',
  'dsp.panel.src.cuda.guide.runtimeStep3': '如果繼續失敗，ECHO 會自動回落 CPU FIR，不會靜默假裝 GPU 生效。',
  'dsp.panel.src.cuda.guide.runtimeTitle': 'CUDA 執行時失敗',
  'dsp.panel.src.cuda.guide.title': 'CUDA 安裝指引',
  'dsp.panel.src.cuda.guide.workerStep1': '這通常不是使用者驅動問題，而是當前 ECHO 包內缺少 CUDA FIR 元件。',
  'dsp.panel.src.cuda.guide.workerStep2': '安裝帶 CUDA FIR worker 的 ECHO 版本，或用 CUDA 構建配置重新打包。',
  'dsp.panel.src.cuda.guide.workerStep3': '在元件補齊前會自動回落 CPU FIR / SOXR。',
  'dsp.panel.src.cuda.guide.workerTitle': 'ECHO CUDA 元件缺失',
  'dsp.panel.src.cuda.reason.driverMissing': '未檢測到 NVIDIA 驅動或 nvidia-smi',
  'dsp.panel.src.cuda.reason.driverUnreadable': 'NVIDIA 驅動執行檔返回異常',
  'dsp.panel.src.cuda.reason.workerCpuOnly': 'ECHO CUDA worker 不是 CUDA 構建',
  'dsp.panel.src.cuda.reason.workerMissing': 'ECHO CUDA worker 未隨安裝包提供',
  'dsp.panel.src.cuda.reason.workerRuntime': 'CUDA worker 播放中失敗或超時',
  'dsp.panel.src.cuda.reason.workerStopped': 'CUDA worker 已隨暫停或切換停止，等待下一次播放狀態',
  'dsp.panel.src.filter': 'Filter',
  'dsp.panel.src.filter.apodFastDetail': 'apodizing 快速檔：較早 cutoff / 中等 taps，用來壓老錄音或 MP3 殘留 ringing。',
  'dsp.panel.src.filter.apodGaussDetail': 'apodizing 高斯窗：更柔和的提前滾降，聲音會更順滑但高頻邊緣更剋制。',
  'dsp.panel.src.filter.apodLongDetail': 'apodizing 長 taps：提前滾降 + 高 stopband，優先處理舊 ADC / brickwall 前振鈴。',
  'dsp.panel.src.filter.apodMinringDetail': 'apodizing minimum phase：降低前振鈴並主動衰減原始檔 ringing，聽感變化最明顯。',
  'dsp.panel.src.filter.closedFormDetail': '封閉形式 sinc 插值方向，後續做基準對照。',
  'dsp.panel.src.filter.collapse': '收起精選',
  'dsp.panel.src.filter.expand': '展開全部',
  'dsp.panel.src.filter.gpuCpu': 'CPU / 入門 GPU',
  'dsp.panel.src.filter.gpuRtx5060': '建議 RTX 5060+',
  'dsp.panel.src.filter.gpuRtx5070': '建議 RTX 5070+',
  'dsp.panel.src.filter.gpuRtx5070Ti': '建議 RTX 5070 Ti+',
  'dsp.panel.src.filter.gpuRtx5080': '建議 RTX 5080+',
  'dsp.panel.src.filter.gpuRtx5090': '建議 RTX 5090 / 32GB',
  'dsp.panel.src.filter.loadHigh': '高負載',
  'dsp.panel.src.filter.loadExtreme': '極高負載',
  'dsp.panel.src.filter.loadLight': '輕負載',
  'dsp.panel.src.filter.loadMedium': '中負載',
  'dsp.panel.src.filter.loadResearch': '研究',
  'dsp.panel.src.filter.loadVeryHigh': '很高',
  'dsp.panel.src.filter.minringFirLpDetail': 'minimum-ringing FIR，低預振鈴，聲音更貼近。',
  'dsp.panel.src.filter.minringFirMpDetail': 'minimum-ringing 中等精度檔，降低前振鈴並保留更多透明度。',
  'dsp.panel.src.filter.minringFirXlaDetail': 'minimum-ringing 超長檔，偏自然聽感但計算量明顯更高。',
  'dsp.panel.src.filter.minringFirSoftDetail': 'minimum-ringing soft：高斯窗 + minimum phase，偏柔和、靠前、少刺激。',
  'dsp.panel.src.filter.minringFirExtremeDetail': 'minimum-ringing extreme：3071 taps minimum phase，衝聽感變化和瞬態自然感。',
  'dsp.panel.src.filter.polySincExt2HiresLpDetail': 'ext2 高取樣率線性相位檔，給 Nx 路徑準備的高精度版本。',
  'dsp.panel.src.filter.polySincExt2HiresMpDetail': 'ext2 高取樣率 minimum phase 檔，降低前振鈴並保留空氣感。',
  'dsp.panel.src.filter.polySincExt3LongDetail': 'ext3 長 taps 線性相位：更窄 transition、更高 stopband，透明度優先但延遲明顯。',
  'dsp.panel.src.filter.polySincExt3XlaDetail': 'ext3 4095 taps 極限線性相位：給 RTX 5090 / 離線感 A/B 的壓力檔。',
  'dsp.panel.src.filter.polySincExt2ShortDetail': 'ext2 短 taps 檔，保留高精度方向但更適合即時。',
  'dsp.panel.src.filter.polySincExt2LongDetail': '長 taps 線性相位，透明優先，接近 long 檔方向。',
  'dsp.panel.src.filter.polySincExt2MediumDetail': 'ext2 中 taps 檔，透明度和負載更平衡。',
  'dsp.panel.src.filter.polySincExt2XlDetail': 'ext2 3071 taps 極限檔，給高階 CUDA 和離線級聽感測試。',
  'dsp.panel.src.filter.polySincExt2XlaDetail': '超長 taps，面向 8x / Ultra 的後續高精度檔。',
  'dsp.panel.src.filter.polySincGaussHiresLpDetail': '高解析度線性相位高斯窗，柔和但保持定位。',
  'dsp.panel.src.filter.polySincGaussHiresMpDetail': '高解析度 minimum phase 高斯窗，降低前振鈴感。',
  'dsp.panel.src.filter.polySincGaussLongDetail': '高斯窗 poly-sinc，聽感更柔和，兼顧瞬態。',
  'dsp.panel.src.filter.polySincGaussXlDetail': '高斯 3071 taps 極限檔，柔和取向但非常吃顯示卡。',
  'dsp.panel.src.filter.polySincGaussXlaDetail': '高斯超長檔，給 A/B 和測量對照準備。',
  'dsp.panel.src.filter.polySincGaussXtrLongDetail': 'gauss-xtr 長檔：更強高斯整形，聲音更順滑、邊緣更收。',
  'dsp.panel.src.filter.polySincGaussXtrXlaDetail': 'gauss-xtr 4095 taps：極柔和超長檔，用來試“厚、順、暗一點”的方向。',
  'dsp.panel.src.filter.polySincHbDetail': '半帶 poly-sinc，適合 2x/4x 先做穩定即時版。',
  'dsp.panel.src.filter.polySincXtrLpDetail': 'xtr 線性相位長檔，透明取向，對即時效能要求更高。',
  'dsp.panel.src.filter.polySincXtrShortLpDetail': 'xtr short 線性相位，給即時和透明度之間的折中。',
  'dsp.panel.src.filter.polySincXtrShortMpDetail': 'xtr short minimum phase，偏自然聽感和低前振鈴。',
  'dsp.panel.src.filter.polySincXtrXlaDetail': 'xtr xla minimum phase 極限檔，偏聽感但非常吃配置。',
  'dsp.panel.src.filter.polySincXtrMpDetail': '中相位方向，減少前振鈴感，適合聽感取向。',
  'dsp.panel.src.filter.apodXtrDetail': 'apodizing xtr：3071 taps 提前滾降，強力清理舊 brickwall/filter ringing。',
  'dsp.panel.src.filter.apodExtremeDetail': 'apodizing extreme：4095 taps minimum phase，最大化“源 ringing 清理”聽感。',
  'dsp.panel.src.filter.brickwallLongDetail': 'brickwall-long：高截止、窄 transition、強 stopband，用來對照最硬最透明方向。',
  'dsp.panel.src.filter.softKneeLongDetail': 'soft-knee-long：提前緩慢滾降，犧牲一點邊緣換順滑和耐聽。',
  'dsp.panel.src.filter.selected': '已選 Filter',
  'dsp.panel.src.filter.sincLDetail': 'sinc 大檔，作為高精度基準和聽感對照。',
  'dsp.panel.src.filter.sincLongHDetail': 'sinc-long 高精度版，作為更重的線性相位基準。',
  'dsp.panel.src.filter.sincLongDetail': '長 sinc 基線，用來校準 FIR 設計和聽感差異。',
  'dsp.panel.src.filter.sincMDetail': 'sinc 中檔，負載較低的基準參考。',
  'dsp.panel.src.filter.sincXlaDetail': 'sinc xla 超長基準檔，用來壓力測試和對照極限 filter。',
  'dsp.panel.src.kicker': '取樣率轉換',
  'dsp.panel.src.mode': '模式',
  'dsp.panel.src.mode.family2x': '2x PCM',
  'dsp.panel.src.mode.family2xDetail': '44.1k 家族升到 88.2k，48k 家族升到 96k。',
  'dsp.panel.src.mode.family4x': '4x PCM',
  'dsp.panel.src.mode.family4xDetail': '44.1k 家族升到 176.4k，48k 家族升到 192k。',
  'dsp.panel.src.mode.family8x': '8x Ultra',
  'dsp.panel.src.mode.family8xDetail': '實驗檔：44.1k 家族升到 352.8k，48k 家族升到 384k。',
  'dsp.panel.src.mode.compatibility48': '48 kHz 相容',
  'dsp.panel.src.mode.compatibility48Detail': '將 PCM 固定轉換到 48 kHz，適合只接受 48 kHz 的獨佔耳機或音效卡；預設關閉。',
  'dsp.panel.src.mode.off': '關閉',
  'dsp.panel.src.mode.offDetail': '保持源取樣率，Bit-perfect 條件不受 ECHO SRC 影響。',
  'dsp.panel.src.modeSwitch': 'ECHO SRC 控制模式',
  'dsp.panel.src.native': '原生直通',
  'dsp.panel.src.normal': '普通',
  'dsp.panel.src.notConnected': '未接入播放鏈路',
  'dsp.panel.src.note': '只處理 PCM。共享輸出、DSD 輸出或 HQPlayer 接管時不會疊加升頻。',
  'dsp.panel.src.pending': '等待下一次播放規劃',
  'dsp.panel.src.precision': '精度',
  'dsp.panel.src.quality': '質量策略',
  'dsp.panel.src.quality.balanced': 'Balanced',
  'dsp.panel.src.quality.balancedDetail': '保持原有 SOXR 檔位，兼顧穩定和開銷。',
  'dsp.panel.src.quality.lowLatency': 'Low latency',
  'dsp.panel.src.quality.lowLatencyDetail': '降低 SRC 開銷，適合低延遲輸出。',
  'dsp.panel.src.quality.transparent': 'Transparent',
  'dsp.panel.src.quality.transparentDetail': '最高精度 SOXR，優先透明和低失真。',
  'dsp.panel.src.recommended': '推薦',
  'dsp.panel.src.route': '路徑',
  'dsp.panel.src.sourceRate': '源取樣率',
  'dsp.panel.src.targetRate': '目標取樣率',
  'dsp.stage.src': '取樣率',
  'dsp.error.channelBridge': '聲道工具不可用。',
  'dsp.error.desktopBridge': '桌面橋接不可用。',
  'dsp.error.dspBridge': 'DSP 橋接不可用。',
  'dsp.error.firBridge': 'FIR 橋接不可用。',
  'dsp.label.bitPerfect': 'Bit-perfect',
  'dsp.label.currentModule': '當前模組',
  'dsp.label.module': 'DSP 模組',
  'dsp.label.moduleStatus': '模組狀態',
  'dsp.label.output': '輸出',
  'dsp.metric.bitPerfect': 'Bit-perfect',
  'dsp.metric.clipping': '削波',
  'dsp.metric.dsp': 'DSP',
  'dsp.metric.inputPeak': '輸入峰值',
  'dsp.metric.ir': 'IR',
  'dsp.metric.latency': '延遲',
  'dsp.metric.liveHeadroom': '即時餘量',
  'dsp.metric.truePeak': 'True Peak',
  'dsp.metric.mode': '模式',
  'dsp.metric.outputEstimate': '輸出估算',
  'dsp.metric.reason': '原因',
  'dsp.metric.sampleRate': '取樣率',
  'dsp.metric.taps': 'Taps',
  'dsp.module.channel.description': '平衡、延遲、Mono',
  'dsp.module.channel.title': '聲道工具',
  'dsp.module.eq.description': '頻段、前級、預設',
  'dsp.module.eq.title': '引數 EQ',
  'dsp.module.headroom.description': 'DSP 前餘量預留',
  'dsp.module.headroom.title': 'Headroom',
  'dsp.module.headphone.description': 'OPRA 耳機曲線',
  'dsp.module.headphone.title': '耳機校正',
  'dsp.module.room.description': '只處理 IR 卷積',
  'dsp.module.room.title': 'FIR / 房間校正',
  'dsp.module.safety.description': '只監控輸出鏈',
  'dsp.module.safety.title': '輸出安全',
  'dsp.module.sdm.description': 'DSD / SDM 真實鏈路',
  'dsp.module.sdm.title': 'ECHO SDM / DSD（測試版）',
  'dsp.panel.sdm.capability': 'Capability',
  'dsp.panel.sdm.capabilityDetail': 'ECHO 現在可驗證 Native DSD、DoP 及獨立 PCM -> SDM；SDM 不依賴實驗室裡的 DSD 直通開關。',
  'dsp.panel.sdm.detail': '顯示當前這首歌是否真的走 DSD/DoP/native DSD，或是否實際進入獨立 PCM -> SDM 鏈路。',
  'dsp.panel.sdm.dop': 'DoP passthrough',
  'dsp.panel.sdm.dopDetail': '本地 DSF 在 Exclusive 下嘗試 DoP，失敗會明確 fallback 到 PCM。',
  'dsp.panel.sdm.fallback': 'Fallback',
  'dsp.panel.sdm.guard': 'Guard',
  'dsp.panel.sdm.guardDetail': 'PCM -> SDM 會自動套用該檔位建議 headroom，並對極弱訊號進入 DSD idle 以壓低底噪。',
  'dsp.panel.sdm.kicker': 'DSD / sigma-delta monitor',
  'dsp.panel.sdm.modulator': 'PCM -> SDM modulator',
  'dsp.panel.sdm.modulatorCoefficients': '反饋係數',
  'dsp.panel.sdm.modulatorDither': 'Dither',
  'dsp.panel.sdm.modulatorHeadroom': '建議餘量',
  'dsp.panel.sdm.modulatorOrder': '階數',
  'dsp.panel.sdm.modulatorProfile': 'Modulator 引數',
  'dsp.panel.sdm.modulatorStability': '穩定限制',
  'dsp.panel.sdm.modulatorPending': '未路由，檢視 Fallback',
  'dsp.panel.sdm.nativeDsd': 'Native DSD',
  'dsp.panel.sdm.noDsdSource': '當前不是 DSD 源',
  'dsp.panel.sdm.note': 'PCM -> SDM 使用獨立 ECHO SDM 鏈路；實驗室裡的 DSD 直通只服務原生 DSD 源。',
  'dsp.panel.sdm.output': 'Actual output',
  'dsp.panel.sdm.oversampling': 'PCM oversampling',
  'dsp.panel.sdm.oversampling1x': 'Oversampling 1x',
  'dsp.panel.sdm.oversampling1xDetail': '低取樣率 PCM 入口濾波傾向；CUDA 4x/8x 會作為第一段 ECHO FIR 執行。',
  'dsp.panel.sdm.oversamplingEffective': '當前槽位',
  'dsp.panel.sdm.oversamplingNx': 'Oversampling Nx',
  'dsp.panel.sdm.oversamplingNxDetail': '高取樣率或多倍頻階段濾波傾向；CUDA 4x/8x 會作為後續 ECHO FIR 階段執行。',
  'dsp.panel.sdm.oversamplingRoute': '前端上取樣',
  'dsp.panel.sdm.oversamplingTruth': '真實執行以 native host 回報的 FIR stages、backend 與 fallback 為準。',
  'dsp.panel.sdm.pcmFallback': 'PCM fallback',
  'dsp.panel.sdm.requested': 'Requested',
  'dsp.panel.sdm.source': 'Source',
  'dsp.panel.sdm.transport': 'Transport',
  'dsp.panel.sdm.actual': '實際生效',
  'dsp.panel.sdm.badge.planned': '實驗鏈路',
  'dsp.panel.sdm.badge.real': '真實鏈路',
  'dsp.panel.sdm.badge.safe': '旁路安全',
  'dsp.panel.sdm.compute': 'SDM Compute',
  'dsp.panel.sdm.compute.cpuDetail': 'CPU 即時路徑已接入第一版 PCM -> SDM DoP。',
  'dsp.panel.sdm.compute.cudaDetail': '包含原生 CUDA 遞迴調變器與真機效能准入；若 CPU 更快，CUDA 仍可加速 FIR 過取樣。',
  'dsp.panel.sdm.mode': 'SDM 模式',
  'dsp.panel.sdm.mode.dsdPassthrough': 'DSD Passthrough',
  'dsp.panel.sdm.mode.dsdPassthroughDetail': '只處理原生 DSD 源，走 DoP，不經過 PCM 升頻。',
  'dsp.panel.sdm.mode.off': '關閉 SDM',
  'dsp.panel.sdm.mode.offDetail': 'PCM 和 ECHO SRC 保持獨立；不會啟動 DSD/SDM 輸出。',
  'dsp.panel.sdm.mode.pcmToDsd': 'PCM -> SDM',
  'dsp.panel.sdm.mode.pcmToDsdDetail': '將 PCM 調變為 1-bit SDM；DSD64-256 可走 DoP，實驗性 ASIO 鏈路可走 Native DSD。',
  'dsp.panel.sdm.sound': 'SDM 聲音風格',
  'dsp.panel.sdm.sound.detail': '聲音風格改變送入調變器前的 FIR 相位、振鈴與滾降；Quality 只負責調變穩定性和超聲頻噪聲。',
  'dsp.panel.sdm.sound.linear': 'ECHO Linear',
  'dsp.panel.sdm.sound.linearDetail': '線性相位、陡峭滾降；保留對稱瞬態和最寬頻寬，適合作為中性基準。',
  'dsp.panel.sdm.sound.linearBadge': '中性 / 對稱振鈴',
  'dsp.panel.sdm.sound.transient': 'ECHO Transient',
  'dsp.panel.sdm.sound.transientDetail': '最小相位、前置振鈴顯著減少；鼓點和撥弦更靠前，代價是相位不再線性。',
  'dsp.panel.sdm.sound.transientBadge': '瞬態 / 最小相位',
  'dsp.panel.sdm.sound.smooth': 'ECHO Smooth',
  'dsp.panel.sdm.sound.smoothDetail': 'Apodizing + Gaussian 漸進滾降；更主動清理源檔案數位振鈴，高頻頻寬取捨也更明顯。',
  'dsp.panel.sdm.sound.smoothBadge': '柔和 / Apodizing',
  'dsp.panel.sdm.sound.custom': 'Custom FIR',
  'dsp.panel.sdm.quality': '調變器 / 穩定性',
  'dsp.panel.sdm.quality.hifi': 'HiFi',
  'dsp.panel.sdm.quality.hifiDetail': '6 階有界 NTF，固定 6 dB 調變安全餘量；日常品質檔。',
  'dsp.panel.sdm.quality.insane': 'Insane',
  'dsp.panel.sdm.quality.insaneDetail': '8 階有界 NTF，固定 6 dB 調變安全餘量；高負載實驗檔。',
  'dsp.panel.sdm.quality.reference': 'Reference',
  'dsp.panel.sdm.quality.referenceDetail': '7 階有界 NTF，固定 6 dB 調變安全餘量；量測與對照檔。',
  'dsp.panel.sdm.quality.safe': 'Realtime Safe',
  'dsp.panel.sdm.quality.safeDetail': '3 階有界 NTF，固定 6 dB 調變安全餘量；穩定性優先。',
  'dsp.panel.sdm.runtime.dsdPassthrough': '當前曲目正在走 DSD passthrough',
  'dsp.panel.sdm.runtime.off': '當前曲目沒有走 SDM',
  'dsp.panel.sdm.runtime.pcmToSdmActive': 'PCM -> SDM 正在實際生效',
  'dsp.panel.sdm.runtime.pcmToSdmNotRouted': '當前鏈路未路由 PCM -> SDM，請看 Fallback 原因',
  'dsp.panel.sdm.separateNote': 'SDM 與 PCM/ECHO SRC 分開儲存；只有當前播放鏈路滿足條件時才會實際接管 PCM。',
  'dsp.panel.sdm.target': 'Target DSD rate',
  'dsp.panel.sdm.target.dsd128Detail': '常用即時目標；PCM -> SDM 由 ECHO SDM 獨立鏈路實際接管。',
  'dsp.panel.sdm.target.dsd256Detail': '高倍率即時 PCM -> SDM 目標；避免走普通 DoP 直出。',
  'dsp.panel.sdm.target.dsd512Detail': '32x FIR / 22.5792 或 24.576 MHz Native DSD；僅 ASIO 實驗鏈路准入，其他輸出會明確拒絕。',
  'dsp.panel.sdm.target.dsd64Detail': '輕量目標；用於驗證 ECHO SDM 鏈路是否能穩定出聲。',
  'dsp.panel.channel.advanced': '高階聲道',
  'dsp.panel.channel.balance': '聲像平衡',
  'dsp.panel.channel.bandCompensation': '分頻段左右補償',
  'dsp.panel.channel.bandHigh': '高頻',
  'dsp.panel.channel.bandLow': '低頻',
  'dsp.panel.channel.bandMid': '中頻',
  'dsp.panel.channel.centered': '中心穩定',
  'dsp.panel.channel.compensationDetail': '預設只降低偏響一側，適合不可維修的耳機偏音補償。',
  'dsp.panel.channel.compensationOff': '已關閉',
  'dsp.panel.channel.compensationOn': '已開啟',
  'dsp.panel.channel.compensationTitle': '偏音補償',
  'dsp.panel.channel.constantPower': '恆功率',
  'dsp.panel.channel.delaySkew': '延遲差',
  'dsp.panel.channel.he90Hint': '建議從 0.25 dB 開始，邊聽居中人聲邊微調。',
  'dsp.panel.channel.invertLeft': '左聲道反相',
  'dsp.panel.channel.invertRight': '右聲道反相',
  'dsp.panel.channel.kicker': '聲道工具',
  'dsp.panel.channel.leansLeft': '偏左 {value}',
  'dsp.panel.channel.leansRight': '偏右 {value}',
  'dsp.panel.channel.leftDelay': '左聲道延遲',
  'dsp.panel.channel.leftGain': '左聲道增益',
  'dsp.panel.channel.leftOutput': '左輸出',
  'dsp.panel.channel.leftTooLoud': '左側偏響',
  'dsp.panel.channel.monoTools': 'Mono / 檢查',
  'dsp.panel.channel.mono.left': '只聽左聲道',
  'dsp.panel.channel.mono.off': '關閉 Mono',
  'dsp.panel.channel.mono.right': '只聽右聲道',
  'dsp.panel.channel.mono.sum': '合併 Mono',
  'dsp.panel.channel.note': '聲道工具已從引數 EQ 中分離，適合檢查聲像、左右耳差異和單聲道相容。',
  'dsp.panel.channel.modePro': 'Pro',
  'dsp.panel.channel.modeSimple': 'Simple',
  'dsp.panel.channel.presetDefaultName': '耳機偏音補償',
  'dsp.panel.channel.presetEmpty': '還沒有儲存的聲道方案。',
  'dsp.panel.channel.presetName': '方案名稱',
  'dsp.panel.channel.presetPrompt': '給這個耳機方案起個名字',
  'dsp.panel.channel.presets': '耳機方案',
  'dsp.panel.channel.phaseTools': '相位 / 路由',
  'dsp.panel.channel.removePreset': '移除',
  'dsp.panel.channel.saveCurrent': '儲存當前引數',
  'dsp.panel.channel.selectPreset': '選擇方案',
  'dsp.panel.channel.switchPreset': '切換',
  'dsp.panel.channel.renamePreset': '重新命名',
  'dsp.panel.channel.renamePrompt': '重新命名這個耳機方案',
  'dsp.panel.channel.rightDelay': '右聲道延遲',
  'dsp.panel.channel.rightGain': '右聲道增益',
  'dsp.panel.channel.rightOutput': '右輸出',
  'dsp.panel.channel.rightTooLoud': '右側偏響',
  'dsp.panel.channel.step': '步進',
  'dsp.panel.channel.swap': '交換左右',
  'dsp.panel.channel.swapCompensation': '交換補償方向',
  'dsp.panel.channel.safeAttenuation': '靜電耳機建議使用衰減補償，避擴音高輸出電平。',
  'dsp.panel.channel.compare': 'A/B 對比',
  'dsp.panel.channel.compareActive': '正在旁路',
  'dsp.panel.channel.compareHint': '臨時關閉聲道處理，用來對比補償前後的聲像。',
  'dsp.panel.channel.monoHint': '合併 Mono 會兩邊都響；只聽左/右會靜音另一邊。',
  'dsp.panel.channel.trimCenter': '偏音清零',
  'dsp.panel.headroom.applyRecommended': '應用建議',
  'dsp.panel.headroom.applyRecommendedValue': '採用建議值 {value}',
  'dsp.panel.headroom.budgetAria': 'Headroom 預算',
  'dsp.panel.headroom.clipCount': '削波次數',
  'dsp.panel.headroom.clipCountValue': '{count} 次',
  'dsp.panel.headroom.guardActive': '已啟用',
  'dsp.panel.headroom.guardDirect': '直通',
  'dsp.panel.headroom.guardStandby': '待命',
  'dsp.panel.headroom.guardState': '保護狀態',
  'dsp.panel.headroom.kicker': 'Headroom 管理',
  'dsp.panel.headroom.heroSubtitle': '預留餘量，保護瞬態與 DSP 動態。',
  'dsp.panel.headroom.history': '最近 60 秒',
  'dsp.panel.headroom.inputTrace': '輸入',
  'dsp.panel.headroom.lastClip': '最近削波',
  'dsp.panel.headroom.makeConservative': '設為 -6 dB',
  'dsp.panel.headroom.makeSafe': '設為 {value}',
  'dsp.panel.headroom.modeAria': 'Headroom 模式',
  'dsp.panel.headroom.modeDaily': '日常',
  'dsp.panel.headroom.modeDailyDetail': '輕量 DSP 預留。',
  'dsp.panel.headroom.modeDirect': '直通',
  'dsp.panel.headroom.modeDirectDetail': '不額外降低電平。',
  'dsp.panel.headroom.modeDsp': 'DSP',
  'dsp.panel.headroom.modeDspDetail': '給 EQ/FIR 留出安全空間。',
  'dsp.panel.headroom.nextDirect': '保持直通',
  'dsp.panel.headroom.nextDirectDetail': '當前沒有需要預留的 DSP 風險。',
  'dsp.panel.headroom.nextHoldRisk': '先降低餘量',
  'dsp.panel.headroom.nextHoldRiskDetail': '檢測到削波風險，建議先預留 Headroom。',
  'dsp.panel.headroom.nextProtect': '應用保護餘量',
  'dsp.panel.headroom.nextProtectDetail': '當前輸出接近滿幅，建議立即降低。',
  'dsp.panel.headroom.nextReady': '繼續監聽',
  'dsp.panel.headroom.nextReadyDetail': 'DSP 已有安全餘量。',
  'dsp.panel.headroom.nextStandby': '保持待命',
  'dsp.panel.headroom.nextStandbyDetail': '有 DSP 模組開啟，但暫未檢測到風險。',
  'dsp.panel.headroom.nextStep': '下一步',
  'dsp.panel.headroom.nextWatch': '觀察輸出',
  'dsp.panel.headroom.nextWatchDetail': '輸出接近上限，建議留意削波。',
  'dsp.panel.headroom.noClip': '無記錄',
  'dsp.panel.headroom.note': 'Headroom 只負責預留電平空間，不再混進 EQ 或 FIR 的具體調音。',
  'dsp.panel.headroom.outputTrace': '輸出估算',
  'dsp.panel.headroom.presetsAria': 'Headroom 預設',
  'dsp.panel.headroom.primaryAction': '應用 {value}',
  'dsp.panel.headroom.reasonChannel': '聲道工具可能提高電平。',
  'dsp.panel.headroom.reasonClipping': '檢測到削波。',
  'dsp.panel.headroom.reasonDirect': 'Headroom 只在 DSP 路徑生效；當前 EQ / FIR / 聲道工具都未啟用，原生直通不會被它處理。',
  'dsp.panel.headroom.reasonEq': 'EQ 曲線可能提高電平。',
  'dsp.panel.headroom.reasonLive': '即時餘量偏低。',
  'dsp.panel.headroom.reasonOutput': '輸出估算接近滿幅。',
  'dsp.panel.headroom.reasonSrcTruePeak': 'ECHO SRC / FIR 可能暴露 intersample peak，建議至少預留 -3 dB。',
  'dsp.panel.headroom.reasonRoom': 'FIR / 房間校正可能提高電平。',
  'dsp.panel.headroom.reasonSafe': '當前訊號安全。',
  'dsp.panel.headroom.recommendation': '建議',
  'dsp.panel.headroom.recommendationSafe': '安全',
  'dsp.panel.headroom.reserve': '預留餘量',
  'dsp.panel.headroom.restoreDirect': '恢復直通',
  'dsp.panel.headroom.safePolicy': '安全優先',
  'dsp.panel.headroom.safetyActions': '快速保護',
  'dsp.panel.headroom.status': '狀態',
  'dsp.panel.headroom.statusClose': '接近上限',
  'dsp.panel.headroom.statusRisk': '存在風險',
  'dsp.panel.headroom.statusSafe': '安全',
  'dsp.panel.headroom.transparentNote': '只降低數位電平，不改變音色。',
  'dsp.panel.headroom.waitingSignal': '等待播放訊號',
  'dsp.panel.room.future.recent': '最近 IR',
  'dsp.panel.room.future.response': '響應預覽',
  'dsp.panel.room.hero.activeDetail': '卷積正在參與輸出鏈。',
  'dsp.panel.room.hero.activeTitle': 'FIR 已啟用',
  'dsp.panel.room.hero.emptyDetail': '匯入 IR 後才能啟用房間校正。',
  'dsp.panel.room.hero.emptyTitle': '未載入 IR',
  'dsp.panel.room.hero.loadedDetail': 'IR 已載入，可以啟用。',
  'dsp.panel.room.hero.loadedTitle': 'IR 已載入',
  'dsp.panel.room.hero.state': '狀態',
  'dsp.panel.room.kicker': '空間處理',
  'dsp.panel.room.nextEnable': '啟用 FIR',
  'dsp.panel.room.nextEnableDetail': 'IR 已準備好，可以試聽。',
  'dsp.panel.room.nextImport': '匯入 IR',
  'dsp.panel.room.nextImportDetail': '先選擇一個卷積檔案。',
  'dsp.panel.room.nextListen': '繼續試聽',
  'dsp.panel.room.nextListenDetail': '確認校正後音量和相位正常。',
  'dsp.panel.room.nextTrim': '降低 Trim',
  'dsp.panel.room.nextTrimDetail': 'FIR 輸出存在削波風險。',
  'dsp.panel.room.note': 'FIR / 房間校正只處理卷積和 IR，不再和 EQ 預設混在一起。',
  'dsp.panel.room.quickTrim': '快速 Trim',
  'dsp.panel.room.routeTitle': '路徑',
  'dsp.panel.room.safeEnableHint': '先預留 -6 dB Headroom，再啟用 FIR。',
  'dsp.panel.room.safetyRisk': '請降低 Trim 或 Headroom。',
  'dsp.panel.room.safetySafe': '輸出鏈當前安全。',
  'dsp.panel.room.safetyTitle': '安全',
  'dsp.panel.room.trim': 'Trim',
  'dsp.panel.safety.kicker': '輸出安全',
  'dsp.panel.safety.heroProtectedTitle': '輸出鏈路受保護',
  'dsp.panel.safety.heroProtectedDetail': 'DSP 正在參與播放，輸出安全會持續監控削波、餘量和 bit-perfect 路徑。',
  'dsp.panel.safety.heroRiskTitle': '檢測到輸出風險',
  'dsp.panel.safety.heroRiskDetail': '當前鏈路有削波或餘量風險，先降低 Headroom、EQ 增益或 FIR Trim。',
  'dsp.panel.safety.heroDirectTitle': '原生直通',
  'dsp.panel.safety.heroDirectDetail': '沒有啟用 DSP 模組時，播放保持 bit-perfect 候選路徑，輸出安全只做狀態觀察。',
  'dsp.panel.safety.chainTitle': '當前鏈路',
  'dsp.panel.safety.checkTitle': '安全檢查',
  'dsp.panel.safety.nextTitle': '建議動作',
  'dsp.panel.safety.nextRisk': '先處理餘量',
  'dsp.panel.safety.nextRiskDetail': '有風險時不要繼續疊加 EQ / FIR 增益，優先降 Headroom 或相關模組 Trim。',
  'dsp.panel.safety.nextProtected': '繼續監聽',
  'dsp.panel.safety.nextProtectedDetail': '鏈路處於 DSP 路徑但沒有發現削波風險，可以繼續觀察即時輸出。',
  'dsp.panel.safety.nextDirect': '保持直通',
  'dsp.panel.safety.nextDirectDetail': '當前沒有 DSP 處理，適合確認原始輸出、裝置取樣率和 bit-perfect 候選狀態。',
  'dsp.panel.safety.routeInput': '輸入',
  'dsp.panel.safety.routeHeadroom': '餘量',
  'dsp.panel.safety.routeProcess': '處理',
  'dsp.panel.safety.routeOutput': '輸出',
  'dsp.panel.safety.checkBitPerfect': 'Bit-perfect',
  'dsp.panel.safety.checkLimiter': '保護限制器',
  'dsp.panel.safety.disableLimiter': '關閉保護限制器',
  'dsp.panel.safety.enableLimiter': '啟用保護限制器',
  'dsp.panel.safety.limiterBypassed': '已旁路',
  'dsp.panel.safety.limiterBypassedDetail': '最終保護限制器已關閉，熱輸出可能削波或失真。',
  'dsp.panel.safety.limiterToggleTitle': '保護限制器',
  'dsp.panel.safety.checkRoom': 'FIR',
  'dsp.panel.safety.checkChannel': '聲道工具',
  'dsp.panel.safety.note': '削波保護顯示僅供參考；最終仍要用耳朵聽是否失真、刺耳或壓縮感過強。',
  'dsp.room.status.active': '已啟用',
  'dsp.room.status.empty': '未載入',
  'dsp.room.status.error': '錯誤',
  'dsp.room.status.loaded': '已載入',
  'dsp.stage.input': '輸入',
  'dsp.stage.output': '輸出',
  'dsp.stage.shape': '塑形',
  'dsp.stage.space': '空間',
  'dsp.stage.stereo': '聲道',
  'dsp.status.active': '已啟用',
  'dsp.status.auto': '自動',
  'dsp.status.balanceActive': '聲道處理中',
  'dsp.status.bypassed': '已旁路',
  'dsp.status.candidate': '候選',
  'dsp.status.clear': '正常',
  'dsp.status.direct': '直通',
  'dsp.status.disabledByDsp': 'DSP 路徑',
  'dsp.status.dspPath': 'DSP 路徑',
  'dsp.status.flat': 'Flat',
  'dsp.status.headroomRisk': '餘量風險',
  'dsp.status.limiterArmed': '待命',
  'dsp.status.limiting': '正在限幅',
  'dsp.status.modulesActive': '{count} 個模組啟用',
  'dsp.status.nativeDirect': 'Bit-perfect 路徑',
  'dsp.status.noIr': '無 IR',
  'dsp.status.none': '無',
  'dsp.status.protected': '已保護',
  'dsp.status.ready': '就緒',
  'dsp.status.risk': '風險',
  'dsp.status.riskDetected': '檢測到風險',
  'dsp.status.shared': 'shared',
  'dsp.status.signalProtected': '訊號安全',
  'dsp.status.stereoDirect': '立體聲直通',
  'dsp.status.systemOutput': '系統輸出',
};

const dspLocalTextJaJP: Record<string, string> = {
  'dsp.panel.sdm.sound.compare': 'サウンドプロファイル A/B',
  'dsp.panel.sdm.sound.compareDetail': 'A/B では FIR のみを切り替え、DSD レート、モジュレーター、ヘッドルーム、出力経路は維持します。再生中は 3 秒のリードイン付きで同じ箇所に戻ります。',
  'dsp.panel.sdm.sound.compareLinear': 'A/B Linear 基準',
  'dsp.panel.sdm.sound.compareRestore': '復元',
  'dsp.panel.sdm.sound.dsd512CudaRequired': 'DSD512 の Transient / Smooth は識別性の高い長い FIR を使用するため、CPU のリアルタイム判定を通過しません。CUDA を選択してください。デバイスを開く前にネイティブホストが実際の余裕を再検証します。',
  // Japanese local DSP strings
  'dsp.action.clear': 'クリア',
  'dsp.action.disableChannel': 'チャンネル補正をオフ',
  'dsp.action.disableFir': 'FIR をオフ',
  'dsp.action.enableChannel': 'チャンネル補正をオン',
  'dsp.action.enableFir': 'FIR をオン',
  'dsp.action.enableFirSafely': '安全に有効化',
  'dsp.action.importIr': 'IR をインポート',
  'dsp.action.refresh': '状態を更新',
  'dsp.action.reset': 'リセット',
  'dsp.action.save': '保存',
  'dsp.aria.chain': 'DSP モジュールチェーン',
  'dsp.aria.modules': 'DSP モジュール',
  'dsp.aria.pipeline': 'DSP pipeline',
  'dsp.aria.workspace': 'DSP ワークスペース',
  'dsp.brand.subtitle': 'Signal Control',
  'dsp.section.advanced': '詳細設定',
  'dsp.module.src.description': 'PCM サンプルレート変換',
  'dsp.module.src.title': 'ECHO SRC / アップサンプリング',
  'dsp.panel.src.abBypass': 'A/B ネイティブ',
  'dsp.panel.src.abRestore': 'アップサンプリングを復元',
  'dsp.panel.src.active': 'アップサンプリング中',
  'dsp.panel.src.bypassDsd': 'DSD 出力バイパス',
  'dsp.panel.src.bypassShared': '共有出力バイパス',
  'dsp.panel.src.detail': 'A local ECHO SRC engine independent from HQPlayer. It is off by default; once enabled it enters the DSP path and no longer reports bit-perfect.',
  'dsp.panel.src.engine': 'エンジン',
  'dsp.panel.src.advanced': '詳細',
  'dsp.panel.src.advancedSummary': 'Advanced mode shows poly-sinc / FIR / GPU planning; live playback follows the active/fallback state in Signal Path.',
  'dsp.panel.src.compute': 'Compute',
  'dsp.panel.src.compute.cpuDetail': 'Default realtime path: stable, low scheduling risk, and playback-safe first.',
  'dsp.panel.src.compute.cpuStatus': 'CPU realtime path. CUDA is not requested.',
  'dsp.panel.src.compute.gpuBadge': 'GPU',
  'dsp.panel.src.compute.gpuDetail': 'Experimental path for very long filters and larger buffers; latency and underruns must be verified before engine hookup.',
  'dsp.panel.src.dither.activeStatus': 'Active on integer output / {bits}-bit',
  'dsp.panel.src.dither.floatSafe': 'バイパス float output',
  'dsp.panel.src.dither.floatStatus': 'Current output is float, so dither is bypassed',
  'dsp.panel.src.dither.highpassDetail': 'High-pass TPDF pushes dither energy away from low frequencies for 16-bit output and quiet tails.',
  'dsp.panel.src.dither.integerOnly': 'Integer output only',
  'dsp.panel.src.dither.ns5Detail': '5th-order noise shaping lowers mid/low-band quantization texture with modest risk.',
  'dsp.panel.src.dither.ns9Detail': '9th-order noise shaping pushes more noise upward for 24-bit or high-headroom chains.',
  'dsp.panel.src.dither.offDetail': 'Keep the Float32 PCM path untouched. Off by default to avoid pointless added noise.',
  'dsp.panel.src.dither.offStatus': 'オフ',
  'dsp.panel.src.dither.pendingStatus': 'Waiting for integer output format',
  'dsp.panel.src.dither.title': 'PCM Dither / Noise Shaping',
  'dsp.panel.src.dither.tpdfDetail': 'Standard TPDF, the safest quantization dither for 16-bit or 24-bit integer output.',
  'dsp.panel.src.dither.ultraDetail': 'Ultra-shaped profile with the strongest shaping; cleaner tails, but more demanding of headroom and output chain.',
  'dsp.panel.src.ladder.hifi': 'HiFi',
  'dsp.panel.src.ladder.hifiDetail': '4x / gauss-long 1x / hb Nx / CPU. Softer presentation with moderate realtime pressure.',
  'dsp.panel.src.ladder.insane': 'Insane / オフライン-like',
  'dsp.panel.src.ladder.insaneDetail': '8x / apod-long plus ext2-xl / CUDA. Very heavy, meant for near-offline PCM experiments.',
  'dsp.panel.src.ladder.latencyExtreme': 'Extreme latency',
  'dsp.panel.src.ladder.latencyHigh': 'High latency',
  'dsp.panel.src.ladder.latencyLow': 'Low latency',
  'dsp.panel.src.ladder.latencyMedium': 'Medium latency',
  'dsp.panel.src.ladder.realtimeSafe': 'リアルタイム Safe',
  'dsp.panel.src.ladder.realtimeSafeDetail': '4x / hb 1x+Nx / CPU. Prioritizes no stutter and responsive UI.',
  'dsp.panel.src.ladder.reference': 'Reference',
  'dsp.panel.src.ladder.referenceDetail': '8x / apod-minring 1x / ext2-long Nx / CUDA. Prioritizes audible change and transparency.',
  'dsp.panel.src.ladder.title': 'CPU/GPU Quality Ladder',
  'dsp.panel.src.cuda.pending': 'CUDA runtime is ready; FIR worker is not active yet.',
  'dsp.panel.src.cuda.ready': '{device} / {memory} / Driver {driver} / CUDA {cuda}',
  'dsp.panel.src.cuda.lowUtilization': 'Real-time audio uses small low-latency blocks, so low GPU utilization does not mean CUDA is inactive; trust CUDA FIR active in the live playback state.',
  'dsp.panel.src.cuda.unavailable': 'CUDA unavailable: {reason}',
  'dsp.panel.src.cuda.guide.driverStep1': 'Install or update NVIDIA App / official GeForce, Studio, or RTX drivers.',
  'dsp.panel.src.cuda.guide.driverStep2': 'Restart Windows after installation, then reopen ECHO.',
  'dsp.panel.src.cuda.guide.driverStep3': '状態を更新 here; if it is still unavailable, confirm nvidia-smi runs in Windows.',
  'dsp.panel.src.cuda.guide.driverTitle': 'NVIDIA driver required',
  'dsp.panel.src.cuda.guide.genericStep1': 'Update the official NVIDIA driver first, then restart the system.',
  'dsp.panel.src.cuda.guide.genericStep2': 'Reopen ECHO and refresh status.',
  'dsp.panel.src.cuda.guide.genericStep3': 'If it still fails, use CPU FIR / SOXR and check the diagnostic reason.',
  'dsp.panel.src.cuda.guide.genericTitle': 'CUDA needs attention',
  'dsp.panel.src.cuda.guide.problem': 'Detected: {reason}',
  'dsp.panel.src.cuda.guide.runtimeStep1': 'Update the NVIDIA driver and restart the system.',
  'dsp.panel.src.cuda.guide.runtimeStep2': 'Try a lighter filter or a lower upsampling factor to verify stability.',
  'dsp.panel.src.cuda.guide.runtimeStep3': 'If it keeps failing, ECHO falls back to CPU FIR instead of pretending GPU is active.',
  'dsp.panel.src.cuda.guide.runtimeTitle': 'CUDA runtime failed',
  'dsp.panel.src.cuda.guide.title': 'CUDA installation guide',
  'dsp.panel.src.cuda.guide.workerStep1': 'This is usually not a user driver issue; the current ECHO package is missing the CUDA FIR component.',
  'dsp.panel.src.cuda.guide.workerStep2': 'Install an ECHO build that includes the CUDA FIR worker, or rebuild with CUDA enabled.',
  'dsp.panel.src.cuda.guide.workerStep3': 'Until the component exists, playback falls back to CPU FIR / SOXR.',
  'dsp.panel.src.cuda.guide.workerTitle': 'ECHO CUDA component missing',
  'dsp.panel.src.cuda.reason.driverMissing': 'NVIDIA driver or nvidia-smi was not detected',
  'dsp.panel.src.cuda.reason.driverUnreadable': 'NVIDIA driver probe returned an unexpected result',
  'dsp.panel.src.cuda.reason.workerCpuOnly': 'ECHO CUDA worker was built without CUDA',
  'dsp.panel.src.cuda.reason.workerMissing': 'ECHO CUDA worker is not bundled',
  'dsp.panel.src.cuda.reason.workerRuntime': 'CUDA worker failed or timed out during playback',
  'dsp.panel.src.cuda.reason.workerStopped': 'CUDA worker stopped with pause or route switching; waiting for the next playback state',
  'dsp.panel.src.filter': 'フィルター',
  'dsp.panel.src.filter.apodFastDetail': 'Fast apodizing profile: earlier cutoff with medium taps to suppress ringing left by old filters or MP3 sources.',
  'dsp.panel.src.filter.apodGaussDetail': 'Gaussian apodizing profile: softer early rolloff for a smoother presentation with calmer treble edges.',
  'dsp.panel.src.filter.apodLongDetail': 'Long-tap apodizing profile: early rolloff plus high stopband rejection for old ADC / brickwall pre-ringing.',
  'dsp.panel.src.filter.apodMinringDetail': 'Minimum-phase apodizing profile: lowers pre-ringing and attenuates source ringing for the most audible PCM change.',
  'dsp.panel.src.filter.closedFormDetail': '閉じるd-form sinc interpolation direction for later baseline comparison.',
  'dsp.panel.src.filter.collapse': 'Show curated',
  'dsp.panel.src.filter.expand': 'Show all',
  'dsp.panel.src.filter.gpuCpu': 'CPU / entry GPU',
  'dsp.panel.src.filter.gpuRtx5060': 'RTX 5060+ suggested',
  'dsp.panel.src.filter.gpuRtx5070': 'RTX 5070+ suggested',
  'dsp.panel.src.filter.gpuRtx5070Ti': 'RTX 5070 Ti+ suggested',
  'dsp.panel.src.filter.gpuRtx5080': 'RTX 5080+ suggested',
  'dsp.panel.src.filter.gpuRtx5090': 'RTX 5090 / 32GB suggested',
  'dsp.panel.src.filter.loadHigh': 'High load',
  'dsp.panel.src.filter.loadExtreme': 'Extreme load',
  'dsp.panel.src.filter.loadLight': 'Light load',
  'dsp.panel.src.filter.loadMedium': 'Medium load',
  'dsp.panel.src.filter.loadResearch': 'Research',
  'dsp.panel.src.filter.loadVeryHigh': 'Very high',
  'dsp.panel.src.filter.minringFirLpDetail': 'Minimum-ringing FIR with low pre-ringing and a closer presentation.',
  'dsp.panel.src.filter.minringFirMpDetail': 'Minimum-ringing medium-precision profile with lower pre-ringing and more transparency.',
  'dsp.panel.src.filter.minringFirXlaDetail': 'Extra-long minimum-ringing profile for natural presentation with much higher compute cost.',
  'dsp.panel.src.filter.minringFirSoftDetail': 'Gaussian-windowed minimum-ringing profile for a softer, closer, less aggressive presentation.',
  'dsp.panel.src.filter.minringFirExtremeDetail': '3071-tap minimum-ringing profile for stronger audible change and more natural transients.',
  'dsp.panel.src.filter.polySincExt2HiresLpDetail': 'Hi-res ext2 linear-phase profile prepared for the Nx path.',
  'dsp.panel.src.filter.polySincExt2HiresMpDetail': 'Hi-res ext2 minimum-phase profile that lowers pre-ringing while preserving air.',
  'dsp.panel.src.filter.polySincExt3LongDetail': 'Long-tap ext3 linear-phase profile with a narrower transition band and stronger stopband rejection.',
  'dsp.panel.src.filter.polySincExt3XlaDetail': '4095-tap ext3 extreme linear-phase profile for RTX 5090 or offline-like A/B stress tests.',
  'dsp.panel.src.filter.polySincExt2ShortDetail': 'Short-tap ext2 profile that keeps the high-precision direction more realtime-friendly.',
  'dsp.panel.src.filter.polySincExt2LongDetail': 'Long-tap linear-phase target, transparency first, close to a long profile direction.',
  'dsp.panel.src.filter.polySincExt2MediumDetail': 'Medium-tap ext2 profile balancing transparency and compute cost.',
  'dsp.panel.src.filter.polySincExt2XlDetail': '3071-tap ext2 extreme profile for high-end CUDA and offline-grade listening tests.',
  'dsp.panel.src.filter.polySincExt2XlaDetail': 'Extra-long taps for future 8x / Ultra precision profiles.',
  'dsp.panel.src.filter.polySincGaussHiresLpDetail': 'Hi-res linear-phase gaussian window with a smoother sound while preserving placement.',
  'dsp.panel.src.filter.polySincGaussHiresMpDetail': 'Hi-res minimum-phase gaussian window aimed at lower pre-ringing feel.',
  'dsp.panel.src.filter.polySincGaussLongDetail': 'Gaussian-windowed poly-sinc for a smoother presentation while preserving transients.',
  'dsp.panel.src.filter.polySincGaussXlDetail': '3071-tap gaussian extreme profile with a smooth direction and very high GPU demand.',
  'dsp.panel.src.filter.polySincGaussXlaDetail': 'Extra-long gaussian profile prepared for A/B and measurement comparison.',
  'dsp.panel.src.filter.polySincGaussXtrLongDetail': 'Long gauss-xtr profile with stronger gaussian shaping for smoother edges.',
  'dsp.panel.src.filter.polySincGaussXtrXlaDetail': '4095-tap gauss-xtr profile for a very smooth, thicker, less edgy direction.',
  'dsp.panel.src.filter.polySincHbDetail': 'Halfband poly-sinc suited to a stable realtime 2x/4x first pass.',
  'dsp.panel.src.filter.polySincXtrLpDetail': 'Long xtr linear-phase profile with a transparent target and higher realtime demands.',
  'dsp.panel.src.filter.polySincXtrShortLpDetail': 'Short xtr linear-phase profile for realtime transparency tradeoffs.',
  'dsp.panel.src.filter.polySincXtrShortMpDetail': 'Short xtr minimum-phase profile for natural feel and lower pre-ringing.',
  'dsp.panel.src.filter.polySincXtrXlaDetail': 'Extreme xtr minimum-phase profile, listening-oriented and very hardware hungry.',
  'dsp.panel.src.filter.polySincXtrMpDetail': 'Medium-phase direction that reduces pre-ringing feel for a listening-oriented profile.',
  'dsp.panel.src.filter.apodXtrDetail': '3071-tap apodizing profile with early rolloff for stronger old-filter ringing cleanup.',
  'dsp.panel.src.filter.apodExtremeDetail': '4095-tap minimum-phase apodizing profile for the strongest source-ringing cleanup direction.',
  'dsp.panel.src.filter.brickwallLongDetail': 'Hard comparison profile: high cutoff, narrow transition, and strong stopband rejection.',
  'dsp.panel.src.filter.softKneeLongDetail': 'Soft-knee comparison profile with earlier gentle rolloff for smoother long-session listening.',
  'dsp.panel.src.filter.selected': 'Selected filter',
  'dsp.panel.src.filter.sincLDetail': 'Large sinc baseline for high-precision reference and listening comparison.',
  'dsp.panel.src.filter.sincLongHDetail': 'Higher-precision sinc-long variant for a heavier linear-phase baseline.',
  'dsp.panel.src.filter.sincLongDetail': 'Long sinc baseline for calibrating FIR design and listening differences.',
  'dsp.panel.src.filter.sincMDetail': 'Medium sinc baseline with lower compute cost.',
  'dsp.panel.src.filter.sincXlaDetail': 'Extra-long sinc baseline for stress testing and comparing extreme filters.',
  'dsp.panel.src.kicker': 'Sample-rate conversion',
  'dsp.panel.src.mode': 'モード',
  'dsp.panel.src.mode.family2x': '2x PCM',
  'dsp.panel.src.mode.family2xDetail': 'Upsample the 44.1k family to 88.2k and the 48k family to 96k.',
  'dsp.panel.src.mode.family4x': '4x PCM',
  'dsp.panel.src.mode.family4xDetail': 'Upsample the 44.1k family to 176.4k and the 48k family to 192k.',
  'dsp.panel.src.mode.family8x': '8x Ultra',
  'dsp.panel.src.mode.family8xDetail': 'Experimental: upsample the 44.1k family to 352.8k and the 48k family to 384k.',
  'dsp.panel.src.mode.compatibility48': '48 kHz compatibility',
  'dsp.panel.src.mode.compatibility48Detail': 'Convert PCM to a fixed 48 kHz for exclusive headphones or audio devices that only accept 48 kHz. Off by default.',
  'dsp.panel.src.mode.off': 'オフ',
  'dsp.panel.src.mode.offDetail': 'Keep the source sample rate. ECHO SRC does not affect bit-perfect conditions.',
  'dsp.panel.src.modeSwitch': 'ECHO SRC control mode',
  'dsp.panel.src.native': 'ネイティブ direct',
  'dsp.panel.src.normal': 'Normal',
  'dsp.panel.src.notConnected': 'Not connected to playback',
  'dsp.panel.src.note': 'PCM only. Upsampling is not stacked when shared output, DSD output, or HQPlayer takes over.',
  'dsp.panel.src.pending': 'Waiting for the next playback plan',
  'dsp.panel.src.precision': 'Precision',
  'dsp.panel.src.quality': 'Quality profile',
  'dsp.panel.src.quality.balanced': 'Balanced',
  'dsp.panel.src.quality.balancedDetail': 'Keep the existing SOXR profile while balancing stability and cost.',
  'dsp.panel.src.quality.lowLatency': 'Low latency',
  'dsp.panel.src.quality.lowLatencyDetail': 'Reduce SRC cost for low-latency output.',
  'dsp.panel.src.quality.transparent': 'Transparent',
  'dsp.panel.src.quality.transparentDetail': 'Highest precision SOXR, prioritizing transparency and low distortion.',
  'dsp.panel.src.recommended': 'Recommended',
  'dsp.panel.src.route': 'Route',
  'dsp.panel.src.sourceRate': 'Source rate',
  'dsp.panel.src.targetRate': '目標レート',
  'dsp.stage.src': 'サンプルレート',
  'dsp.error.channelBridge': 'Channel tools are unavailable.',
  'dsp.error.desktopBridge': 'Desktop bridge is unavailable.',
  'dsp.error.dspBridge': 'DSP bridge is unavailable.',
  'dsp.error.firBridge': 'FIR bridge is unavailable.',
  'dsp.label.bitPerfect': 'Bit-perfect',
  'dsp.label.currentModule': 'Current module',
  'dsp.label.module': 'DSP module',
  'dsp.label.moduleStatus': 'Module status',
  'dsp.label.output': 'Output',
  'dsp.metric.bitPerfect': 'Bit-perfect',
  'dsp.metric.clipping': 'Clipping',
  'dsp.metric.dsp': 'DSP',
  'dsp.metric.inputPeak': 'Input peak',
  'dsp.metric.ir': 'IR',
  'dsp.metric.latency': 'Latency',
  'dsp.metric.liveHeadroom': 'Live headroom',
  'dsp.metric.truePeak': 'True Peak',
  'dsp.metric.mode': 'モード',
  'dsp.metric.outputEstimate': 'Output estimate',
  'dsp.metric.reason': 'Reason',
  'dsp.metric.sampleRate': 'サンプルレート',
  'dsp.metric.taps': 'Taps',
  'dsp.module.channel.description': 'Balance, delay, mono',
  'dsp.module.channel.title': 'Channel tools',
  'dsp.module.eq.description': 'Bands, preamp, presets',
  'dsp.module.eq.title': 'Parametric EQ',
  'dsp.module.headroom.description': 'Reserve DSP headroom',
  'dsp.module.headroom.title': 'ヘッドルーム',
  'dsp.module.headphone.description': 'OPRA headphone curves',
  'dsp.module.headphone.title': 'Headphone correction',
  'dsp.module.room.description': 'IR convolution only',
  'dsp.module.room.title': 'FIR / ルーム補正',
  'dsp.module.safety.description': 'Final output monitor',
  'dsp.module.safety.title': 'Output safety',
  'dsp.module.sdm.description': 'DSD / SDM truth path',
  'dsp.module.sdm.title': 'ECHO SDM / DSD (Beta)',
  'dsp.panel.sdm.capability': 'Capability',
  'dsp.panel.sdm.capabilityDetail': 'ECHO can verify ネイティブ DSD, DoP, and independent PCM -> SDM. SDM does not depend on the Lab DSD passthrough switch.',
  'dsp.panel.sdm.detail': 'Shows whether the current track really uses DSD, DoP, native DSD, or the independent PCM -> SDM path.',
  'dsp.panel.sdm.dop': 'DoP passthrough',
  'dsp.panel.sdm.dopDetail': 'Local DSF attempts DoP under Exclusive; failures are explicit PCM fallback.',
  'dsp.panel.sdm.fallback': 'Fallback',
  'dsp.panel.sdm.guard': 'Guard',
  'dsp.panel.sdm.guardDetail': 'PCM -> SDM applies this tier headroom automatically and locks very low-level signals to DSD idle to reduce hiss.',
  'dsp.panel.sdm.kicker': 'DSD / sigma-delta monitor',
  'dsp.panel.sdm.modulator': 'PCM -> SDM modulator',
  'dsp.panel.sdm.modulatorCoefficients': 'Feedback coefficients',
  'dsp.panel.sdm.modulatorDither': 'Dither',
  'dsp.panel.sdm.modulatorHeadroom': 'ヘッドルーム target',
  'dsp.panel.sdm.modulatorOrder': 'Order',
  'dsp.panel.sdm.modulatorProfile': 'Modulator profile',
  'dsp.panel.sdm.modulatorStability': 'Stability limit',
  'dsp.panel.sdm.modulatorPending': 'Not routed; check Fallback',
  'dsp.panel.sdm.nativeDsd': 'ネイティブ DSD',
  'dsp.panel.sdm.noDsdSource': 'Current source is not DSD',
  'dsp.panel.sdm.note': 'PCM -> SDM uses the independent ECHO SDM path; the Lab DSD passthrough switch is only for native DSD sources.',
  'dsp.panel.sdm.output': 'Actual output',
  'dsp.panel.sdm.oversampling': 'PCM oversampling',
  'dsp.panel.sdm.oversampling1x': 'Oversampling 1x',
  'dsp.panel.sdm.oversampling1xDetail': 'Low-rate PCM entry filter intent; CUDA 4x/8x runs this as the first ECHO FIR stage.',
  'dsp.panel.sdm.oversamplingEffective': 'Effective slot',
  'dsp.panel.sdm.oversamplingNx': 'Oversampling Nx',
  'dsp.panel.sdm.oversamplingNxDetail': 'High-rate or already-oversampled stage intent; CUDA 4x/8x runs this as later ECHO FIR stages.',
  'dsp.panel.sdm.oversamplingRoute': 'Front-end upsample',
  'dsp.panel.sdm.oversamplingTruth': 'The native host report for FIR stages, backend, and fallback is the active truth.',
  'dsp.panel.sdm.pcmFallback': 'PCM fallback',
  'dsp.panel.sdm.requested': 'Requested',
  'dsp.panel.sdm.source': 'Source',
  'dsp.panel.sdm.transport': 'Transport',
  'dsp.panel.sdm.actual': 'Runtime',
  'dsp.panel.sdm.badge.planned': 'Experimental',
  'dsp.panel.sdm.badge.real': 'Real path',
  'dsp.panel.sdm.badge.safe': 'バイパス safe',
  'dsp.panel.sdm.compute': 'SDM Compute',
  'dsp.panel.sdm.compute.cpuDetail': 'CPU realtime path is routed for the first PCM -> SDM DoP implementation.',
  'dsp.panel.sdm.compute.cudaDetail': 'Includes a native CUDA recursive modulator with device admission; CUDA can still accelerate FIR oversampling when the CPU modulator is faster.',
  'dsp.panel.sdm.mode': 'SDM mode',
  'dsp.panel.sdm.mode.dsdPassthrough': 'DSD passthrough',
  'dsp.panel.sdm.mode.dsdPassthroughDetail': 'Handles native DSD sources through DoP without PCM upsampling.',
  'dsp.panel.sdm.mode.off': 'オフ',
  'dsp.panel.sdm.mode.offDetail': 'PCM and ECHO SRC stay independent; no DSD/SDM output is requested.',
  'dsp.panel.sdm.mode.pcmToDsd': 'PCM -> SDM',
  'dsp.panel.sdm.mode.pcmToDsdDetail': 'Modulates PCM to 1-bit SDM. DSD64-256 can use DoP; the experimental ASIO path can use native DSD.',
  'dsp.panel.sdm.sound': 'SDM sound profile',
  'dsp.panel.sdm.sound.detail': 'Sound profiles change FIR phase, ringing, and roll-off before modulation. Quality controls stability and ultrasonic noise.',
  'dsp.panel.sdm.sound.linear': 'ECHO Linear',
  'dsp.panel.sdm.sound.linearDetail': 'Linear phase and steep roll-off preserve symmetric transients and maximum bandwidth as the neutral reference.',
  'dsp.panel.sdm.sound.linearBadge': 'Neutral / symmetric',
  'dsp.panel.sdm.sound.transient': 'ECHO Transient',
  'dsp.panel.sdm.sound.transientDetail': 'Minimum phase sharply reduces pre-ringing so attacks move forward, with non-linear phase as the trade-off.',
  'dsp.panel.sdm.sound.transientBadge': 'Attack / minimum phase',
  'dsp.panel.sdm.sound.smooth': 'ECHO Smooth',
  'dsp.panel.sdm.sound.smoothDetail': 'Apodizing plus Gaussian roll-off more actively cleans source ringing, with a clearly more conservative high-frequency bandwidth.',
  'dsp.panel.sdm.sound.smoothBadge': 'Soft / apodizing',
  'dsp.panel.sdm.sound.custom': 'Custom FIR',
  'dsp.panel.sdm.quality': 'Modulator / stability',
  'dsp.panel.sdm.quality.hifi': 'HiFi',
  'dsp.panel.sdm.quality.hifiDetail': 'Bounded 6th-order NTF with 4.5 dB modulation safety headroom for daily quality.',
  'dsp.panel.sdm.quality.insane': 'Insane',
  'dsp.panel.sdm.quality.insaneDetail': 'Bounded 8th-order NTF retains 6 dB modulation safety headroom; experimental high-load tier.',
  'dsp.panel.sdm.quality.reference': 'Reference',
  'dsp.panel.sdm.quality.referenceDetail': 'Bounded 7th-order NTF with 4.5 dB modulation safety headroom for measurement and comparison.',
  'dsp.panel.sdm.quality.safe': 'リアルタイム Safe',
  'dsp.panel.sdm.quality.safeDetail': 'Bounded 3rd-order NTF with 3 dB modulation safety headroom; louder while remaining stress-tested.',
  'dsp.panel.sdm.runtime.dsdPassthrough': 'Current track is using DSD passthrough',
  'dsp.panel.sdm.runtime.off': 'Current track is not using SDM',
  'dsp.panel.sdm.runtime.pcmToSdmActive': 'PCM -> SDM is active in the current path',
  'dsp.panel.sdm.runtime.pcmToSdmNotRouted': 'PCM -> SDM is not routed in the current path; check Fallback',
  'dsp.panel.sdm.separateNote': 'SDM is saved separately from PCM/ECHO SRC; it takes over PCM only when the active playback path qualifies.',
  'dsp.panel.sdm.target': 'Target DSD rate',
  'dsp.panel.sdm.target.dsd128Detail': 'Common realtime target; PCM -> SDM is handled by the independent ECHO SDM path.',
  'dsp.panel.sdm.target.dsd256Detail': 'Higher-rate realtime PCM -> SDM target; avoid regular DoP passthrough.',
  'dsp.panel.sdm.target.dsd512Detail': '32x FIR and 22.5792/24.576 MHz native DSD; admitted only on the experimental ASIO path, with explicit rejection elsewhere.',
  'dsp.panel.sdm.target.dsd64Detail': 'Light target for validating whether the ECHO SDM path can output stably.',
  'dsp.panel.channel.advanced': 'Advanced channel',
  'dsp.panel.channel.balance': 'Stereo balance',
  'dsp.panel.channel.bandCompensation': 'Band compensation',
  'dsp.panel.channel.bandHigh': 'High',
  'dsp.panel.channel.bandLow': 'Low',
  'dsp.panel.channel.bandMid': 'Mid',
  'dsp.panel.channel.centered': 'Centered',
  'dsp.panel.channel.compensationDetail': 'Defaults to attenuating the louder side, useful for headphone channel imbalance that cannot be repaired.',
  'dsp.panel.channel.compensationOff': 'オフ',
  'dsp.panel.channel.compensationOn': 'On',
  'dsp.panel.channel.compensationTitle': 'Imbalance compensation',
  'dsp.panel.channel.constantPower': 'Constant power',
  'dsp.panel.channel.delaySkew': 'Delay skew',
  'dsp.panel.channel.he90Hint': 'Start from 0.25 dB and fine tune while listening to centered vocals.',
  'dsp.panel.channel.invertLeft': 'Invert left',
  'dsp.panel.channel.invertRight': 'Invert right',
  'dsp.panel.channel.kicker': 'Channel tools',
  'dsp.panel.channel.leansLeft': 'Left {value}',
  'dsp.panel.channel.leansRight': 'Right {value}',
  'dsp.panel.channel.leftDelay': 'Left delay',
  'dsp.panel.channel.leftGain': 'Left gain',
  'dsp.panel.channel.leftOutput': 'Left output',
  'dsp.panel.channel.leftTooLoud': 'Left side louder',
  'dsp.panel.channel.monoTools': 'Mono / Check',
  'dsp.panel.channel.mono.left': 'Left only',
  'dsp.panel.channel.mono.off': 'Mono off',
  'dsp.panel.channel.mono.right': 'Right only',
  'dsp.panel.channel.mono.sum': 'Sum mono',
  'dsp.panel.channel.note': 'Channel tools are separated from Parametric EQ, for checking stereo image, left/right differences, and mono compatibility.',
  'dsp.panel.channel.modePro': 'Pro',
  'dsp.panel.channel.modeSimple': 'Simple',
  'dsp.panel.channel.presetDefaultName': 'Headphone imbalance compensation',
  'dsp.panel.channel.presetEmpty': 'No saved channel profiles yet.',
  'dsp.panel.channel.presetName': 'プロファイル name',
  'dsp.panel.channel.presetPrompt': 'Name this headphone profile',
  'dsp.panel.channel.presets': 'Headphone profiles',
  'dsp.panel.channel.phaseTools': 'Phase / Routing',
  'dsp.panel.channel.removePreset': 'Remove',
  'dsp.panel.channel.saveCurrent': 'Save current settings',
  'dsp.panel.channel.selectPreset': 'Select profile',
  'dsp.panel.channel.switchPreset': 'Switch',
  'dsp.panel.channel.renamePreset': 'Rename',
  'dsp.panel.channel.renamePrompt': 'Rename this headphone profile',
  'dsp.panel.channel.rightDelay': 'Right delay',
  'dsp.panel.channel.rightGain': 'Right gain',
  'dsp.panel.channel.rightOutput': 'Right output',
  'dsp.panel.channel.rightTooLoud': 'Right side louder',
  'dsp.panel.channel.step': 'Step',
  'dsp.panel.channel.swap': 'Swap left/right',
  'dsp.panel.channel.swapCompensation': 'Swap compensation direction',
  'dsp.panel.channel.safeAttenuation': 'For electrostatic headphones, prefer attenuation compensation to avoid raising output level.',
  'dsp.panel.channel.compare': 'A/B compare',
  'dsp.panel.channel.compareActive': 'バイパスing',
  'dsp.panel.channel.compareHint': 'Temporarily bypass channel processing to compare the stereo image before and after compensation.',
  'dsp.panel.channel.monoHint': 'Sum mono plays both sides; left-only or right-only mutes the other side.',
  'dsp.panel.channel.trimCenter': 'Clear imbalance',
  'dsp.panel.headroom.applyRecommended': 'Apply recommendation',
  'dsp.panel.headroom.applyRecommendedValue': '推奨値 {value} を適用',
  'dsp.panel.headroom.budgetAria': 'ヘッドルーム budget',
  'dsp.panel.headroom.clipCount': 'Clip count',
  'dsp.panel.headroom.clipCountValue': '{count} times',
  'dsp.panel.headroom.guardActive': '有効',
  'dsp.panel.headroom.guardDirect': 'ダイレクト',
  'dsp.panel.headroom.guardStandby': 'Standby',
  'dsp.panel.headroom.guardState': 'Guard state',
  'dsp.panel.headroom.kicker': 'ヘッドルーム management',
  'dsp.panel.headroom.heroSubtitle': 'トランジェントと DSP の動作余裕を確保します。',
  'dsp.panel.headroom.history': '直近 60 秒',
  'dsp.panel.headroom.inputTrace': '入力',
  'dsp.panel.headroom.lastClip': 'Last clip',
  'dsp.panel.headroom.makeConservative': 'Set to -6 dB',
  'dsp.panel.headroom.makeSafe': 'Set to {value}',
  'dsp.panel.headroom.modeAria': 'ヘッドルーム mode',
  'dsp.panel.headroom.modeDaily': 'Daily',
  'dsp.panel.headroom.modeDailyDetail': 'Light DSP reserve.',
  'dsp.panel.headroom.modeDirect': 'ダイレクト',
  'dsp.panel.headroom.modeDirectDetail': 'No extra level reduction.',
  'dsp.panel.headroom.modeDsp': 'DSP',
  'dsp.panel.headroom.modeDspDetail': 'Leave safe space for EQ/FIR.',
  'dsp.panel.headroom.nextDirect': 'Keep direct',
  'dsp.panel.headroom.nextDirectDetail': 'No DSP reserve risk is currently needed.',
  'dsp.panel.headroom.nextHoldRisk': 'Reduce headroom first',
  'dsp.panel.headroom.nextHoldRiskDetail': 'Clipping risk detected. Reserve headroom first.',
  'dsp.panel.headroom.nextProtect': 'Apply protection headroom',
  'dsp.panel.headroom.nextProtectDetail': 'Output is near full scale. Reduce level immediately.',
  'dsp.panel.headroom.nextReady': 'Keep monitoring',
  'dsp.panel.headroom.nextReadyDetail': 'DSP already has safe headroom.',
  'dsp.panel.headroom.nextStandby': 'Keep standby',
  'dsp.panel.headroom.nextStandbyDetail': 'DSP モジュール are enabled, but no risk is detected yet.',
  'dsp.panel.headroom.nextStep': 'Next step',
  'dsp.panel.headroom.nextWatch': 'Watch output',
  'dsp.panel.headroom.nextWatchDetail': 'Output is close to the limit. Watch for clipping.',
  'dsp.panel.headroom.noClip': 'No record',
  'dsp.panel.headroom.note': 'ヘッドルーム only reserves level space; it no longer mixes specific EQ or FIR tuning here.',
  'dsp.panel.headroom.outputTrace': '出力推定',
  'dsp.panel.headroom.presetsAria': 'ヘッドルーム presets',
  'dsp.panel.headroom.primaryAction': 'Apply {value}',
  'dsp.panel.headroom.reasonChannel': 'Channel tools may increase level.',
  'dsp.panel.headroom.reasonClipping': 'Clipping detected.',
  'dsp.panel.headroom.reasonDirect': 'ヘッドルーム only works in the DSP path; when EQ, FIR, and channel tools are all off, native direct is not processed by it.',
  'dsp.panel.headroom.reasonEq': 'EQ curves may increase level.',
  'dsp.panel.headroom.reasonLive': 'Live headroom is low.',
  'dsp.panel.headroom.reasonOutput': 'Estimated output is near full scale.',
  'dsp.panel.headroom.reasonSrcTruePeak': 'ECHO SRC / FIR can reveal intersample peaks; reserve at least -3 dB.',
  'dsp.panel.headroom.reasonRoom': 'FIR / room correction may increase level.',
  'dsp.panel.headroom.reasonSafe': 'Current signal is safe.',
  'dsp.panel.headroom.recommendation': 'Recommendation',
  'dsp.panel.headroom.recommendationSafe': 'Safe',
  'dsp.panel.headroom.reserve': 'Reserve headroom',
  'dsp.panel.headroom.restoreDirect': 'ダイレクトに戻す',
  'dsp.panel.headroom.safePolicy': 'セーフティ first',
  'dsp.panel.headroom.safetyActions': 'Quick protection',
  'dsp.panel.headroom.status': 'Status',
  'dsp.panel.headroom.statusClose': 'Near limit',
  'dsp.panel.headroom.statusRisk': 'Risk detected',
  'dsp.panel.headroom.statusSafe': 'Safe',
  'dsp.panel.headroom.transparentNote': 'デジタルレベルのみを下げ、音色は変えません。',
  'dsp.panel.headroom.waitingSignal': '再生信号を待機中',
  'dsp.panel.room.future.recent': 'Recent IR',
  'dsp.panel.room.future.response': 'Response preview',
  'dsp.panel.room.hero.activeDetail': 'Convolution is participating in the output chain.',
  'dsp.panel.room.hero.activeTitle': 'FIR enabled',
  'dsp.panel.room.hero.emptyDetail': 'インポート an IR before enabling room correction.',
  'dsp.panel.room.hero.emptyTitle': 'No IR loaded',
  'dsp.panel.room.hero.loadedDetail': 'IR is loaded and ready to enable.',
  'dsp.panel.room.hero.loadedTitle': 'IR loaded',
  'dsp.panel.room.hero.state': 'State',
  'dsp.panel.room.kicker': 'Spatial processing',
  'dsp.panel.room.nextEnable': 'FIR をオン',
  'dsp.panel.room.nextEnableDetail': 'IR is ready. Try listening.',
  'dsp.panel.room.nextImport': 'IR をインポート',
  'dsp.panel.room.nextImportDetail': 'Choose a convolution file first.',
  'dsp.panel.room.nextListen': 'Keep listening',
  'dsp.panel.room.nextListenDetail': 'Confirm volume and phase are normal after correction.',
  'dsp.panel.room.nextTrim': 'Lower trim',
  'dsp.panel.room.nextTrimDetail': 'FIR output has clipping risk.',
  'dsp.panel.room.note': 'FIR / room correction only handles convolution and IR; it is no longer mixed with EQ presets.',
  'dsp.panel.room.quickTrim': 'Quick trim',
  'dsp.panel.room.routeTitle': 'Route',
  'dsp.panel.room.safeEnableHint': 'Reserve -6 dB headroom before enabling FIR.',
  'dsp.panel.room.safetyRisk': 'Lower トリム or ヘッドルーム.',
  'dsp.panel.room.safetySafe': 'The output chain is currently safe.',
  'dsp.panel.room.safetyTitle': 'セーフティ',
  'dsp.panel.room.trim': 'トリム',
  'dsp.panel.safety.kicker': 'Output safety',
  'dsp.panel.safety.heroProtectedTitle': 'Output chain protected',
  'dsp.panel.safety.heroProtectedDetail': 'DSP is participating in playback, so output safety continues monitoring clipping, headroom, and bit-perfect route status.',
  'dsp.panel.safety.heroRiskTitle': 'Output risk detected',
  'dsp.panel.safety.heroRiskDetail': 'The current chain has clipping or headroom risk. Lower ヘッドルーム, EQ gain, or FIR トリム first.',
  'dsp.panel.safety.heroDirectTitle': 'ネイティブ direct',
  'dsp.panel.safety.heroDirectDetail': 'When no DSP module is enabled, playback stays on the bit-perfect candidate route and output safety only observes status.',
  'dsp.panel.safety.chainTitle': 'Current chain',
  'dsp.panel.safety.checkTitle': 'セーフティ check',
  'dsp.panel.safety.nextTitle': 'Suggested action',
  'dsp.panel.safety.nextRisk': 'Handle headroom first',
  'dsp.panel.safety.nextRiskDetail': 'Do not keep stacking EQ / FIR gain while risk exists. Lower ヘッドルーム or the related module トリム first.',
  'dsp.panel.safety.nextProtected': 'Keep monitoring',
  'dsp.panel.safety.nextProtectedDetail': 'The chain is in the DSP path and no clipping risk was found. Continue watching live output.',
  'dsp.panel.safety.nextDirect': 'Keep direct',
  'dsp.panel.safety.nextDirectDetail': 'No DSP processing is active. This is suitable for checking original output, device sample rate, and bit-perfect candidate status.',
  'dsp.panel.safety.routeInput': 'Input',
  'dsp.panel.safety.routeHeadroom': 'ヘッドルーム',
  'dsp.panel.safety.routeProcess': 'Process',
  'dsp.panel.safety.routeOutput': 'Output',
  'dsp.panel.safety.checkBitPerfect': 'Bit-perfect',
  'dsp.panel.safety.checkLimiter': 'Protection limiter',
  'dsp.panel.safety.disableLimiter': 'Disable protection limiter',
  'dsp.panel.safety.enableLimiter': 'Enable protection limiter',
  'dsp.panel.safety.limiterBypassed': 'バイパスed',
  'dsp.panel.safety.limiterBypassedDetail': 'The final protection limiter is off. Hot output may clip or distort.',
  'dsp.panel.safety.limiterToggleTitle': 'Protection limiter',
  'dsp.panel.safety.checkRoom': 'FIR',
  'dsp.panel.safety.checkChannel': 'Channel tools',
  'dsp.panel.safety.note': 'Clipping-protection readouts are only a reference; trust your ears for distortion, harshness, or excessive compression.',
  'dsp.room.status.active': '有効',
  'dsp.room.status.empty': 'Not loaded',
  'dsp.room.status.error': 'エラー',
  'dsp.room.status.loaded': 'Loaded',
  'dsp.stage.input': 'Input',
  'dsp.stage.output': 'Output',
  'dsp.stage.shape': 'Shape',
  'dsp.stage.space': 'Space',
  'dsp.stage.stereo': 'Stereo',
  'dsp.status.active': 'Enabled',
  'dsp.status.auto': 'Auto',
  'dsp.status.balanceActive': 'Channel processing',
  'dsp.status.bypassed': 'バイパスed',
  'dsp.status.candidate': 'Candidate',
  'dsp.status.clear': 'クリア',
  'dsp.status.direct': 'ダイレクト',
  'dsp.status.disabledByDsp': 'DSP path',
  'dsp.status.dspPath': 'DSP path',
  'dsp.status.flat': 'Flat',
  'dsp.status.headroomRisk': 'ヘッドルーム risk',
  'dsp.status.limiterArmed': 'Armed',
  'dsp.status.limiting': 'Limiting',
  'dsp.status.modulesActive': '{count} modules active',
  'dsp.status.nativeDirect': 'Bit-perfect path',
  'dsp.status.noIr': 'No IR',
  'dsp.status.none': 'なし',
  'dsp.status.protected': 'Protected',
  'dsp.status.ready': 'Ready',
  'dsp.status.risk': 'Risk',
  'dsp.status.riskDetected': 'Risk detected',
  'dsp.status.shared': 'shared',
  'dsp.status.signalProtected': 'Signal protected',
  'dsp.status.stereoDirect': 'Stereo direct',
  'dsp.status.systemOutput': 'System output',
};

const dspLocalTextKoKR: Record<string, string> = {
  ...dspLocalTextEnUS,
  'dsp.action.clear': '지우기',
  'dsp.action.disableChannel': '채널 보정 끄기',
  'dsp.action.disableFir': 'FIR 끄기',
  'dsp.action.enableChannel': '채널 보정 켜기',
  'dsp.action.enableFir': 'FIR 켜기',
  'dsp.action.enableFirSafely': '안전하게 켜기',
  'dsp.action.importIr': 'IR 가져오기',
  'dsp.action.refresh': '상태 새로 고침',
  'dsp.action.reset': '초기화',
  'dsp.action.save': '저장',
  'dsp.aria.chain': 'DSP 모듈 체인',
  'dsp.aria.modules': 'DSP 모듈',
  'dsp.aria.pipeline': 'DSP 파이프라인',
  'dsp.aria.workspace': 'DSP 작업 영역',
  'dsp.section.advanced': '고급 설정',
  'dsp.module.src.description': 'PCM 샘플 레이트 변환',
  'dsp.module.src.title': 'ECHO SRC / 업샘플링',
  'dsp.panel.src.abBypass': 'A/B 원음',
  'dsp.panel.src.abRestore': '업샘플링 복원',
  'dsp.panel.src.active': '업샘플링 활성화됨',
  'dsp.panel.src.bypassDsd': 'DSD 출력 우회',
  'dsp.panel.src.bypassShared': '공유 출력 우회',
  'dsp.panel.src.engine': '엔진',
  'dsp.panel.src.advanced': '고급',
  'dsp.panel.src.compute': '계산',
  'dsp.panel.src.compute.gpuBadge': 'GPU',
  'dsp.panel.src.dither.offStatus': '끔',
  'dsp.panel.src.dither.title': 'PCM 디더 / 노이즈 셰이핑',
  'dsp.panel.src.ladder.hifi': "하이파이",
  'dsp.panel.src.ladder.insane': 'Insane / 오프라인 유사',
  'dsp.panel.src.ladder.latencyExtreme': '매우 높은 지연',
  'dsp.panel.src.ladder.latencyHigh': '높은 지연',
  'dsp.panel.src.ladder.latencyLow': '낮은 지연',
  'dsp.panel.src.ladder.latencyMedium': '중간 지연',
  'dsp.panel.src.ladder.realtimeSafe': '실시간 안전',
  'dsp.panel.src.ladder.reference': '레퍼런스',
  'dsp.panel.src.ladder.title': 'CPU/GPU 품질 단계',
  'dsp.panel.src.mode': '모드',
  'dsp.panel.src.native': '네이티브',
  'dsp.panel.src.normal': '일반',
  'dsp.panel.src.notConnected': '연결되지 않음',
  'dsp.panel.src.precision': '정밀도',
  'dsp.panel.src.quality': '품질',
  'dsp.panel.src.recommended': '권장',
  'dsp.panel.src.route': '경로',
  'dsp.panel.src.sourceRate': '소스 샘플 레이트',
  'dsp.panel.src.targetRate': '목표 샘플 레이트',
  'dsp.stage.input': '입력',
  'dsp.stage.output': '출력',
  'dsp.stage.shape': '셰이핑',
  'dsp.stage.space': '공간',
  'dsp.stage.stereo': '스테레오',
  'dsp.status.active': '활성화됨',
  'dsp.status.auto': '자동',
  'dsp.status.balanceActive': '채널 처리 중',
  'dsp.status.bypassed': '우회됨',
  'dsp.status.candidate': '후보',
  'dsp.status.clear': '지우기',
  'dsp.status.direct': '직접',
  'dsp.status.disabledByDsp': 'DSP 경로',
  'dsp.status.flat': '플랫',
  'dsp.status.headroomRisk': '헤드룸 위험',
  'dsp.status.limiterArmed': '대기 중',
  'dsp.status.limiting': '리미팅 중',
  'dsp.status.modulesActive': '활성 모듈 {count}개',
  'dsp.status.nativeDirect': '비트 퍼펙트 경로',
  'dsp.status.noIr': 'IR 없음',
  'dsp.status.none': '없음',
  'dsp.status.protected': '보호됨',
  'dsp.status.ready': '준비됨',
  'dsp.status.risk': '위험',
  'dsp.status.riskDetected': '위험 감지됨',
  'dsp.status.signalProtected': '신호 보호됨',
  'dsp.status.stereoDirect': '스테레오 직접 출력',
  'dsp.status.systemOutput': '시스템 출력',

  "dsp.panel.sdm.sound.compare": "사운드 프로필 A/B",
  "dsp.panel.sdm.sound.compareDetail": "A/B는 FIR만 변경합니다. DSD 타겟, 변조기, 헤드룸 및 출력 경로는 변경되지 않습니다. 재생 중에는 3초 도입부와 함께 동일한 발췌 부분으로 돌아갑니다.",
  "dsp.panel.sdm.sound.compareLinear": "A/B 선형 참조",
  "dsp.panel.sdm.sound.compareRestore": "복원",
  "dsp.panel.sdm.sound.dsd512CudaRequired": "DSD512 Transient/Smooth는 CPU 실시간 승인을 통과하지 못하는 특유의 긴 FIR을 사용합니다. CUDA를 선택하십시오. 네이티브 호스트는 장치를 열기 전에 실제 헤드룸을 확인합니다.",
  "dsp.brand.subtitle": "신호 제어",
  "dsp.panel.src.detail": "HQPlayer와 독립된 로컬 ECHO SRC 엔진. 기본적으로 꺼져 있습니다. 활성화되면 DSP 경로로 들어가고 더 이상 비트 완벽을 보고하지 않습니다.",
  "dsp.panel.src.advancedSummary": "고급 모드에서는 폴리싱크/FIR/GPU 계획을 보여줍니다. 실시간 재생은 신호 경로의 활성/대체 상태를 따릅니다.",
  "dsp.panel.src.compute.cpuDetail": "기본 실시간 경로: 안정적이고 일정 위험이 낮으며 재생 안전이 우선입니다.",
  "dsp.panel.src.compute.cpuStatus": "CPU 실시간 경로. CUDA는 요청되지 않습니다.",
  "dsp.panel.src.compute.gpuDetail": "매우 긴 필터와 더 큰 버퍼에 대한 실험 경로입니다. 엔진을 연결하기 전에 대기 시간과 언더런을 확인해야 합니다.",
  "dsp.panel.src.dither.activeStatus": "정수 출력에서 ​​활성화 / {bits}-비트",
  "dsp.panel.src.dither.floatSafe": "부동 소수점 출력 우회",
  "dsp.panel.src.dither.floatStatus": "현재 출력은 부동이므로 디더링이 우회됩니다",
  "dsp.panel.src.dither.highpassDetail": "하이패스 TPDF는 16비트 출력과 조용한 테일을 위해 낮은 주파수에서 디더 에너지를 밀어냅니다.",
  "dsp.panel.src.dither.integerOnly": "정수 출력만",
  "dsp.panel.src.dither.ns5Detail": "5차 노이즈 쉐이핑은 적당한 위험으로 중간/저대역 양자화 텍스처를 낮춥니다.",
  "dsp.panel.src.dither.ns9Detail": "9차 노이즈 쉐이핑은 24비트 또는 높은 헤드룸 체인의 경우 더 많은 노이즈를 상향 조정합니다.",
  "dsp.panel.src.dither.offDetail": "Float32 PCM 경로를 그대로 유지하십시오. 무의미한 추가 노이즈를 방지하기 위해 기본적으로 꺼져 있습니다.",
  "dsp.panel.src.dither.pendingStatus": "정수 출력 형식을 기다리는 중",
  "dsp.panel.src.dither.tpdfDetail": "16비트 또는 24비트 정수 출력을 위한 가장 안전한 양자화 디더링인 표준 TPDF.",
  "dsp.panel.src.dither.ultraDetail": "가장 강력한 형태를 갖춘 울트라 형태의 프로파일; 테일은 깔끔하지만 헤드룸과 출력 체인이 더 까다롭습니다.",
  "dsp.panel.src.ladder.hifiDetail": "4x / 가우스 길이 1x / hb Nx / CPU. 적당한 실시간 압력으로 더욱 부드러운 프레젠테이션을 제공합니다.",
  "dsp.panel.src.ladder.insaneDetail": "8x / apod-long 및 ext2-xl / CUDA. 매우 무겁습니다. 오프라인에 가까운 PCM 실험에 적합합니다.",
  "dsp.panel.src.ladder.realtimeSafeDetail": "4x/hb 1x+Nx/CPU. 끊김 현상이 없고 반응성이 뛰어난 UI를 우선시합니다.",
  "dsp.panel.src.ladder.referenceDetail": "8x / apod-minring 1x / ext2-long Nx / CUDA. 가청 변화와 투명성을 우선시합니다.",
  "dsp.panel.src.cuda.pending": "CUDA 런타임이 준비되었습니다. FIR 작업자가 아직 활성화되지 않았습니다.",
  "dsp.panel.src.cuda.ready": "{device} / {memory} / 드라이버 {driver} / CUDA {cuda}",
  "dsp.panel.src.cuda.lowUtilization": "실시간 오디오는 지연 시간이 짧은 작은 블록을 사용하므로 GPU 사용률이 낮다고 해서 CUDA가 비활성 상태라는 의미는 아닙니다. 라이브 재생 상태에서 CUDA FIR 활성을 신뢰하십시오.",
  "dsp.panel.src.cuda.unavailable": "CUDA를 사용할 수 없음: {reason}",
  "dsp.panel.src.cuda.guide.driverStep1": "NVIDIA 앱/공식 GeForce, Studio 또는 RTX 드라이버를 설치하거나 업데이트하세요.",
  "dsp.panel.src.cuda.guide.driverStep2": "설치 후 Windows를 다시 시작한 다음 ECHO를 다시 엽니다.",
  "dsp.panel.src.cuda.guide.driverStep3": "여기에서 상태를 새로 고치세요. 여전히 사용할 수 없는 경우 nvidia-smi가 Windows에서 실행되는지 확인하세요.",
  "dsp.panel.src.cuda.guide.driverTitle": "NVIDIA 드라이버 필요",
  "dsp.panel.src.cuda.guide.genericStep1": "먼저 공식 NVIDIA 드라이버를 업데이트한 다음 시스템을 다시 시작하세요.",
  "dsp.panel.src.cuda.guide.genericStep2": "ECHO를 다시 열고 상태를 새로 고칩니다.",
  "dsp.panel.src.cuda.guide.genericStep3": "그래도 실패하면 CPU FIR/SOXR을 사용하여 진단 이유를 확인하세요.",
  "dsp.panel.src.cuda.guide.genericTitle": "CUDA에 주의가 필요함",
  "dsp.panel.src.cuda.guide.problem": "감지됨: {reason}",
  "dsp.panel.src.cuda.guide.runtimeStep1": "NVIDIA 드라이버를 업데이트하고 시스템을 다시 시작하십시오.",
  "dsp.panel.src.cuda.guide.runtimeStep2": "안정성을 확인하려면 더 가벼운 필터나 더 낮은 업샘플링 계수를 사용해 보십시오.",
  "dsp.panel.src.cuda.guide.runtimeStep3": "계속 실패하면 ECHO는 GPU가 활성화된 척하는 대신 CPU FIR로 대체됩니다.",
  "dsp.panel.src.cuda.guide.runtimeTitle": "CUDA 런타임이 실패했습니다",
  "dsp.panel.src.cuda.guide.title": "CUDA 설치 가이드",
  "dsp.panel.src.cuda.guide.workerStep1": "이는 일반적으로 사용자 드라이버 문제가 아닙니다. 현재 ECHO 패키지에는 CUDA FIR 구성 요소가 없습니다.",
  "dsp.panel.src.cuda.guide.workerStep2": "CUDA FIR 작업자가 포함된 ECHO 빌드를 설치하거나 CUDA를 활성화하여 다시 빌드하세요.",
  "dsp.panel.src.cuda.guide.workerStep3": "구성요소가 존재할 때까지 재생은 CPU FIR/SOXR로 대체됩니다.",
  "dsp.panel.src.cuda.guide.workerTitle": "ECHO CUDA 구성요소 누락",
  "dsp.panel.src.cuda.reason.driverMissing": "NVIDIA 드라이버 또는 nvidia-smi가 감지되지 않았습니다",
  "dsp.panel.src.cuda.reason.driverUnreadable": "NVIDIA 드라이버 프로브가 예상치 못한 결과를 반환했습니다",
  "dsp.panel.src.cuda.reason.workerCpuOnly": "ECHO CUDA 작업자는 CUDA 없이 구축되었습니다",
  "dsp.panel.src.cuda.reason.workerMissing": "ECHO CUDA 작업자는 번들로 제공되지 않습니다.",
  "dsp.panel.src.cuda.reason.workerRuntime": "CUDA 작업자가 재생 중에 실패하거나 시간 초과되었습니다",
  "dsp.panel.src.cuda.reason.workerStopped": "CUDA 작업자가 일시 중지 또는 경로 전환으로 인해 중지되었습니다. 다음 재생 상태를 기다리는 중",
  "dsp.panel.src.filter": "필터",
  "dsp.panel.src.filter.apodFastDetail": "빠른 아포다이징 프로필: 오래된 필터나 MP3 소스로 인한 울림을 억제하기 위해 중간 탭으로 더 일찍 차단합니다.",
  "dsp.panel.src.filter.apodGaussDetail": "가우스 아포다이징 프로필: 더 부드러운 초기 롤오프로 더 차분한 고음 가장자리로 더 부드러운 표현을 제공합니다.",
  "dsp.panel.src.filter.apodLongDetail": "롱탭 아포다이징 프로필: 기존 ADC/브릭월 사전 링잉에 대한 조기 롤오프 및 높은 저지대역 거부.",
  "dsp.panel.src.filter.apodMinringDetail": "최소 위상 아포다이징 프로필: 가장 잘 들리는 PCM 변경을 위해 사전 링잉을 낮추고 소스 링잉을 감쇠합니다.",
  "dsp.panel.src.filter.closedFormDetail": "이후 기준선 비교를 위한 폐쇄형 싱크 보간 방향입니다.",
  "dsp.panel.src.filter.collapse": "엄선된 쇼",
  "dsp.panel.src.filter.expand": "모두 표시",
  "dsp.panel.src.filter.gpuCpu": "CPU / 보급형 GPU",
  "dsp.panel.src.filter.gpuRtx5060": "RTX 5060+ 권장",
  "dsp.panel.src.filter.gpuRtx5070": "RTX 5070+ 권장",
  "dsp.panel.src.filter.gpuRtx5070Ti": "RTX 5070 Ti+ 제안",
  "dsp.panel.src.filter.gpuRtx5080": "RTX 5080+ 권장",
  "dsp.panel.src.filter.gpuRtx5090": "RTX 5090 / 32GB 권장",
  "dsp.panel.src.filter.loadHigh": "높은 부하",
  "dsp.panel.src.filter.loadExtreme": "극한 부하",
  "dsp.panel.src.filter.loadLight": "경부하",
  "dsp.panel.src.filter.loadMedium": "중간 부하",
  "dsp.panel.src.filter.loadResearch": "연구",
  "dsp.panel.src.filter.loadVeryHigh": "매우 높음",
  "dsp.panel.src.filter.minringFirLpDetail": "낮은 사전 링잉과 더 가까운 프리젠테이션을 갖춘 최소 링잉 FIR입니다.",
  "dsp.panel.src.filter.minringFirMpDetail": "사전 링잉이 낮고 투명도가 높은 최소 링잉 중간 정밀도 프로파일입니다.",
  "dsp.panel.src.filter.minringFirXlaDetail": "훨씬 더 높은 컴퓨팅 비용으로 자연스러운 프레젠테이션을 위한 매우 긴 최소 벨소리 프로필입니다.",
  "dsp.panel.src.filter.minringFirSoftDetail": "더 부드럽고, 더 가깝고, 덜 공격적인 프레젠테이션을 위한 가우스 창 최소 울림 프로필입니다.",
  "dsp.panel.src.filter.minringFirExtremeDetail": "더 강한 가청 변화와 보다 자연스러운 과도 현상을 위한 3071탭 최소 링잉 프로파일.",
  "dsp.panel.src.filter.polySincExt2HiresLpDetail": "Nx 경로를 위해 준비된 고해상도 ext2 선형 위상 프로파일.",
  "dsp.panel.src.filter.polySincExt2HiresMpDetail": "공기를 보존하면서 사전 링잉을 낮추는 고해상도 ext2 최소 위상 프로파일.",
  "dsp.panel.src.filter.polySincExt3LongDetail": "더 좁은 전이 대역과 더 강력한 정지 대역 제거 기능을 갖춘 롱탭 ext3 선형 위상 프로파일입니다.",
  "dsp.panel.src.filter.polySincExt3XlaDetail": "RTX 5090 또는 오프라인과 유사한 A/B 스트레스 테스트를 위한 4095탭 ext3 익스트림 선형 위상 프로필.",
  "dsp.panel.src.filter.polySincExt2ShortDetail": "고정밀 방향을 보다 실시간 친화적으로 유지하는 짧은 탭 ext2 프로파일.",
  "dsp.panel.src.filter.polySincExt2LongDetail": "긴 탭 선형 위상 타겟, 투명도 우선, 긴 프로파일 방향에 가깝습니다.",
  "dsp.panel.src.filter.polySincExt2MediumDetail": "투명성과 컴퓨팅 비용의 균형을 유지하는 미디엄 탭 ext2 프로필.",
  "dsp.panel.src.filter.polySincExt2XlDetail": "고급 CUDA 및 오프라인 수준 청취 테스트를 위한 3071탭 ext2 익스트림 프로필.",
  "dsp.panel.src.filter.polySincExt2XlaDetail": "미래의 8x/초정밀 프로파일을 위한 매우 긴 탭입니다.",
  "dsp.panel.src.filter.polySincGaussHiresLpDetail": "배치를 유지하면서 더 부드러운 사운드를 제공하는 고해상도 선형 위상 가우스 창.",
  "dsp.panel.src.filter.polySincGaussHiresMpDetail": "낮은 사전 벨소리 느낌을 목표로 하는 고해상도 최소 위상 가우스 창입니다.",
  "dsp.panel.src.filter.polySincGaussLongDetail": "과도 현상을 유지하면서 더욱 부드러운 표현을 위한 가우시안 윈도우 폴리싱크.",
  "dsp.panel.src.filter.polySincGaussXlDetail": "부드러운 방향과 매우 높은 GPU 수요를 갖춘 3071탭 가우스 익스트림 프로필.",
  "dsp.panel.src.filter.polySincGaussXlaDetail": "A/B 및 측정 비교를 위해 준비된 매우 긴 가우스 프로파일.",
  "dsp.panel.src.filter.polySincGaussXtrLongDetail": "더 부드러운 가장자리를 위해 더 강력한 가우스 형태를 갖춘 긴 gauss-xtr 프로파일.",
  "dsp.panel.src.filter.polySincGaussXtrXlaDetail": "매우 부드럽고 두껍고 덜 날카로운 방향을 위한 4095 탭 gauss-xtr 프로파일.",
  "dsp.panel.src.filter.polySincHbDetail": "안정적인 실시간 2x/4x 첫 번째 패스에 적합한 하프밴드 폴리싱크.",
  "dsp.panel.src.filter.polySincXtrLpDetail": "투명한 타겟과 더 높은 실시간 요구 사항을 갖춘 긴 xtr 선형 위상 프로파일입니다.",
  "dsp.panel.src.filter.polySincXtrShortLpDetail": "실시간 투명성 절충을 위한 짧은 xtr 선형 위상 프로파일.",
  "dsp.panel.src.filter.polySincXtrShortMpDetail": "자연스러운 느낌과 낮은 프리링잉을 위한 짧은 xtr 최소 위상 프로필.",
  "dsp.panel.src.filter.polySincXtrXlaDetail": "극도의 xtr 최소 위상 프로파일, 청취 지향적이며 하드웨어를 많이 사용합니다.",
  "dsp.panel.src.filter.polySincXtrMpDetail": "청취 지향 프로필에 대한 사전 울림 느낌을 줄이는 중간 위상 방향입니다.",
  "dsp.panel.src.filter.apodXtrDetail": "더 강력한 오래된 필터 링잉 정리를 위해 조기 롤오프 기능을 갖춘 3071탭 아포다이징 프로파일.",
  "dsp.panel.src.filter.apodExtremeDetail": "가장 강력한 소스 링잉 정리 방향을 위한 4095탭 최소 위상 아포다이징 프로파일입니다.",
  "dsp.panel.src.filter.brickwallLongDetail": "하드 비교 프로필: 높은 컷오프, 좁은 전환 및 강력한 저지대역 제거.",
  "dsp.panel.src.filter.softKneeLongDetail": "더 부드러운 장시간 세션 청취를 위해 더 빠른 부드러운 롤오프를 갖춘 Soft-knee 비교 프로필입니다.",
  "dsp.panel.src.filter.selected": "선택된 필터",
  "dsp.panel.src.filter.sincLDetail": "고정밀 참조 및 청취 비교를 위한 대규모 싱크 베이스라인.",
  "dsp.panel.src.filter.sincLongHDetail": "더 무거운 선형 위상 기준선을 위한 더 높은 정밀도의 sinc-long 변형입니다.",
  "dsp.panel.src.filter.sincLongDetail": "FIR 설계 및 청취 차이를 보정하기 위한 긴 동기화 기준선입니다.",
  "dsp.panel.src.filter.sincMDetail": "컴퓨팅 비용이 더 낮은 중간 싱크 기준입니다.",
  "dsp.panel.src.filter.sincXlaDetail": "스트레스 테스트 및 극한 필터 비교를 위한 매우 긴 싱크 기준선입니다.",
  "dsp.panel.src.kicker": "샘플링 속도 변환",
  "dsp.panel.src.mode.family2xDetail": "44.1k 계열을 88.2k로, 48k 계열을 96k로 업샘플링합니다.",
  "dsp.panel.src.mode.family4xDetail": "44.1k 제품군을 176.4k로, 48k 제품군을 192k로 업샘플링합니다.",
  "dsp.panel.src.mode.family8x": "8x 울트라",
  "dsp.panel.src.mode.family8xDetail": "실험적: 44.1k 제품군을 352.8k로 업샘플링하고 48k 제품군을 384k로 업샘플링합니다.",
  "dsp.panel.src.mode.compatibility48": "48kHz 호환성",
  "dsp.panel.src.mode.compatibility48Detail": "48kHz만 수신하는 전용 헤드폰이나 오디오 장치의 경우 PCM을 고정 48kHz로 변환합니다. 기본적으로 꺼져 있습니다.",
  "dsp.panel.src.mode.off": "꺼짐",
  "dsp.panel.src.mode.offDetail": "소스 샘플링 속도를 유지합니다. ECHO SRC는 비트 퍼펙트 조건에 영향을 주지 않습니다.",
  "dsp.panel.src.modeSwitch": "ECHO SRC 제어 모드",
  "dsp.panel.src.note": "PCM 전용입니다. 공유 출력, DSD 출력 또는 HQPlayer가 인계되면 업샘플링이 스택되지 않습니다.",
  "dsp.panel.src.pending": "다음 재생 계획을 기다리는 중",
  "dsp.panel.src.quality.balanced": "균형 잡힌",
  "dsp.panel.src.quality.balancedDetail": "안정성과 비용의 균형을 유지하면서 기존 SOXR 프로필을 유지하세요.",
  "dsp.panel.src.quality.lowLatency": "낮은 대기 시간",
  "dsp.panel.src.quality.lowLatencyDetail": "낮은 대기 시간 출력을 위해 SRC 비용을 줄입니다.",
  "dsp.panel.src.quality.transparent": "투명하게",
  "dsp.panel.src.quality.transparentDetail": "투명성과 낮은 왜곡을 우선시하는 최고 정밀도 SOXR.",
  "dsp.stage.src": "샘플링 속도",
  "dsp.error.channelBridge": "채널 도구를 사용할 수 없습니다.",
  "dsp.error.desktopBridge": "데스크톱 브리지를 사용할 수 없습니다.",
  "dsp.error.dspBridge": "DSP 브리지를 사용할 수 없습니다.",
  "dsp.error.firBridge": "FIR 브리지를 사용할 수 없습니다.",
  "dsp.label.bitPerfect": "아주 완벽하게",
  "dsp.label.currentModule": "현재 모듈",
  "dsp.label.module": "DSP 모듈",
  "dsp.label.moduleStatus": "모듈 상태",
  "dsp.label.output": "출력",
  "dsp.metric.bitPerfect": "조금 완벽함",
  "dsp.metric.clipping": "클리핑",
  "dsp.metric.inputPeak": "입력 피크",
  "dsp.metric.latency": "지연 시간",
  "dsp.metric.liveHeadroom": "라이브 헤드룸",
  "dsp.metric.truePeak": "트루 피크",
  "dsp.metric.mode": "모드",
  "dsp.metric.outputEstimate": "출력 추정",
  "dsp.metric.reason": "이유",
  "dsp.metric.sampleRate": "샘플링 속도",
  "dsp.metric.taps": "탭",
  "dsp.module.channel.description": "밸런스, 딜레이, 모노",
  "dsp.module.channel.title": "채널 도구",
  "dsp.module.eq.description": "밴드, 프리앰프, 프리셋",
  "dsp.module.eq.title": "파라메트릭 EQ",
  "dsp.module.headroom.description": "DSP 헤드룸 예약",
  "dsp.module.headroom.title": "헤드룸",
  "dsp.module.headphone.description": "OPRA 헤드폰 곡선",
  "dsp.module.headphone.title": "헤드폰 교정",
  "dsp.module.room.description": "IR 컨볼루션만",
  "dsp.module.room.title": "FIR / 방 수정",
  "dsp.module.safety.description": "최종 출력 모니터",
  "dsp.module.safety.title": "출력 안전",
  "dsp.module.sdm.description": "DSD / SDM 진실 경로",
  "dsp.module.sdm.title": "ECHO SDM/DSD(베타)",
  "dsp.panel.sdm.capability": "능력",
  "dsp.panel.sdm.capabilityDetail": "ECHO는 기본 DSD, DoP 및 독립 PCM -> SDM을 확인할 수 있습니다. SDM은 Lab DSD 패스스루 스위치에 의존하지 않습니다.",
  "dsp.panel.sdm.detail": "현재 트랙이 실제로 DSD, DoP, 기본 DSD 또는 독립 PCM -> SDM 경로를 사용하는지 표시합니다.",
  "dsp.panel.sdm.dop": "DoP 통과",
  "dsp.panel.sdm.dopDetail": "로컬 DSF는 독점 상태에서 DoP를 시도합니다. 실패는 명시적인 PCM 대체입니다.",
  "dsp.panel.sdm.fallback": "대체",
  "dsp.panel.sdm.guard": "경비병",
  "dsp.panel.sdm.guardDetail": "PCM -> SDM은 이 계층 헤드룸을 자동으로 적용하고 매우 낮은 레벨의 신호를 DSD 유휴 상태로 잠가서 히스를 줄입니다.",
  "dsp.panel.sdm.kicker": "DSD / 시그마-델타 모니터",
  "dsp.panel.sdm.modulator": "PCM -> SDM 변조기",
  "dsp.panel.sdm.modulatorCoefficients": "피드백 계수",
  "dsp.panel.sdm.modulatorDither": "디더",
  "dsp.panel.sdm.modulatorHeadroom": "헤드룸 목표",
  "dsp.panel.sdm.modulatorOrder": "주문",
  "dsp.panel.sdm.modulatorProfile": "변조기 프로필",
  "dsp.panel.sdm.modulatorStability": "안정성 한계",
  "dsp.panel.sdm.modulatorPending": "라우팅되지 않았습니다. 대체를 확인하세요",
  "dsp.panel.sdm.nativeDsd": "네이티브 DSD",
  "dsp.panel.sdm.noDsdSource": "현재 소스가 DSD가 아닙니다",
  "dsp.panel.sdm.note": "PCM -> SDM은 독립적인 ECHO SDM 경로를 사용합니다. Lab DSD 패스스루 스위치는 기본 DSD 소스에만 사용됩니다.",
  "dsp.panel.sdm.output": "실제 출력",
  "dsp.panel.sdm.oversampling": "PCM 오버샘플링",
  "dsp.panel.sdm.oversampling1x": "오버샘플링 1x",
  "dsp.panel.sdm.oversampling1xDetail": "저속 PCM 항목 필터 의도; CUDA 4x/8x는 이를 첫 번째 ECHO FIR 단계로 실행합니다.",
  "dsp.panel.sdm.oversamplingEffective": "유효 슬롯",
  "dsp.panel.sdm.oversamplingNx": "오버샘플링 Nx",
  "dsp.panel.sdm.oversamplingNxDetail": "높은 속도 또는 이미 오버샘플링된 무대 의도 CUDA 4x/8x는 이를 이후 ECHO FIR 단계로 실행합니다.",
  "dsp.panel.sdm.oversamplingRoute": "프런트엔드 업샘플",
  "dsp.panel.sdm.oversamplingTruth": "FIR 단계, 백엔드 및 대체에 대한 기본 호스트 보고서는 실제 진실입니다.",
  "dsp.panel.sdm.pcmFallback": "PCM 대체",
  "dsp.panel.sdm.requested": "요청됨",
  "dsp.panel.sdm.source": "출처",
  "dsp.panel.sdm.transport": "운송",
  "dsp.panel.sdm.actual": "런타임",
  "dsp.panel.sdm.badge.planned": "실험적",
  "dsp.panel.sdm.badge.real": "실제 경로",
  "dsp.panel.sdm.badge.safe": "우회 안전",
  "dsp.panel.sdm.compute": "SDM 컴퓨팅",
  "dsp.panel.sdm.compute.cpuDetail": "CPU 실시간 경로는 첫 번째 PCM -> SDM DoP 구현을 위해 라우팅됩니다.",
  "dsp.panel.sdm.compute.cudaDetail": "장치 승인 기능이 있는 기본 CUDA 재귀 변조기가 포함되어 있습니다. CUDA는 CPU 변조기가 더 빠르면 FIR 오버샘플링을 계속 가속화할 수 있습니다.",
  "dsp.panel.sdm.mode": "SDM 모드",
  "dsp.panel.sdm.mode.dsdPassthrough": "DSD 패스스루",
  "dsp.panel.sdm.mode.dsdPassthroughDetail": "PCM 업샘플링 없이 DoP를 통해 기본 DSD 소스를 처리합니다.",
  "dsp.panel.sdm.mode.off": "꺼짐",
  "dsp.panel.sdm.mode.offDetail": "PCM과 ECHO SRC는 독립적으로 유지됩니다. DSD/SDM 출력이 요청되지 않습니다.",
  "dsp.panel.sdm.mode.pcmToDsdDetail": "PCM을 1비트 SDM으로 변조합니다. DSD64-256은 DoP를 사용할 수 있습니다. 실험적인 ASIO 경로는 기본 DSD를 사용할 수 있습니다.",
  "dsp.panel.sdm.sound": "SDM 사운드 프로필",
  "dsp.panel.sdm.sound.detail": "사운드 프로필은 변조 전에 FIR 위상, 벨소리 및 롤오프를 변경합니다. 품질은 톤 사전 설정을 가장하는 대신 안정성과 초음파 소음을 제어합니다.",
  "dsp.panel.sdm.sound.linear": "ECHO 선형",
  "dsp.panel.sdm.sound.linearDetail": "선형 위상 및 가파른 롤오프는 대칭 과도 현상과 최대 대역폭을 중립 기준으로 유지합니다.",
  "dsp.panel.sdm.sound.linearBadge": "중립 / 대칭",
  "dsp.panel.sdm.sound.transient": "에코 과도",
  "dsp.panel.sdm.sound.transientDetail": "최소 단계는 사전 링잉을 대폭 줄여 공격이 앞으로 진행되도록 하고 비선형 단계를 절충합니다.",
  "dsp.panel.sdm.sound.transientBadge": "공격 / 최소 단계",
  "dsp.panel.sdm.sound.smooth": "에코 스무스",
  "dsp.panel.sdm.sound.smoothDetail": "아포다이징과 가우스 롤오프는 확실히 더 보수적인 고주파 대역폭을 통해 소스 링잉을 보다 적극적으로 제거합니다.",
  "dsp.panel.sdm.sound.smoothBadge": "소프트/아포다이징",
  "dsp.panel.sdm.sound.custom": "맞춤형 FIR",
  "dsp.panel.sdm.quality": "변조기 / 안정성",
  "dsp.panel.sdm.quality.hifi": "하이파이",
  "dsp.panel.sdm.quality.hifiDetail": "일일 품질을 위한 4.5dB 변조 안전 헤드룸을 갖춘 제한된 6차 NTF입니다.",
  "dsp.panel.sdm.quality.insane": "미쳤어",
  "dsp.panel.sdm.quality.insaneDetail": "6dB 변조 안전 헤드룸을 유지하는 제한된 8차 NTF; 실험적인 고부하 계층.",
  "dsp.panel.sdm.quality.reference": "참조",
  "dsp.panel.sdm.quality.referenceDetail": "측정 및 비교를 위한 4.5dB 변조 안전 헤드룸을 갖춘 제한된 7차 NTF입니다.",
  "dsp.panel.sdm.quality.safe": "실시간 안전",
  "dsp.panel.sdm.quality.safeDetail": "3dB 변조 안전 헤드룸을 적용해 더 큰 음량과 스트레스 테스트 안정성을 제공하는 제한된 3차 NTF입니다.",
  "dsp.panel.sdm.runtime.dsdPassthrough": "현재 트랙은 DSD 패스스루를 사용하고 있습니다",
  "dsp.panel.sdm.runtime.off": "현재 트랙은 SDM을 사용하지 않습니다",
  "dsp.panel.sdm.runtime.pcmToSdmActive": "PCM -> SDM이 현재 경로에서 활성화되어 있습니다",
  "dsp.panel.sdm.runtime.pcmToSdmNotRouted": "PCM -> SDM은 현재 경로에서 라우팅되지 않습니다. 대체를 확인하세요",
  "dsp.panel.sdm.separateNote": "SDM은 PCM/ECHO SRC와 별도로 저장됩니다. 활성 재생 경로가 자격을 갖춘 경우에만 PCM을 대신합니다.",
  "dsp.panel.sdm.target": "목표 DSD 속도",
  "dsp.panel.sdm.target.dsd128Detail": "일반적인 실시간 타겟. PCM -> SDM은 독립적인 ECHO SDM 경로에 의해 처리됩니다.",
  "dsp.panel.sdm.target.dsd256Detail": "고속 실시간 PCM -> SDM 타겟; 일반적인 DoP 통과를 피하세요.",
  "dsp.panel.sdm.target.dsd512Detail": "32x FIR 및 22.5792/24.576MHz 기본 DSD; 실험적인 ASIO 경로에서만 허용되었으며 다른 곳에서는 명시적으로 거부되었습니다.",
  "dsp.panel.sdm.target.dsd64Detail": "ECHO SDM 경로가 안정적으로 출력될 수 있는지 검증하기 위한 라이트 타겟입니다.",
  "dsp.panel.channel.advanced": "고급 채널",
  "dsp.panel.channel.balance": "스테레오 밸런스",
  "dsp.panel.channel.bandCompensation": "밴드 보상",
  "dsp.panel.channel.bandHigh": "높은",
  "dsp.panel.channel.bandLow": "낮음",
  "dsp.panel.channel.bandMid": "중간",
  "dsp.panel.channel.centered": "중앙",
  "dsp.panel.channel.compensationDetail": "기본값은 더 큰 쪽을 감쇠하는 것으로, 복구할 수 없는 헤드폰 채널 불균형에 유용합니다.",
  "dsp.panel.channel.compensationOff": "꺼짐",
  "dsp.panel.channel.compensationOn": "켜짐",
  "dsp.panel.channel.compensationTitle": "불균형 보상",
  "dsp.panel.channel.constantPower": "일정한 전력",
  "dsp.panel.channel.delaySkew": "지연 편향",
  "dsp.panel.channel.he90Hint": "0.25dB부터 시작하여 중앙에 위치한 보컬을 들으면서 미세 조정하세요.",
  "dsp.panel.channel.invertLeft": "왼쪽으로 반전",
  "dsp.panel.channel.invertRight": "오른쪽으로 반전",
  "dsp.panel.channel.kicker": "채널 도구",
  "dsp.panel.channel.leansLeft": "왼쪽 {value}",
  "dsp.panel.channel.leansRight": "맞습니다 {value}",
  "dsp.panel.channel.leftDelay": "왼쪽 지연",
  "dsp.panel.channel.leftGain": "왼쪽 게인",
  "dsp.panel.channel.leftOutput": "왼쪽 출력",
  "dsp.panel.channel.leftTooLoud": "왼쪽이 더 크게",
  "dsp.panel.channel.monoTools": "모노 / 체크",
  "dsp.panel.channel.mono.left": "왼쪽만",
  "dsp.panel.channel.mono.off": "모노 꺼짐",
  "dsp.panel.channel.mono.right": "오른쪽만",
  "dsp.panel.channel.mono.sum": "합계 모노",
  "dsp.panel.channel.note": "채널 도구는 파라메트릭 EQ와 분리되어 스테레오 이미지, 왼쪽/오른쪽 차이 및 모노 호환성을 확인합니다.",
  "dsp.panel.channel.modePro": "프로",
  "dsp.panel.channel.modeSimple": "간단하다",
  "dsp.panel.channel.presetDefaultName": "헤드폰 불균형 보상",
  "dsp.panel.channel.presetEmpty": "아직 저장된 채널 프로필이 없습니다.",
  "dsp.panel.channel.presetName": "프로필 이름",
  "dsp.panel.channel.presetPrompt": "이 헤드폰 프로필의 이름을 지정하세요",
  "dsp.panel.channel.presets": "헤드폰 프로필",
  "dsp.panel.channel.phaseTools": "단계 / 라우팅",
  "dsp.panel.channel.removePreset": "제거",
  "dsp.panel.channel.saveCurrent": "현재 설정 저장",
  "dsp.panel.channel.selectPreset": "프로필 선택",
  "dsp.panel.channel.switchPreset": "스위치",
  "dsp.panel.channel.renamePreset": "이름 바꾸기",
  "dsp.panel.channel.renamePrompt": "이 헤드폰 프로필의 이름을 바꾸세요",
  "dsp.panel.channel.rightDelay": "오른쪽 지연",
  "dsp.panel.channel.rightGain": "오른쪽 이득",
  "dsp.panel.channel.rightOutput": "오른쪽 출력",
  "dsp.panel.channel.rightTooLoud": "오른쪽이 더 크게",
  "dsp.panel.channel.step": "단계",
  "dsp.panel.channel.swap": "왼쪽/오른쪽 바꾸기",
  "dsp.panel.channel.swapCompensation": "보상 방향 교환",
  "dsp.panel.channel.safeAttenuation": "정전형 헤드폰의 경우 출력 레벨을 높이지 않으려면 감쇠 보상을 선호합니다.",
  "dsp.panel.channel.compare": "A/B 비교",
  "dsp.panel.channel.compareActive": "우회",
  "dsp.panel.channel.compareHint": "보상 전후의 스테레오 이미지를 비교하기 위해 일시적으로 채널 처리를 우회합니다.",
  "dsp.panel.channel.monoHint": "Sum mono는 양면을 연주합니다. 왼쪽 전용 또는 오른쪽 전용은 상대방을 음소거합니다.",
  "dsp.panel.channel.trimCenter": "불균형 해소",
  "dsp.panel.headroom.applyRecommended": "추천 적용",
  "dsp.panel.headroom.applyRecommendedValue": "권장값 {value} 적용",
  "dsp.panel.headroom.budgetAria": "여유 예산",
  "dsp.panel.headroom.clipCount": "클립 수",
  "dsp.panel.headroom.clipCountValue": "{count}번",
  "dsp.panel.headroom.guardActive": "활성",
  "dsp.panel.headroom.guardDirect": "직접",
  "dsp.panel.headroom.guardStandby": "대기",
  "dsp.panel.headroom.guardState": "가드 상태",
  "dsp.panel.headroom.kicker": "헤드룸 관리",
  "dsp.panel.headroom.heroSubtitle": "트랜지언트와 DSP 동작을 위한 여유를 확보합니다.",
  "dsp.panel.headroom.history": "최근 60초",
  "dsp.panel.headroom.inputTrace": "입력",
  "dsp.panel.headroom.lastClip": "마지막 클립",
  "dsp.panel.headroom.makeConservative": "-6dB로 설정",
  "dsp.panel.headroom.makeSafe": "{value}으로 설정",
  "dsp.panel.headroom.modeAria": "헤드룸 모드",
  "dsp.panel.headroom.modeDaily": "매일",
  "dsp.panel.headroom.modeDailyDetail": "가벼운 DSP 예비.",
  "dsp.panel.headroom.modeDirect": "직접",
  "dsp.panel.headroom.modeDirectDetail": "추가 레벨 감소는 없습니다.",
  "dsp.panel.headroom.modeDspDetail": "EQ/FIR을 위한 안전한 공간을 남겨두세요.",
  "dsp.panel.headroom.nextDirect": "직접적으로 유지",
  "dsp.panel.headroom.nextDirectDetail": "현재 DSP 예비 위험은 필요하지 않습니다.",
  "dsp.panel.headroom.nextHoldRisk": "먼저 헤드룸을 줄여보세요",
  "dsp.panel.headroom.nextHoldRiskDetail": "클리핑 위험이 감지되었습니다. 먼저 헤드룸을 예약하세요.",
  "dsp.panel.headroom.nextProtect": "보호 여유 적용",
  "dsp.panel.headroom.nextProtectDetail": "출력은 풀 스케일에 가깝습니다. 즉시 레벨을 낮추십시오.",
  "dsp.panel.headroom.nextReady": "계속 모니터링",
  "dsp.panel.headroom.nextReadyDetail": "DSP에는 이미 안전한 헤드룸이 있습니다.",
  "dsp.panel.headroom.nextStandby": "계속 대기",
  "dsp.panel.headroom.nextStandbyDetail": "DSP 모듈이 활성화되었지만 아직 위험이 감지되지 않았습니다.",
  "dsp.panel.headroom.nextStep": "다음 단계",
  "dsp.panel.headroom.nextWatch": "출력 감시",
  "dsp.panel.headroom.nextWatchDetail": "출력이 한계에 가까워졌습니다. 클리핑에 주의하세요.",
  "dsp.panel.headroom.noClip": "기록이 없습니다",
  "dsp.panel.headroom.note": "헤드룸은 레벨 공간만 예약합니다. 여기서는 더 이상 특정 EQ 또는 FIR 튜닝을 혼합하지 않습니다.",
  "dsp.panel.headroom.outputTrace": "출력 추정",
  "dsp.panel.headroom.presetsAria": "헤드룸 사전 설정",
  "dsp.panel.headroom.primaryAction": "{value} 적용",
  "dsp.panel.headroom.reasonChannel": "채널 도구는 레벨을 높일 수 있습니다.",
  "dsp.panel.headroom.reasonClipping": "클리핑이 감지되었습니다.",
  "dsp.panel.headroom.reasonDirect": "헤드룸은 DSP 경로에서만 작동합니다. EQ, FIR 및 채널 도구가 모두 꺼져 있으면 네이티브 다이렉트가 처리되지 않습니다.",
  "dsp.panel.headroom.reasonEq": "EQ 곡선은 레벨을 증가시킬 수 있습니다.",
  "dsp.panel.headroom.reasonLive": "라이브 헤드룸이 낮습니다.",
  "dsp.panel.headroom.reasonOutput": "예상 출력은 풀 스케일에 가깝습니다.",
  "dsp.panel.headroom.reasonSrcTruePeak": "ECHO SRC/FIR은 샘플 간 피크를 나타낼 수 있습니다. 최소 -3dB를 예약하세요.",
  "dsp.panel.headroom.reasonRoom": "FIR/방보정 레벨이 상승할 수 있습니다.",
  "dsp.panel.headroom.reasonSafe": "현재 신호는 안전합니다.",
  "dsp.panel.headroom.recommendation": "추천",
  "dsp.panel.headroom.recommendationSafe": "안전하다",
  "dsp.panel.headroom.reserve": "여유 공간 확보",
  "dsp.panel.headroom.restoreDirect": "다이렉트 복원",
  "dsp.panel.headroom.safePolicy": "안전 제일",
  "dsp.panel.headroom.safetyActions": "빠른 보호",
  "dsp.panel.headroom.status": "상태",
  "dsp.panel.headroom.statusClose": "한계에 가까워",
  "dsp.panel.headroom.statusRisk": "위험이 감지됨",
  "dsp.panel.headroom.statusSafe": "안전하다",
  "dsp.panel.headroom.transparentNote": "디지털 레벨만 낮추며 음색은 바꾸지 않습니다.",
  "dsp.panel.headroom.waitingSignal": "재생 신호 대기 중",
  "dsp.panel.room.future.recent": "최근 IR",
  "dsp.panel.room.future.response": "응답 미리보기",
  "dsp.panel.room.hero.activeDetail": "컨볼루션이 출력 체인에 참여하고 있습니다.",
  "dsp.panel.room.hero.activeTitle": "FIR 활성화",
  "dsp.panel.room.hero.emptyDetail": "방 수정을 활성화하기 전에 IR을 가져오십시오.",
  "dsp.panel.room.hero.emptyTitle": "IR이 로드되지 않았습니다",
  "dsp.panel.room.hero.loadedDetail": "IR이 로드되었으며 활성화할 준비가 되었습니다.",
  "dsp.panel.room.hero.loadedTitle": "IR 로드됨",
  "dsp.panel.room.hero.state": "상태",
  "dsp.panel.room.kicker": "공간 처리",
  "dsp.panel.room.nextEnable": "FIR 활성화",
  "dsp.panel.room.nextEnableDetail": "IR이 준비되었습니다. 들어보세요.",
  "dsp.panel.room.nextImport": "IR 가져오기",
  "dsp.panel.room.nextImportDetail": "먼저 컨볼루션 파일을 선택하세요.",
  "dsp.panel.room.nextListen": "계속 들어봐",
  "dsp.panel.room.nextListenDetail": "교정 후 볼륨과 위상이 정상인지 확인합니다.",
  "dsp.panel.room.nextTrim": "낮은 트림",
  "dsp.panel.room.nextTrimDetail": "FIR 출력에는 클리핑 위험이 있습니다.",
  "dsp.panel.room.note": "FIR/룸 보정은 컨볼루션 및 IR만 처리합니다. 더 이상 EQ 사전 설정과 혼합되지 않습니다.",
  "dsp.panel.room.quickTrim": "빠른 트림",
  "dsp.panel.room.routeTitle": "경로",
  "dsp.panel.room.safeEnableHint": "FIR을 활성화하기 전에 -6dB 헤드룸을 예약하세요.",
  "dsp.panel.room.safetyRisk": "낮은 트림 또는 헤드룸.",
  "dsp.panel.room.safetySafe": "출력 체인은 현재 안전합니다.",
  "dsp.panel.room.safetyTitle": "안전",
  "dsp.panel.room.trim": "다듬기",
  "dsp.panel.safety.kicker": "출력 안전",
  "dsp.panel.safety.heroProtectedTitle": "출력 체인이 보호됨",
  "dsp.panel.safety.heroProtectedDetail": "DSP가 재생에 참여하므로 출력 안전이 계속해서 클리핑, 헤드룸 및 비트 퍼펙트 경로 상태를 모니터링합니다.",
  "dsp.panel.safety.heroRiskTitle": "출력 위험이 감지됨",
  "dsp.panel.safety.heroRiskDetail": "현재 체인에는 클리핑 또는 헤드룸 위험이 있습니다. 낮은 헤드룸, EQ 게인 또는 FIR 트림을 먼저 수행합니다.",
  "dsp.panel.safety.heroDirectTitle": "네이티브 다이렉트",
  "dsp.panel.safety.heroDirectDetail": "DSP 모듈이 활성화되지 않은 경우 재생은 비트 완벽한 후보 경로로 유지되며 출력 안전은 상태만 관찰합니다.",
  "dsp.panel.safety.chainTitle": "현재 체인",
  "dsp.panel.safety.checkTitle": "안전 점검",
  "dsp.panel.safety.nextTitle": "제안된 조치",
  "dsp.panel.safety.nextRisk": "헤드룸을 먼저 처리하세요",
  "dsp.panel.safety.nextRiskDetail": "위험이 존재하는 동안에는 EQ/FIR 게인을 계속 쌓지 마십시오. 헤드룸을 낮추거나 관련 모듈을 먼저 다듬습니다.",
  "dsp.panel.safety.nextProtected": "계속 모니터링",
  "dsp.panel.safety.nextProtectedDetail": "체인이 DSP 경로에 있고 잘림 위험이 발견되지 않았습니다. 계속해서 실시간 출력을 시청하세요.",
  "dsp.panel.safety.nextDirect": "직접적으로",
  "dsp.panel.safety.nextDirectDetail": "DSP 처리가 활성화되어 있지 않습니다. 이는 원본 출력, 장치 샘플 속도 및 비트 완벽한 후보 상태를 확인하는 데 적합합니다.",
  "dsp.panel.safety.routeInput": "입력",
  "dsp.panel.safety.routeHeadroom": "헤드룸",
  "dsp.panel.safety.routeProcess": "프로세스",
  "dsp.panel.safety.routeOutput": "출력",
  "dsp.panel.safety.checkBitPerfect": "아주 완벽하게",
  "dsp.panel.safety.checkLimiter": "보호 제한기",
  "dsp.panel.safety.disableLimiter": "보호 제한기 비활성화",
  "dsp.panel.safety.enableLimiter": "보호 제한기 활성화",
  "dsp.panel.safety.limiterBypassed": "우회됨",
  "dsp.panel.safety.limiterBypassedDetail": "최종 보호 제한기가 꺼져 있습니다. 핫 출력이 잘리거나 왜곡될 수 있습니다.",
  "dsp.panel.safety.limiterToggleTitle": "보호 제한기",
  "dsp.panel.safety.checkRoom": "전나무",
  "dsp.panel.safety.checkChannel": "채널 도구",
  "dsp.panel.safety.note": "클리핑 방지 판독값은 참고용일 뿐입니다. 왜곡, 거칠음 또는 과도한 압축에 대해서는 귀를 믿으십시오.",
  "dsp.room.status.active": "활성",
  "dsp.room.status.empty": "로드되지 않음",
  "dsp.room.status.error": "오류",
  "dsp.room.status.loaded": "로드됨",
  "dsp.status.dspPath": "DSP 경로",
  "dsp.status.shared": "공유됨",
};


const dspLocalTexts = {
  'zh-CN': dspLocalTextZhCN,
  'zh-TW': dspLocalTextZhTW,
  'en-US': dspLocalTextEnUS,
  'ja-JP': dspLocalTextJaJP,
  'ko-KR': dspLocalTextKoKR,
} as const;

type DspTranslate = (key: string, options?: Parameters<ReturnType<typeof useI18n>['t']>[1]) => string;

const useDspI18n = (): { t: DspTranslate } => {
  const { locale, t } = useI18n();
  const localText = dspLocalTexts[locale] ?? dspLocalTextZhCN;

  return {
    t: useCallback((key, options) => {
      if (localText[key]) {
        return Object.entries(options ?? {}).reduce(
          (text, [name, value]) => text.replaceAll(`{${name}}`, String(value)),
          localText[key],
        );
      }

      return t(key as TranslationKey, options);
    }, [localText, t]),
  };
};

const formatDb = (value: number | null | undefined): string => {
  if (!Number.isFinite(value)) {
    return '0 dB';
  }

  const rounded = Math.round(Number(value) * 10) / 10;
  return `${rounded > 0 ? '+' : ''}${rounded.toFixed(Math.abs(rounded) % 1 > 0 ? 1 : 0)} dB`;
};

const formatPreciseDb = (value: number | null | undefined): string => {
  if (!Number.isFinite(value)) {
    return '0 dB';
  }

  const rounded = Math.round(Number(value) * 100) / 100;
  const decimals = Math.abs(rounded % 1) < 0.001 ? 0 : Math.abs((rounded * 10) % 1) < 0.001 ? 1 : 2;
  return `${rounded > 0 ? '+' : ''}${rounded.toFixed(decimals)} dB`;
};

const formatLevel = (value: number | null | undefined): string => (Number.isFinite(value) ? formatDb(value) : '--');

const formatRate = (value: number | null | undefined, autoLabel: string): string => (value ? `${Math.round(value / 1000)} kHz` : autoLabel);

const clampNumber = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

const finiteLevel = (value: number | null | undefined): number | null => (Number.isFinite(value) ? Number(value) : null);

const roundHeadroomDb = (value: number): number => Math.round(clampNumber(value, dspHeadroomMinDb, dspHeadroomMaxDb) * 10) / 10;

const roundChannelGainDb = (value: number): number => {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.round(clampNumber(value, channelBalanceMinGainDb, channelBalanceMaxGainDb) * 100) / 100;
};

const roundChannelBandGainDb = (value: number): number => {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.round(clampNumber(value, channelBalanceBandMinGainDb, channelBalanceBandMaxGainDb) * 100) / 100;
};

const roundChannelDelayMs = (value: number): number => {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.round(clampNumber(value, channelBalanceMinDelayMs, channelBalanceMaxDelayMs) * 100) / 100;
};

const linearToDb = (value: number): number => 20 * Math.log10(Math.max(0.000001, value));

const getBalanceGainDb = (balance: number, constantPower: boolean): { leftDb: number; rightDb: number } => {
  const safeBalance = clampNumber(balance, -1, 1);

  if (!constantPower) {
    const leftGain = safeBalance > 0 ? 1 - safeBalance : 1;
    const rightGain = safeBalance < 0 ? 1 + safeBalance : 1;
    return { leftDb: linearToDb(leftGain), rightDb: linearToDb(rightGain) };
  }

  const pan = (safeBalance + 1) * Math.PI * 0.25;
  const compensation = Math.sqrt(2);
  return {
    leftDb: linearToDb(Math.min(1, Math.cos(pan) * compensation)),
    rightDb: linearToDb(Math.min(1, Math.sin(pan) * compensation)),
  };
};

const formatBalancePosition = (balance: number): string => {
  const percent = Math.round(Math.abs(balance) * 100);
  if (percent === 0) {
    return '0%';
  }

  return `${balance > 0 ? 'R' : 'L'} ${percent}%`;
};

const normalizeChannelBandGains = (bandGains: ChannelBalanceState['bandGains'] | null | undefined): NonNullable<ChannelBalanceState['bandGains']> => (
  channelBalanceBandIds.reduce<NonNullable<ChannelBalanceState['bandGains']>>((next, bandId) => {
    next[bandId] = {
      leftGainDb: roundChannelBandGainDb(Number(bandGains?.[bandId]?.leftGainDb ?? 0)),
      rightGainDb: roundChannelBandGainDb(Number(bandGains?.[bandId]?.rightGainDb ?? 0)),
    };
    return next;
  }, {
    low: { ...defaultBandGains.low },
    mid: { ...defaultBandGains.mid },
    high: { ...defaultBandGains.high },
  })
);

const normalizeChannelBalanceState = (state: Partial<ChannelBalanceState> | null | undefined): ChannelBalanceState => ({
  enabled: state?.enabled === true,
  balance: clampNumber(Number(state?.balance ?? 0), -1, 1),
  leftGainDb: roundChannelGainDb(Number(state?.leftGainDb ?? 0)),
  rightGainDb: roundChannelGainDb(Number(state?.rightGainDb ?? 0)),
  bandGains: normalizeChannelBandGains(state?.bandGains),
  leftDelayMs: roundChannelDelayMs(Number(state?.leftDelayMs ?? 0)),
  rightDelayMs: roundChannelDelayMs(Number(state?.rightDelayMs ?? 0)),
  swapLeftRight: state?.swapLeftRight === true,
  monoMode: state?.monoMode === 'sum' || state?.monoMode === 'left' || state?.monoMode === 'right' ? state.monoMode : 'off',
  invertLeft: state?.invertLeft === true,
  invertRight: state?.invertRight === true,
  constantPower: state?.constantPower !== false,
  clippingRisk: state?.clippingRisk === true,
});

const readChannelPresets = (): ChannelBalancePreset[] => {
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    const parsed = JSON.parse(window.localStorage.getItem(channelPresetStorageKey) ?? '[]') as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((item): ChannelBalancePreset | null => {
        if (!item || typeof item !== 'object') {
          return null;
        }

        const preset = item as Partial<ChannelBalancePreset>;
        const name = typeof preset.name === 'string' && preset.name.trim() ? preset.name.trim().slice(0, 40) : null;
        if (!name) {
          return null;
        }

        return {
          id: typeof preset.id === 'string' && preset.id ? preset.id : `channel-${Date.now()}`,
          name,
          state: normalizeChannelBalanceState(preset.state),
          createdAt: typeof preset.createdAt === 'string' ? preset.createdAt : new Date().toISOString(),
        };
      })
      .filter((item): item is ChannelBalancePreset => item !== null)
      .slice(0, maxChannelPresetCount);
  } catch {
    return [];
  }
};

const writeChannelPresets = (presets: ChannelBalancePreset[]): void => {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(channelPresetStorageKey, JSON.stringify(presets.slice(0, maxChannelPresetCount)));
};

const formatTime = (value: string | null | undefined, emptyLabel: string): string => {
  if (!value) {
    return emptyLabel;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return emptyLabel;
  }

  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const isEchoSrcPcmActive = (audioStatus: AudioStatus | null): boolean => {
  const runtimeState = audioStatus?.echoSrcRuntime?.state;
  return Boolean(
    audioStatus?.echoSrcMode !== 'off' &&
    audioStatus?.echoSrcTargetSampleRate &&
    (runtimeState === 'active' || runtimeState === 'planned' || runtimeState === 'fallback'),
  );
};

const getRecommendedHeadroomDb = (audioStatus: AudioStatus | null, currentHeadroomDb: number): number => {
  const targetHeadroomDb = 1;
  const outputPeakDb = finiteLevel(audioStatus?.audioLevels?.estimatedOutputPeakDb);
  const outputTruePeakDb = finiteLevel(audioStatus?.audioLevels?.estimatedOutputTruePeakDb);
  const outputPeakForHeadroomDb = outputPeakDb === null
    ? outputTruePeakDb
    : outputTruePeakDb === null
      ? outputPeakDb
      : Math.max(outputPeakDb, outputTruePeakDb);
  const liveHeadroomDb = finiteLevel(audioStatus?.audioLevels?.headroomDb);
  const truePeakHeadroomDb = finiteLevel(audioStatus?.audioLevels?.truePeakHeadroomDb);
  const reductionFromOutput = outputPeakForHeadroomDb === null ? 0 : Math.max(0, outputPeakForHeadroomDb + targetHeadroomDb);
  const reductionFromLive = liveHeadroomDb === null ? 0 : Math.max(0, targetHeadroomDb - liveHeadroomDb);
  const reductionFromTruePeak = truePeakHeadroomDb === null ? 0 : Math.max(0, targetHeadroomDb - truePeakHeadroomDb);
  const reductionFromEchoSrc = isEchoSrcPcmActive(audioStatus) ? Math.max(0, 3 + currentHeadroomDb) : 0;
  const fallbackReduction = audioStatus?.clippingRisk ? 6 : 0;
  const neededReductionDb = Math.max(reductionFromOutput, reductionFromLive, reductionFromTruePeak, reductionFromEchoSrc, fallbackReduction);

  if (neededReductionDb <= 0.05) {
    return roundHeadroomDb(currentHeadroomDb);
  }

  return roundHeadroomDb(currentHeadroomDb - neededReductionDb);
};

type HeadroomTone = 'good' | 'warn' | 'risk';

const hasObservedDspClippingRisk = (
  audioStatus: AudioStatus | null,
  eqState: EqState,
  roomCorrection: RoomCorrectionState,
  channelBalance: ChannelBalanceState,
  clipCount = audioStatus?.audioLevels?.clipCount ?? 0,
): boolean =>
  clipCount > 0 ||
  audioStatus?.dspClippingRisk === true ||
  audioStatus?.dspLimiterProtecting === true ||
  eqState.clippingRisk ||
  roomCorrection.clippingRisk ||
  channelBalance.clippingRisk === true;

const hasHeadroomWarning = (
  audioStatus: AudioStatus | null,
  outputPeakDb: number | null,
  liveHeadroomDb: number | null,
  truePeakHeadroomDb: number | null,
): boolean =>
  audioStatus?.clippingRisk === true ||
  (outputPeakDb !== null && outputPeakDb >= -1) ||
  (liveHeadroomDb !== null && liveHeadroomDb <= 1) ||
  (truePeakHeadroomDb !== null && truePeakHeadroomDb <= 1);

type ModulePanelProps = {
  audioStatus: AudioStatus | null;
  eqState: EqState;
  roomCorrection: RoomCorrectionState;
  channelBalance: ChannelBalanceState;
  echoSrcMode: AudioEchoSrcMode;
  echoSrcQualityProfile: AudioEchoSrcQualityProfile;
  echoSrcAdvancedModeEnabled: boolean;
  echoSrcFilterProfile1x: AudioEchoSrcFilterProfile;
  echoSrcFilterProfileNx: AudioEchoSrcFilterProfile;
  echoSrcComputeBackend: AudioEchoSrcComputeBackend;
  pcmDitherMode: AudioPcmDitherMode;
  dsdOutputMode: AudioDsdOutputMode;
  sdmMode: AudioSdmMode;
  sdmTargetRate: AudioSdmTargetRate;
  sdmQualityProfile: AudioSdmQualityProfile;
  sdmComputeBackend: AudioSdmComputeBackend;
  sdmOversamplingFilterProfile1x: AudioEchoSrcFilterProfile;
  sdmOversamplingFilterProfileNx: AudioEchoSrcFilterProfile;
  sdmSoundCompareReturnProfile: AudioSdmSoundProfileSelection | null;
  echoSrcCompareReturnMode: AudioEchoSrcMode | null;
  busyKey: string | null;
  onEchoSrcModeChange: (mode: AudioEchoSrcMode) => void;
  onEchoSrcQualityProfileChange: (profile: AudioEchoSrcQualityProfile) => void;
  onEchoSrcAdvancedModeChange: (enabled: boolean) => void;
  onEchoSrcFilterSlotChange: (slot: '1x' | 'nx', profile: AudioEchoSrcFilterProfile) => void;
  onEchoSrcComputeBackendChange: (backend: AudioEchoSrcComputeBackend) => void;
  onEchoSrcQualityLadderApply: (option: EchoSrcQualityLadderOption) => void;
  onPcmDitherModeChange: (mode: AudioPcmDitherMode) => void;
  onSdmModeChange: (mode: AudioSdmMode) => void;
  onSdmTargetRateChange: (rate: AudioSdmTargetRate) => void;
  onSdmQualityProfileChange: (profile: AudioSdmQualityProfile) => void;
  onSdmComputeBackendChange: (backend: AudioSdmComputeBackend) => void;
  onSdmSoundProfileChange: (profile: AudioSdmSoundProfileId) => void;
  onSdmSoundCompareToggle: () => void;
  onSdmOversamplingFilterSlotChange: (slot: '1x' | 'nx', profile: AudioEchoSrcFilterProfile) => void;
  onDsdDopChange: (enabled: boolean) => void;
  onEchoSrcCompareToggle: () => void;
  onHeadroomChange: (headroomDb: number) => void;
  onSafetyLimiterChange: (enabled: boolean) => void;
  onImportRoomCorrection: () => void;
  onToggleRoomCorrection: () => void;
  onEnableRoomSafely: () => void;
  onRoomTrimChange: (trimDb: number) => void;
  onClearRoomCorrection: () => void;
  onChannelPatch: (patch: Partial<ChannelBalanceState>) => void;
  onChannelReset: () => void;
  onRefresh: () => void;
};

type EchoSrcSettingsPatch = {
  audioEchoSrcMode?: AudioEchoSrcMode;
  audioEchoSrcQualityProfile?: AudioEchoSrcQualityProfile;
  audioEchoSrcAdvancedModeEnabled?: boolean;
  audioEchoSrcFilterProfile?: AudioEchoSrcFilterProfile;
  audioEchoSrcFilterProfile1x?: AudioEchoSrcFilterProfile;
  audioEchoSrcFilterProfileNx?: AudioEchoSrcFilterProfile;
  audioEchoSrcComputeBackend?: AudioEchoSrcComputeBackend;
  audioPcmDitherMode?: AudioPcmDitherMode;
};

type EchoSrcOutputPatch = Partial<Pick<
  AudioOutputSettings,
  | 'echoSrcMode'
  | 'echoSrcQualityProfile'
  | 'echoSrcAdvancedModeEnabled'
  | 'echoSrcFilterProfile'
  | 'echoSrcFilterProfile1x'
  | 'echoSrcFilterProfileNx'
  | 'echoSrcComputeBackend'
  | 'pcmDitherMode'
>>;

type SdmSettingsPatch = {
  audioDsdOutputMode?: AudioDsdOutputMode;
  audioSdmMode?: AudioSdmMode;
  audioSdmTargetRate?: AudioSdmTargetRate;
  audioSdmQualityProfile?: AudioSdmQualityProfile;
  audioSdmComputeBackend?: AudioSdmComputeBackend;
  audioSdmOversamplingFilterProfile1x?: AudioEchoSrcFilterProfile;
  audioSdmOversamplingFilterProfileNx?: AudioEchoSrcFilterProfile;
};

type SdmOutputPatch = Partial<Pick<
  AudioOutputSettings,
  | 'dsdOutputMode'
  | 'sdmMode'
  | 'sdmTargetRate'
  | 'sdmQualityProfile'
  | 'sdmComputeBackend'
  | 'sdmOversamplingFilterProfile1x'
  | 'sdmOversamplingFilterProfileNx'
>>;

const DspMetric = ({ label, value, tone }: { label: string; value: string; tone?: HeadroomTone }): JSX.Element => (
  <span className="dsp-module-metric" data-tone={tone}>
    <em>{label}</em>
    <strong>{value}</strong>
  </span>
);

const formatEchoSrcBackendLabel = (backend: AudioEchoSrcRuntimeBackend | null | undefined): string => {
  if (backend === 'cuda') {
    return 'CUDA FIR';
  }
  if (backend === 'cpu') {
    return 'CPU FIR';
  }
  if (backend === 'soxr') {
    return 'SOXR';
  }
  if (backend === 'default') {
    return 'Default SRC';
  }
  return '--';
};

const formatCudaMemory = (memoryTotalMiB: number | null | undefined): string => {
  if (!Number.isFinite(memoryTotalMiB) || !memoryTotalMiB || memoryTotalMiB <= 0) {
    return 'VRAM --';
  }

  const memoryGiB = memoryTotalMiB / 1024;
  const rounded = memoryGiB >= 10 ? Math.round(memoryGiB).toString() : memoryGiB.toFixed(1);
  return `${rounded}GB VRAM`;
};

const formatCudaRuntimeLabel = (cudaStatus: AudioStatus['echoSrcCudaStatus'] | null | undefined): string => {
  const device = cudaStatus?.deviceName ?? 'NVIDIA CUDA';
  const memory = formatCudaMemory(cudaStatus?.memoryTotalMiB);
  const driver = cudaStatus?.driverVersion ?? '--';
  const cuda = cudaStatus?.cudaVersion ?? '--';
  return `${device} / ${memory} / Driver ${driver} / CUDA ${cuda}`;
};

const dsdBaseSampleRate = 2_822_400;

const formatDsdRate = (sampleRate: number | null | undefined, fallback = '--'): string => {
  if (!Number.isFinite(sampleRate) || !sampleRate || sampleRate <= 0) {
    return fallback;
  }

  if (sampleRate >= 1_000_000) {
    const multiple = sampleRate / dsdBaseSampleRate;
    const rounded = Math.round(multiple);
    if (rounded >= 1 && Math.abs(multiple - rounded) < 0.02) {
      return `DSD${rounded * 64}`;
    }
  }

  return formatRate(sampleRate, fallback);
};

const isDsdSourceStatus = (status: AudioStatus | null): boolean => {
  if (!status) {
    return false;
  }

  const codec = status.codec?.toLowerCase() ?? '';
  const filePath = status.currentFilePath?.toLowerCase() ?? '';
  return (
    codec.includes('dsd') ||
    codec.includes('dsf') ||
    codec.includes('dff') ||
    filePath.endsWith('.dsf') ||
    filePath.endsWith('.dff') ||
    status.bitDepth === 1 ||
    Boolean(status.fileSampleRate && status.fileSampleRate >= 1_000_000)
  );
};

const findDsdWarning = (warnings: string[], prefixes: string[]): string | null =>
  warnings.find((warning) => prefixes.some((prefix) => warning === prefix || warning.startsWith(`${prefix}:`))) ?? null;

const formatDsdWarning = (warning: string | null, t: (key: string, params?: Record<string, string>) => string): string => {
  if (!warning) {
    return '--';
  }

  const [code, detail] = warning.split(/:(.+)/u);
  const detailText = detail ? ` / ${detail}` : '';
  switch (code) {
    case 'dsd_dop_requires_exclusive_or_asio':
      return 'DoP requires Exclusive';
    case 'dsd_dop_format_unsupported':
      return 'DSD format is not supported for DoP';
    case 'dsd_dop_disabled_by_dsp':
      return 'DSP, volume, or speed blocks DoP';
    case 'dsd_source_decoded_to_pcm':
      return `DSD decoded to PCM${detailText}`;
    case 'dsd_dop_fell_back_to_pcm':
      return `DoP fell back to PCM${detailText}`;
    case 'sdm_pcm_to_dsd_requires_exclusive_or_asio':
      return 'PCM -> SDM requires Exclusive output';
    case 'sdm_pcm_to_dsd_exclusive_dop_high_rate_unsafe':
      return 'DSD256+ PCM -> SDM requires ECHO SDM path';
    case 'sdm_pcm_to_dsd_native_dsd_required':
      return 'PCM -> SDM requires the independent ECHO SDM raw path';
    case 'sdm_pcm_to_dsd_target_unsupported':
      return `PCM -> SDM target is not supported${detailText}`;
    case 'sdm_pcm_to_dsd_channels_unsupported':
      return `PCM -> SDM channel count is not supported${detailText}`;
    case 'sdm_cuda_backend_unavailable':
      return `SDM CUDA fell back to CPU${detailText}`;
    case 'sdm_cuda_runtime_fallback':
      return `SDM CUDA runtime fallback${detailText}`;
    case 'native_cuda_sdm_not_faster':
      return `CPU SDM selected by realtime admission${detailText}`;
    case 'native_cuda_sdm_realtime_admission_failed':
      return `CPU SDM selected to protect realtime playback${detailText}`;
    case 'native_sdm_realtime_margin_low':
      return `SDM realtime margin is low${detailText}`;
    case 'native_sdm_stability_recovery':
      return `SDM modulator recovered from instability${detailText}`;
    case 'native_sdm_realtime_admission_failed':
      return `PCM -> SDM cannot meet realtime on this profile${detailText}`;
    case 'native_cuda_sdm_runtime_failure':
      return `SDM CUDA runtime fallback${detailText}`;
    case 'sdm_pcm_to_dsd_fell_back_to_pcm':
      return `PCM -> SDM fell back to PCM${detailText}`;
    case 'sdm_pcm_to_dsd_output_start_failed':
      if (warning.includes('native_sdm_realtime_admission_failed')) {
        return 'PCM -> SDM cannot meet realtime; use Realtime Safe or a lower DSD rate';
      }
      return `PCM -> SDM output failed closed${detailText}`;
    default:
      return `${t('dsp.panel.sdm.fallback')} / ${warning.replaceAll('_', ' ')}`;
  }
};

const formatEchoSrcFirFrames = (frames: number | null | undefined): string | null =>
  typeof frames === 'number' && Number.isFinite(frames) && frames > 0 ? `${Math.round(frames)}f` : null;

const formatEchoSrcFirMs = (value: number | null | undefined): string | null =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? `${value.toFixed(value >= 10 ? 1 : 2)}ms` : null;

const formatEchoSrcFirRealtime = (value: number | null | undefined): string | null =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? `${value.toFixed(value >= 10 ? 1 : 2)}x realtime` : null;

const formatEchoSrcRuntimePlan = (runtime: AudioStatus['echoSrcRuntime'] | null | undefined): string => {
  if (!runtime?.filterProfile) {
    return '--';
  }

  const preRinging = typeof runtime.preRingingEnergyRatio === 'number'
    ? `pre ${(runtime.preRingingEnergyRatio * 100).toFixed(1)}%`
    : null;
  const stopband = typeof runtime.measuredStopbandPeakDb === 'number'
    ? `stop ${runtime.measuredStopbandPeakDb.toFixed(0)}dB`
    : null;
  const stageText = runtime.firStageCount && runtime.firStageCount > 1
    ? `${runtime.firStageCount} stages`
    : null;
  const tapText = runtime.firStageTapCounts?.length
    ? `${runtime.firStageTapCounts.join('+')} taps`
    : runtime.tapCount
      ? `${runtime.tapCount} taps`
      : null;
  const batchText = runtime.firBatchFrames && runtime.firBatchFrames > 1
    ? `batch ${formatEchoSrcFirFrames(runtime.firBatchFrames)}`
    : null;
  const blockText = runtime.firMaxBlockFrames && runtime.firMaxBlockFrames > 1
    ? `block ${formatEchoSrcFirFrames(runtime.firMaxBlockFrames)}`
    : null;
  const workerText = runtime.firWorkerAverageMs !== null && runtime.firWorkerAverageMs !== undefined
    ? `worker ${formatEchoSrcFirMs(runtime.firWorkerAverageMs)} avg`
    : null;
  const realtimeText = formatEchoSrcFirRealtime(runtime.firRealtimeRatio);
  const stageProfiles = runtime.firStageProfiles ?? [];
  const hasStageProfiles = stageProfiles.length > 0;
  const filterSlotText = hasStageProfiles && stageProfiles.length > 1
    ? 'Filter 1x/Nx'
    : runtime.filterSlot
      ? `Filter ${runtime.filterSlot === '1x' ? '1x' : 'Nx'}`
      : null;
  const filterProfileText = hasStageProfiles
    ? stageProfiles.join(' -> ')
    : runtime.filterProfile;
  const parts = [
    filterSlotText,
    filterProfileText,
    stageText,
    tapText,
    runtime.firProcessingMode,
    batchText,
    blockText,
    workerText,
    realtimeText,
    runtime.window,
    runtime.phase,
    typeof runtime.impulsePeakIndex === 'number' ? `peak@${runtime.impulsePeakIndex}` : null,
    preRinging,
    stopband,
    runtime.stopbandAttenuationDb ? `${runtime.stopbandAttenuationDb} dB` : null,
  ].filter((part): part is string => Boolean(part));

  return parts.join(' / ');
};

type CudaInstallGuide = {
  title: string;
  reason: string;
  steps: string[];
};

const isActionableCudaInstallReason = (reason: string | null | undefined): boolean => {
  const normalized = reason?.trim() ?? '';
  return normalized !== '' &&
    normalized !== 'src_cuda_worker_disposed' &&
    normalized !== 'audio_session_run_cancelled' &&
    normalized !== 'native_cuda_sdm_requires_fir_oversampling' &&
    !normalized.startsWith('native_cuda_fir_not_faster:') &&
    !normalized.startsWith('native_cuda_sdm_not_faster:') &&
    !normalized.startsWith('native_cuda_sdm_realtime_admission_failed:');
};

const formatCudaUnavailableReason = (reason: string | null | undefined, t: DspTranslate): string => {
  const normalized = reason?.trim() ?? '';
  if (normalized.startsWith('native_cuda_fir_not_faster:')) {
    return `CPU FIR selected by device benchmark / ${normalized.split(':')[1] ?? ''}`;
  }
  if (!normalized || normalized === 'nvidia_smi_missing' || normalized.includes('ENOENT') || normalized.includes('not recognized')) {
    return t('dsp.panel.src.cuda.reason.driverMissing');
  }
  if (normalized === 'nvidia_smi_parse_failed' || normalized.startsWith('Command failed')) {
    return t('dsp.panel.src.cuda.reason.driverUnreadable');
  }
  if (
    normalized === 'src_cuda_worker_missing' ||
    normalized === 'src_cuda_worker_unavailable' ||
    normalized === 'native_cuda_dsp_not_built'
  ) {
    return t('dsp.panel.src.cuda.reason.workerMissing');
  }
  if (normalized === 'src_cuda_worker_built_without_cuda') {
    return t('dsp.panel.src.cuda.reason.workerCpuOnly');
  }
  if (
    normalized === 'src_cuda_worker_request_timeout' ||
    normalized.startsWith('src_cuda_worker_exit:') ||
    normalized.startsWith('echo_src_cuda_runtime_fallback:') ||
    normalized.startsWith('native_cuda_dsp_runtime_failure:')
  ) {
    return t('dsp.panel.src.cuda.reason.workerRuntime');
  }
  if (normalized === 'src_cuda_worker_disposed' || normalized === 'audio_session_run_cancelled') {
    return t('dsp.panel.src.cuda.reason.workerStopped');
  }
  return normalized;
};

const buildCudaInstallGuide = (reason: string | null | undefined, t: DspTranslate): CudaInstallGuide => {
  const normalized = reason?.trim() ?? '';
  if (!normalized || normalized === 'nvidia_smi_missing' || normalized.includes('ENOENT') || normalized.includes('not recognized')) {
    return {
      title: t('dsp.panel.src.cuda.guide.driverTitle'),
      reason: formatCudaUnavailableReason(reason, t),
      steps: [
        t('dsp.panel.src.cuda.guide.driverStep1'),
        t('dsp.panel.src.cuda.guide.driverStep2'),
        t('dsp.panel.src.cuda.guide.driverStep3'),
      ],
    };
  }

  if (
    normalized === 'src_cuda_worker_missing' ||
    normalized === 'src_cuda_worker_unavailable' ||
    normalized === 'src_cuda_worker_built_without_cuda' ||
    normalized === 'native_cuda_dsp_not_built'
  ) {
    return {
      title: t('dsp.panel.src.cuda.guide.workerTitle'),
      reason: formatCudaUnavailableReason(reason, t),
      steps: [
        t('dsp.panel.src.cuda.guide.workerStep1'),
        t('dsp.panel.src.cuda.guide.workerStep2'),
        t('dsp.panel.src.cuda.guide.workerStep3'),
      ],
    };
  }

  if (
    normalized === 'src_cuda_worker_request_timeout' ||
    normalized.startsWith('src_cuda_worker_exit:') ||
    normalized.startsWith('echo_src_cuda_runtime_fallback:') ||
    normalized.startsWith('native_cuda_dsp_runtime_failure:')
  ) {
    return {
      title: t('dsp.panel.src.cuda.guide.runtimeTitle'),
      reason: formatCudaUnavailableReason(reason, t),
      steps: [
        t('dsp.panel.src.cuda.guide.runtimeStep1'),
        t('dsp.panel.src.cuda.guide.runtimeStep2'),
        t('dsp.panel.src.cuda.guide.runtimeStep3'),
      ],
    };
  }

  return {
    title: t('dsp.panel.src.cuda.guide.genericTitle'),
    reason: formatCudaUnavailableReason(reason, t),
    steps: [
      t('dsp.panel.src.cuda.guide.genericStep1'),
      t('dsp.panel.src.cuda.guide.genericStep2'),
      t('dsp.panel.src.cuda.guide.genericStep3'),
    ],
  };
};

const EchoSrcPanel = ({
  audioStatus,
  echoSrcMode,
  echoSrcQualityProfile,
  echoSrcAdvancedModeEnabled,
  echoSrcFilterProfile1x,
  echoSrcFilterProfileNx,
  echoSrcComputeBackend,
  pcmDitherMode,
  echoSrcCompareReturnMode,
  busyKey,
  onEchoSrcModeChange,
  onEchoSrcQualityProfileChange,
  onEchoSrcAdvancedModeChange,
  onEchoSrcFilterSlotChange,
  onEchoSrcComputeBackendChange,
  onEchoSrcQualityLadderApply,
  onPcmDitherModeChange,
  onEchoSrcCompareToggle,
  onRefresh,
}: ModulePanelProps): JSX.Element => {
  const { t } = useDspI18n();
  const warnings = audioStatus?.warnings ?? [];
  const active = audioStatus?.echoSrcActive === true;
  const effectiveQualityProfile = normalizeEchoSrcQualityProfile(audioStatus?.echoSrcQualityProfile ?? echoSrcQualityProfile);
  const qualityOption = echoSrcQualityOptions.find((option) => option.profile === effectiveQualityProfile) ?? echoSrcQualityOptions[0];
  const sharedBypass = echoSrcMode !== 'off' && (audioStatus?.outputMode === 'shared' || warnings.includes('echo_src_bypassed_in_shared_output'));
  const dsdBypass =
    echoSrcMode !== 'off' &&
    (warnings.includes('echo_src_bypassed_for_dsd_direct') || warnings.includes('echo_src_bypassed_for_dsd_pcm'));
  const routeKey: string =
    active ? 'dsp.panel.src.active' :
    sharedBypass ? 'dsp.panel.src.bypassShared' :
    dsdBypass ? 'dsp.panel.src.bypassDsd' :
    echoSrcMode === 'off' ? 'dsp.panel.src.native' :
    'dsp.panel.src.pending';
  const routeTone: HeadroomTone | undefined = active ? 'good' : sharedBypass || dsdBypass ? 'warn' : undefined;
  const sourceRate = audioStatus?.fileSampleRate ?? null;
  const targetRate = active ? audioStatus?.echoSrcTargetSampleRate : null;
  const srcCommitPending = busyKey === 'src';
  const compareDisabled = echoSrcMode === 'off' && !echoSrcCompareReturnMode;
  const selectedAdvancedFilter1x = echoSrcAdvancedFilterOptions.find((option) => option.id === echoSrcFilterProfile1x) ?? echoSrcAdvancedFilterOptions[0];
  const selectedAdvancedFilterNx = echoSrcAdvancedFilterOptions.find((option) => option.id === echoSrcFilterProfileNx) ?? echoSrcAdvancedFilterOptions[0];
  const activeQualityLadderId = echoSrcQualityLadderOptions.find((option) =>
    echoSrcMode === option.mode &&
    echoSrcAdvancedModeEnabled &&
    echoSrcQualityProfile === option.qualityProfile &&
    echoSrcFilterProfile1x === option.filter1x &&
    echoSrcFilterProfileNx === option.filterNx &&
    echoSrcComputeBackend === option.computeBackend
  )?.id ?? null;
  const selectedPcmDitherMode = normalizePcmDitherMode(audioStatus?.pcmDitherMode ?? pcmDitherMode);
  const pcmDitherActive = audioStatus?.pcmDitherActive === true;
  const pcmDitherReason = audioStatus?.pcmDitherReason ?? null;
  const pcmDitherStatusText =
    pcmDitherActive && audioStatus?.pcmDitherTargetBitDepth
      ? t('dsp.panel.src.dither.activeStatus', { bits: String(audioStatus.pcmDitherTargetBitDepth) })
      : selectedPcmDitherMode === 'off'
        ? t('dsp.panel.src.dither.offStatus')
        : pcmDitherReason === 'float_output_not_quantized'
          ? t('dsp.panel.src.dither.floatStatus')
          : t('dsp.panel.src.dither.pendingStatus');
  const runtime = audioStatus?.echoSrcRuntime ?? null;
  const runtimeBackend = runtime?.activeBackend ?? null;
  const runtimeFallback = runtime?.state === 'fallback';
  const runtimeSlot = runtime?.filterSlot ?? null;
  const cudaStatus = audioStatus?.echoSrcCudaStatus ?? null;
  const cudaActive = runtime?.cudaActive === true || audioStatus?.echoSrcCudaActive === true;
  const cpuModel = typeof audioStatus?.cpuModel === 'string' && audioStatus.cpuModel.trim()
    ? audioStatus.cpuModel.trim()
    : null;
  const runtimePlanText = formatEchoSrcRuntimePlan(runtime);
  const cudaInstallReason =
    echoSrcComputeBackend === 'cuda'
      ? runtimeFallback && runtime?.requestedBackend === 'cuda'
        ? runtime.fallbackReason
        : cudaStatus?.available === false
          ? cudaStatus.error ?? 'nvidia_smi_missing'
          : null
      : null;
  const cudaInstallGuide = cudaInstallReason && isActionableCudaInstallReason(cudaInstallReason) && !cudaActive
    ? buildCudaInstallGuide(cudaInstallReason, t)
    : null;
  const computeStatusText =
    runtimeFallback
      ? `Fallback active / ${formatEchoSrcBackendLabel(runtimeBackend)} / ${formatCudaUnavailableReason(runtime?.fallbackReason, t)}`
      : runtime?.state === 'active'
        ? `${formatEchoSrcBackendLabel(runtimeBackend)} active / ${runtimePlanText}`
        : runtime?.state === 'planned'
          ? 'CUDA FIR planned / waiting for native host'
        : echoSrcComputeBackend !== 'cuda'
      ? t('dsp.panel.src.compute.cpuStatus')
      : cudaStatus?.available
        ? cudaActive
          ? `CUDA FIR active / ${formatCudaRuntimeLabel(cudaStatus)}`
          : t('dsp.panel.src.cuda.ready', {
            device: cudaStatus.deviceName ?? 'NVIDIA CUDA',
            memory: formatCudaMemory(cudaStatus.memoryTotalMiB),
            driver: cudaStatus.driverVersion ?? '--',
            cuda: cudaStatus.cudaVersion ?? '--',
          })
        : t('dsp.panel.src.cuda.unavailable', { reason: formatCudaUnavailableReason(cudaStatus?.error ?? 'nvidia_smi_missing', t) });
  const advancedRouteText =
    runtimeFallback
      ? `Fallback / ${formatEchoSrcBackendLabel(runtimeBackend)}`
      : runtime?.state === 'active'
        ? `${formatEchoSrcBackendLabel(runtimeBackend)} active`
        : runtime?.state === 'planned'
          ? 'FIR planned'
          : t('dsp.panel.src.notConnected');
  const advancedSummaryText =
    runtimeFallback
      ? `Requested ${formatEchoSrcBackendLabel(runtime.requestedBackend)}; now using ${formatEchoSrcBackendLabel(runtimeBackend)}.`
      : runtime?.state === 'active'
        ? `${formatEchoSrcBackendLabel(runtimeBackend)} is routed into the current playback path.`
        : t('dsp.panel.src.advancedSummary');
  const engineText = active ? formatEchoSrcBackendLabel(runtimeBackend ?? (cudaActive ? 'cuda' : 'soxr')) : '--';
  const precisionText = runtime?.tapCount
    ? `${runtime.tapCount} taps / ${runtime.phase ?? '--'} / ${runtime.window ?? '--'}`
    : active ? qualityOption.precision.replace('SOXR ', '') : qualityOption.precision;

  const selectedPreviewFilter = runtimeSlot === 'nx' ? selectedAdvancedFilterNx : selectedAdvancedFilter1x;
  return (
    <EchoSrcControlSurface
        mode={echoSrcMode}
        quality={effectiveQualityProfile}
        advanced={echoSrcAdvancedModeEnabled}
        filter1x={echoSrcFilterProfile1x}
        filterNx={echoSrcFilterProfileNx}
        compute={echoSrcComputeBackend}
        dither={selectedPcmDitherMode}
        activeFilterSlot={runtimeSlot === '1x' || runtimeSlot === 'nx' ? runtimeSlot : null}
        routeTone={routeTone === 'good' || routeTone === 'warn' ? routeTone : 'neutral'}
        routeLabel={t(routeKey)}
        sourceRate={formatRate(sourceRate, '--')}
        targetRate={formatRate(targetRate, '--')}
        engineLabel={engineText}
        qualityLabel={t(qualityOption.titleKey)}
        precisionLabel={precisionText}
        computeStatus={computeStatusText}
        ditherStatus={pcmDitherStatusText}
        advancedStatus={advancedRouteText}
        busy={srcCommitPending}
        compareDisabled={compareDisabled}
        compareRestore={echoSrcMode === 'off' && Boolean(echoSrcCompareReturnMode)}
        modeOptions={echoSrcModeOptions.map((option) => ({
          value: option.mode,
          label: t(option.titleKey),
          detail: t(option.detailKey),
        }))}
        qualityOptions={echoSrcQualityOptions.map((option) => ({
          value: option.profile,
          label: t(option.titleKey),
          detail: t(option.detailKey),
        }))}
        filterOptions={echoSrcAdvancedFilterOptions.map((option) => ({
          value: option.id,
          label: option.label,
          detail: t(option.detailKey),
        }))}
        computeOptions={echoSrcAdvancedComputeOptions.map((option) => ({
          value: option.id,
          label: option.label,
          detail: option.id === 'cpu' && cpuModel
            ? `${cpuModel} / ${t(option.detailKey)}`
            : option.id === 'cuda' && cudaStatus?.available
              ? `${formatCudaRuntimeLabel(cudaStatus)} / ${t(option.detailKey)}`
              : t(option.detailKey),
        }))}
        ditherOptions={pcmDitherOptions.map((option) => ({
          value: option.mode,
          label: option.label,
          detail: t(option.detailKey),
        }))}
        ladderOptions={echoSrcQualityLadderOptions.map((option) => ({
          id: option.id,
          label: t(option.titleKey),
          detail: t(option.detailKey),
          meta: `${t(option.latencyKey)} / ${t(option.gpuKey)}`,
          active: activeQualityLadderId === option.id,
        }))}
        copy={{
          eyebrow: t('dsp.panel.src.kicker'),
          title: t('dsp.module.src.title'),
          subtitle: t('dsp.panel.src.detail'),
          route: t('dsp.panel.src.route'),
          sourceRate: t('dsp.panel.src.sourceRate'),
          targetRate: t('dsp.panel.src.targetRate'),
          engine: t('dsp.panel.src.engine'),
          quality: t('dsp.panel.src.quality'),
          precision: t('dsp.panel.src.precision'),
          mode: t('dsp.panel.src.modeSwitch'),
          normal: t('dsp.panel.src.normal'),
          advanced: t('dsp.panel.src.advanced'),
          filterPreview: `${t('dsp.panel.src.filter')} · Design preview`,
          filterPreviewNote: `${t(selectedPreviewFilter.detailKey)} ${t('dsp.panel.src.advancedSummary')}`,
          runtimeFacts: `${t('dsp.panel.src.route')} / Runtime`,
          filterPlan: `${t('dsp.panel.src.filter')} 1x / Nx`,
          compute: t('dsp.panel.src.compute'),
          dither: t('dsp.panel.src.dither.title'),
          refresh: t('dsp.action.refresh'),
          abBypass: t('dsp.panel.src.abBypass'),
          abRestore: t('dsp.panel.src.abRestore'),
          note: t('dsp.panel.src.note'),
          advancedSummary: advancedSummaryText,
        }}
        cudaGuide={cudaInstallGuide}
        onModeChange={onEchoSrcModeChange}
        onQualityChange={onEchoSrcQualityProfileChange}
        onAdvancedChange={onEchoSrcAdvancedModeChange}
        onFilterChange={onEchoSrcFilterSlotChange}
        onComputeChange={onEchoSrcComputeBackendChange}
        onDitherChange={onPcmDitherModeChange}
        onLadderApply={(id) => {
          const option = echoSrcQualityLadderOptions.find((candidate) => candidate.id === id);
          if (option) onEchoSrcQualityLadderApply(option);
        }}
        onCompareToggle={onEchoSrcCompareToggle}
        onRefresh={onRefresh}
    />
  );
};

const SdmPanel = ({
  audioStatus,
  dsdOutputMode,
  sdmMode,
  sdmTargetRate,
  sdmQualityProfile,
  sdmComputeBackend,
  sdmOversamplingFilterProfile1x,
  sdmOversamplingFilterProfileNx,
  sdmSoundCompareReturnProfile,
  busyKey,
  onSdmModeChange,
  onSdmTargetRateChange,
  onSdmQualityProfileChange,
  onSdmComputeBackendChange,
  onSdmSoundProfileChange,
  onSdmSoundCompareToggle,
  onSdmOversamplingFilterSlotChange,
  onDsdDopChange,
  onRefresh,
}: ModulePanelProps): JSX.Element => {
  const { t } = useDspI18n();
  const warnings = audioStatus?.warnings ?? [];
  const dsdSource = isDsdSourceStatus(audioStatus);
  const activeDsdMode = audioStatus?.activeDsdOutputMode ?? null;
  const statusSdmTargetRate = normalizeSdmTargetRate(audioStatus?.sdmTargetRate ?? sdmTargetRate);
  const statusSdmQualityProfile = normalizeSdmQualityProfile(audioStatus?.sdmQualityProfile ?? sdmQualityProfile);
  const statusSdmComputeBackend = normalizeSdmComputeBackend(audioStatus?.sdmComputeBackend ?? sdmComputeBackend);
  const actualSdmComputeBackend = normalizeSdmComputeBackend(audioStatus?.sdmActualComputeBackend ?? statusSdmComputeBackend);
  const selectedTargetOption = sdmTargetRateOptions.find((option) => option.rate === sdmTargetRate) ?? sdmTargetRateOptions[1];
  const selectedQualityOption = sdmQualityProfileOptions.find((option) => option.profile === sdmQualityProfile) ?? sdmQualityProfileOptions[0];
  const selectedComputeOption = sdmComputeBackendOptions.find((option) => option.backend === sdmComputeBackend) ?? sdmComputeBackendOptions[0];
  const selectedSoundProfile = resolveAudioSdmSoundProfileSelection(
    sdmOversamplingFilterProfile1x,
    sdmOversamplingFilterProfileNx,
  );
  const selectedSoundOption = sdmSoundProfileOptions.find((option) => option.id === selectedSoundProfile) ?? null;
  const compareReturnSoundOption = sdmSoundProfileOptions.find((option) => option.id === sdmSoundCompareReturnProfile) ?? null;
  const soundCompareDisabled = selectedSoundProfile === 'linear' && !sdmSoundCompareReturnProfile;
  const dsd512LongSoundNeedsCuda =
    sdmTargetRate === 'dsd512' &&
    sdmComputeBackend === 'cpu' &&
    (selectedSoundProfile === 'transient' || selectedSoundProfile === 'smooth');
  const statusTargetOption = sdmTargetRateOptions.find((option) => option.rate === statusSdmTargetRate) ?? sdmTargetRateOptions[1];
  const statusQualityOption = sdmQualityProfileOptions.find((option) => option.profile === statusSdmQualityProfile) ?? sdmQualityProfileOptions[0];
  const statusComputeOption = sdmComputeBackendOptions.find((option) => option.backend === actualSdmComputeBackend) ?? sdmComputeBackendOptions[0];
  const modulatorProfile = audioStatus?.sdmModulatorProfile ?? null;
  const modulatorProfileText = modulatorProfile
    ? `${modulatorProfile.name} / ${modulatorProfile.order}th`
    : t(statusQualityOption.labelKey);
  const modulatorCoefficientsText = modulatorProfile
    ? modulatorProfile.feedbackCoefficients.map((coefficient) => coefficient.toFixed(3)).join(', ')
    : '--';
  const modulatorDitherText = modulatorProfile ? modulatorProfile.ditherAmplitude.toExponential(1) : '--';
  const modulatorStabilityText = modulatorProfile ? `+/-${modulatorProfile.stabilityLimit.toFixed(2)}` : '--';
  const modulatorHeadroomText = modulatorProfile ? formatDb(-modulatorProfile.recommendedHeadroomDb) : '--';
  const runtimeState = audioStatus?.sdmRuntimeState ?? (sdmMode === 'pcmToDsd' ? 'pcm_to_sdm_not_routed' : 'off');
  const runtimeText =
    runtimeState === 'dsd_passthrough'
      ? t('dsp.panel.sdm.runtime.dsdPassthrough')
      : runtimeState === 'pcm_to_sdm_active'
        ? t('dsp.panel.sdm.runtime.pcmToSdmActive')
      : runtimeState === 'pcm_to_sdm_not_routed'
        ? t('dsp.panel.sdm.runtime.pcmToSdmNotRouted')
        : t('dsp.panel.sdm.runtime.off');
  const requestedDop = dsdOutputMode === 'dop' || audioStatus?.dsdOutputModeRequested === 'dop';
  const fallbackWarning = findDsdWarning(warnings, [
    'dsd_dop_fell_back_to_pcm',
    'dsd_source_decoded_to_pcm',
    'dsd_dop_requires_exclusive_or_asio',
    'dsd_dop_format_unsupported',
    'dsd_dop_disabled_by_dsp',
    'sdm_pcm_to_dsd_requires_exclusive_or_asio',
    'sdm_pcm_to_dsd_exclusive_dop_high_rate_unsafe',
    'sdm_pcm_to_dsd_native_dsd_required',
    'sdm_pcm_to_dsd_target_unsupported',
    'sdm_pcm_to_dsd_channels_unsupported',
    'sdm_cuda_backend_unavailable',
    'sdm_cuda_runtime_fallback',
    'native_cuda_sdm_not_faster',
    'native_cuda_sdm_realtime_admission_failed',
    'native_cuda_sdm_runtime_failure',
    'native_sdm_realtime_margin_low',
    'native_sdm_stability_recovery',
    'native_sdm_realtime_admission_failed',
    'sdm_pcm_to_dsd_fell_back_to_pcm',
    'sdm_pcm_to_dsd_output_start_failed',
  ]);
  const sourceRate = audioStatus?.dsdNativeSampleRate ?? audioStatus?.fileSampleRate ?? null;
  const outputText =
    activeDsdMode === 'native'
      ? t('dsp.panel.sdm.nativeDsd')
      : activeDsdMode === 'dop'
        ? 'DoP'
        : runtimeState === 'pcm_to_sdm_active'
          ? `PCM -> ${statusTargetOption.label}`
        : runtimeState === 'pcm_to_sdm_not_routed'
          ? t('dsp.panel.sdm.pcmFallback')
        : dsdSource
          ? t('dsp.panel.sdm.pcmFallback')
          : t('dsp.panel.sdm.noDsdSource');
  const requestedText =
    sdmMode === 'pcmToDsd'
      ? `${selectedTargetOption.label} / ${selectedSoundOption ? t(selectedSoundOption.labelKey) : t('dsp.panel.sdm.sound.custom')} / ${t(selectedQualityOption.labelKey)} / ${selectedComputeOption.label}`
      : sdmMode === 'dsdPassthrough'
        ? 'DoP'
        : t('dsp.panel.sdm.mode.off');
  const transportText =
    activeDsdMode === 'dop'
      ? formatRate(audioStatus?.dsdTransportSampleRate ?? audioStatus?.requestedOutputSampleRate ?? null, '--')
      : activeDsdMode === 'native'
        ? formatDsdRate(sourceRate, '--')
        : runtimeState === 'pcm_to_sdm_active'
          ? formatRate(audioStatus?.sdmTransportSampleRate ?? audioStatus?.requestedOutputSampleRate ?? null, '--')
        : formatRate(audioStatus?.decoderOutputSampleRate ?? audioStatus?.requestedOutputSampleRate ?? null, '--');
  const sourceText = dsdSource
    ? `${formatDsdRate(sourceRate, '--')} / ${audioStatus?.codec ?? 'DSD'}`
    : [
      audioStatus?.fileSampleRate ? formatRate(audioStatus.fileSampleRate, '--') : null,
      audioStatus?.codec ?? null,
    ].filter(Boolean).join(' / ') || '--';
  const capabilityText =
    audioStatus?.outputMode === 'exclusive'
      ? sdmMode === 'pcmToDsd'
        ? runtimeState === 'pcm_to_sdm_active'
          ? 'ECHO SDM over DoP'
          : 'ECHO SDM over DoP candidate'
        : 'DoP candidate'
      : sdmMode === 'pcmToDsd'
          ? 'PCM -> SDM request'
          : 'PCM / select Exclusive';
  const sdmRuntime = audioStatus?.sdmRuntime ?? null;
  const sdmCudaStatus = audioStatus?.sdmCudaStatus ?? null;
  const sdmWorkerAverageText = formatEchoSrcFirMs(sdmRuntime?.workerAverageMs);
  const sdmRealtimeText = formatEchoSrcFirRealtime(sdmRuntime?.realtimeRatio);
  const sdmAdmissionText = formatEchoSrcFirRealtime(sdmRuntime?.realtimeAdmissionRatio);
  const sdmPcmDspRateText = sdmRuntime?.pcmDspSampleRate
    ? `PCM DSP ${formatRate(sdmRuntime.pcmDspSampleRate, '--')}`
    : null;
  const sdmStabilityText = typeof sdmRuntime?.peakFeedbackState === 'number'
    ? `state ${sdmRuntime.peakFeedbackState.toFixed(3)} / recoveries ${sdmRuntime.stabilityRecoveries ?? 0}`
    : null;
  const sdmBatchText = sdmRuntime?.batchFrames && sdmRuntime.batchFrames > 1
    ? `batch ${formatEchoSrcFirFrames(sdmRuntime.batchFrames)}`
    : null;
  const sdmBlockText = sdmRuntime?.maxBlockFrames && sdmRuntime.maxBlockFrames > 1
    ? `block ${formatEchoSrcFirFrames(sdmRuntime.maxBlockFrames)}`
    : null;
  const sdmRequestText = typeof sdmRuntime?.workerRequests === 'number'
    ? `${sdmRuntime.workerRequests} worker req`
    : null;
  const sdmPerformanceDetail = [
    sdmWorkerAverageText ? `worker ${sdmWorkerAverageText} avg` : null,
    sdmRealtimeText ? `FIR + SDM ${sdmRealtimeText}` : null,
    sdmAdmissionText ? `admission ${sdmAdmissionText}` : null,
    sdmPcmDspRateText,
    sdmStabilityText,
    sdmRequestText,
  ].filter(Boolean).join(' / ');
  const sdmRealtimeRisk =
    (typeof sdmRuntime?.realtimeRatio === 'number' && sdmRuntime.realtimeRatio >= 0.85)
    || (typeof sdmRuntime?.realtimeAdmissionRatio === 'number' && sdmRuntime.realtimeAdmissionRatio >= 0.8)
    || (sdmRuntime?.stabilityRecoveries ?? 0) > 0;
  const oversamplingRuntime = sdmRuntime?.oversamplingRuntime ?? null;
  const hybridCudaActive =
    sdmRuntime?.activeBackend === 'cpu' &&
    oversamplingRuntime?.activeBackend === 'cuda';
  const sdmAdmissionFallback =
    sdmRuntime?.fallbackReason?.startsWith('native_cuda_sdm_not_faster:') === true ||
    sdmRuntime?.fallbackReason?.startsWith('native_cuda_sdm_realtime_admission_failed:') === true;
  const computeRuntimeText =
    sdmRuntime?.activeBackend === 'cuda'
      ? `CUDA SDM active / ${formatCudaRuntimeLabel(sdmCudaStatus)}`
      : hybridCudaActive
        ? 'Hybrid active / CUDA FIR + CPU SDM'
      : sdmRuntime?.requestedBackend === 'cuda' && sdmRuntime.activeBackend === 'cpu'
        ? `CPU fallback / ${sdmRuntime.fallbackReason ?? 'CUDA unavailable'}`
        : sdmRuntime?.activeBackend === 'cpu'
          ? 'CPU SDM active'
          : statusComputeOption.label;
  const computeRuntimeDetail =
    sdmRuntime?.activeBackend === 'cuda'
      ? [
        sdmRuntime.processingMode,
        sdmBatchText,
        sdmBlockText,
        sdmPerformanceDetail,
      ].filter(Boolean).join(' / ') || t(statusComputeOption.detailKey)
      : hybridCudaActive
        ? [
          'CUDA FIR oversampling',
          'CPU recursive modulator',
          sdmPerformanceDetail,
          sdmAdmissionFallback
            ? `realtime admission / ${sdmRuntime?.fallbackReason?.split(':')[1] ?? ''}`
            : sdmRuntime?.fallbackReason,
        ].filter(Boolean).join(' / ')
      : sdmRuntime?.requestedBackend === 'cuda' && sdmRuntime.activeBackend === 'cpu'
        ? [
          sdmRuntime.fallbackReason ?? 'CUDA fallback active',
          sdmRuntime.processingMode,
          sdmBatchText,
          sdmBlockText,
          sdmPerformanceDetail,
        ].filter(Boolean).join(' / ') || t(statusComputeOption.detailKey)
        : [t(statusComputeOption.detailKey), sdmPerformanceDetail].filter(Boolean).join(' / ');
  const oversamplingRuntimeBackendText = oversamplingRuntime?.activeBackend
    ? String(oversamplingRuntime.activeBackend).toUpperCase()
    : oversamplingRuntime?.requestedBackend
      ? `${String(oversamplingRuntime.requestedBackend).toUpperCase()} planned`
      : null;
  const oversamplingEngineText =
    sdmRuntime?.oversamplingEngine === 'soxr'
      ? `SOXR precision ${sdmRuntime.oversamplingPrecision ?? 28}`
      : sdmRuntime?.oversamplingEngine === 'echo-fir'
        ? ['ECHO FIR', oversamplingRuntimeBackendText].filter(Boolean).join(' / ')
        : sdmRuntime?.oversamplingEngine === 'default'
          ? 'Default resampler fallback'
          : '--';
  const oversamplingRouteText =
    sdmRuntime?.oversamplingSourceSampleRate && sdmRuntime.oversamplingTargetSampleRate
      ? `${formatRate(sdmRuntime.oversamplingSourceSampleRate, '--')} -> ${formatRate(sdmRuntime.oversamplingTargetSampleRate, '--')}`
      : '--';
  const outputTone: HeadroomTone | undefined =
    runtimeState === 'dsd_passthrough' || runtimeState === 'pcm_to_sdm_active'
      ? 'good'
      : runtimeState === 'pcm_to_sdm_not_routed' || dsdSource || fallbackWarning
        ? 'warn'
        : undefined;
  const isBusy = busyKey === 'sdm';

  return (
    <EchoSdmControlSurface
      mode={sdmMode}
      targetRate={sdmTargetRate}
      quality={sdmQualityProfile}
      compute={sdmComputeBackend}
      soundProfile={selectedSoundOption?.id ?? null}
      filter1x={sdmOversamplingFilterProfile1x}
      filterNx={sdmOversamplingFilterProfileNx}
      requestedDop={requestedDop}
      compareRestore={selectedSoundProfile === 'linear' && Boolean(sdmSoundCompareReturnProfile)}
      compareDisabled={soundCompareDisabled}
      busy={isBusy}
      routeTone={outputTone === 'good' || outputTone === 'warn' ? outputTone : 'neutral'}
      sourceLabel={sourceText}
      requestedLabel={requestedText}
      outputLabel={outputText}
      runtimeLabel={runtimeText}
      transportLabel={transportText}
      oversamplingLabel={`${oversamplingEngineText} / ${oversamplingRouteText}`}
      modulatorLabel={modulatorProfileText}
      computeLabel={computeRuntimeText}
      computeDetail={computeRuntimeDetail}
      fallbackLabel={formatDsdWarning(fallbackWarning, t)}
      capabilityLabel={capabilityText}
      performanceLabel={sdmPerformanceDetail || runtimeText}
      modulatorDetails={[
        {
          label: t('dsp.panel.sdm.modulatorOrder'),
          value: modulatorProfile ? `${modulatorProfile.order}th` : '--',
          detail: modulatorProfile?.noiseShaper ?? t('dsp.panel.sdm.runtime.off'),
        },
        {
          label: t('dsp.panel.sdm.modulatorCoefficients'),
          value: modulatorCoefficientsText,
          detail: modulatorProfile?.id ?? '--',
        },
        {
          label: t('dsp.panel.sdm.modulatorDither'),
          value: modulatorDitherText,
          detail: `${t('dsp.panel.sdm.modulatorStability')} ${modulatorStabilityText}`,
        },
        {
          label: t('dsp.panel.sdm.modulatorHeadroom'),
          value: modulatorHeadroomText,
          detail: t('dsp.panel.sdm.guardDetail'),
        },
      ]}
      warning={dsd512LongSoundNeedsCuda
        ? t('dsp.panel.sdm.sound.dsd512CudaRequired')
        : fallbackWarning
          ? formatDsdWarning(fallbackWarning, t)
          : null}
      modeOptions={sdmModeOptions.map((option) => ({
        value: option.mode,
        label: t(option.labelKey),
        detail: t(option.detailKey),
      }))}
      targetOptions={sdmTargetRateOptions.map((option) => ({
        value: option.rate,
        label: option.label,
        detail: t(option.detailKey),
      }))}
      qualityOptions={sdmQualityProfileOptions.map((option) => ({
        value: option.profile,
        label: t(option.labelKey),
        detail: t(option.detailKey),
      }))}
      computeOptions={sdmComputeBackendOptions.map((option) => ({
        value: option.backend,
        label: option.label,
        detail: t(option.detailKey),
      }))}
      soundOptions={sdmSoundProfileOptions.map((option) => ({
        value: option.id,
        label: t(option.labelKey),
        detail: t(option.detailKey),
      }))}
      filterOptions={echoSrcAdvancedFilterOptions.map((option) => ({
        value: option.id,
        label: option.label,
        detail: t(option.detailKey),
      }))}
      copy={{
        title: t('dsp.module.sdm.title'),
        subtitle: t('dsp.panel.sdm.detail'),
        source: t('dsp.panel.sdm.source'),
        requested: t('dsp.panel.sdm.requested'),
        output: t('dsp.panel.sdm.output'),
        actual: t('dsp.panel.sdm.actual'),
        transport: t('dsp.panel.sdm.transport'),
        oversampling: t('dsp.panel.sdm.oversampling'),
        modulator: t('dsp.panel.sdm.modulator'),
        compute: t('dsp.panel.sdm.compute'),
        fallback: t('dsp.panel.sdm.fallback'),
        mode: t('dsp.panel.sdm.mode'),
        target: t('dsp.panel.sdm.target'),
        quality: t('dsp.panel.sdm.quality'),
        sound: t('dsp.panel.sdm.sound'),
        customSound: t('dsp.panel.sdm.sound.custom'),
        dop: t('dsp.panel.sdm.dop'),
        refresh: t('dsp.action.refresh'),
        preview: `${t('dsp.panel.sdm.modulator')} · Design preview`,
        previewNote: `${t(statusQualityOption.detailKey)} ${t('dsp.panel.sdm.separateNote')}`,
        runtimeFacts: `${t('dsp.panel.sdm.actual')} / Runtime`,
        signalPlan: `${t('dsp.panel.sdm.oversampling')} / ${t('dsp.panel.sdm.modulator')}`,
        advanced: t('dsp.panel.src.advanced'),
        normal: t('dsp.panel.src.normal'),
        compareLinear: t('dsp.panel.sdm.sound.compareLinear'),
        compareRestore: `${t('dsp.panel.sdm.sound.compareRestore')} ${compareReturnSoundOption ? t(compareReturnSoundOption.labelKey) : t('dsp.panel.sdm.sound.custom')}`,
        guard: t('dsp.panel.sdm.guard'),
        guardDetail: t('dsp.panel.sdm.guardDetail'),
        note: t('dsp.panel.sdm.note'),
      }}
      onModeChange={onSdmModeChange}
      onTargetRateChange={onSdmTargetRateChange}
      onQualityChange={onSdmQualityProfileChange}
      onComputeChange={onSdmComputeBackendChange}
      onSoundChange={onSdmSoundProfileChange}
      onFilterChange={onSdmOversamplingFilterSlotChange}
      onDopToggle={() => onDsdDopChange(!(sdmMode === 'dsdPassthrough' && dsdOutputMode === 'dop'))}
      onCompareToggle={onSdmSoundCompareToggle}
      onRefresh={onRefresh}
    />
  );

};

const HeadroomPanel = ({ audioStatus, eqState, roomCorrection, channelBalance, busyKey, onHeadroomChange, onRefresh }: ModulePanelProps): JSX.Element => {
  const { t } = useDspI18n();
  const headroomDb = eqState.dspHeadroomDb ?? 0;
  const [draftHeadroomDb, setDraftHeadroomDb] = useState(headroomDb);
  const dspPathActive = audioStatus?.dspActive === true;
  const recommendedHeadroomDb = getRecommendedHeadroomDb(audioStatus, headroomDb);
  const hasRecommendation = dspPathActive && Math.abs(recommendedHeadroomDb - headroomDb) > 0.05;
  const liveHeadroomDb = finiteLevel(audioStatus?.audioLevels?.headroomDb);
  const outputPeakDb = finiteLevel(audioStatus?.audioLevels?.estimatedOutputPeakDb);
  const truePeakDb = finiteLevel(audioStatus?.audioLevels?.estimatedOutputTruePeakDb);
  const truePeakHeadroomDb = finiteLevel(audioStatus?.audioLevels?.truePeakHeadroomDb);
  const inputPeakDb = finiteLevel(audioStatus?.audioLevels?.inputPeakDb);
  const clipCount = audioStatus?.audioLevels?.clipCount ?? 0;
  const clippingRisk = hasObservedDspClippingRisk(audioStatus, eqState, roomCorrection, channelBalance, clipCount);
  const srcTruePeakReserveRecommended = isEchoSrcPcmActive(audioStatus) && headroomDb > -2.95;
  const headroomWarning = hasHeadroomWarning(audioStatus, outputPeakDb, liveHeadroomDb, truePeakHeadroomDb) || srcTruePeakReserveRecommended;
  const lastClipAt = audioStatus?.audioLevels?.lastClipAt ?? null;
  const headroomArmed = Math.abs(headroomDb) > 0.05;
  const headroomActive = dspPathActive && headroomArmed;
  const guardStateKey: string =
    headroomActive ? 'dsp.panel.headroom.guardActive' :
    headroomArmed ? 'dsp.panel.headroom.guardStandby' :
    'dsp.panel.headroom.guardDirect';
  const statusTone: HeadroomTone = !dspPathActive ? 'good' : clippingRisk ? 'risk' : headroomWarning ? 'warn' : 'good';
  const statusKey: string =
    statusTone === 'risk' ? 'dsp.panel.headroom.statusRisk' :
    statusTone === 'warn' ? 'dsp.panel.headroom.statusClose' :
    'dsp.panel.headroom.statusSafe';
  const reasonKey: string =
    !dspPathActive ? 'dsp.panel.headroom.reasonDirect' :
    clipCount > 0 || audioStatus?.dspClippingRisk || audioStatus?.dspLimiterProtecting ? 'dsp.panel.headroom.reasonClipping' :
    eqState.clippingRisk ? 'dsp.panel.headroom.reasonEq' :
    roomCorrection.clippingRisk ? 'dsp.panel.headroom.reasonRoom' :
    channelBalance.clippingRisk ? 'dsp.panel.headroom.reasonChannel' :
    srcTruePeakReserveRecommended ? 'dsp.panel.headroom.reasonSrcTruePeak' :
    truePeakHeadroomDb !== null && truePeakHeadroomDb <= 1 ? 'dsp.panel.headroom.reasonOutput' :
    outputPeakDb !== null && outputPeakDb >= -1 ? 'dsp.panel.headroom.reasonOutput' :
    liveHeadroomDb !== null && liveHeadroomDb <= 1 ? 'dsp.panel.headroom.reasonLive' :
    'dsp.panel.headroom.reasonSafe';
  const modeOptions = [
    { value: 0, title: t('dsp.panel.headroom.modeDirect'), detail: t('dsp.panel.headroom.modeDirectDetail') },
    { value: -3, title: t('dsp.panel.headroom.modeDaily'), detail: t('dsp.panel.headroom.modeDailyDetail') },
    { value: -6, title: t('dsp.panel.headroom.modeDsp'), detail: t('dsp.panel.headroom.modeDspDetail') },
  ];
  const protectiveFloorDb = statusTone === 'risk' ? -6 : statusTone === 'warn' ? -3 : headroomDb;
  const protectiveHeadroomDb = roundHeadroomDb(Math.min(headroomDb, recommendedHeadroomDb, protectiveFloorDb));
  const conservativeHeadroomDb = roundHeadroomDb(Math.min(headroomDb, -6));
  const canApplyProtective = dspPathActive && protectiveHeadroomDb < headroomDb - 0.05;
  const canApplyConservative = dspPathActive && conservativeHeadroomDb < headroomDb - 0.05;
  const nextStepKey: string =
    !dspPathActive ? 'dsp.panel.headroom.nextDirect' :
    canApplyProtective ? 'dsp.panel.headroom.nextProtect' :
    statusTone === 'risk' ? 'dsp.panel.headroom.nextHoldRisk' :
    statusTone === 'warn' ? 'dsp.panel.headroom.nextWatch' :
    headroomActive ? 'dsp.panel.headroom.nextReady' :
    headroomArmed ? 'dsp.panel.headroom.nextStandby' :
    'dsp.panel.headroom.nextDirect';
  const nextStepDetailKey: string =
    !dspPathActive ? 'dsp.panel.headroom.nextDirectDetail' :
    canApplyProtective ? 'dsp.panel.headroom.nextProtectDetail' :
    statusTone === 'risk' ? 'dsp.panel.headroom.nextHoldRiskDetail' :
    statusTone === 'warn' ? 'dsp.panel.headroom.nextWatchDetail' :
    headroomActive ? 'dsp.panel.headroom.nextReadyDetail' :
    headroomArmed ? 'dsp.panel.headroom.nextStandbyDetail' :
    'dsp.panel.headroom.nextDirectDetail';

  useEffect(() => {
    setDraftHeadroomDb(headroomDb);
  }, [headroomDb]);

  const applyHeadroomValue = (value: number): void => {
    const nextValue = roundHeadroomDb(value);
    setDraftHeadroomDb(nextValue);
    if (Math.abs(nextValue - headroomDb) > 0.05) onHeadroomChange(nextValue);
  };

  return (
    <section className="dsp-module-panel dsp-module-panel--headroom">
      <div className="dsp-headroom-status" data-tone={statusTone}>
        <span>
          <em>{t('dsp.panel.headroom.status')}</em>
          <strong>{t(statusKey)}</strong>
        </span>
        <p>{t(reasonKey)}</p>
      </div>

      <div className="dsp-headroom-main">
        <div className="dsp-headroom-control">
          <div className="dsp-headroom-reserve" data-tone={statusTone}>
            <div className="dsp-headroom-reserve-heading">
              <span>
                <em>{t('dsp.panel.headroom.reserve')}</em>
                <small>{t('dsp.panel.headroom.note')}</small>
              </span>
              <output aria-live="polite">{formatDb(draftHeadroomDb)}</output>
            </div>
            <label className="dsp-headroom-range">
              <span>{t('dsp.panel.headroom.reserve')}</span>
              <input
                type="range"
                min={dspHeadroomMinDb}
                max={dspHeadroomMaxDb}
                step="0.1"
                value={draftHeadroomDb}
                disabled={busyKey === 'headroom'}
                aria-valuetext={formatDb(draftHeadroomDb)}
                onChange={(event) => setDraftHeadroomDb(roundHeadroomDb(Number(event.currentTarget.value)))}
                onPointerUp={(event) => applyHeadroomValue(Number(event.currentTarget.value))}
                onPointerCancel={() => setDraftHeadroomDb(headroomDb)}
                onBlur={(event) => applyHeadroomValue(Number(event.currentTarget.value))}
                onKeyUp={(event) => applyHeadroomValue(Number(event.currentTarget.value))}
              />
            </label>
            <div className="dsp-headroom-modes" role="group" aria-label={t('dsp.panel.headroom.modeAria')}>
              {modeOptions.map((option) => (
                <button type="button" data-active={Math.abs(draftHeadroomDb - option.value) <= 0.05} disabled={busyKey === 'headroom'} key={option.value} onClick={() => applyHeadroomValue(option.value)}>
                  <strong>{option.title}</strong>
                  <span>{option.detail}</span>
                  <em>{formatDb(option.value)}</em>
                </button>
              ))}
            </div>
          </div>

          <div className="dsp-module-metrics dsp-headroom-metrics dsp-headroom-metrics--primary">
            <DspMetric label={t('dsp.metric.inputPeak')} value={formatLevel(inputPeakDb)} />
            <DspMetric label={t('dsp.metric.outputEstimate')} value={formatLevel(outputPeakDb)} />
            <DspMetric label={t('dsp.metric.truePeak')} value={formatLevel(truePeakDb)} tone={truePeakHeadroomDb !== null && truePeakHeadroomDb <= 1 ? 'warn' : undefined} />
            <DspMetric label={t('dsp.metric.liveHeadroom')} value={formatLevel(liveHeadroomDb)} tone={statusTone === 'risk' ? 'risk' : 'good'} />
          </div>

          <div className="dsp-headroom-budget" aria-label={t('dsp.panel.headroom.budgetAria')}>
            <span style={{ width: `${Math.max(6, Math.min(100, ((inputPeakDb ?? -18) + 24) * 3.3))}%` }}>
              <em>{t('dsp.metric.inputPeak')}</em>
              <strong>{formatLevel(inputPeakDb)}</strong>
            </span>
            <span style={{ width: `${Math.max(6, Math.min(100, ((outputPeakDb ?? -18) + 24) * 3.3))}%` }}>
              <em>{t('dsp.metric.outputEstimate')}</em>
              <strong>{formatLevel(outputPeakDb)}</strong>
            </span>
            <span data-tone={statusTone}>
              <em>{t('dsp.metric.liveHeadroom')}</em>
              <strong>{formatLevel(liveHeadroomDb)}</strong>
            </span>
          </div>
        </div>

        <aside className="dsp-headroom-assist">
          <div className="dsp-headroom-next-step" data-tone={statusTone}>
            <div className="dsp-headroom-next-step-heading">
              <span>
                <em>{t('dsp.panel.headroom.nextStep')}</em>
                <strong>{t(nextStepKey)}</strong>
              </span>
              <span className="dsp-headroom-recommended-value">
                <em>{t('dsp.panel.headroom.recommendation')}</em>
                <strong>{hasRecommendation ? formatDb(recommendedHeadroomDb) : t('dsp.panel.headroom.recommendationSafe')}</strong>
              </span>
            </div>
            <p>{t(nextStepDetailKey)}</p>
            <div className="dsp-headroom-next-step-actions">
              <button type="button" disabled={!canApplyProtective || busyKey === 'headroom'} onClick={() => applyHeadroomValue(protectiveHeadroomDb)}>
                <ShieldCheck size={14} aria-hidden="true" />
                {t('dsp.panel.headroom.primaryAction', { value: formatDb(protectiveHeadroomDb) })}
              </button>
              <button type="button" onClick={onRefresh}>
                <Activity size={14} aria-hidden="true" />
                {t('dsp.action.refresh')}
              </button>
            </div>
          </div>

          <div className="dsp-module-metrics dsp-headroom-metrics dsp-headroom-metrics--diagnostics">
            <DspMetric label={t('dsp.panel.headroom.guardState')} value={t(guardStateKey)} tone={headroomActive ? 'good' : headroomArmed ? 'warn' : undefined} />
            <DspMetric label={t('dsp.panel.headroom.clipCount')} value={t('dsp.panel.headroom.clipCountValue', { count: String(clipCount) })} tone={clipCount > 0 ? 'risk' : 'good'} />
            <DspMetric label={t('dsp.panel.headroom.lastClip')} value={formatTime(lastClipAt, t('dsp.panel.headroom.noClip'))} tone={clipCount > 0 ? 'risk' : undefined} />
          </div>

          <button className="dsp-headroom-conservative" type="button" disabled={!canApplyConservative || busyKey === 'headroom'} onClick={() => applyHeadroomValue(conservativeHeadroomDb)}>
            <ShieldCheck size={14} aria-hidden="true" />
            {t('dsp.panel.headroom.makeConservative')}
          </button>
          <p className="dsp-module-note">{t('dsp.panel.headroom.note')}</p>
        </aside>
      </div>
    </section>
  );
};

const RoomCorrectionPanel = ({
  roomCorrection,
  eqState,
  audioStatus,
  busyKey,
  onImportRoomCorrection,
  onToggleRoomCorrection,
  onEnableRoomSafely,
  onRoomTrimChange,
  onClearRoomCorrection,
  onRefresh,
}: ModulePanelProps): JSX.Element => {
  const { t } = useDspI18n();
  const hasIr = Boolean(roomCorrection.irId);
  const roomTone: HeadroomTone = roomCorrection.clippingRisk || roomCorrection.status === 'error' ? 'risk' : roomCorrection.enabled ? 'good' : hasIr ? 'warn' : 'good';
  const heroTitleKey: string =
    roomCorrection.enabled ? 'dsp.panel.room.hero.activeTitle' :
    hasIr ? 'dsp.panel.room.hero.loadedTitle' :
    'dsp.panel.room.hero.emptyTitle';
  const heroDetailKey: string =
    roomCorrection.enabled ? 'dsp.panel.room.hero.activeDetail' :
    hasIr ? 'dsp.panel.room.hero.loadedDetail' :
    'dsp.panel.room.hero.emptyDetail';
  const nextTitleKey: string =
    roomCorrection.clippingRisk ? 'dsp.panel.room.nextTrim' :
    roomCorrection.enabled ? 'dsp.panel.room.nextListen' :
    hasIr ? 'dsp.panel.room.nextEnable' :
    'dsp.panel.room.nextImport';
  const nextDetailKey: string =
    roomCorrection.clippingRisk ? 'dsp.panel.room.nextTrimDetail' :
    roomCorrection.enabled ? 'dsp.panel.room.nextListenDetail' :
    hasIr ? 'dsp.panel.room.nextEnableDetail' :
    'dsp.panel.room.nextImportDetail';
  const dspHeadroomDb = eqState.dspHeadroomDb ?? 0;
  const bitPerfectValue = roomCorrection.enabled ? t('dsp.status.disabledByDsp') : t('dsp.status.ready');
  const clippingValue = roomCorrection.clippingRisk ? t('dsp.status.riskDetected') : t('dsp.status.clear');
  const latencyValue = roomCorrection.latencySamples > 0 ? `${roomCorrection.latencySamples} samples` : t('dsp.status.none');
  const outputPeakDb = finiteLevel(audioStatus?.audioLevels?.estimatedOutputPeakDb);
  const safeTrimDb = Math.min(roomCorrection.trimDb, -6);
  const canSafeEnable = hasIr && !roomCorrection.enabled;

  return (
    <section className="dsp-module-panel dsp-module-panel--room" data-enabled={roomCorrection.enabled} data-tone={roomTone}>
      <div className="dsp-room-main">
        <div className="dsp-room-hero">
          <p>{t(heroDetailKey)}</p>
          <div className="dsp-room-primary">
            <span>
              <em>{t('dsp.panel.room.hero.state')}</em>
              <strong>{t(heroTitleKey)}</strong>
              <small>{t('dsp.panel.room.safeEnableHint')}</small>
            </span>
            <div className="dsp-module-actions">
              <button type="button" disabled={busyKey === 'room-import'} onClick={onImportRoomCorrection}>
                <FileAudio size={14} aria-hidden="true" />
                {t('dsp.action.importIr')}
              </button>
              <button type="button" disabled={!canSafeEnable || busyKey !== null} onClick={onEnableRoomSafely}>
                <ShieldCheck size={14} aria-hidden="true" />
                {t('dsp.action.enableFirSafely')}
              </button>
              <button type="button" data-active={roomCorrection.enabled} disabled={!hasIr || busyKey === 'room-toggle'} onClick={onToggleRoomCorrection}>
                <Zap size={14} aria-hidden="true" />
                {roomCorrection.enabled ? t('dsp.action.disableFir') : t('dsp.action.enableFir')}
              </button>
              <button type="button" disabled={!hasIr || busyKey === 'room-clear'} onClick={onClearRoomCorrection}>
                {t('dsp.action.clear')}
              </button>
            </div>
          </div>
        </div>

        <label className="dsp-module-range dsp-room-trim">
          <span>{t('dsp.panel.room.trim')}</span>
          <input
            type="range"
            min={roomCorrectionMinTrimDb}
            max={roomCorrectionMaxTrimDb}
            step="0.1"
            value={roomCorrection.trimDb}
            disabled={!hasIr}
            onChange={(event) => onRoomTrimChange(Number(event.currentTarget.value))}
          />
          <strong>{formatDb(roomCorrection.trimDb)}</strong>
        </label>

        <div className="dsp-room-trim-tools" role="group" aria-label={t('dsp.panel.room.quickTrim')}>
          <span>{t('dsp.panel.room.quickTrim')}</span>
          {[-6, -3, 0].map((trimPreset) => (
            <button
              type="button"
              data-active={Math.abs(roomCorrection.trimDb - trimPreset) <= 0.05}
              disabled={!hasIr || busyKey === 'room-trim'}
              key={trimPreset}
              onClick={() => onRoomTrimChange(trimPreset)}
            >
              {formatDb(trimPreset)}
            </button>
          ))}
        </div>

        <div className="dsp-module-metrics dsp-room-metrics">
          <DspMetric label={t('dsp.metric.ir')} value={roomCorrection.irName ?? t('dsp.status.noIr')} tone={hasIr ? 'good' : undefined} />
          <DspMetric label={t('dsp.metric.mode')} value={roomCorrection.channelMode} />
          <DspMetric label={t('dsp.metric.taps')} value={roomCorrection.tapCount > 0 ? String(roomCorrection.tapCount) : '--'} />
          <DspMetric label={t('dsp.metric.sampleRate')} value={roomCorrection.sampleRate ? `${roomCorrection.sampleRate} Hz` : '--'} />
          <DspMetric label={t('dsp.metric.latency')} value={latencyValue} />
          <DspMetric label={t('dsp.metric.outputEstimate')} value={formatLevel(outputPeakDb)} tone={roomCorrection.clippingRisk ? 'risk' : undefined} />
        </div>

        {roomCorrection.error ? <p className="dsp-module-error">{roomCorrection.error}</p> : null}
        <p className="dsp-module-note">{t('dsp.panel.room.note')}</p>
      </div>

      <aside className="dsp-room-side">
        <div className="dsp-room-status" data-tone={roomTone}>
          <span>
            <ShieldCheck size={17} aria-hidden="true" />
            <em>{t('dsp.panel.room.safetyTitle')}</em>
          </span>
          <strong>{roomTone === 'risk' ? t('dsp.status.riskDetected') : t('dsp.status.signalProtected')}</strong>
          <p>{roomTone === 'risk' ? t('dsp.panel.room.safetyRisk') : t('dsp.panel.room.safetySafe')}</p>
        </div>

        <div className="dsp-room-route">
          <span>
            <Route size={16} aria-hidden="true" />
            <em>{t('dsp.panel.room.routeTitle')}</em>
          </span>
          <dl>
            <div>
              <dt>{t('dsp.metric.bitPerfect')}</dt>
              <dd>{bitPerfectValue}</dd>
            </div>
            <div>
              <dt>{t('dsp.panel.headroom.reserve')}</dt>
              <dd>{formatDb(dspHeadroomDb)}</dd>
            </div>
            <div>
              <dt>{t('dsp.metric.clipping')}</dt>
              <dd>{clippingValue}</dd>
            </div>
            <div>
              <dt>{t('dsp.metric.latency')}</dt>
              <dd>{latencyValue}</dd>
            </div>
          </dl>
        </div>

        <div className="dsp-room-next">
          <span>
            <Info size={16} aria-hidden="true" />
            <em>{t('dsp.panel.headroom.nextStep')}</em>
          </span>
          <strong>{t(nextTitleKey)}</strong>
          <p>{t(nextDetailKey)}</p>
          <div className="dsp-room-next-actions">
            {!hasIr ? (
              <button type="button" disabled={busyKey === 'room-import'} onClick={onImportRoomCorrection}>
                <FileAudio size={14} aria-hidden="true" />
                {t('dsp.action.importIr')}
              </button>
            ) : roomCorrection.clippingRisk ? (
              <>
                <button type="button" disabled={busyKey === 'room-trim'} onClick={() => onRoomTrimChange(safeTrimDb)}>
                  <Gauge size={14} aria-hidden="true" />
                  {t('dsp.panel.room.nextTrim')}
                </button>
                <button type="button" onClick={onRefresh}>
                  {t('dsp.action.refresh')}
                </button>
              </>
            ) : roomCorrection.enabled ? (
              <>
                <button type="button" data-active onClick={onToggleRoomCorrection}>
                  <Zap size={14} aria-hidden="true" />
                  {t('dsp.action.disableFir')}
                </button>
                <button type="button" onClick={onRefresh}>
                  {t('dsp.action.refresh')}
                </button>
              </>
            ) : (
              <>
                <button type="button" disabled={busyKey !== null} onClick={onEnableRoomSafely}>
                  <ShieldCheck size={14} aria-hidden="true" />
                  {t('dsp.action.enableFirSafely')}
                </button>
                <button type="button" disabled={busyKey === 'room-toggle'} onClick={onToggleRoomCorrection}>
                  <Zap size={14} aria-hidden="true" />
                  {t('dsp.action.enableFir')}
                </button>
              </>
            )}
          </div>
        </div>

        <div className="dsp-room-expansion">
          <span><Clock3 size={15} aria-hidden="true" />{t('dsp.panel.room.future.recent')}</span>
          <span><AudioWaveform size={15} aria-hidden="true" />{t('dsp.panel.room.future.response')}</span>
        </div>
      </aside>
    </section>
  );
};

const ChannelPanel = ({ channelBalance, busyKey, onChannelPatch, onChannelReset }: ModulePanelProps): JSX.Element => {
  const { t } = useDspI18n();
  const [trimStepDb, setTrimStepDb] = useState(0.25);
  const [channelPresets, setChannelPresets] = useState<ChannelBalancePreset[]>(() => readChannelPresets());
  const [activeChannelPresetId, setActiveChannelPresetId] = useState<string | null>(null);
  const [presetNameDraft, setPresetNameDraft] = useState(() => t('dsp.panel.channel.presetDefaultName'));
  const [renamingPresetId, setRenamingPresetId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [compareBypassed, setCompareBypassed] = useState(false);
  const [panelMode, setPanelMode] = useState<ChannelPanelMode>('simple');
  const [balanceDraftPercent, setBalanceDraftPercent] = useState(() => Math.round(channelBalance.balance * 1000) / 10);
  const [balanceDragging, setBalanceDragging] = useState(false);
  const compareSnapshotRef = useRef<ChannelBalanceState | null>(null);
  const leftGainDb = Number(channelBalance.leftGainDb ?? 0);
  const rightGainDb = Number(channelBalance.rightGainDb ?? 0);
  const bandGains = normalizeChannelBandGains(channelBalance.bandGains);
  const leftDelayMs = Number(channelBalance.leftDelayMs ?? 0);
  const rightDelayMs = Number(channelBalance.rightDelayMs ?? 0);
  const balanceGain = getBalanceGainDb(channelBalance.balance, channelBalance.constantPower);
  const effectiveLeftDb = leftGainDb + balanceGain.leftDb;
  const effectiveRightDb = rightGainDb + balanceGain.rightDb;
  const outputSkewDb = effectiveRightDb - effectiveLeftDb;
  const outputSkewAbsDb = Math.abs(outputSkewDb);
  const outputSkewLabel = outputSkewAbsDb < 0.05
    ? t('dsp.panel.channel.centered')
    : outputSkewDb > 0
      ? t('dsp.panel.channel.leansRight', { value: formatPreciseDb(outputSkewAbsDb) })
      : t('dsp.panel.channel.leansLeft', { value: formatPreciseDb(outputSkewAbsDb) });
  const delaySkewMs = rightDelayMs - leftDelayMs;
  const leftMeterWidth = clampNumber(50 - (outputSkewDb * 8), 8, 92);
  const rightMeterWidth = 100 - leftMeterWidth;
  const hasBandEffect = channelBalanceBandIds.some((bandId) => (
    Math.abs(bandGains[bandId].leftGainDb) > 0.001 || Math.abs(bandGains[bandId].rightGainDb) > 0.001
  ));
  const hasAdvancedEffect =
    channelBalance.swapLeftRight
    || channelBalance.monoMode !== 'off'
    || channelBalance.invertLeft
    || channelBalance.invertRight
    || hasBandEffect;
  const patchChannel = (patch: Partial<ChannelBalanceState>): void => {
    setActiveChannelPresetId(null);
    onChannelPatch(patch);
  };
  useEffect(() => {
    if (!balanceDragging) {
      setBalanceDraftPercent(Math.round(channelBalance.balance * 1000) / 10);
    }
  }, [balanceDragging, channelBalance.balance]);
  const patchBalancePercent = (nextPercent: number): void => {
    const roundedPercent = Math.round(clampNumber(nextPercent, -100, 100) * 10) / 10;
    setBalanceDraftPercent(roundedPercent);
    patchChannel({ balance: clampNumber(roundedPercent / 100, -1, 1), enabled: true });
  };
  const patchBandGain = (bandId: ChannelBalanceBandId, side: 'leftGainDb' | 'rightGainDb', gainDb: number): void => {
    patchChannel({
      bandGains: {
        ...bandGains,
        [bandId]: {
          ...bandGains[bandId],
          [side]: roundChannelBandGainDb(gainDb),
        },
      },
      enabled: true,
    });
  };
  const swapCompensationDirection = (): void => {
    patchChannel({
      leftGainDb: rightGainDb,
      rightGainDb: leftGainDb,
      leftDelayMs: rightDelayMs,
      rightDelayMs: leftDelayMs,
      bandGains: channelBalanceBandIds.reduce<NonNullable<ChannelBalanceState['bandGains']>>((next, bandId) => {
        next[bandId] = {
          leftGainDb: bandGains[bandId].rightGainDb,
          rightGainDb: bandGains[bandId].leftGainDb,
        };
        return next;
      }, {
        low: { ...defaultBandGains.low },
        mid: { ...defaultBandGains.mid },
        high: { ...defaultBandGains.high },
      }),
      enabled: true,
    });
  };
  const resetChannel = (): void => {
    compareSnapshotRef.current = null;
    setCompareBypassed(false);
    setActiveChannelPresetId(null);
    onChannelReset();
  };
  const clearCompensation = (): void => {
    patchChannel({
      enabled: hasAdvancedEffect,
      balance: 0,
      leftGainDb: 0,
      rightGainDb: 0,
      bandGains: normalizeChannelBandGains(null),
      leftDelayMs: 0,
      rightDelayMs: 0,
    });
  };
  const toggleCompareBypass = (): void => {
    if (compareBypassed) {
      const snapshot = compareSnapshotRef.current;
      compareSnapshotRef.current = null;
      setCompareBypassed(false);
      if (snapshot) {
        onChannelPatch(snapshot);
      }
      return;
    }

    compareSnapshotRef.current = normalizeChannelBalanceState(channelBalance);
    setCompareBypassed(true);
    onChannelPatch({ enabled: false });
  };
  const saveChannelPreset = (): void => {
    const presetName = presetNameDraft.trim() || t('dsp.panel.channel.presetDefaultName');

    const sourceState = compareBypassed && compareSnapshotRef.current ? compareSnapshotRef.current : channelBalance;
    const nextPreset: ChannelBalancePreset = {
      id: `channel-${Date.now()}`,
      name: presetName.slice(0, 40),
      state: { ...normalizeChannelBalanceState(sourceState), enabled: true, clippingRisk: false },
      createdAt: new Date().toISOString(),
    };
    setChannelPresets((current) => {
      const next = [nextPreset, ...current.filter((preset) => preset.name !== nextPreset.name)].slice(0, maxChannelPresetCount);
      writeChannelPresets(next);
      return next;
    });
    setActiveChannelPresetId(nextPreset.id);
    setPresetNameDraft(t('dsp.panel.channel.presetDefaultName'));
  };
  const applyChannelPreset = (preset: ChannelBalancePreset): void => {
    compareSnapshotRef.current = null;
    setCompareBypassed(false);
    setActiveChannelPresetId(preset.id);
    onChannelPatch({ ...preset.state, enabled: true });
  };
  const renameChannelPreset = (preset: ChannelBalancePreset): void => {
    setRenamingPresetId(preset.id);
    setRenameDraft(preset.name);
  };
  const commitRenameChannelPreset = (presetId: string): void => {
    const presetName = renameDraft.trim();

    if (!presetName) {
      setRenamingPresetId(null);
      return;
    }

    setChannelPresets((current) => {
      const next = current.map((item) => (
        item.id === presetId
          ? { ...item, name: presetName.slice(0, 40) }
          : item
      ));
      writeChannelPresets(next);
      return next;
    });
    setRenamingPresetId(null);
    setRenameDraft('');
  };
  const removeChannelPreset = (presetId: string): void => {
    if (activeChannelPresetId === presetId) {
      setActiveChannelPresetId(null);
    }
    if (renamingPresetId === presetId) {
      setRenamingPresetId(null);
      setRenameDraft('');
    }

    setChannelPresets((current) => {
      const next = current.filter((preset) => preset.id !== presetId);
      writeChannelPresets(next);
      return next;
    });
  };
  const activeChannelPreset = channelPresets.find((preset) => preset.id === activeChannelPresetId) ?? null;

  return (
    <section className="dsp-module-panel dsp-module-panel--channel" data-enabled={channelBalance.enabled}>
      <div className="dsp-channel-main">
        <div className="dsp-channel-hero">
          <div className="dsp-channel-primary">
            <span>
              <em>{t('dsp.panel.channel.compensationTitle')}</em>
              <strong>{outputSkewLabel}</strong>
              <small>{t('dsp.panel.channel.compensationDetail')}</small>
            </span>
            <div className="dsp-module-actions">
              <button
                type="button"
                className="dsp-channel-toggle"
                aria-pressed={channelBalance.enabled}
                data-active={channelBalance.enabled}
                disabled={busyKey === 'channel'}
                onClick={() => patchChannel({ enabled: !channelBalance.enabled })}
              >
                <span className="dsp-channel-toggle-rail" aria-hidden="true"><span /></span>
                <span className="dsp-channel-toggle-copy">
                  <strong>{t('dsp.panel.channel.compensationTitle')}</strong>
                  <small>{channelBalance.enabled ? t('dsp.panel.channel.compensationOn') : t('dsp.panel.channel.compensationOff')}</small>
                </span>
              </button>
              <button type="button" data-active={compareBypassed} disabled={busyKey === 'channel'} onClick={toggleCompareBypass}>
                {compareBypassed ? t('dsp.panel.channel.compareActive') : t('dsp.panel.channel.compare')}
              </button>
              <button type="button" disabled={busyKey === 'channel-reset'} onClick={resetChannel}>
                <RotateCcw size={14} />{t('dsp.action.reset')}
              </button>
            </div>
          </div>

          <div className="dsp-channel-mode-tabs" role="tablist" aria-label={t('dsp.panel.channel.advanced')}>
            {(['simple', 'pro'] as const).map((mode) => (
              <button
                type="button"
                aria-selected={panelMode === mode}
                data-active={panelMode === mode}
                key={mode}
                onClick={() => setPanelMode(mode)}
                role="tab"
              >
                {mode === 'simple' ? t('dsp.panel.channel.modeSimple') : t('dsp.panel.channel.modePro')}
              </button>
            ))}
          </div>

          <div className="dsp-channel-bias-card">
            <div className="dsp-channel-bias-head">
              <span>{t('dsp.panel.channel.leftOutput')}</span>
              <strong>{outputSkewLabel}</strong>
              <span>{t('dsp.panel.channel.rightOutput')}</span>
            </div>
            <div className="dsp-channel-bias-meter" aria-hidden="true">
              <span data-side="left" style={{ width: `${leftMeterWidth}%` }} />
              <i />
              <span data-side="right" style={{ width: `${rightMeterWidth}%` }} />
            </div>
            <div className="dsp-channel-bias-values">
              <strong>{formatPreciseDb(effectiveLeftDb)}</strong>
              <strong>{formatPreciseDb(effectiveRightDb)}</strong>
            </div>
          </div>

          <div className="dsp-channel-trim-tools">
            <span>{t('dsp.panel.channel.step')}</span>
            {[...electrostaticTrimSteps, ...channelTrimSteps.filter((stepDb) => stepDb !== 0.25)].map((stepDb) => (
              <button type="button" data-active={trimStepDb === stepDb} key={stepDb} onClick={() => setTrimStepDb(stepDb)}>
                {formatPreciseDb(stepDb)}
              </button>
            ))}
            <button
              type="button"
              disabled={leftGainDb <= channelBalanceMinGainDb + 0.001}
              onClick={() => patchChannel({ leftGainDb: roundChannelGainDb(leftGainDb - trimStepDb), enabled: true })}
            >
              {t('dsp.panel.channel.leftTooLoud')}
            </button>
            <button
              type="button"
              disabled={rightGainDb <= channelBalanceMinGainDb + 0.001}
              onClick={() => patchChannel({ rightGainDb: roundChannelGainDb(rightGainDb - trimStepDb), enabled: true })}
            >
              {t('dsp.panel.channel.rightTooLoud')}
            </button>
            <button type="button" onClick={clearCompensation}>
              {t('dsp.panel.channel.trimCenter')}
            </button>
            <button type="button" onClick={swapCompensationDirection}>
              {t('dsp.panel.channel.swapCompensation')}
            </button>
          </div>

          {panelMode === 'pro' ? (
            <div className="dsp-channel-band-card">
              <div className="dsp-channel-band-head">
                <em>{t('dsp.panel.channel.bandCompensation')}</em>
                <span><Info size={15} aria-hidden="true" />{t('dsp.panel.channel.safeAttenuation')}</span>
              </div>
              {channelBalanceBandIds.map((bandId) => (
                <div className="dsp-channel-band-row" key={bandId}>
                  <span>
                    <strong>{t(channelBandLabels[bandId].titleKey)}</strong>
                    <small>{channelBandLabels[bandId].range}</small>
                  </span>
                  <label>
                    <small>{t('dsp.panel.channel.leftOutput')}</small>
                    <input
                      type="number"
                      min={channelBalanceBandMinGainDb}
                      max={channelBalanceBandMaxGainDb}
                      step="0.1"
                      value={bandGains[bandId].leftGainDb}
                      onChange={(event) => patchBandGain(bandId, 'leftGainDb', Number(event.currentTarget.value))}
                    />
                  </label>
                  <label>
                    <small>{t('dsp.panel.channel.rightOutput')}</small>
                    <input
                      type="number"
                      min={channelBalanceBandMinGainDb}
                      max={channelBalanceBandMaxGainDb}
                      step="0.1"
                      value={bandGains[bandId].rightGainDb}
                      onChange={(event) => patchBandGain(bandId, 'rightGainDb', Number(event.currentTarget.value))}
                    />
                  </label>
                </div>
              ))}
            </div>
          ) : null}

          <label className="dsp-module-range dsp-channel-balance-range">
            <span>{t('dsp.panel.channel.balance')}</span>
            <input
              type="range"
              min="-100"
              max="100"
              step="0.5"
              value={balanceDragging ? balanceDraftPercent : Math.round(channelBalance.balance * 1000) / 10}
              onBlur={() => setBalanceDragging(false)}
              onChange={(event) => patchBalancePercent(Number(event.currentTarget.value))}
              onPointerCancel={() => setBalanceDragging(false)}
              onPointerDown={() => setBalanceDragging(true)}
              onPointerUp={() => setBalanceDragging(false)}
            />
            <strong>{formatBalancePosition((balanceDragging ? balanceDraftPercent : Math.round(channelBalance.balance * 1000) / 10) / 100)}</strong>
          </label>

          {panelMode === 'pro' ? (
            <div className="dsp-module-grid dsp-channel-grid">
              <label>
                <span>{t('dsp.panel.channel.leftGain')}</span>
                <input type="number" min={channelBalanceMinGainDb} max={channelBalanceMaxGainDb} step="0.05" value={leftGainDb} onChange={(event) => patchChannel({ leftGainDb: roundChannelGainDb(Number(event.currentTarget.value)), enabled: true })} />
              </label>
              <label>
                <span>{t('dsp.panel.channel.rightGain')}</span>
                <input type="number" min={channelBalanceMinGainDb} max={channelBalanceMaxGainDb} step="0.05" value={rightGainDb} onChange={(event) => patchChannel({ rightGainDb: roundChannelGainDb(Number(event.currentTarget.value)), enabled: true })} />
              </label>
              <label>
                <span>{t('dsp.panel.channel.leftDelay')}</span>
                <input type="number" min={channelBalanceMinDelayMs} max={channelBalanceMaxDelayMs} step="0.01" value={leftDelayMs} onChange={(event) => patchChannel({ leftDelayMs: roundChannelDelayMs(Number(event.currentTarget.value)), enabled: true })} />
              </label>
              <label>
                <span>{t('dsp.panel.channel.rightDelay')}</span>
                <input type="number" min={channelBalanceMinDelayMs} max={channelBalanceMaxDelayMs} step="0.01" value={rightDelayMs} onChange={(event) => patchChannel({ rightDelayMs: roundChannelDelayMs(Number(event.currentTarget.value)), enabled: true })} />
              </label>
            </div>
          ) : null}
        </div>
      </div>

      <aside className="dsp-channel-side">
        <div className="dsp-channel-summary">
          <DspMetric label={t('dsp.panel.channel.leftOutput')} value={formatPreciseDb(effectiveLeftDb)} />
          <DspMetric label={t('dsp.panel.channel.rightOutput')} value={formatPreciseDb(effectiveRightDb)} />
          <DspMetric label={t('dsp.panel.channel.delaySkew')} value={`${delaySkewMs > 0 ? '+' : ''}${Math.round(delaySkewMs * 100) / 100} ms`} />
        </div>

        <div className="dsp-channel-tools">
          <span><Info size={15} aria-hidden="true" />{t('dsp.panel.channel.he90Hint')}</span>
        </div>

        <div className="dsp-channel-tools">
          <span><Info size={15} aria-hidden="true" />{t('dsp.panel.channel.compareHint')}</span>
        </div>

        <div className="dsp-channel-tools">
          <em>{t('dsp.panel.channel.presets')}</em>
          <div className="dsp-channel-presets">
            <div className="dsp-channel-save-row">
              <label>
                <span>{t('dsp.panel.channel.presetName')}</span>
                <input
                  type="text"
                  maxLength={40}
                  value={presetNameDraft}
                  onChange={(event) => setPresetNameDraft(event.currentTarget.value)}
                />
              </label>
              <button type="button" onClick={saveChannelPreset}>
                <Save size={14} aria-hidden="true" />{t('dsp.panel.channel.saveCurrent')}
              </button>
            </div>
            {channelPresets.length > 0 ? (
              <>
                <div className="dsp-channel-preset-picker">
                  <label>
                    <span>{t('dsp.panel.channel.switchPreset')}</span>
                    <select
                      value={activeChannelPresetId ?? ''}
                      onChange={(event) => {
                        const preset = channelPresets.find((item) => item.id === event.currentTarget.value);
                        if (preset) {
                          applyChannelPreset(preset);
                        }
                      }}
                    >
                      <option value="">{t('dsp.panel.channel.selectPreset')}</option>
                      {channelPresets.map((preset) => (
                        <option key={preset.id} value={preset.id}>{preset.name}</option>
                      ))}
                    </select>
                  </label>
                  <div className="dsp-channel-preset-actions">
                    <button type="button" disabled={!activeChannelPreset} onClick={() => activeChannelPreset ? renameChannelPreset(activeChannelPreset) : undefined}>
                      <Pencil size={13} aria-hidden="true" />
                      {t('dsp.panel.channel.renamePreset')}
                    </button>
                    <button type="button" disabled={!activeChannelPreset} onClick={() => activeChannelPreset ? removeChannelPreset(activeChannelPreset.id) : undefined}>
                      <Trash2 size={13} aria-hidden="true" />
                      {t('dsp.panel.channel.removePreset')}
                    </button>
                  </div>
                </div>
                {activeChannelPreset && renamingPresetId === activeChannelPreset.id ? (
                  <div className="dsp-channel-rename-row">
                    <input
                      aria-label={t('dsp.panel.channel.renamePrompt')}
                      maxLength={40}
                      type="text"
                      value={renameDraft}
                      onChange={(event) => setRenameDraft(event.currentTarget.value)}
                    />
                    <button type="button" onClick={() => commitRenameChannelPreset(activeChannelPreset.id)}>
                      <CheckCircle2 size={13} aria-hidden="true" />
                      {t('dsp.action.save')}
                    </button>
                    <button type="button" onClick={() => setRenamingPresetId(null)}>
                      {t('dsp.action.clear')}
                    </button>
                  </div>
                ) : null}
              </>
            ) : (
              <small>{t('dsp.panel.channel.presetEmpty')}</small>
            )}
          </div>
        </div>

        {panelMode === 'pro' ? (
          <>
            <div className="dsp-channel-tools">
              <em>{t('dsp.panel.channel.monoTools')}</em>
              <span><Info size={15} aria-hidden="true" />{t('dsp.panel.channel.monoHint')}</span>
              <div className="dsp-module-actions">
                {(['off', 'sum', 'left', 'right'] as const).map((mode) => (
                  <button type="button" data-active={channelBalance.monoMode === mode} key={mode} onClick={() => patchChannel({ monoMode: mode, enabled: mode !== 'off' || channelBalance.enabled })}>
                    {t(monoModeKeyMap[mode])}
                  </button>
                ))}
              </div>
            </div>

            <div className="dsp-channel-tools">
              <em>{t('dsp.panel.channel.phaseTools')}</em>
              <div className="dsp-module-actions">
                <button type="button" data-active={channelBalance.swapLeftRight} onClick={() => patchChannel({ swapLeftRight: !channelBalance.swapLeftRight, enabled: true })}>{t('dsp.panel.channel.swap')}</button>
                <button type="button" data-active={channelBalance.invertLeft} onClick={() => patchChannel({ invertLeft: !channelBalance.invertLeft, enabled: true })}>{t('dsp.panel.channel.invertLeft')}</button>
                <button type="button" data-active={channelBalance.invertRight} onClick={() => patchChannel({ invertRight: !channelBalance.invertRight, enabled: true })}>{t('dsp.panel.channel.invertRight')}</button>
                <button type="button" data-active={channelBalance.constantPower} onClick={() => patchChannel({ constantPower: !channelBalance.constantPower })}>{t('dsp.panel.channel.constantPower')}</button>
              </div>
            </div>
          </>
        ) : null}

        <p className="dsp-module-note">{t('dsp.panel.channel.note')}</p>
      </aside>
    </section>
  );
};

const SafetyPanel = ({ audioStatus, eqState, roomCorrection, channelBalance, busyKey, onSafetyLimiterChange, onRefresh }: ModulePanelProps): JSX.Element => {
  const { t } = useDspI18n();
  const dspActive = audioStatus?.dspActive === true;
  const limiterProtecting = audioStatus?.dspLimiterProtecting === true;
  const safetyLimiterEnabled = eqState.dspSafetyLimiterEnabled !== false;
  const liveHeadroomDb = finiteLevel(audioStatus?.audioLevels?.headroomDb);
  const outputPeakDb = finiteLevel(audioStatus?.audioLevels?.estimatedOutputPeakDb);
  const truePeakHeadroomDb = finiteLevel(audioStatus?.audioLevels?.truePeakHeadroomDb);
  const clipCount = audioStatus?.audioLevels?.clipCount ?? 0;
  const clippingRisk = hasObservedDspClippingRisk(audioStatus, eqState, roomCorrection, channelBalance, clipCount);
  const headroomWarning = hasHeadroomWarning(audioStatus, outputPeakDb, liveHeadroomDb, truePeakHeadroomDb);
  const routeTone: HeadroomTone = limiterProtecting ? 'risk' : clippingRisk || headroomWarning ? 'warn' : dspActive ? 'good' : 'warn';
  const heroTitleKey: string =
    limiterProtecting || clippingRisk ? 'dsp.panel.safety.heroRiskTitle' :
    dspActive ? 'dsp.panel.safety.heroProtectedTitle' :
    'dsp.panel.safety.heroDirectTitle';
  const heroDetailKey: string =
    limiterProtecting || clippingRisk ? 'dsp.panel.safety.heroRiskDetail' :
    dspActive ? 'dsp.panel.safety.heroProtectedDetail' :
    'dsp.panel.safety.heroDirectDetail';
  const nextTitleKey: string =
    limiterProtecting || clippingRisk ? 'dsp.panel.safety.nextRisk' :
    dspActive ? 'dsp.panel.safety.nextProtected' :
    'dsp.panel.safety.nextDirect';
  const nextDetailKey: string =
    limiterProtecting || clippingRisk ? 'dsp.panel.safety.nextRiskDetail' :
    dspActive ? 'dsp.panel.safety.nextProtectedDetail' :
    'dsp.panel.safety.nextDirectDetail';
  const activeProcessModules = [
    eqState.enabled || audioStatus?.eqEnabled ? t('dsp.module.eq.title') : null,
    roomCorrection.enabled ? t('dsp.module.room.title') : null,
    channelBalance.enabled || audioStatus?.channelBalanceEnabled ? t('dsp.module.channel.title') : null,
  ].filter((module): module is string => Boolean(module));
  const processLabel = activeProcessModules.length > 0 ? activeProcessModules.join(' / ') : t('dsp.status.bypassed');
  const routeItems = [
    { key: 'dsp.panel.safety.routeInput', icon: RadioTower, value: audioStatus?.codec ?? t('dsp.status.systemOutput') },
    { key: 'dsp.panel.safety.routeHeadroom', icon: Gauge, value: formatDb(eqState.dspHeadroomDb ?? audioStatus?.dspHeadroomDb ?? 0) },
    { key: 'dsp.panel.safety.routeProcess', icon: SlidersHorizontal, value: processLabel },
    { key: 'dsp.panel.safety.routeOutput', icon: ShieldCheck, value: limiterProtecting ? t('dsp.status.limiting') : clippingRisk ? t('dsp.status.riskDetected') : t('dsp.status.ready') },
  ];
  const safetyChecks = [
    {
      label: t('dsp.panel.safety.checkBitPerfect'),
      value: dspActive ? t('dsp.status.dspPath') : t('dsp.status.candidate'),
      tone: dspActive ? undefined : 'good' as HeadroomTone,
    },
    {
      label: t('dsp.panel.safety.checkLimiter'),
      value: safetyLimiterEnabled
        ? (limiterProtecting ? t('dsp.status.limiting') : t('dsp.status.limiterArmed'))
        : t('dsp.panel.safety.limiterBypassed'),
      tone: !safetyLimiterEnabled ? 'risk' as HeadroomTone : limiterProtecting ? 'risk' as HeadroomTone : 'good' as HeadroomTone,
    },
    {
      label: t('dsp.metric.outputEstimate'),
      value: formatLevel(outputPeakDb),
      tone: outputPeakDb !== null && outputPeakDb >= -1 ? 'warn' as HeadroomTone : undefined,
    },
    {
      label: t('dsp.metric.liveHeadroom'),
      value: formatLevel(liveHeadroomDb),
      tone: liveHeadroomDb !== null && liveHeadroomDb <= 1 ? 'warn' as HeadroomTone : 'good' as HeadroomTone,
    },
    {
      label: t('dsp.panel.headroom.clipCount'),
      value: t('dsp.panel.headroom.clipCountValue', { count: String(clipCount) }),
      tone: clipCount > 0 ? 'risk' as HeadroomTone : 'good' as HeadroomTone,
    },
    {
      label: t('dsp.panel.safety.checkRoom'),
      value: roomCorrection.enabled ? t('dsp.status.active') : t('dsp.status.bypassed'),
      tone: roomCorrection.clippingRisk ? 'risk' as HeadroomTone : roomCorrection.enabled ? 'good' as HeadroomTone : undefined,
    },
    {
      label: t('dsp.panel.safety.checkChannel'),
      value: channelBalance.enabled ? t('dsp.status.active') : t('dsp.status.bypassed'),
      tone: channelBalance.clippingRisk ? 'risk' as HeadroomTone : channelBalance.enabled ? 'good' as HeadroomTone : undefined,
    },
    {
      label: t('dsp.metric.reason'),
      value: audioStatus?.bitPerfectDisabledReason ?? t('dsp.status.none'),
      tone: clippingRisk ? 'risk' as HeadroomTone : undefined,
    },
  ];

  return (
    <section className="dsp-module-panel dsp-module-panel--safety" data-tone={routeTone}>
      <div className="dsp-safety-hero">
        <div className="dsp-safety-emblem">
          <ShieldCheck size={28} aria-hidden="true" />
        </div>
        <div>
          <h2>{t(heroTitleKey)}</h2>
          <p>{t(heroDetailKey)}</p>
        </div>
      </div>

      <div className="dsp-safety-route" aria-label={t('dsp.panel.safety.chainTitle')}>
        {routeItems.map((item) => {
          const Icon = item.icon;
          return (
            <span key={item.key}>
              <Icon size={17} aria-hidden="true" />
              <em>{t(item.key)}</em>
              <strong>{item.value}</strong>
            </span>
          );
        })}
      </div>

      <div className="dsp-safety-body">
        <div className="dsp-safety-checks">
          <div className="dsp-safety-section-head">
            <span><AudioWaveform size={16} aria-hidden="true" />{t('dsp.panel.safety.checkTitle')}</span>
          </div>
          <div className="dsp-module-metrics dsp-safety-metrics">
            {safetyChecks.map((check) => (
              <DspMetric key={check.label} label={check.label} value={check.value} tone={check.tone} />
            ))}
          </div>
        </div>

        <aside className="dsp-safety-next">
          <span>
            <Info size={16} aria-hidden="true" />
            <em>{t('dsp.panel.safety.nextTitle')}</em>
          </span>
          <strong>{t(nextTitleKey)}</strong>
          <p>{t(nextDetailKey)}</p>
          <div className="dsp-module-actions" role="group" aria-label={t('dsp.panel.safety.limiterToggleTitle')}>
            <button
              type="button"
              data-active={safetyLimiterEnabled}
              disabled={busyKey === 'safety'}
              onClick={() => onSafetyLimiterChange(true)}
            >
              <ShieldCheck size={14} aria-hidden="true" />
              {t('dsp.panel.safety.enableLimiter')}
            </button>
            <button
              type="button"
              data-active={!safetyLimiterEnabled}
              disabled={busyKey === 'safety'}
              onClick={() => onSafetyLimiterChange(false)}
            >
              <Zap size={14} aria-hidden="true" />
              {t('dsp.panel.safety.disableLimiter')}
            </button>
          </div>
          {!safetyLimiterEnabled ? <p>{t('dsp.panel.safety.limiterBypassedDetail')}</p> : null}
          <button type="button" onClick={onRefresh}>
            <Activity size={14} aria-hidden="true" />
            {t('dsp.action.refresh')}
          </button>
        </aside>
      </div>

      <p className="dsp-module-note">{t('dsp.panel.safety.note')}</p>
    </section>
  );
};

const DspWorkbench = (): JSX.Element => {
  const { t } = useDspI18n();
  const { audioStatus, error } = useThrottledSharedPlaybackStatus(dspPlaybackStatusUiIntervalMs);
  const [selectedModuleId, setSelectedModuleId] = useState<DspModuleId>(() => readStoredDspModuleId());
  const [eqState, setEqState] = useState<EqState>(fallbackEqState);
  const [roomCorrection, setRoomCorrection] = useState<RoomCorrectionState>(fallbackRoomCorrection);
  const [channelBalance, setChannelBalance] = useState<ChannelBalanceState>(fallbackChannelBalance);
  const [compressor, setCompressor] = useState<CompressorState>(() => defaultDspRackState().compressor);
  const [crossfeed, setCrossfeed] = useState<CrossfeedState>(() => defaultDspRackState().crossfeed);
  const [stereoField, setStereoField] = useState<StereoFieldState>(() => defaultDspRackState().stereoField);
  const [channelMatrix, setChannelMatrix] = useState<ChannelMatrixState>(() => defaultDspRackState().channelMatrix);
  const [echoSrcMode, setEchoSrcMode] = useState<AudioEchoSrcMode>('off');
  const [echoSrcQualityProfile, setEchoSrcQualityProfile] = useState<AudioEchoSrcQualityProfile>('transparent');
  const [echoSrcAdvancedModeEnabled, setEchoSrcAdvancedModeEnabled] = useState(false);
  const [echoSrcFilterProfile, setEchoSrcFilterProfile] = useState<AudioEchoSrcFilterProfile>('poly-sinc-gauss-long');
  const [echoSrcFilterProfile1x, setEchoSrcFilterProfile1x] = useState<AudioEchoSrcFilterProfile>('poly-sinc-gauss-long');
  const [echoSrcFilterProfileNx, setEchoSrcFilterProfileNx] = useState<AudioEchoSrcFilterProfile>('poly-sinc-hb');
  const [echoSrcComputeBackend, setEchoSrcComputeBackend] = useState<AudioEchoSrcComputeBackend>('cpu');
  const [pcmDitherMode, setPcmDitherMode] = useState<AudioPcmDitherMode>('off');
  const [dsdOutputMode, setDsdOutputMode] = useState<AudioDsdOutputMode>('dop');
  const [sdmMode, setSdmMode] = useState<AudioSdmMode>('off');
  const [sdmTargetRate, setSdmTargetRate] = useState<AudioSdmTargetRate>('dsd128');
  const [sdmQualityProfile, setSdmQualityProfile] = useState<AudioSdmQualityProfile>('safe');
  const [sdmComputeBackend, setSdmComputeBackend] = useState<AudioSdmComputeBackend>('cpu');
  const [sdmOversamplingFilterProfile1x, setSdmOversamplingFilterProfile1x] = useState<AudioEchoSrcFilterProfile>('sinc-long');
  const [sdmOversamplingFilterProfileNx, setSdmOversamplingFilterProfileNx] = useState<AudioEchoSrcFilterProfile>('poly-sinc-hb');
  const [sdmSoundCompareReturnFilters, setSdmSoundCompareReturnFilters] = useState<SdmSoundFilterPair | null>(null);
  const [echoSrcCompareReturnMode, setEchoSrcCompareReturnMode] = useState<AudioEchoSrcMode | null>(null);
  const [moduleError, setModuleError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const echoSrcActionGenerationRef = useRef(0);
  const echoSrcActionQueueRef = useRef<Promise<void>>(Promise.resolve());
  const sdmActionQueueRef = useRef<Promise<void>>(Promise.resolve());
  const sdmSoundCompareAnchorMsRef = useRef<number | null>(null);

  useEffect(() => {
    writeStoredDspModuleId(selectedModuleId);
  }, [selectedModuleId]);

  const loadModuleStates = useCallback(async (): Promise<void> => {
    const eq = getEqBridge();
    if (!eq) {
      setModuleError(t('dsp.error.desktopBridge'));
      return;
    }

    try {
      const [nextEqState, nextRoomCorrection, nextChannelBalance, nextCompressor, nextCrossfeed, nextStereoField, nextChannelMatrix] = await Promise.all([
        eq.getState(),
        eq.getRoomCorrectionState?.() ?? Promise.resolve(fallbackRoomCorrection),
        eq.getChannelBalanceState(),
        eq.getCompressorState?.() ?? Promise.resolve(defaultDspRackState().compressor),
        eq.getCrossfeedState?.() ?? Promise.resolve(defaultDspRackState().crossfeed),
        eq.getStereoFieldState?.() ?? Promise.resolve(defaultDspRackState().stereoField),
        eq.getChannelMatrixState?.() ?? Promise.resolve(defaultDspRackState().channelMatrix),
      ]);
      setEqState(nextEqState);
      setRoomCorrection(nextRoomCorrection);
      setChannelBalance(nextChannelBalance);
      setCompressor(nextCompressor);
      setCrossfeed(nextCrossfeed);
      setStereoField(nextStereoField);
      setChannelMatrix(nextChannelMatrix);
      setModuleError(null);
    } catch (stateError) {
      setModuleError(stateError instanceof Error ? stateError.message : String(stateError));
    }
  }, [t]);

  useEffect(() => {
    void loadModuleStates();
  }, [loadModuleStates]);

  useEffect(() => {
    let cancelled = false;
    const applyEchoSrcSetting = (mode: unknown): void => {
      if (!cancelled) {
        const nextMode = normalizeEchoSrcMode(mode);
        setEchoSrcMode(nextMode);
        if (nextMode !== 'off') {
          setEchoSrcCompareReturnMode(nextMode);
        }
      }
    };
    const applyEchoSrcQualitySetting = (profile: unknown): void => {
      if (!cancelled) {
        setEchoSrcQualityProfile(normalizeEchoSrcQualityProfile(profile));
      }
    };
    const applyEchoSrcAdvancedSettings = (settings: {
      audioEchoSrcAdvancedModeEnabled?: boolean;
      audioEchoSrcFilterProfile?: AudioEchoSrcFilterProfile;
      audioEchoSrcFilterProfile1x?: AudioEchoSrcFilterProfile;
      audioEchoSrcFilterProfileNx?: AudioEchoSrcFilterProfile;
      audioEchoSrcComputeBackend?: AudioEchoSrcComputeBackend;
      audioPcmDitherMode?: AudioPcmDitherMode;
      audioDsdOutputMode?: AudioDsdOutputMode;
          audioSdmMode?: AudioSdmMode;
      audioSdmTargetRate?: AudioSdmTargetRate;
      audioSdmQualityProfile?: AudioSdmQualityProfile;
      audioSdmComputeBackend?: AudioSdmComputeBackend;
      audioSdmOversamplingFilterProfile1x?: AudioEchoSrcFilterProfile;
      audioSdmOversamplingFilterProfileNx?: AudioEchoSrcFilterProfile;
    } | null | undefined): void => {
      if (cancelled) {
        return;
      }

      if (settings && Object.prototype.hasOwnProperty.call(settings, 'audioEchoSrcAdvancedModeEnabled')) {
        setEchoSrcAdvancedModeEnabled(settings.audioEchoSrcAdvancedModeEnabled === true);
      }
      if (settings && Object.prototype.hasOwnProperty.call(settings, 'audioEchoSrcFilterProfile')) {
        const legacyProfile = normalizeEchoSrcAdvancedFilter(settings.audioEchoSrcFilterProfile);
        setEchoSrcFilterProfile(legacyProfile);
        setEchoSrcFilterProfile1x(legacyProfile);
      }
      if (settings && Object.prototype.hasOwnProperty.call(settings, 'audioEchoSrcFilterProfile1x')) {
        const profile1x = normalizeEchoSrcAdvancedFilter(settings.audioEchoSrcFilterProfile1x);
        setEchoSrcFilterProfile1x(profile1x);
        setEchoSrcFilterProfile(profile1x);
      }
      if (settings && Object.prototype.hasOwnProperty.call(settings, 'audioEchoSrcFilterProfileNx')) {
        setEchoSrcFilterProfileNx(normalizeEchoSrcAdvancedFilter(settings.audioEchoSrcFilterProfileNx));
      }
      if (settings && Object.prototype.hasOwnProperty.call(settings, 'audioEchoSrcComputeBackend')) {
        setEchoSrcComputeBackend(normalizeEchoSrcAdvancedCompute(settings.audioEchoSrcComputeBackend));
      }
      if (settings && Object.prototype.hasOwnProperty.call(settings, 'audioPcmDitherMode')) {
        setPcmDitherMode(normalizePcmDitherMode(settings.audioPcmDitherMode));
      }
      if (settings && Object.prototype.hasOwnProperty.call(settings, 'audioDsdOutputMode')) {
        setDsdOutputMode(settings.audioDsdOutputMode === 'dop' ? 'dop' : 'pcm');
      }
      if (settings && Object.prototype.hasOwnProperty.call(settings, 'audioSdmMode')) {
        setSdmMode(normalizeSdmMode(settings.audioSdmMode));
      }
      if (settings && Object.prototype.hasOwnProperty.call(settings, 'audioSdmTargetRate')) {
        setSdmTargetRate(normalizeSdmTargetRate(settings.audioSdmTargetRate));
      }
      if (settings && Object.prototype.hasOwnProperty.call(settings, 'audioSdmQualityProfile')) {
        setSdmQualityProfile(normalizeSdmQualityProfile(settings.audioSdmQualityProfile));
      }
      if (settings && Object.prototype.hasOwnProperty.call(settings, 'audioSdmComputeBackend')) {
        setSdmComputeBackend(normalizeSdmComputeBackend(settings.audioSdmComputeBackend));
      }
      if (settings && Object.prototype.hasOwnProperty.call(settings, 'audioSdmOversamplingFilterProfile1x')) {
        setSdmOversamplingFilterProfile1x(normalizeEchoSrcAdvancedFilter(settings.audioSdmOversamplingFilterProfile1x));
      }
      if (settings && Object.prototype.hasOwnProperty.call(settings, 'audioSdmOversamplingFilterProfileNx')) {
        setSdmOversamplingFilterProfileNx(normalizeEchoSrcAdvancedFilter(settings.audioSdmOversamplingFilterProfileNx));
      }
    };

    void window.echo?.app?.getSettings?.()
      .then((settings) => {
        applyEchoSrcSetting(settings?.audioEchoSrcMode);
        applyEchoSrcQualitySetting(settings?.audioEchoSrcQualityProfile);
        applyEchoSrcAdvancedSettings(settings);
      })
      .catch(() => undefined);

    const handleSettingsChanged = (event: Event): void => {
      const settings = (event as CustomEvent<{
        audioEchoSrcMode?: AudioEchoSrcMode;
        audioEchoSrcQualityProfile?: AudioEchoSrcQualityProfile;
        audioEchoSrcAdvancedModeEnabled?: boolean;
        audioEchoSrcFilterProfile?: AudioEchoSrcFilterProfile;
        audioEchoSrcFilterProfile1x?: AudioEchoSrcFilterProfile;
        audioEchoSrcFilterProfileNx?: AudioEchoSrcFilterProfile;
        audioEchoSrcComputeBackend?: AudioEchoSrcComputeBackend;
        audioPcmDitherMode?: AudioPcmDitherMode;
        audioDsdOutputMode?: AudioDsdOutputMode;
              audioSdmMode?: AudioSdmMode;
        audioSdmTargetRate?: AudioSdmTargetRate;
        audioSdmQualityProfile?: AudioSdmQualityProfile;
        audioSdmComputeBackend?: AudioSdmComputeBackend;
        audioSdmOversamplingFilterProfile1x?: AudioEchoSrcFilterProfile;
        audioSdmOversamplingFilterProfileNx?: AudioEchoSrcFilterProfile;
      }>).detail;
      if (settings && Object.prototype.hasOwnProperty.call(settings, 'audioEchoSrcMode')) {
        applyEchoSrcSetting(settings.audioEchoSrcMode);
      }
      if (settings && Object.prototype.hasOwnProperty.call(settings, 'audioEchoSrcQualityProfile')) {
        applyEchoSrcQualitySetting(settings.audioEchoSrcQualityProfile);
      }
      applyEchoSrcAdvancedSettings(settings);
    };

    window.addEventListener('settings:changed', handleSettingsChanged);
    return () => {
      cancelled = true;
      window.removeEventListener('settings:changed', handleSettingsChanged);
    };
  }, []);

  const runModuleAction = useCallback(async (key: string, action: () => Promise<void>): Promise<void> => {
    setBusyKey(key);
    setModuleError(null);
    try {
      await action();
      await refreshPlaybackStatus();
    } catch (actionError) {
      setModuleError(formatDspActionError(actionError));
    } finally {
      setBusyKey(null);
    }
  }, []);

  const runEchoSrcAction = useCallback((
    settingsPatch: EchoSrcSettingsPatch,
    outputPatch: EchoSrcOutputPatch,
    rollback: () => void,
  ): void => {
    const app = window.echo?.app;
    const audio = window.echo?.audio;
    if (!app?.getSettings || !app.setSettings || !audio?.setOutput) {
      setModuleError(t('dsp.error.desktopBridge'));
      rollback();
      return;
    }

    const generation = echoSrcActionGenerationRef.current + 1;
    echoSrcActionGenerationRef.current = generation;
    setBusyKey('src');
    setModuleError(null);

    const operation = echoSrcActionQueueRef.current.then(async () => {
      let previousSettings: AppSettings | null = null;
      let settingsPersisted = false;
      try {
        previousSettings = await app.getSettings();
        const nextSettings = await app.setSettings(settingsPatch);
        settingsPersisted = true;
        await audio.setOutput(outputPatch);
        if (echoSrcActionGenerationRef.current === generation) {
          window.dispatchEvent(new CustomEvent('settings:changed', { detail: nextSettings }));
          await refreshPlaybackStatus();
        }
      } catch (actionError) {
        if (settingsPersisted && previousSettings) {
          const rollbackPatch = createSettingsRollbackPatch(settingsPatch, previousSettings);
          const restoredSettings = await app.setSettings(rollbackPatch).catch(() => null);
          if (restoredSettings && echoSrcActionGenerationRef.current === generation) {
            window.dispatchEvent(new CustomEvent('settings:changed', { detail: restoredSettings }));
          }
        }
        if (echoSrcActionGenerationRef.current === generation) {
          rollback();
          setModuleError(formatDspActionError(actionError));
        }
      } finally {
        if (echoSrcActionGenerationRef.current === generation) {
          setBusyKey(null);
        }
      }
    });
    echoSrcActionQueueRef.current = operation;
    void operation;
  }, [t]);

  const runSdmAction = useCallback((
    settingsPatch: SdmSettingsPatch,
    outputPatch: SdmOutputPatch,
    rollback: () => void,
    hooks: {
      beforeOutputApplied?: () => Promise<void>;
      afterOutputApplied?: () => Promise<void>;
    } = {},
  ): void => {
    const app = window.echo?.app;
    const audio = window.echo?.audio;
    if (!app?.getSettings || !app.setSettings || !audio?.setOutput) {
      setModuleError(t('dsp.error.desktopBridge'));
      rollback();
      return;
    }

    const operation = sdmActionQueueRef.current.then(() => runModuleAction('sdm', async () => {
      let previousSettings: AppSettings | null = null;
      let settingsPersisted = false;
      try {
        previousSettings = await app.getSettings();
        const nextSettings = await app.setSettings(settingsPatch);
        settingsPersisted = true;
        await hooks.beforeOutputApplied?.();
        await audio.setOutput(outputPatch);
        await hooks.afterOutputApplied?.();
        window.dispatchEvent(new CustomEvent('settings:changed', { detail: nextSettings }));
      } catch (actionError) {
        if (settingsPersisted && previousSettings) {
          const restoredSettings = await app
            .setSettings(createSettingsRollbackPatch(settingsPatch, previousSettings))
            .catch(() => null);
          if (restoredSettings) {
            window.dispatchEvent(new CustomEvent('settings:changed', { detail: restoredSettings }));
          }
        }
        rollback();
        throw actionError;
      }
    }));
    sdmActionQueueRef.current = operation;
    void operation;
  }, [runModuleAction, t]);

  const handleEchoSrcModeChange = useCallback(
    (mode: AudioEchoSrcMode): void => {
      const previousMode = echoSrcMode;
      if (mode !== 'off') {
        setEchoSrcCompareReturnMode(mode);
      }
      setEchoSrcMode(mode);
      runEchoSrcAction(
        { audioEchoSrcMode: mode },
        { echoSrcMode: mode },
        () => setEchoSrcMode(previousMode),
      );
    },
    [echoSrcMode, runEchoSrcAction],
  );

  const handleEchoSrcCompareToggle = useCallback((): void => {
    if (echoSrcMode !== 'off') {
      setEchoSrcCompareReturnMode(echoSrcMode);
      handleEchoSrcModeChange('off');
      return;
    }

    const restoreMode = normalizeEchoSrcMode(echoSrcCompareReturnMode);
    if (restoreMode !== 'off') {
      handleEchoSrcModeChange(restoreMode);
    }
  }, [echoSrcCompareReturnMode, echoSrcMode, handleEchoSrcModeChange]);

  const handleEchoSrcQualityProfileChange = useCallback(
    (profile: AudioEchoSrcQualityProfile): void => {
      const previousProfile = echoSrcQualityProfile;
      setEchoSrcQualityProfile(profile);
      runEchoSrcAction(
        { audioEchoSrcQualityProfile: profile },
        { echoSrcQualityProfile: profile },
        () => setEchoSrcQualityProfile(previousProfile),
      );
    },
    [echoSrcQualityProfile, runEchoSrcAction],
  );

  const handleEchoSrcAdvancedModeChange = useCallback(
    (enabled: boolean): void => {
      const previousEnabled = echoSrcAdvancedModeEnabled;
      setEchoSrcAdvancedModeEnabled(enabled);
      runEchoSrcAction(
        { audioEchoSrcAdvancedModeEnabled: enabled },
        { echoSrcAdvancedModeEnabled: enabled },
        () => setEchoSrcAdvancedModeEnabled(previousEnabled),
      );
    },
    [echoSrcAdvancedModeEnabled, runEchoSrcAction],
  );

  const handleEchoSrcFilterSlotChange = useCallback(
    (slot: '1x' | 'nx', profile: AudioEchoSrcFilterProfile): void => {
      const previousProfile = echoSrcFilterProfile;
      const previousProfile1x = echoSrcFilterProfile1x;
      const previousProfileNx = echoSrcFilterProfileNx;
      if (slot === '1x') {
        setEchoSrcFilterProfile(profile);
        setEchoSrcFilterProfile1x(profile);
      } else {
        setEchoSrcFilterProfileNx(profile);
      }

      const patch = slot === '1x'
        ? { audioEchoSrcFilterProfile: profile, audioEchoSrcFilterProfile1x: profile }
        : { audioEchoSrcFilterProfileNx: profile };
      const outputPatch = slot === '1x'
        ? { echoSrcFilterProfile: profile, echoSrcFilterProfile1x: profile }
        : { echoSrcFilterProfileNx: profile };

      runEchoSrcAction(
        patch,
        outputPatch,
        () => {
          setEchoSrcFilterProfile(previousProfile);
          setEchoSrcFilterProfile1x(previousProfile1x);
          setEchoSrcFilterProfileNx(previousProfileNx);
        },
      );
    },
    [echoSrcFilterProfile, echoSrcFilterProfile1x, echoSrcFilterProfileNx, runEchoSrcAction],
  );

  const handleEchoSrcComputeBackendChange = useCallback(
    (backend: AudioEchoSrcComputeBackend): void => {
      const previousBackend = echoSrcComputeBackend;
      setEchoSrcComputeBackend(backend);
      runEchoSrcAction(
        { audioEchoSrcComputeBackend: backend },
        { echoSrcComputeBackend: backend },
        () => setEchoSrcComputeBackend(previousBackend),
      );
    },
    [echoSrcComputeBackend, runEchoSrcAction],
  );

  const handleEchoSrcQualityLadderApply = useCallback(
    (option: EchoSrcQualityLadderOption): void => {
      const previousMode = echoSrcMode;
      const previousQualityProfile = echoSrcQualityProfile;
      const previousAdvancedEnabled = echoSrcAdvancedModeEnabled;
      const previousProfile = echoSrcFilterProfile;
      const previousProfile1x = echoSrcFilterProfile1x;
      const previousProfileNx = echoSrcFilterProfileNx;
      const previousBackend = echoSrcComputeBackend;

      setEchoSrcMode(option.mode);
      setEchoSrcCompareReturnMode(option.mode);
      setEchoSrcQualityProfile(option.qualityProfile);
      setEchoSrcAdvancedModeEnabled(true);
      setEchoSrcFilterProfile(option.filter1x);
      setEchoSrcFilterProfile1x(option.filter1x);
      setEchoSrcFilterProfileNx(option.filterNx);
      setEchoSrcComputeBackend(option.computeBackend);

      runEchoSrcAction(
        {
          audioEchoSrcMode: option.mode,
          audioEchoSrcQualityProfile: option.qualityProfile,
          audioEchoSrcAdvancedModeEnabled: true,
          audioEchoSrcFilterProfile: option.filter1x,
          audioEchoSrcFilterProfile1x: option.filter1x,
          audioEchoSrcFilterProfileNx: option.filterNx,
          audioEchoSrcComputeBackend: option.computeBackend,
        },
        {
          echoSrcMode: option.mode,
          echoSrcQualityProfile: option.qualityProfile,
          echoSrcAdvancedModeEnabled: true,
          echoSrcFilterProfile: option.filter1x,
          echoSrcFilterProfile1x: option.filter1x,
          echoSrcFilterProfileNx: option.filterNx,
          echoSrcComputeBackend: option.computeBackend,
        },
        () => {
          setEchoSrcMode(previousMode);
          setEchoSrcQualityProfile(previousQualityProfile);
          setEchoSrcAdvancedModeEnabled(previousAdvancedEnabled);
          setEchoSrcFilterProfile(previousProfile);
          setEchoSrcFilterProfile1x(previousProfile1x);
          setEchoSrcFilterProfileNx(previousProfileNx);
          setEchoSrcComputeBackend(previousBackend);
        },
      );
    },
    [echoSrcAdvancedModeEnabled, echoSrcComputeBackend, echoSrcFilterProfile, echoSrcFilterProfile1x, echoSrcFilterProfileNx, echoSrcMode, echoSrcQualityProfile, runEchoSrcAction],
  );

  const handlePcmDitherModeChange = useCallback(
    (mode: AudioPcmDitherMode): void => {
      const previousMode = pcmDitherMode;
      setPcmDitherMode(mode);
      runEchoSrcAction(
        { audioPcmDitherMode: mode },
        { pcmDitherMode: mode },
        () => setPcmDitherMode(previousMode),
      );
    },
    [pcmDitherMode, runEchoSrcAction],
  );

  const handleSdmModeChange = useCallback(
    (mode: AudioSdmMode): void => {
      const previousSdmMode = sdmMode;
      const previousDsdOutputMode = dsdOutputMode;
      const nextDsdOutputMode: AudioDsdOutputMode = mode === 'dsdPassthrough' ? 'dop' : 'pcm';

      setSdmMode(mode);
      setDsdOutputMode(nextDsdOutputMode);
      runSdmAction(
        {
          audioSdmMode: mode,
          audioDsdOutputMode: nextDsdOutputMode,
        },
        {
          sdmMode: mode,
          dsdOutputMode: nextDsdOutputMode,
        },
        () => {
          setSdmMode(previousSdmMode);
          setDsdOutputMode(previousDsdOutputMode);
        },
      );
    },
    [dsdOutputMode, runSdmAction, sdmMode],
  );

  const handleSdmTargetRateChange = useCallback(
    (rate: AudioSdmTargetRate): void => {
      const previousRate = sdmTargetRate;
      setSdmTargetRate(rate);
      runSdmAction(
        { audioSdmTargetRate: rate },
        { sdmTargetRate: rate },
        () => setSdmTargetRate(previousRate),
      );
    },
    [runSdmAction, sdmTargetRate],
  );

  const handleSdmQualityProfileChange = useCallback(
    (profile: AudioSdmQualityProfile): void => {
      const previousProfile = sdmQualityProfile;
      setSdmQualityProfile(profile);
      runSdmAction(
        { audioSdmQualityProfile: profile },
        { sdmQualityProfile: profile },
        () => setSdmQualityProfile(previousProfile),
      );
    },
    [runSdmAction, sdmQualityProfile],
  );

  const handleSdmComputeBackendChange = useCallback(
    (backend: AudioSdmComputeBackend): void => {
      const previousBackend = sdmComputeBackend;
      setSdmComputeBackend(backend);
      runSdmAction(
        { audioSdmComputeBackend: backend },
        { sdmComputeBackend: backend },
        () => setSdmComputeBackend(previousBackend),
      );
    },
    [runSdmAction, sdmComputeBackend],
  );

  const handleSdmSoundProfileChange = useCallback(
    (profileId: AudioSdmSoundProfileId): void => {
      const previousProfile1x = sdmOversamplingFilterProfile1x;
      const previousProfileNx = sdmOversamplingFilterProfileNx;
      const previousCompareReturnFilters = sdmSoundCompareReturnFilters;
      const profile = getAudioSdmSoundProfile(profileId);
      sdmSoundCompareAnchorMsRef.current = null;
      if (profileId !== 'linear') {
        setSdmSoundCompareReturnFilters({
          filterProfile1x: profile.filterProfile1x,
          filterProfileNx: profile.filterProfileNx,
        });
      }
      setSdmOversamplingFilterProfile1x(profile.filterProfile1x);
      setSdmOversamplingFilterProfileNx(profile.filterProfileNx);
      runSdmAction(
        {
          audioSdmOversamplingFilterProfile1x: profile.filterProfile1x,
          audioSdmOversamplingFilterProfileNx: profile.filterProfileNx,
        },
        {
          sdmOversamplingFilterProfile1x: profile.filterProfile1x,
          sdmOversamplingFilterProfileNx: profile.filterProfileNx,
        },
        () => {
          setSdmOversamplingFilterProfile1x(previousProfile1x);
          setSdmOversamplingFilterProfileNx(previousProfileNx);
          setSdmSoundCompareReturnFilters(previousCompareReturnFilters);
        },
      );
    },
    [runSdmAction, sdmOversamplingFilterProfile1x, sdmOversamplingFilterProfileNx, sdmSoundCompareReturnFilters],
  );

  const handleSdmSoundCompareToggle = useCallback((): void => {
    const previousFilters: SdmSoundFilterPair = {
      filterProfile1x: sdmOversamplingFilterProfile1x,
      filterProfileNx: sdmOversamplingFilterProfileNx,
    };
    const currentSelection = resolveAudioSdmSoundProfileSelection(
      previousFilters.filterProfile1x,
      previousFilters.filterProfileNx,
    );
    const linearProfile = getAudioSdmSoundProfile('linear');
    const nextFilters: SdmSoundFilterPair | null = currentSelection === 'linear'
      ? sdmSoundCompareReturnFilters
      : {
        filterProfile1x: linearProfile.filterProfile1x,
        filterProfileNx: linearProfile.filterProfileNx,
      };
    if (!nextFilters) {
      return;
    }

    let nextAnchorMs = currentSelection === 'linear'
      ? sdmSoundCompareAnchorMsRef.current
      : null;

    const previousCompareReturnFilters = sdmSoundCompareReturnFilters;
    if (currentSelection !== 'linear') {
      setSdmSoundCompareReturnFilters(previousFilters);
    }
    setSdmOversamplingFilterProfile1x(nextFilters.filterProfile1x);
    setSdmOversamplingFilterProfileNx(nextFilters.filterProfileNx);
    runSdmAction(
      {
        audioSdmOversamplingFilterProfile1x: nextFilters.filterProfile1x,
        audioSdmOversamplingFilterProfileNx: nextFilters.filterProfileNx,
      },
      {
        sdmOversamplingFilterProfile1x: nextFilters.filterProfile1x,
        sdmOversamplingFilterProfileNx: nextFilters.filterProfileNx,
      },
      () => {
        setSdmOversamplingFilterProfile1x(previousFilters.filterProfile1x);
        setSdmOversamplingFilterProfileNx(previousFilters.filterProfileNx);
        setSdmSoundCompareReturnFilters(previousCompareReturnFilters);
      },
      {
        beforeOutputApplied: async () => {
          if (currentSelection === 'linear') {
            return;
          }
          const playback = window.echo?.playback;
          if (!playback?.getStatus) {
            return;
          }
          try {
            const playbackStatus = await playback.getStatus();
            const currentPositionMs = Number(playbackStatus.positionMs);
            nextAnchorMs = Number.isFinite(currentPositionMs)
              ? Math.max(0, currentPositionMs - 3_000)
              : null;
            sdmSoundCompareAnchorMsRef.current = nextAnchorMs;
          } catch (statusError) {
            setModuleError(formatDspActionError(statusError));
          }
        },
        afterOutputApplied: async () => {
          const playback = window.echo?.playback;
          if (nextAnchorMs === null || !playback?.seek) {
            return;
          }
          try {
            await playback.seek(nextAnchorMs / 1_000);
            await refreshPlaybackStatus();
          } catch (seekError) {
            setModuleError(formatDspActionError(seekError));
          }
        },
      },
    );
  }, [
    runSdmAction,
    sdmOversamplingFilterProfile1x,
    sdmOversamplingFilterProfileNx,
    sdmSoundCompareReturnFilters,
  ]);

  const handleSdmOversamplingFilterSlotChange = useCallback(
    (slot: '1x' | 'nx', profile: AudioEchoSrcFilterProfile): void => {
      const previousProfile1x = sdmOversamplingFilterProfile1x;
      const previousProfileNx = sdmOversamplingFilterProfileNx;
      const previousCompareReturnFilters = sdmSoundCompareReturnFilters;
      sdmSoundCompareAnchorMsRef.current = null;
      const nextFilters: SdmSoundFilterPair = {
        filterProfile1x: slot === '1x' ? profile : previousProfile1x,
        filterProfileNx: slot === 'nx' ? profile : previousProfileNx,
      };
      if (resolveAudioSdmSoundProfileSelection(nextFilters.filterProfile1x, nextFilters.filterProfileNx) !== 'linear') {
        setSdmSoundCompareReturnFilters(nextFilters);
      }
      if (slot === '1x') {
        setSdmOversamplingFilterProfile1x(profile);
      } else {
        setSdmOversamplingFilterProfileNx(profile);
      }

      runSdmAction(
        slot === '1x'
          ? { audioSdmOversamplingFilterProfile1x: profile }
          : { audioSdmOversamplingFilterProfileNx: profile },
        slot === '1x'
          ? { sdmOversamplingFilterProfile1x: profile }
          : { sdmOversamplingFilterProfileNx: profile },
        () => {
          setSdmOversamplingFilterProfile1x(previousProfile1x);
          setSdmOversamplingFilterProfileNx(previousProfileNx);
          setSdmSoundCompareReturnFilters(previousCompareReturnFilters);
        },
      );
    },
    [runSdmAction, sdmOversamplingFilterProfile1x, sdmOversamplingFilterProfileNx, sdmSoundCompareReturnFilters],
  );

  const handleDsdDopChange = useCallback(
    (enabled: boolean): void => {
      const previousSdmMode = sdmMode;
      const previousDsdOutputMode = dsdOutputMode;
      const nextDsdOutputMode: AudioDsdOutputMode = enabled ? 'dop' : 'pcm';
      const nextSdmMode: AudioSdmMode = enabled ? 'dsdPassthrough' : 'off';
      setSdmMode(nextSdmMode);
      setDsdOutputMode(nextDsdOutputMode);
      runSdmAction(
        {
          audioSdmMode: nextSdmMode,
          audioDsdOutputMode: nextDsdOutputMode,
        },
        {
          sdmMode: nextSdmMode,
          dsdOutputMode: nextDsdOutputMode,
        },
        () => {
          setSdmMode(previousSdmMode);
          setDsdOutputMode(previousDsdOutputMode);
        },
      );
    },
    [dsdOutputMode, runSdmAction, sdmMode],
  );



  const handleHeadroomChange = useCallback(
    (headroomDb: number): void => {
      const eq = getEqBridge();
      if (!eq?.setDspHeadroom) {
        setModuleError(t('dsp.error.dspBridge'));
        return;
      }

      const safeHeadroomDb = Math.round(clampNumber(headroomDb, dspHeadroomMinDb, dspHeadroomMaxDb) * 10) / 10;
      setEqState((current) => ({ ...current, dspHeadroomDb: safeHeadroomDb }));
      void runModuleAction('headroom', async () => {
        setEqState(await eq.setDspHeadroom(safeHeadroomDb));
      });
    },
    [runModuleAction, t],
  );

  const handleSafetyLimiterChange = useCallback(
    (enabled: boolean): void => {
      const eq = getEqBridge();
      if (!eq?.setDspSafetyLimiterEnabled) {
        setModuleError(t('dsp.error.dspBridge'));
        return;
      }

      setEqState((current) => ({ ...current, dspSafetyLimiterEnabled: enabled }));
      void runModuleAction('safety', async () => {
        setEqState(await eq.setDspSafetyLimiterEnabled(enabled));
      });
    },
    [runModuleAction, t],
  );

  const handleImportRoomCorrection = useCallback((): void => {
    const eq = getEqBridge();
    if (!eq?.importRoomCorrectionIr) {
      setModuleError(t('dsp.error.firBridge'));
      return;
    }

    void runModuleAction('room-import', async () => {
      const imported = await eq.importRoomCorrectionIr();
      if (imported) {
        setRoomCorrection(imported);
      }
    });
  }, [runModuleAction, t]);

  const handleToggleRoomCorrection = useCallback((): void => {
    const eq = getEqBridge();
    if (!eq?.setRoomCorrectionEnabled) {
      setModuleError(t('dsp.error.firBridge'));
      return;
    }

    void runModuleAction('room-toggle', async () => {
      setRoomCorrection(await eq.setRoomCorrectionEnabled(!roomCorrection.enabled));
    });
  }, [roomCorrection.enabled, runModuleAction, t]);

  const handleEnableRoomSafely = useCallback((): void => {
    const eq = getEqBridge();
    if (!eq?.setDspHeadroom || !eq?.setRoomCorrectionEnabled) {
      setModuleError(t('dsp.error.firBridge'));
      return;
    }

    if (!roomCorrection.irId) {
      setModuleError(t('dsp.error.firBridge'));
      return;
    }

    const safeHeadroomDb = roundHeadroomDb(Math.min(eqState.dspHeadroomDb ?? 0, -6));
    setEqState((current) => ({ ...current, dspHeadroomDb: safeHeadroomDb }));
    setRoomCorrection((current) => ({ ...current, enabled: true }));
    void runModuleAction('room-safe-enable', async () => {
      setEqState(await eq.setDspHeadroom(safeHeadroomDb));
      setRoomCorrection(await eq.setRoomCorrectionEnabled(true));
    });
  }, [eqState.dspHeadroomDb, roomCorrection.irId, runModuleAction, t]);

  const handleRoomTrimChange = useCallback(
    (trimDb: number): void => {
      const eq = getEqBridge();
      if (!eq?.setRoomCorrectionTrim) {
        setModuleError(t('dsp.error.firBridge'));
        return;
      }

      const safeTrimDb = Math.round(clampNumber(trimDb, roomCorrectionMinTrimDb, roomCorrectionMaxTrimDb) * 10) / 10;
      setRoomCorrection((current) => ({ ...current, trimDb: safeTrimDb }));
      void runModuleAction('room-trim', async () => {
        setRoomCorrection(await eq.setRoomCorrectionTrim(safeTrimDb));
      });
    },
    [runModuleAction, t],
  );

  const handleClearRoomCorrection = useCallback((): void => {
    const eq = getEqBridge();
    if (!eq?.clearRoomCorrection) {
      setModuleError(t('dsp.error.firBridge'));
      return;
    }

    void runModuleAction('room-clear', async () => {
      setRoomCorrection(await eq.clearRoomCorrection());
    });
  }, [runModuleAction, t]);

  const handleChannelPatch = useCallback(
    (patch: Partial<ChannelBalanceState>): void => {
      const eq = getEqBridge();
      if (!eq?.setChannelBalanceState) {
        setModuleError(t('dsp.error.channelBridge'));
        return;
      }

      setChannelBalance((current) => ({ ...current, ...patch }));
      void runModuleAction('channel', async () => {
        setChannelBalance(await eq.setChannelBalanceState(patch));
      });
    },
    [runModuleAction, t],
  );

  const handleChannelReset = useCallback((): void => {
    const eq = getEqBridge();
    if (!eq?.resetChannelBalance) {
      setModuleError(t('dsp.error.channelBridge'));
      return;
    }

    void runModuleAction('channel-reset', async () => {
      setChannelBalance(await eq.resetChannelBalance());
    });
  }, [runModuleAction, t]);

  const dspActive = audioStatus?.dspActive === true;
  const eqEnabled = audioStatus?.eqEnabled ?? eqState.enabled;
  const activeEqPresetName = audioStatus?.eqPresetName || eqState.presetName || '';
  const headphoneCorrectionActive = eqEnabled && activeEqPresetName.startsWith('耳机校正 -');
  const channelBalanceEnabled = audioStatus?.channelBalanceEnabled ?? channelBalance.enabled;
  const outputPeakDb = finiteLevel(audioStatus?.audioLevels?.estimatedOutputPeakDb);
  const liveHeadroomDb = finiteLevel(audioStatus?.audioLevels?.headroomDb);
  const truePeakHeadroomDb = finiteLevel(audioStatus?.audioLevels?.truePeakHeadroomDb);
  const clipCount = audioStatus?.audioLevels?.clipCount ?? 0;
  const clippingRisk = hasObservedDspClippingRisk(audioStatus, eqState, roomCorrection, channelBalance, clipCount);
  const headroomWarning = hasHeadroomWarning(audioStatus, outputPeakDb, liveHeadroomDb, truePeakHeadroomDb);
  const dspHeadroomDb = eqState.dspHeadroomDb ?? 0;
  const safetyLimiterEnabled = eqState.dspSafetyLimiterEnabled !== false;
  const outputName = audioStatus?.outputDeviceName || t('dsp.status.systemOutput');
  const sampleRate = audioStatus?.actualDeviceSampleRate ?? audioStatus?.requestedOutputSampleRate ?? audioStatus?.fileSampleRate ?? null;
  const echoSrcActive = audioStatus?.echoSrcActive === true;
  const echoSrcEnabled = echoSrcMode !== 'off' || echoSrcActive;
  const echoSrcModeOption = echoSrcModeOptions.find((option) => option.mode === echoSrcMode) ?? echoSrcModeOptions[0];
  const echoSrcSubtitle = echoSrcActive
    ? formatRate(audioStatus?.echoSrcTargetSampleRate, t('dsp.status.auto'))
    : echoSrcMode !== 'off'
      ? t(echoSrcModeOption.titleKey)
      : t('dsp.status.bypassed');
  const dsdSourceActive = isDsdSourceStatus(audioStatus);
  const activeDsdMode = audioStatus?.activeDsdOutputMode ?? null;
  const sdmRuntimeState = audioStatus?.sdmRuntimeState ?? (sdmMode === 'pcmToDsd' ? 'pcm_to_sdm_not_routed' : 'off');
  const sdmTargetLabel = sdmTargetRateOptions.find((option) => option.rate === sdmTargetRate)?.label ?? 'DSD128';
  const activeSdmTargetLabel = audioStatus?.sdmTargetRate
    ? sdmTargetRateOptions.find((option) => option.rate === audioStatus.sdmTargetRate)?.label ?? sdmTargetLabel
    : sdmTargetLabel;
  const activeSdmProfileName = audioStatus?.sdmModulatorProfile?.name ?? null;
  const dsdOutputEnabled =
    sdmMode !== 'off' ||
    dsdOutputMode === 'dop' ||
    activeDsdMode === 'dop' ||
    activeDsdMode === 'native' ||
    sdmRuntimeState !== 'off';
  const sdmSubtitle = activeDsdMode === 'native'
    ? t('dsp.panel.sdm.nativeDsd')
    : activeDsdMode === 'dop'
      ? 'DoP'
      : sdmRuntimeState === 'pcm_to_sdm_active'
        ? `PCM -> ${activeSdmTargetLabel}${activeSdmProfileName ? ` / ${activeSdmProfileName}` : ''}`
      : sdmMode === 'pcmToDsd'
        ? `${sdmTargetLabel} / ${t('dsp.panel.sdm.modulatorPending')}`
        : sdmRuntimeState === 'pcm_to_sdm_not_routed'
          ? t('dsp.panel.sdm.modulatorPending')
          : dsdSourceActive
            ? t('dsp.panel.sdm.pcmFallback')
            : dsdOutputMode === 'dop'
              ? t('dsp.panel.sdm.dop')
              : t('dsp.status.bypassed');

  const modules = useMemo<DspModule[]>(
    () => [
      {
        id: 'rack',
        stageKey: 'dsp.stage.input',
        title: 'DSP Rack',
        subtitle: '8 个可重排模块',
        description: '编排实际处理顺序',
        icon: Route,
        enabled: false,
        accent: 'violet',
      },
      {
        id: 'headroom',
        stageKey: 'dsp.stage.input',
        title: t('dsp.module.headroom.title'),
        subtitle: formatDb(dspHeadroomDb),
        description: t('dsp.module.headroom.description'),
        icon: Gauge,
        enabled: Math.abs(dspHeadroomDb) > 0.05,
        accent: 'blue',
      },
      {
        id: 'src',
        stageKey: 'dsp.stage.src',
        title: t('dsp.module.src.title'),
        subtitle: echoSrcSubtitle,
        description: t('dsp.module.src.description'),
        icon: RadioTower,
        enabled: echoSrcEnabled,
        accent: echoSrcActive ? 'green' : 'blue',
      },
      {
        id: 'sdm',
        stageKey: 'dsp.stage.src',
        title: t('dsp.module.sdm.title'),
        subtitle: sdmSubtitle,
        description: t('dsp.module.sdm.description'),
        icon: AudioWaveform,
        enabled: dsdOutputEnabled || dsdSourceActive,
        accent: activeDsdMode || sdmRuntimeState === 'pcm_to_sdm_active' ? 'green' : sdmRuntimeState === 'pcm_to_sdm_not_routed' || dsdSourceActive ? 'amber' : 'blue',
      },
      {
        id: 'eq',
        stageKey: 'dsp.stage.shape',
        title: t('dsp.module.eq.title'),
        subtitle: audioStatus?.eqPresetName || eqState.presetName || t('dsp.status.flat'),
        description: t('dsp.module.eq.description'),
        icon: SlidersHorizontal,
        enabled: eqEnabled,
        accent: 'violet',
      },
      {
        id: 'compressor',
        stageKey: 'dsp.stage.shape',
        title: '压缩器',
        subtitle: compressor.enabled ? `${compressor.ratio.toFixed(1)}:1 / ${compressor.thresholdDb.toFixed(1)} dB` : t('dsp.status.bypassed'),
        description: '软拐点、并行混合与补偿增益',
        icon: Gauge,
        enabled: compressor.enabled,
        accent: 'amber',
      },
      {
        id: 'crossfeed',
        stageKey: 'dsp.stage.stereo',
        title: '交叉馈送',
        subtitle: crossfeed.enabled ? `${Math.round(crossfeed.amount * 100)}% / ${Math.round(crossfeed.cutoffHz)} Hz` : t('dsp.status.bypassed'),
        description: '耳机低频声像自然融合',
        icon: Headphones,
        enabled: crossfeed.enabled,
        accent: 'blue',
      },
      {
        id: 'stereoField',
        stageKey: 'dsp.stage.stereo',
        title: '立体声场',
        subtitle: stereoField.enabled ? `${Math.round(stereoField.width * 100)}%` : t('dsp.status.bypassed'),
        description: 'Mid / Side 宽度与增益',
        icon: Waves,
        enabled: stereoField.enabled,
        accent: 'violet',
      },
      {
        id: 'channelMatrix',
        stageKey: 'dsp.stage.stereo',
        title: '声道矩阵',
        subtitle: channelMatrix.enabled ? '2 × 2' : t('dsp.status.bypassed'),
        description: '左右声道任意路由与混合',
        icon: Route,
        enabled: channelMatrix.enabled,
        accent: 'amber',
      },
      {
        id: 'headphone',
        stageKey: 'dsp.stage.shape',
        title: t('dsp.module.headphone.title'),
        subtitle: headphoneCorrectionActive ? activeEqPresetName : 'OPRA',
        description: t('dsp.module.headphone.description'),
        icon: Headphones,
        enabled: headphoneCorrectionActive,
        accent: 'blue',
      },
      {
        id: 'room',
        stageKey: 'dsp.stage.space',
        title: t('dsp.module.room.title'),
        subtitle: roomCorrection.irName ?? t('dsp.status.noIr'),
        description: t('dsp.module.room.description'),
        icon: Waves,
        enabled: roomCorrection.enabled,
        accent: 'green',
      },
      {
        id: 'channel',
        stageKey: 'dsp.stage.stereo',
        title: t('dsp.module.channel.title'),
        subtitle: channelBalanceEnabled ? t('dsp.status.balanceActive') : t('dsp.status.stereoDirect'),
        description: t('dsp.module.channel.description'),
        icon: Headphones,
        enabled: channelBalanceEnabled,
        accent: 'amber',
      },
      {
        id: 'safety',
        stageKey: 'dsp.stage.output',
        title: t('dsp.module.safety.title'),
        subtitle: !safetyLimiterEnabled ? t('dsp.panel.safety.limiterBypassed') : audioStatus?.dspLimiterProtecting === true ? t('dsp.status.limiting') : clippingRisk ? t('dsp.status.riskDetected') : headroomWarning ? t('dsp.status.headroomRisk') : t('dsp.status.limiterArmed'),
        description: t('dsp.module.safety.description'),
        icon: ShieldCheck,
        enabled: !safetyLimiterEnabled || audioStatus?.dspLimiterProtecting === true || clippingRisk || headroomWarning || dspActive,
        accent: !safetyLimiterEnabled || audioStatus?.dspLimiterProtecting === true || clippingRisk || headroomWarning ? 'amber' : 'green',
      },
    ],
    [activeDsdMode, activeEqPresetName, audioStatus?.dspLimiterProtecting, audioStatus?.eqPresetName, channelBalanceEnabled, channelMatrix.enabled, clippingRisk, compressor.enabled, compressor.ratio, compressor.thresholdDb, crossfeed.amount, crossfeed.cutoffHz, crossfeed.enabled, dsdOutputEnabled, dsdSourceActive, dspActive, dspHeadroomDb, echoSrcActive, echoSrcEnabled, echoSrcSubtitle, eqEnabled, eqState.presetName, headroomWarning, headphoneCorrectionActive, roomCorrection.enabled, roomCorrection.irName, safetyLimiterEnabled, sdmRuntimeState, sdmSubtitle, stereoField.enabled, stereoField.width, t],
  );

  const activeCount = modules.filter((module) => module.id !== 'rack' && module.enabled).length;
  const selectedModule = modules.find((module) => module.id === selectedModuleId) ?? modules[1];
  const SelectedIcon = selectedModule.icon;
  const moduleSections = [
    { id: 'main', label: null, modules: modules.filter((module) => !isDspAdvancedModule(module)) },
    { id: 'advanced', label: t('dsp.section.advanced'), modules: modules.filter(isDspAdvancedModule) },
  ] as const;
  const pipelineNodes = modules.filter((module) => module.id !== 'rack').map((module) => ({
    id: module.id,
    label: t(module.stageKey),
    value: module.enabled ? module.subtitle : t('dsp.status.bypassed'),
    enabled: module.enabled,
    selected: module.id === selectedModuleId,
    risk: module.id === 'safety' && clippingRisk,
  }));
  const sdmSoundCompareReturnProfile = sdmSoundCompareReturnFilters
    ? resolveAudioSdmSoundProfileSelection(
      sdmSoundCompareReturnFilters.filterProfile1x,
      sdmSoundCompareReturnFilters.filterProfileNx,
    )
    : null;
  const panelProps: ModulePanelProps = {
    audioStatus,
    eqState,
    roomCorrection,
    channelBalance,
    echoSrcMode,
    echoSrcQualityProfile,
    echoSrcAdvancedModeEnabled,
    echoSrcFilterProfile1x,
    echoSrcFilterProfileNx,
    echoSrcComputeBackend,
    pcmDitherMode,
    dsdOutputMode,
    sdmMode,
    sdmTargetRate,
    sdmQualityProfile,
    sdmComputeBackend,
    sdmOversamplingFilterProfile1x,
    sdmOversamplingFilterProfileNx,
    sdmSoundCompareReturnProfile,
    echoSrcCompareReturnMode,
    busyKey,
    onEchoSrcModeChange: handleEchoSrcModeChange,
    onEchoSrcQualityProfileChange: handleEchoSrcQualityProfileChange,
    onEchoSrcAdvancedModeChange: handleEchoSrcAdvancedModeChange,
    onEchoSrcFilterSlotChange: handleEchoSrcFilterSlotChange,
    onEchoSrcComputeBackendChange: handleEchoSrcComputeBackendChange,
    onEchoSrcQualityLadderApply: handleEchoSrcQualityLadderApply,
    onPcmDitherModeChange: handlePcmDitherModeChange,
    onSdmModeChange: handleSdmModeChange,
    onSdmTargetRateChange: handleSdmTargetRateChange,
    onSdmQualityProfileChange: handleSdmQualityProfileChange,
    onSdmComputeBackendChange: handleSdmComputeBackendChange,
    onSdmSoundProfileChange: handleSdmSoundProfileChange,
    onSdmSoundCompareToggle: handleSdmSoundCompareToggle,
    onSdmOversamplingFilterSlotChange: handleSdmOversamplingFilterSlotChange,
    onDsdDopChange: handleDsdDopChange,
    onEchoSrcCompareToggle: handleEchoSrcCompareToggle,
    onHeadroomChange: handleHeadroomChange,
    onSafetyLimiterChange: handleSafetyLimiterChange,
    onImportRoomCorrection: handleImportRoomCorrection,
    onToggleRoomCorrection: handleToggleRoomCorrection,
    onEnableRoomSafely: handleEnableRoomSafely,
    onRoomTrimChange: handleRoomTrimChange,
    onClearRoomCorrection: handleClearRoomCorrection,
    onChannelPatch: handleChannelPatch,
    onChannelReset: handleChannelReset,
    onRefresh: () => {
      void loadModuleStates();
      void refreshPlaybackStatus();
    },
  };

  useEffect(() => {
    if (moduleError) {
      dispatchAudioErrorNotice(moduleError);
    }
  }, [moduleError]);

  return (
    <div className="dsp-page">
      <div className="dsp-stage" data-module={selectedModuleId}>
        <aside className="dsp-rail" aria-label={t('dsp.aria.modules')}>
          <div className="dsp-brand">
            <span>DSP</span>
            <strong>ECHO</strong>
            <em>{t('dsp.brand.subtitle')}</em>
          </div>

          <div className="dsp-output-card">
            <RadioTower size={17} aria-hidden="true" />
            <div>
              <span>{t('dsp.label.output')}</span>
              <strong>{outputName}</strong>
              <small>{formatRate(sampleRate, t('dsp.status.auto'))} / {audioStatus?.outputMode ?? t('dsp.status.shared')}</small>
            </div>
          </div>

          <nav className="dsp-chain" aria-label={t('dsp.aria.chain')}>
            {moduleSections.map((section) => (
              <div
                className="dsp-chain-section"
                data-section={section.id}
                key={section.id}
                role={section.id === 'advanced' ? 'group' : undefined}
                aria-label={section.label ?? undefined}
              >
                {section.label ? <span className="dsp-chain-section-title">{section.label}</span> : null}
                {section.modules.map((module, index) => {
                  const Icon = module.icon;
                  const isSelected = module.id === selectedModuleId;
                  const previousModule = section.modules[index - 1];
                  const showStage = section.id === 'main' && (!previousModule || previousModule.stageKey !== module.stageKey);

                  return (
                    <div className="dsp-chain-group" key={module.id}>
                      {showStage ? <span className="dsp-chain-stage">{t(module.stageKey)}</span> : null}
                      <button
                        type="button"
                        className="dsp-chain-item"
                        data-active={module.id === 'rack' || module.enabled}
                        data-selected={isSelected}
                        data-accent={module.accent}
                        onClick={() => setSelectedModuleId(module.id)}
                      >
                        <span className="dsp-chain-handle" aria-hidden="true" />
                        <span className="dsp-chain-icon">
                          <Icon size={17} aria-hidden="true" />
                        </span>
                        <span className="dsp-chain-copy">
                          <strong>{module.title}</strong>
                          <small>{module.description}</small>
                        </span>
                        <span className="dsp-chain-state" aria-hidden="true">
                          {module.id === 'rack' ? <Route size={14} /> : module.enabled ? <CheckCircle2 size={14} /> : null}
                        </span>
                      </button>
                    </div>
                  );
                })}
              </div>
            ))}
          </nav>
        </aside>

        <section
          className="dsp-workspace"
          data-module={selectedModuleId}
          aria-label={t('dsp.aria.workspace')}
        >
          <header className="dsp-topbar">
            <div className="dsp-topbar-title">
              <span className="dsp-selected-icon">
                <SelectedIcon size={22} aria-hidden="true" />
              </span>
              <div>
                <p>{t('dsp.label.module')}</p>
                <h1>{selectedModule.title}</h1>
                <span className="dsp-topbar-subtitle">{t(selectedModule.stageKey)} / {selectedModule.description}</span>
              </div>
            </div>
            <div className="dsp-topbar-status">
              <span data-active={dspActive}>
                <Activity size={14} aria-hidden="true" />
                {dspActive ? t('dsp.status.modulesActive', { count: activeCount }) : t('dsp.status.nativeDirect')}
              </span>
              <span data-risk={clippingRisk}>
                <AudioWaveform size={14} aria-hidden="true" />
                {audioStatus?.dspLimiterProtecting === true ? t('dsp.status.limiting') : clippingRisk || headroomWarning ? t('dsp.status.headroomRisk') : t('dsp.status.ready')}
              </span>
            </div>
          </header>

          <div className="dsp-pipeline-map" aria-label={t('dsp.aria.pipeline')}>
            {pipelineNodes.map((node) => (
              <span key={node.id} data-active={node.enabled} data-selected={node.selected} data-risk={node.risk}>
                <em>{node.label}</em>
                <strong>{node.value}</strong>
              </span>
            ))}
          </div>

          <div className="dsp-focus-strip" data-risk={clippingRisk}>
            <span>
              <em>{t('dsp.label.currentModule')}</em>
              <strong>{selectedModule.title}</strong>
            </span>
            <span>
              <em>{t('dsp.label.moduleStatus')}</em>
              <strong>{selectedModule.id === 'rack' ? '可编辑' : selectedModule.enabled ? t('dsp.status.active') : t('dsp.status.bypassed')}</strong>
            </span>
            <span>
              <em>{t('dsp.label.bitPerfect')}</em>
              <strong>{dspActive ? t('dsp.status.dspPath') : t('dsp.status.ready')}</strong>
            </span>
            <button type="button" onClick={panelProps.onRefresh}>
              {t('dsp.action.refresh')}
            </button>
          </div>

          <div className="dsp-editor-shell" data-module={selectedModuleId}>
            {selectedModuleId === 'rack' ? <DspRackPanel /> : null}
            {selectedModuleId === 'headroom' ? <HeadroomPanel {...panelProps} /> : null}
            {selectedModuleId === 'src' ? <EchoSrcPanel {...panelProps} /> : null}
            {selectedModuleId === 'sdm' ? <SdmPanel {...panelProps} /> : null}
            {selectedModuleId === 'eq' ? <EqPanel audioStatus={audioStatus} onAudioStatusRefresh={() => void refreshPlaybackStatus()} surface="eq-only" /> : null}
            {selectedModuleId === 'compressor' ? <CompressorPanel state={compressor} onApplied={setCompressor} /> : null}
            {selectedModuleId === 'crossfeed' ? <CrossfeedPanel state={crossfeed} onApplied={setCrossfeed} /> : null}
            {selectedModuleId === 'stereoField' ? <StereoFieldPanel state={stereoField} onApplied={setStereoField} /> : null}
            {selectedModuleId === 'channelMatrix' ? <ChannelMatrixPanel state={channelMatrix} onApplied={setChannelMatrix} /> : null}
            {selectedModuleId === 'headphone' ? (
              <HeadphoneCorrectionPanel
                eqState={eqState}
                showTitle={false}
                onApplied={setEqState}
                onAppliedStatusRefresh={() => {
                  void refreshPlaybackStatus();
                }}
              />
            ) : null}
            {selectedModuleId === 'room' ? <RoomCorrectionPanel {...panelProps} /> : null}
            {selectedModuleId === 'channel' ? <ChannelPanel {...panelProps} /> : null}
            {selectedModuleId === 'safety' ? <SafetyPanel {...panelProps} /> : null}
          </div>
        </section>
      </div>
    </div>
  );
};

export const DspPage = (): JSX.Element => {
  const { unlocked } = useEchoProEntitlement();
  return unlocked ? <DspWorkbench /> : <></>;
};
