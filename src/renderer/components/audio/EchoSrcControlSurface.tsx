import { Activity, ArrowRight, Check, ChevronDown, RefreshCw, RotateCcw, Settings2 } from 'lucide-react';
import type {
  AudioEchoSrcComputeBackend,
  AudioEchoSrcFilterProfile,
  AudioEchoSrcMode,
  AudioEchoSrcQualityProfile,
  AudioPcmDitherMode,
} from '../../../shared/types/audio';
import { DspSelect } from './DspSelect';
import '../../styles/src-workbench.css';

export type EchoSrcTone = 'good' | 'warn' | 'neutral';

export type EchoSrcModeView = {
  value: AudioEchoSrcMode;
  label: string;
  detail: string;
};

export type EchoSrcQualityView = {
  value: AudioEchoSrcQualityProfile;
  label: string;
  detail: string;
};

export type EchoSrcFilterView = {
  value: AudioEchoSrcFilterProfile;
  label: string;
  detail: string;
};

export type EchoSrcComputeView = {
  value: AudioEchoSrcComputeBackend;
  label: string;
  detail: string;
};

export type EchoSrcDitherView = {
  value: AudioPcmDitherMode;
  label: string;
  detail: string;
};

export type EchoSrcLadderView = {
  id: string;
  label: string;
  detail: string;
  meta: string;
  active: boolean;
};

export type EchoSrcControlCopy = {
  eyebrow: string;
  title: string;
  subtitle: string;
  route: string;
  sourceRate: string;
  targetRate: string;
  engine: string;
  quality: string;
  precision: string;
  mode: string;
  normal: string;
  advanced: string;
  filterPreview: string;
  filterPreviewNote: string;
  runtimeFacts: string;
  filterPlan: string;
  compute: string;
  dither: string;
  refresh: string;
  abBypass: string;
  abRestore: string;
  note: string;
  advancedSummary: string;
};

export type EchoSrcControlSurfaceProps = {
  mode: AudioEchoSrcMode;
  quality: AudioEchoSrcQualityProfile;
  advanced: boolean;
  filter1x: AudioEchoSrcFilterProfile;
  filterNx: AudioEchoSrcFilterProfile;
  compute: AudioEchoSrcComputeBackend;
  dither: AudioPcmDitherMode;
  activeFilterSlot: '1x' | 'nx' | null;
  routeTone: EchoSrcTone;
  routeLabel: string;
  sourceRate: string;
  targetRate: string;
  engineLabel: string;
  qualityLabel: string;
  precisionLabel: string;
  computeStatus: string;
  ditherStatus: string;
  advancedStatus: string;
  busy: boolean;
  compareDisabled: boolean;
  compareRestore: boolean;
  modeOptions: EchoSrcModeView[];
  qualityOptions: EchoSrcQualityView[];
  filterOptions: EchoSrcFilterView[];
  computeOptions: EchoSrcComputeView[];
  ditherOptions: EchoSrcDitherView[];
  ladderOptions: EchoSrcLadderView[];
  copy: EchoSrcControlCopy;
  cudaGuide?: {
    title: string;
    reason: string;
    steps: string[];
  } | null;
  onModeChange: (mode: AudioEchoSrcMode) => void;
  onQualityChange: (quality: AudioEchoSrcQualityProfile) => void;
  onAdvancedChange: (advanced: boolean) => void;
  onFilterChange: (slot: '1x' | 'nx', filter: AudioEchoSrcFilterProfile) => void;
  onComputeChange: (compute: AudioEchoSrcComputeBackend) => void;
  onDitherChange: (dither: AudioPcmDitherMode) => void;
  onLadderApply: (id: string) => void;
  onCompareToggle: () => void;
  onRefresh: () => void;
};

const getFilterShape = (filter: AudioEchoSrcFilterProfile): { path: string; knee: number; phase: string } => {
  const normalized = filter.toLowerCase();
  const minimumPhase = normalized.includes('minring') || normalized.includes('-mp') || normalized.includes('apod');
  const soft = normalized.includes('soft') || normalized.includes('gauss');
  const steep = normalized.includes('brickwall') || normalized.includes('extreme') || normalized.includes('xla') || normalized.includes('xl');
  const knee = soft ? 505 : steep ? 570 : 545;
  const floorX = Math.min(640, knee + (steep ? 28 : soft ? 82 : 52));
  const tail = steep
    ? `C ${floorX + 8} 165, ${floorX + 13} 196, ${floorX + 20} 181 S ${floorX + 31} 194, ${floorX + 38} 183 S ${floorX + 49} 191, ${floorX + 56} 185 S ${floorX + 70} 188, 676 188`
    : `C ${floorX + 20} 188, 650 188, 676 188`;
  const path = `M 52 54 C 180 54, 360 54, ${knee - 42} 55 C ${knee - 8} 56, ${knee} 60, ${knee + 8} 78 C ${knee + 18} 106, ${floorX - 22} 164, ${floorX} 177 ${tail}`;
  return { path, knee, phase: minimumPhase ? 'Minimum phase' : 'Linear phase' };
};

const SrcFilterPreview = ({
  filter,
  title,
  note,
}: {
  filter: AudioEchoSrcFilterProfile;
  title: string;
  note: string;
}): JSX.Element => {
  const shape = getFilterShape(filter);
  const verticalGrid = [52, 156, 260, 364, 468, 572, 676];
  const horizontalGrid = [54, 88, 122, 156, 188];

  return (
    <section className="src-preview-card" aria-label={title}>
      <header>
        <span>
          <small>{title}</small>
          <strong>{filter}</strong>
        </span>
        <em>{shape.phase}</em>
      </header>
      <div className="src-preview-chart">
        <svg viewBox="0 0 720 220" role="img" aria-label={`${title}: ${filter}`} preserveAspectRatio="none">
          <g className="src-preview-grid">
            {verticalGrid.map((x) => <line key={`v-${x}`} x1={x} x2={x} y1="28" y2="188" />)}
            {horizontalGrid.map((y) => <line key={`h-${y}`} x1="52" x2="676" y1={y} y2={y} />)}
          </g>
          <line className="src-preview-reference" x1="52" x2="676" y1="66" y2="66" />
          <path className="src-preview-area" d={`${shape.path} L 676 188 L 52 188 Z`} />
          <path className="src-preview-response" d={shape.path} />
          <line className="src-preview-knee" x1={shape.knee} x2={shape.knee} y1="28" y2="188" />
          <g className="src-preview-axis-labels">
            <text x="15" y="58">0</text>
            <text x="9" y="92">-24</text>
            <text x="9" y="126">-48</text>
            <text x="9" y="160">-72</text>
            <text x="7" y="192">-96</text>
            <text x="52" y="211">20 Hz</text>
            <text x="340" y="211">10 kHz</text>
            <text x="622" y="211">Nyquist</text>
          </g>
        </svg>
      </div>
      <p>{note}</p>
    </section>
  );
};

const SelectField = <T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string; detail: string }>;
  onChange: (value: T) => void;
}): JSX.Element => (
  <div className="src-select-field">
    <span>{label}</span>
    <span className="src-select-control">
      <DspSelect ariaLabel={label} value={value} options={options} onChange={onChange} />
    </span>
  </div>
);

export const EchoSrcControlSurface = ({
  mode,
  quality,
  advanced,
  filter1x,
  filterNx,
  compute,
  dither,
  activeFilterSlot,
  routeTone,
  routeLabel,
  sourceRate,
  targetRate,
  engineLabel,
  qualityLabel,
  precisionLabel,
  computeStatus,
  ditherStatus,
  advancedStatus,
  busy,
  compareDisabled,
  compareRestore,
  modeOptions,
  qualityOptions,
  filterOptions,
  computeOptions,
  ditherOptions,
  ladderOptions,
  copy,
  cudaGuide,
  onModeChange,
  onQualityChange,
  onAdvancedChange,
  onFilterChange,
  onComputeChange,
  onDitherChange,
  onLadderApply,
  onCompareToggle,
  onRefresh,
}: EchoSrcControlSurfaceProps): JSX.Element => {
  const selectedMode = modeOptions.find((option) => option.value === mode) ?? modeOptions[0];
  const previewFilter = activeFilterSlot === 'nx' ? filterNx : filter1x;

  return (
    <section className="src-workbench" aria-label={copy.title} aria-description={copy.subtitle} data-eyebrow={copy.eyebrow}>
      <section className="src-route-strip" aria-label={copy.route} data-tone={routeTone}>
        <span className="src-route-value">
          <small>{copy.sourceRate}</small>
          <strong>{sourceRate}</strong>
        </span>
        <ArrowRight size={17} aria-hidden="true" />
        <span className="src-route-state">
          <small>{copy.route}</small>
          <strong>{selectedMode.label} · {qualityLabel}</strong>
          <em>{routeLabel}</em>
        </span>
        <ArrowRight size={17} aria-hidden="true" />
        <span className="src-route-value src-route-value--target">
          <small>{copy.targetRate}</small>
          <strong>{targetRate}</strong>
        </span>
      </section>

      <div className="src-workbench-grid">
        <div className="src-workbench-main">
          <section className="src-control-card">
            <div className="src-section-heading">
              <span>
                <small>01</small>
                <strong>{copy.mode}</strong>
              </span>
              <button
                type="button"
                className="src-compare-button"
                disabled={compareDisabled || busy}
                data-active={compareRestore}
                onClick={onCompareToggle}
              >
                <RotateCcw size={13} aria-hidden="true" />
                {compareRestore ? copy.abRestore : copy.abBypass}
              </button>
            </div>
            <div className="src-mode-segments" role="group" aria-label={copy.mode}>
              {modeOptions.map((option) => (
                <button
                  type="button"
                  data-active={mode === option.value}
                  key={option.value}
                  title={option.detail}
                  onClick={() => onModeChange(option.value)}
                >
                  {mode === option.value ? <Check size={13} aria-hidden="true" /> : null}
                  <span>{option.label}</span>
                </button>
              ))}
            </div>

            <div className="src-quality-row">
              <span>
                <small>02</small>
                <strong>{copy.quality}</strong>
              </span>
              <div className="src-quality-segments" role="group" aria-label={copy.quality}>
                {qualityOptions.map((option) => (
                  <button
                    type="button"
                    data-active={quality === option.value}
                    key={option.value}
                    title={option.detail}
                    onClick={() => onQualityChange(option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          </section>

          <SrcFilterPreview filter={previewFilter} title={copy.filterPreview} note={copy.filterPreviewNote} />
        </div>

        <aside className="src-inspector">
          <section className="src-inspector-card">
            <header>
              <span><Activity size={15} aria-hidden="true" />{copy.runtimeFacts}</span>
              <span className="src-runtime-actions">
                <em data-tone={routeTone}>{routeLabel}</em>
                <button type="button" className="src-icon-button" disabled={busy} onClick={onRefresh} aria-label={copy.refresh}>
                  <RefreshCw size={13} aria-hidden="true" />
                </button>
              </span>
            </header>
            <dl>
              <div><dt>{copy.engine}</dt><dd>{engineLabel}</dd></div>
              <div><dt>{copy.quality}</dt><dd>{qualityLabel}</dd></div>
              <div><dt>{copy.precision}</dt><dd>{precisionLabel}</dd></div>
              <div><dt>{copy.compute}</dt><dd>{computeStatus}</dd></div>
            </dl>
          </section>

          <section className="src-inspector-card src-filter-plan">
            <header>
              <span><Settings2 size={15} aria-hidden="true" />{copy.filterPlan}</span>
              <em>{activeFilterSlot ? `Filter ${activeFilterSlot.toUpperCase()}` : 'Standby'}</em>
            </header>
            <SelectField label="Filter 1x" value={filter1x} options={filterOptions} onChange={(value) => onFilterChange('1x', value)} />
            <SelectField label="Filter Nx" value={filterNx} options={filterOptions} onChange={(value) => onFilterChange('nx', value)} />
            <SelectField label={copy.compute} value={compute} options={computeOptions} onChange={onComputeChange} />
            <SelectField label={copy.dither} value={dither} options={ditherOptions} onChange={onDitherChange} />
            <small className="src-field-status">{ditherStatus}</small>
            <button type="button" className="src-advanced-toggle" data-active={advanced} onClick={() => onAdvancedChange(!advanced)}>
              <Settings2 size={14} aria-hidden="true" />
              {advanced ? copy.normal : copy.advanced}
              <ChevronDown size={14} aria-hidden="true" />
            </button>
          </section>

          {advanced ? (
            <section className="src-inspector-card src-advanced-drawer">
              <header>
                <span>{copy.advanced}</span>
                <em>{advancedStatus}</em>
              </header>
              <p>{copy.advancedSummary}</p>
              <div className="src-ladder-list">
                {ladderOptions.map((option) => (
                  <button type="button" data-active={option.active} key={option.id} onClick={() => onLadderApply(option.id)}>
                    <span>{option.label}{option.active ? <Check size={12} aria-hidden="true" /> : null}</span>
                    <small>{option.detail}</small>
                    <em>{option.meta}</em>
                  </button>
                ))}
              </div>
              {cudaGuide ? (
                <div className="src-cuda-guide" role="status">
                  <strong>{cudaGuide.title}</strong>
                  <p>{cudaGuide.reason}</p>
                  <ol>{cudaGuide.steps.map((step) => <li key={step}>{step}</li>)}</ol>
                </div>
              ) : null}
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
