import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { Activity, AlertTriangle, ArrowRight, Check, ChevronDown, Crosshair, RadioTower, RefreshCw, RotateCcw, Settings2, ShieldCheck } from 'lucide-react';
import type {
  AudioEchoSrcFilterProfile,
  AudioSdmComputeBackend,
  AudioSdmMode,
  AudioSdmQualityProfile,
  AudioSdmTargetRate,
} from '../../../shared/types/audio';
import type { AudioSdmSoundProfileId } from '../../../shared/audioSdmSoundProfiles';
import { DspSelect } from './DspSelect';
import '../../styles/src-workbench.css';
import '../../styles/sdm-workbench.css';

type SdmTone = 'good' | 'warn' | 'neutral';

type SdmOption<T extends string> = {
  value: T;
  label: string;
  detail: string;
};

export type EchoSdmControlCopy = {
  title: string;
  subtitle: string;
  source: string;
  requested: string;
  output: string;
  actual: string;
  transport: string;
  oversampling: string;
  modulator: string;
  compute: string;
  fallback: string;
  mode: string;
  target: string;
  quality: string;
  sound: string;
  customSound: string;
  dop: string;
  refresh: string;
  preview: string;
  previewNote: string;
  runtimeFacts: string;
  signalPlan: string;
  advanced: string;
  normal: string;
  compareLinear: string;
  compareRestore: string;
  guard: string;
  guardDetail: string;
  note: string;
};

export type EchoSdmControlSurfaceProps = {
  mode: AudioSdmMode;
  targetRate: AudioSdmTargetRate;
  quality: AudioSdmQualityProfile;
  compute: AudioSdmComputeBackend;
  soundProfile: AudioSdmSoundProfileId | null;
  filter1x: AudioEchoSrcFilterProfile;
  filterNx: AudioEchoSrcFilterProfile;
  requestedDop: boolean;
  compareRestore: boolean;
  compareDisabled: boolean;
  busy: boolean;
  routeTone: SdmTone;
  sourceLabel: string;
  requestedLabel: string;
  outputLabel: string;
  runtimeLabel: string;
  transportLabel: string;
  oversamplingLabel: string;
  modulatorLabel: string;
  computeLabel: string;
  computeDetail: string;
  fallbackLabel: string;
  capabilityLabel: string;
  performanceLabel: string;
  modulatorDetails: Array<{ label: string; value: string; detail: string }>;
  warning?: string | null;
  modeOptions: Array<SdmOption<AudioSdmMode>>;
  targetOptions: Array<SdmOption<AudioSdmTargetRate>>;
  qualityOptions: Array<SdmOption<AudioSdmQualityProfile>>;
  computeOptions: Array<SdmOption<AudioSdmComputeBackend>>;
  soundOptions: Array<SdmOption<AudioSdmSoundProfileId>>;
  filterOptions: Array<SdmOption<AudioEchoSrcFilterProfile>>;
  copy: EchoSdmControlCopy;
  onModeChange: (mode: AudioSdmMode) => void;
  onTargetRateChange: (target: AudioSdmTargetRate) => void;
  onQualityChange: (quality: AudioSdmQualityProfile) => void;
  onComputeChange: (compute: AudioSdmComputeBackend) => void;
  onSoundChange: (profile: AudioSdmSoundProfileId) => void;
  onFilterChange: (slot: '1x' | 'nx', profile: AudioEchoSrcFilterProfile) => void;
  onDopToggle: () => void;
  onCompareToggle: () => void;
  onRefresh: () => void;
};

const getCanvasContext = (canvas: HTMLCanvasElement): CanvasRenderingContext2D | null => {
  try {
    return canvas.getContext('2d');
  } catch {
    return null;
  }
};

const getSdmMaxFrequency = (targetRate: AudioSdmTargetRate): number =>
  targetRate === 'dsd64'
    ? 1_411_200
    : targetRate === 'dsd128'
      ? 2_822_400
      : targetRate === 'dsd256'
        ? 5_644_800
        : 11_289_600;

const formatPreviewFrequency = (frequency: number): string =>
  frequency >= 1_000_000
    ? `${(frequency / 1_000_000).toFixed(frequency >= 10_000_000 ? 1 : 2)} MHz`
    : frequency >= 1_000
      ? `${(frequency / 1_000).toFixed(frequency >= 100_000 ? 0 : 1)} kHz`
      : `${Math.round(frequency)} Hz`;

const SdmNoisePreview = ({
  quality,
  targetRate,
  title,
  note,
}: {
  quality: AudioSdmQualityProfile;
  targetRate: AudioSdmTargetRate;
  title: string;
  note: string;
}): JSX.Element => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const noteId = useId();
  const [inspectionProgress, setInspectionProgress] = useState<number | null>(null);

  const minFrequency = 20;
  const maxFrequency = getSdmMaxFrequency(targetRate);
  const floorByQuality: Record<AudioSdmQualityProfile, number> = {
    safe: -118,
    hifi: -130,
    reference: -142,
    insane: -150,
  };
  const floor = floorByQuality[quality];
  const shapeDb = useCallback((frequency: number): number => {
    if (frequency <= 18_000) return floor + (Math.log10(frequency / minFrequency) * 1.3);
    const normalized = Math.min(1, Math.log10(frequency / 18_000) / Math.log10(maxFrequency / 18_000));
    const rise = 118 * Math.pow(normalized, quality === 'safe' ? 0.72 : 0.58);
    const ripple = normalized > 0.18 ? Math.sin(normalized * 38) * (2 + normalized * 5) : 0;
    return Math.min(-14, floor + rise + ripple);
  }, [floor, maxFrequency, quality]);

  const inspectedFrequency = inspectionProgress === null
    ? null
    : minFrequency * Math.pow(maxFrequency / minFrequency, inspectionProgress);
  const inspectedDb = inspectedFrequency === null ? null : shapeDb(inspectedFrequency);

  const draw = useCallback((): void => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = getCanvasContext(canvas);
    if (!context) return;

    const rect = canvas.getBoundingClientRect();
    const width = Math.max(1, rect.width);
    const height = Math.max(1, rect.height);
    const pixelRatio = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(width * pixelRatio);
    canvas.height = Math.round(height * pixelRatio);
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    context.clearRect(0, 0, width, height);

    const styles = window.getComputedStyle(canvas);
    const ink = styles.getPropertyValue('--src-ink').trim() || '#17191d';
    const muted = styles.getPropertyValue('--src-muted').trim() || '#71757d';
    const blue = styles.getPropertyValue('--src-blue').trim() || '#3155d9';
    const green = styles.getPropertyValue('--src-green').trim() || '#25845e';
    const line = styles.getPropertyValue('--src-line').trim() || '#e3e5e9';
    const bounds = { left: 48, right: 18, top: 18, bottom: 28 };
    const chartWidth = width - bounds.left - bounds.right;
    const chartHeight = height - bounds.top - bounds.bottom;
    const minDb = -160;
    const maxDb = 0;
    const xFor = (frequency: number): number => bounds.left + ((Math.log10(frequency) - Math.log10(minFrequency)) / (Math.log10(maxFrequency) - Math.log10(minFrequency))) * chartWidth;
    const yFor = (db: number): number => bounds.top + ((maxDb - db) / (maxDb - minDb)) * chartHeight;

    context.lineWidth = 1;
    context.strokeStyle = line;
    context.fillStyle = muted;
    context.font = '600 9px Inter, system-ui, sans-serif';
    context.textAlign = 'right';
    context.textBaseline = 'middle';
    for (const db of [0, -40, -80, -120, -160]) {
      const y = yFor(db);
      context.beginPath();
      context.moveTo(bounds.left, y);
      context.lineTo(width - bounds.right, y);
      context.stroke();
      context.fillText(String(db), bounds.left - 8, y);
    }

    const frequencyTicks = [20, 1_000, 20_000, 100_000, 1_000_000].filter((frequency) => frequency < maxFrequency);
    context.textAlign = 'center';
    context.textBaseline = 'top';
    for (const frequency of frequencyTicks) {
      const x = xFor(frequency);
      context.beginPath();
      context.moveTo(x, bounds.top);
      context.lineTo(x, height - bounds.bottom);
      context.stroke();
      context.fillText(frequency >= 1_000_000 ? '1M' : frequency >= 1_000 ? `${frequency / 1_000}k` : String(frequency), x, height - bounds.bottom + 8);
    }

    const basebandX = xFor(20_000);
    context.save();
    context.setLineDash([4, 4]);
    context.strokeStyle = green;
    context.beginPath();
    context.moveTo(basebandX, bounds.top);
    context.lineTo(basebandX, height - bounds.bottom);
    context.stroke();
    context.restore();

    context.beginPath();
    for (let index = 0; index <= 260; index += 1) {
      const progress = index / 260;
      const frequency = minFrequency * Math.pow(maxFrequency / minFrequency, progress);
      const x = xFor(frequency);
      const y = yFor(shapeDb(frequency));
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    context.strokeStyle = blue;
    context.lineWidth = 2.2;
    context.lineJoin = 'round';
    context.stroke();

    if (inspectionProgress !== null) {
      const frequency = minFrequency * Math.pow(maxFrequency / minFrequency, inspectionProgress);
      const x = xFor(frequency);
      const y = yFor(shapeDb(frequency));
      context.save();
      context.setLineDash([3, 4]);
      context.strokeStyle = blue;
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(x, bounds.top);
      context.lineTo(x, height - bounds.bottom);
      context.moveTo(bounds.left, y);
      context.lineTo(width - bounds.right, y);
      context.stroke();
      context.restore();
      context.beginPath();
      context.arc(x, y, 4, 0, Math.PI * 2);
      context.fillStyle = styles.getPropertyValue('--src-panel').trim() || '#ffffff';
      context.fill();
      context.strokeStyle = blue;
      context.lineWidth = 2;
      context.stroke();
    }

    context.fillStyle = ink;
    context.font = '700 9px Inter, system-ui, sans-serif';
    context.textAlign = 'left';
    context.fillText('PCM baseband', bounds.left + 8, bounds.top + 9);
    context.textAlign = 'right';
    context.fillText('Ultrasonic noise shaping', width - bounds.right - 4, bounds.top + 9);
  }, [inspectionProgress, maxFrequency, shapeDb]);

  useEffect(() => {
    draw();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(draw);
    observer?.observe(canvas);
    window.addEventListener('resize', draw);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', draw);
    };
  }, [draw]);

  const inspectAtClientX = (clientX: number): void => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const chartWidth = Math.max(1, rect.width - 66);
    setInspectionProgress(Math.max(0, Math.min(1, (clientX - rect.left - 48) / chartWidth)));
  };

  const handlePreviewKeyDown = (event: KeyboardEvent<HTMLCanvasElement>): void => {
    const current = inspectionProgress ?? Math.log10(20_000 / minFrequency) / Math.log10(maxFrequency / minFrequency);
    const step = event.shiftKey ? 0.1 : 0.025;
    const next = event.key === 'ArrowLeft' || event.key === 'ArrowDown'
      ? Math.max(0, current - step)
      : event.key === 'ArrowRight' || event.key === 'ArrowUp'
        ? Math.min(1, current + step)
        : event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? 1
            : null;
    if (next === null) return;
    event.preventDefault();
    setInspectionProgress(next);
  };

  return (
    <section className="src-preview-card sdm-preview-card" aria-label={title}>
      <header>
        <span>
          <small>{title}</small>
          <strong>{targetRate.toUpperCase()} · {quality}</strong>
        </span>
        <em>Design preview</em>
      </header>
      <div className="src-preview-chart sdm-preview-chart">
        <canvas
          ref={canvasRef}
          role="img"
          tabIndex={0}
          aria-label={`${title}: ${targetRate} ${quality}`}
          aria-describedby={noteId}
          aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown Home End"
          aria-roledescription="interactive response chart"
          onFocus={() => setInspectionProgress((value) => value ?? Math.log10(20_000 / minFrequency) / Math.log10(maxFrequency / minFrequency))}
          onBlur={() => setInspectionProgress(null)}
          onKeyDown={handlePreviewKeyDown}
          onPointerMove={(event) => inspectAtClientX(event.clientX)}
          onPointerLeave={() => setInspectionProgress(null)}
        />
        {inspectedFrequency !== null && inspectedDb !== null ? (
          <output className="sdm-preview-readout" aria-live="polite">
            <Crosshair size={12} aria-hidden="true" />
            <strong>{formatPreviewFrequency(inspectedFrequency)}</strong>
            <span>{inspectedDb.toFixed(1)} dB</span>
          </output>
        ) : null}
      </div>
      <p id={noteId}>{note}</p>
    </section>
  );
};

const SegmentedControl = <T extends string>({
  value,
  options,
  label,
  className,
  disabled,
  showCheck = false,
  detailId,
  onChange,
}: {
  value: T;
  options: Array<SdmOption<T>>;
  label: string;
  className: string;
  disabled: boolean;
  showCheck?: boolean;
  detailId: string;
  onChange: (value: T) => void;
}): JSX.Element => {
  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number): void => {
    const backward = event.key === 'ArrowLeft' || event.key === 'ArrowUp';
    const forward = event.key === 'ArrowRight' || event.key === 'ArrowDown';
    if (!backward && !forward && event.key !== 'Home' && event.key !== 'End') return;
    event.preventDefault();
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? options.length - 1
        : (index + (backward ? -1 : 1) + options.length) % options.length;
    const next = options[nextIndex];
    onChange(next.value);
    event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('button')[nextIndex]?.focus();
  };

  return (
    <div className={className} role="radiogroup" aria-label={label} aria-describedby={detailId} aria-busy={disabled}>
      {options.map((option, index) => (
        <button
          type="button"
          role="radio"
          aria-checked={value === option.value}
          data-active={value === option.value}
          disabled={disabled}
          tabIndex={value === option.value ? 0 : -1}
          key={option.value}
          title={option.detail}
          onClick={() => onChange(option.value)}
          onKeyDown={(event) => handleKeyDown(event, index)}
        >
          {showCheck && value === option.value ? <Check size={13} aria-hidden="true" /> : null}
          <span>{option.label}</span>
        </button>
      ))}
    </div>
  );
};

const SelectField = <T extends string>({
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<SdmOption<T>>;
  disabled: boolean;
  onChange: (value: T) => void;
}): JSX.Element => {
  const detailId = useId();
  const selected = options.find((option) => option.value === value);
  return (
    <div className="sdm-select-block">
      <div className="src-select-field">
        <span>{label}</span>
        <span className="src-select-control">
          <DspSelect ariaLabel={label} value={value} options={options} disabled={disabled} describedBy={detailId} onChange={onChange} />
        </span>
      </div>
      <small id={detailId} className="sdm-select-detail">{selected?.detail}</small>
    </div>
  );
};

export const EchoSdmControlSurface = ({
  mode,
  targetRate,
  quality,
  compute,
  soundProfile,
  filter1x,
  filterNx,
  requestedDop,
  compareRestore,
  compareDisabled,
  busy,
  routeTone,
  sourceLabel,
  requestedLabel,
  outputLabel,
  runtimeLabel,
  transportLabel,
  oversamplingLabel,
  modulatorLabel,
  computeLabel,
  computeDetail,
  fallbackLabel,
  capabilityLabel,
  performanceLabel,
  modulatorDetails,
  warning,
  modeOptions,
  targetOptions,
  qualityOptions,
  computeOptions,
  soundOptions,
  filterOptions,
  copy,
  onModeChange,
  onTargetRateChange,
  onQualityChange,
  onComputeChange,
  onSoundChange,
  onFilterChange,
  onDopToggle,
  onCompareToggle,
  onRefresh,
}: EchoSdmControlSurfaceProps): JSX.Element => {
  const [advanced, setAdvanced] = useState(false);
  const modeDetailId = useId();
  const targetDetailId = useId();
  const qualityDetailId = useId();
  const advancedId = useId();
  const selectedMode = modeOptions.find((option) => option.value === mode) ?? modeOptions[0];
  const selectedTarget = targetOptions.find((option) => option.value === targetRate) ?? targetOptions[0];
  const selectedQuality = qualityOptions.find((option) => option.value === quality) ?? qualityOptions[0];
  const selectedSound = soundOptions.find((option) => option.value === soundProfile) ?? null;
  const routeRequest = requestedLabel.trim().toLocaleLowerCase().startsWith(selectedMode.label.trim().toLocaleLowerCase())
    ? requestedLabel
    : `${selectedMode.label} · ${requestedLabel}`;

  return (
    <section className="src-workbench sdm-workbench" aria-label={copy.title} aria-description={copy.subtitle} aria-busy={busy} data-busy={busy}>
      <section className="src-route-strip" aria-label={copy.actual} data-tone={routeTone}>
        <span className="src-route-value">
          <small>{copy.source}</small>
          <strong>{sourceLabel}</strong>
        </span>
        <ArrowRight size={17} aria-hidden="true" />
        <span className="src-route-state">
          <small>{copy.requested}</small>
          <strong>{routeRequest}</strong>
          <em>{runtimeLabel}</em>
        </span>
        <ArrowRight size={17} aria-hidden="true" />
        <span className="src-route-value src-route-value--target">
          <small>{copy.output}</small>
          <strong>{outputLabel}</strong>
        </span>
      </section>

      <div className="src-workbench-grid">
        <div className="src-workbench-main">
          <section className="src-control-card sdm-control-card" data-busy={busy}>
            <div className="src-section-heading">
              <span><small>01</small><strong>{copy.mode}</strong></span>
              <button type="button" className="sdm-dop-button" aria-pressed={requestedDop} data-active={requestedDop} disabled={busy} onClick={onDopToggle}>
                <RadioTower size={13} aria-hidden="true" />
                {copy.dop}
              </button>
            </div>
            <SegmentedControl value={mode} options={modeOptions} label={copy.mode} className="src-mode-segments sdm-mode-segments" disabled={busy} showCheck detailId={modeDetailId} onChange={onModeChange} />
            <p id={modeDetailId} className="sdm-selection-detail" aria-live="polite"><span>{selectedMode.label}</span>{selectedMode.detail}</p>

            <div className="src-quality-row sdm-target-row">
              <span><small>02</small><strong>{copy.target}</strong></span>
              <div className="sdm-segment-stack">
                <SegmentedControl value={targetRate} options={targetOptions} label={copy.target} className="src-quality-segments sdm-target-segments" disabled={busy} detailId={targetDetailId} onChange={onTargetRateChange} />
                <small id={targetDetailId} className="sdm-inline-detail" aria-live="polite"><strong>{selectedTarget.label}</strong>{selectedTarget.detail}</small>
              </div>
            </div>

            <div className="src-quality-row">
              <span><small>03</small><strong>{copy.quality}</strong></span>
              <div className="sdm-segment-stack">
                <SegmentedControl value={quality} options={qualityOptions} label={copy.quality} className="src-quality-segments sdm-quality-segments" disabled={busy} detailId={qualityDetailId} onChange={onQualityChange} />
                <small id={qualityDetailId} className="sdm-inline-detail" aria-live="polite"><strong>{selectedQuality.label}</strong>{selectedQuality.detail}</small>
              </div>
            </div>
          </section>

          <div className="sdm-preview-shell">
            <SdmNoisePreview quality={quality} targetRate={targetRate} title={copy.preview} note={copy.previewNote} />
            <button type="button" className="sdm-compare-button" aria-pressed={compareRestore} data-active={compareRestore} disabled={busy || compareDisabled} onClick={onCompareToggle}>
              <RotateCcw size={13} aria-hidden="true" />
              {compareRestore ? copy.compareRestore : copy.compareLinear}
            </button>
          </div>
        </div>

        <aside className="src-inspector">
          <section className="src-inspector-card" aria-live="polite" aria-busy={busy}>
            <header>
              <span><Activity size={15} aria-hidden="true" />{copy.runtimeFacts}</span>
              <span className="src-runtime-actions">
                <em data-tone={routeTone}>{runtimeLabel}</em>
                <button type="button" className="src-icon-button" disabled={busy} onClick={onRefresh} aria-label={copy.refresh}>
                  <RefreshCw size={13} aria-hidden="true" className={busy ? 'sdm-spin' : undefined} />
                </button>
              </span>
            </header>
            <dl>
              <div><dt>{copy.actual}</dt><dd>{outputLabel}</dd></div>
              <div><dt>{copy.transport}</dt><dd>{transportLabel}</dd></div>
              <div><dt>{copy.oversampling}</dt><dd>{oversamplingLabel}</dd></div>
              <div><dt>{copy.modulator}</dt><dd>{modulatorLabel}</dd></div>
              <div><dt>{copy.compute}</dt><dd>{computeLabel}</dd></div>
              <div><dt>{copy.fallback}</dt><dd>{fallbackLabel}</dd></div>
            </dl>
          </section>

          <section className="src-inspector-card src-filter-plan sdm-signal-plan">
            <header>
              <span><Settings2 size={15} aria-hidden="true" />{copy.signalPlan}</span>
              <em>{capabilityLabel}</em>
            </header>
            <div className="src-select-field">
              <span>{copy.sound}</span>
              <span className="src-select-control">
                <DspSelect
                  ariaLabel={copy.sound}
                  value={soundProfile ?? ''}
                  options={soundProfile === null
                    ? [{ value: '', label: copy.customSound, disabled: true }, ...soundOptions]
                    : soundOptions}
                  disabled={busy}
                  describedBy={`${advancedId}-sound-detail`}
                  onChange={(value) => onSoundChange(value as AudioSdmSoundProfileId)}
                />
              </span>
            </div>
            <small id={`${advancedId}-sound-detail`} className="sdm-select-detail">{selectedSound?.detail ?? copy.customSound}</small>
            <SelectField label={copy.compute} value={compute} options={computeOptions} disabled={busy} onChange={onComputeChange} />
            <SelectField label="Filter 1x" value={filter1x} options={filterOptions} disabled={busy} onChange={(value) => onFilterChange('1x', value)} />
            <SelectField label="Filter Nx" value={filterNx} options={filterOptions} disabled={busy} onChange={(value) => onFilterChange('nx', value)} />
            <small className="src-field-status">{computeDetail}</small>
            {warning ? <p className="sdm-warning" role="status"><AlertTriangle size={13} aria-hidden="true" />{warning}</p> : null}
            <button type="button" className="src-advanced-toggle" aria-expanded={advanced} aria-controls={advancedId} data-active={advanced} onClick={() => setAdvanced((value) => !value)}>
              <Settings2 size={14} aria-hidden="true" />
              {advanced ? copy.normal : copy.advanced}
              <ChevronDown size={14} aria-hidden="true" />
            </button>
          </section>

          {advanced ? (
            <section id={advancedId} className="src-inspector-card src-advanced-drawer sdm-advanced-drawer" aria-label={copy.guard}>
              <header>
                <span><ShieldCheck size={14} aria-hidden="true" />{copy.guard}</span>
                <em>{performanceLabel}</em>
              </header>
              <p>{copy.guardDetail}</p>
              <div className="sdm-sound-grid" role="group" aria-label={copy.sound}>
                {soundOptions.map((option) => (
                  <button type="button" data-active={soundProfile === option.value} disabled={busy} key={option.value} onClick={() => onSoundChange(option.value)}>
                    <span>{option.label}{soundProfile === option.value ? <Check size={12} aria-hidden="true" /> : null}</span>
                    <small>{option.detail}</small>
                  </button>
                ))}
              </div>
              <dl className="sdm-modulator-details">
                {modulatorDetails.map((detail) => (
                  <div key={detail.label}><dt>{detail.label}</dt><dd>{detail.value}<small>{detail.detail}</small></dd></div>
                ))}
              </dl>
            </section>
          ) : null}
        </aside>
      </div>

      <footer className="src-workbench-note">
        <Activity size={14} aria-hidden="true" />
        <span>{copy.note}</span>
      </footer>
    </section>
  );
};
