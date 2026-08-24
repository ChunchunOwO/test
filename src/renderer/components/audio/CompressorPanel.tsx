import { useEffect, useMemo, useState } from 'react';
import { Activity, ChevronDown, Power, RotateCcw, Save, SlidersHorizontal } from 'lucide-react';
import {
  compressorAttackMaxMs,
  compressorAttackMinMs,
  compressorKneeMaxDb,
  compressorKneeMinDb,
  compressorMakeupMaxDb,
  compressorMakeupMinDb,
  compressorRangeMaxDb,
  compressorRangeMinDb,
  compressorRatioMax,
  compressorRatioMin,
  compressorReleaseMaxMs,
  compressorReleaseMinMs,
  compressorSidechainHighpassMaxHz,
  compressorSidechainHighpassMinHz,
  compressorThresholdMaxDb,
  compressorThresholdMinDb,
  defaultDspRackState,
  normalizeDspRackState,
  type CompressorState,
  type CompressorTelemetry,
} from '../../../shared/types/dspRack';
import { useI18n } from '../../i18n/I18nProvider';
import { getEqBridge } from '../../utils/echoBridge';
import { formatUserFacingError } from '../../utils/userFacingError';
import { CompressorHistory } from './CompressorHistory';
import { CompressorMeters } from './CompressorMeters';
import { getCompressorPanelText } from './CompressorPanelText';
import { CompressorTransferCurve } from './CompressorTransferCurve';
import '../../styles/compressor-workbench.css';

type CompressorPanelProps = {
  state: CompressorState;
  onApplied: (state: CompressorState) => void;
};

type CompressorNumberKey =
  | 'thresholdDb'
  | 'ratio'
  | 'attackMs'
  | 'releaseMs'
  | 'kneeDb'
  | 'makeupDb'
  | 'mix'
  | 'sidechainHighpassHz'
  | 'rangeDb'
  | 'stereoLink';

type ControlDefinition = {
  key: CompressorNumberKey;
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  scale?: 'linear' | 'log';
};

const historySampleCount = 80;
const clamp = (value: number, minimum: number, maximum: number): number => Math.max(minimum, Math.min(maximum, value));

const telemetryFromState = (state: CompressorState): CompressorTelemetry => ({
  inputPeakDb: state.inputPeakDb,
  inputRmsDb: state.inputRmsDb,
  outputPeakDb: state.outputPeakDb,
  outputRmsDb: state.outputRmsDb,
  gainReductionDb: state.gainReductionDb,
  gainReductionDbByChannel: state.gainReductionDbByChannel,
  outputHeadroomDb: state.outputHeadroomDb,
  clippingRisk: state.clippingRisk,
});

const normalizeTelemetry = (telemetry: CompressorTelemetry): CompressorTelemetry => {
  const defaults = defaultDspRackState();
  return telemetryFromState(normalizeDspRackState({
    order: defaults.order,
    compressor: { ...defaults.compressor, ...telemetry },
  }).compressor);
};

const displayValue = (key: CompressorNumberKey, value: number): string => {
  if (key === 'mix' || key === 'stereoLink') return `${Math.round(value * 100)}`;
  if (key === 'ratio') return value.toFixed(1);
  if (key === 'attackMs' && value < 10) return value.toFixed(1);
  return `${Number(value.toFixed(1))}`;
};

const sliderValue = (control: ControlDefinition, value: number): number => {
  if (control.scale !== 'log') return value;
  return Math.log(value / control.min) / Math.log(control.max / control.min);
};

const controlValue = (control: ControlDefinition, rawValue: number): number => {
  if (control.scale !== 'log') return rawValue;
  const value = control.min * (control.max / control.min) ** clamp(rawValue, 0, 1);
  return Math.round(value / control.step) * control.step;
};

const CompressorSlider = ({
  control,
  value,
  disabled,
  onChange,
}: {
  control: ControlDefinition;
  value: number;
  disabled: boolean;
  onChange: (value: number) => void;
}): JSX.Element => (
  <label className="compressor-control">
    <span>
      <strong>{control.label}</strong>
      <em>{displayValue(control.key, value)} {control.unit}</em>
    </span>
    <input
      type="range"
      aria-label={control.label}
      aria-valuetext={`${displayValue(control.key, value)} ${control.unit}`}
      min={control.scale === 'log' ? 0 : control.min}
      max={control.scale === 'log' ? 1 : control.max}
      step={control.scale === 'log' ? 0.001 : control.step}
      value={sliderValue(control, value)}
      disabled={disabled}
      onChange={(event) => onChange(controlValue(control, Number(event.target.value)))}
    />
  </label>
);

const ToggleControl = ({
  label,
  active,
  disabled,
  onClick,
  activeLabel,
  inactiveLabel,
}: {
  label: string;
  active: boolean;
  disabled: boolean;
  onClick: () => void;
  activeLabel: string;
  inactiveLabel: string;
}): JSX.Element => (
  <div className="compressor-toggle-control">
    <span><strong>{label}</strong><em>{active ? activeLabel : inactiveLabel}</em></span>
    <button type="button" role="switch" aria-label={label} aria-checked={active} data-active={active} disabled={disabled} onClick={onClick}>
      <span />
    </button>
  </div>
);

export const CompressorPanel = ({ state, onApplied }: CompressorPanelProps): JSX.Element => {
  const { locale } = useI18n();
  const text = getCompressorPanelText(locale);
  const [draft, setDraft] = useState(state);
  const [telemetry, setTelemetry] = useState<CompressorTelemetry>(() => telemetryFromState(state));
  const [history, setHistory] = useState<number[]>(() => [state.gainReductionDb]);
  const [advancedOpen, setAdvancedOpen] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(state);
    setTelemetry(telemetryFromState(state));
  }, [state]);

  useEffect(() => {
    const eq = getEqBridge();
    if (!eq?.onCompressorTelemetry) return undefined;
    return eq.onCompressorTelemetry((next) => {
      const normalized = normalizeTelemetry(next);
      setTelemetry(normalized);
      setHistory((current) => [...current, normalized.gainReductionDb].slice(-historySampleCount));
    });
  }, []);

  const basicControls = useMemo<ControlDefinition[]>(() => [
    { key: 'thresholdDb', label: text.threshold, unit: 'dB', min: compressorThresholdMinDb, max: compressorThresholdMaxDb, step: 0.5 },
    { key: 'ratio', label: text.ratio, unit: ':1', min: compressorRatioMin, max: compressorRatioMax, step: 0.1 },
    { key: 'attackMs', label: text.attack, unit: 'ms', min: compressorAttackMinMs, max: compressorAttackMaxMs, step: 0.1, scale: 'log' },
    { key: 'releaseMs', label: text.release, unit: 'ms', min: compressorReleaseMinMs, max: compressorReleaseMaxMs, step: 1, scale: 'log' },
    { key: 'makeupDb', label: text.makeup, unit: 'dB', min: compressorMakeupMinDb, max: compressorMakeupMaxDb, step: 0.5 },
    { key: 'mix', label: text.mix, unit: '%', min: 0, max: 1, step: 0.01 },
  ], [text]);
  const advancedControls = useMemo<ControlDefinition[]>(() => [
    { key: 'kneeDb', label: text.knee, unit: 'dB', min: compressorKneeMinDb, max: compressorKneeMaxDb, step: 0.5 },
    { key: 'rangeDb', label: text.range, unit: 'dB', min: compressorRangeMinDb, max: compressorRangeMaxDb, step: 0.5 },
    { key: 'stereoLink', label: text.stereoLink, unit: '%', min: 0, max: 1, step: 0.01 },
    { key: 'sidechainHighpassHz', label: text.sidechainHighpassFrequency, unit: 'Hz', min: compressorSidechainHighpassMinHz, max: compressorSidechainHighpassMaxHz, step: 1, scale: 'log' },
  ], [text]);

  const apply = async (next: CompressorState): Promise<void> => {
    const eq = getEqBridge();
    if (!eq?.setCompressorState) {
      setError(text.bridgeUnavailable);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const applied = await eq.setCompressorState(next);
      setDraft(applied);
      setTelemetry(telemetryFromState(applied));
      onApplied(applied);
    } catch (applyError) {
      setError(formatUserFacingError(applyError, { context: 'audio' }));
    } finally {
      setBusy(false);
    }
  };

  const setNumber = (key: CompressorNumberKey, value: number): void => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const reset = (): void => {
    setDraft(defaultDspRackState().compressor);
  };

  const meterLabels = {
    input: text.input,
    output: text.output,
    gainReduction: text.gainReduction,
    headroom: text.headroom,
    peak: text.peak,
    rms: text.rms,
    left: text.left,
    right: text.right,
  };

  return (
    <section className="dsp-module-panel compressor-workbench" aria-label={text.aria} data-clipping={telemetry.clippingRisk}>
      <header className="compressor-workbench-header">
        <div>
          <span>{text.eyebrow}</span>
          <h2>{text.title}</h2>
          <p>{text.description}</p>
        </div>
        <div className="compressor-header-actions">
          <span className="compressor-native-live"><Activity size={13} aria-hidden="true" />{text.nativeLive}</span>
          <button
            type="button"
            className="compressor-power"
            data-active={draft.enabled}
            disabled={busy}
            onClick={() => void apply({ ...draft, enabled: !draft.enabled })}
          >
            <Power size={16} aria-hidden="true" />
            {draft.enabled ? text.enabled : text.bypassed}
          </button>
        </div>
      </header>

      {telemetry.clippingRisk ? <p className="compressor-clipping-warning" role="alert">{text.clippingRisk}</p> : null}
      {error ? <p className="dsp-rack-error" role="alert">{error}</p> : null}

      <div className="compressor-visual-grid">
        <CompressorTransferCurve
          state={draft}
          telemetry={telemetry}
          title={text.curveTitle}
          detail={text.curveDetail}
          inputLabel={text.input}
          outputLabel={text.output}
          onThresholdChange={(thresholdDb) => setNumber('thresholdDb', thresholdDb)}
        />
        <CompressorHistory values={history} title={text.historyTitle} windowLabel={text.historyWindow} />
      </div>

      <CompressorMeters telemetry={telemetry} labels={meterLabels} />

      <section className="compressor-control-section">
        <header><SlidersHorizontal size={16} aria-hidden="true" /><strong>{text.basic}</strong></header>
        <div className="compressor-control-grid">
          {basicControls.map((control) => (
            <CompressorSlider
              key={control.key}
              control={control}
              value={draft[control.key]}
              disabled={busy}
              onChange={(value) => setNumber(control.key, value)}
            />
          ))}
        </div>
      </section>

      <section className="compressor-control-section compressor-control-section--advanced" data-open={advancedOpen}>
        <button type="button" className="compressor-advanced-toggle" aria-expanded={advancedOpen} onClick={() => setAdvancedOpen((open) => !open)}>
          <span><SlidersHorizontal size={16} aria-hidden="true" /><strong>{text.advanced}</strong></span>
          <ChevronDown size={17} aria-hidden="true" />
        </button>
        {advancedOpen ? (
          <div className="compressor-advanced-body">
            <div className="compressor-segment-control">
              <span><strong>{text.detector}</strong><em>{draft.detectorMode === 'peak' ? text.peak : text.rms}</em></span>
              <div role="group" aria-label={text.detector}>
                <button type="button" data-active={draft.detectorMode === 'peak'} disabled={busy} onClick={() => setDraft((current) => ({ ...current, detectorMode: 'peak' }))}>{text.peak}</button>
                <button type="button" data-active={draft.detectorMode === 'rms'} disabled={busy} onClick={() => setDraft((current) => ({ ...current, detectorMode: 'rms' }))}>{text.rms}</button>
              </div>
            </div>
            <ToggleControl
              label={text.sidechainHighpass}
              active={draft.sidechainHighpassEnabled}
              disabled={busy}
              onClick={() => setDraft((current) => ({ ...current, sidechainHighpassEnabled: !current.sidechainHighpassEnabled }))}
              activeLabel={`${Math.round(draft.sidechainHighpassHz)} Hz`}
              inactiveLabel={text.off}
            />
            <ToggleControl
              label={text.autoRelease}
              active={draft.autoRelease}
              disabled={busy}
              onClick={() => setDraft((current) => ({ ...current, autoRelease: !current.autoRelease }))}
              activeLabel={text.enabled}
              inactiveLabel={text.off}
            />
            {advancedControls.map((control) => (
              <CompressorSlider
                key={control.key}
                control={control}
                value={draft[control.key]}
                disabled={busy || (control.key === 'sidechainHighpassHz' && !draft.sidechainHighpassEnabled)}
                onChange={(value) => setNumber(control.key, value)}
              />
            ))}
          </div>
        ) : null}
      </section>

      <footer className="compressor-workbench-footer">
        <p>{text.applyHint}</p>
        <div>
          <button type="button" disabled={busy} onClick={reset}><RotateCcw size={15} aria-hidden="true" />{text.reset}</button>
          <button type="button" disabled={busy} onClick={() => void apply(draft)}><Save size={15} aria-hidden="true" />{text.apply}</button>
        </div>
      </footer>
    </section>
  );
};
