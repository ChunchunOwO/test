import type { CompressorTelemetry } from '../../../shared/types/dspRack';

type CompressorMetersProps = {
  telemetry: CompressorTelemetry;
  labels: {
    input: string;
    output: string;
    gainReduction: string;
    headroom: string;
    peak: string;
    rms: string;
    left: string;
    right: string;
  };
};

const meterFloorDb = -60;
const clamp = (value: number, minimum: number, maximum: number): number => Math.max(minimum, Math.min(maximum, value));
const levelPercent = (db: number): number => clamp((db - meterFloorDb) / -meterFloorDb, 0, 1) * 100;
const formatDb = (value: number): string => `${Number.isFinite(value) ? value.toFixed(1) : meterFloorDb.toFixed(1)} dB`;

const StereoLevelMeter = ({
  title,
  peakDb,
  rmsDb,
  labels,
}: {
  title: string;
  peakDb: number[];
  rmsDb: number[];
  labels: CompressorMetersProps['labels'];
}): JSX.Element => (
  <article className="compressor-meter-card">
    <header><strong>{title}</strong><span>{labels.peak} / {labels.rms}</span></header>
    {[0, 1].map((channel) => {
      const peak = peakDb[channel] ?? peakDb[0] ?? meterFloorDb;
      const rms = rmsDb[channel] ?? rmsDb[0] ?? meterFloorDb;
      return (
        <div className="compressor-meter-row" key={channel}>
          <b>{channel === 0 ? labels.left : labels.right}</b>
          <div className="compressor-level-track">
            <span className="compressor-level-rms" style={{ width: `${levelPercent(rms)}%` }} />
            <span className="compressor-level-peak" style={{ left: `${levelPercent(peak)}%` }} />
          </div>
          <em>{formatDb(peak)}</em>
        </div>
      );
    })}
  </article>
);

export const CompressorMeters = ({ telemetry, labels }: CompressorMetersProps): JSX.Element => (
  <div className="compressor-meter-grid" data-clipping={telemetry.clippingRisk}>
    <StereoLevelMeter title={labels.input} peakDb={telemetry.inputPeakDb} rmsDb={telemetry.inputRmsDb} labels={labels} />
    <article className="compressor-meter-card compressor-meter-card--reduction">
      <header><strong>{labels.gainReduction}</strong><span>GR</span></header>
      <div className="compressor-gr-readout">
        <strong>{telemetry.gainReductionDb.toFixed(1)}</strong><span>dB</span>
      </div>
      <div className="compressor-gr-track">
        <span style={{ width: `${clamp(telemetry.gainReductionDb / 24, 0, 1) * 100}%` }} />
      </div>
      <footer><span>{labels.headroom}</span><b>{telemetry.outputHeadroomDb.toFixed(1)} dB</b></footer>
    </article>
    <StereoLevelMeter title={labels.output} peakDb={telemetry.outputPeakDb} rmsDb={telemetry.outputRmsDb} labels={labels} />
  </div>
);
