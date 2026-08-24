import { useMemo, useRef, type PointerEvent } from 'react';
import {
  compressorThresholdMaxDb,
  compressorThresholdMinDb,
  type CompressorState,
  type CompressorTelemetry,
} from '../../../shared/types/dspRack';

type CompressorTransferCurveProps = {
  state: CompressorState;
  telemetry: CompressorTelemetry;
  title: string;
  detail: string;
  inputLabel: string;
  outputLabel: string;
  onThresholdChange: (thresholdDb: number) => void;
};

const chartFloorDb = -60;
const chartCeilingDb = 0;
const chartSpanDb = chartCeilingDb - chartFloorDb;
const clamp = (value: number, minimum: number, maximum: number): number => Math.max(minimum, Math.min(maximum, value));
const xForDb = (db: number): number => clamp((db - chartFloorDb) / chartSpanDb, 0, 1) * 100;
const yForDb = (db: number): number => 100 - xForDb(db);

export const computeCompressorReductionDb = (
  inputDb: number,
  thresholdDb: number,
  ratio: number,
  kneeDb: number,
  rangeDb: number,
): number => {
  const overDb = inputDb - thresholdDb;
  const slope = 1 - 1 / Math.max(1, ratio);
  let reductionDb: number;
  if (kneeDb <= 0.001) {
    reductionDb = Math.max(0, overDb * slope);
  } else {
    const halfKnee = kneeDb / 2;
    if (overDb <= -halfKnee) reductionDb = 0;
    else if (overDb >= halfKnee) reductionDb = overDb * slope;
    else {
      const kneePosition = overDb + halfKnee;
      reductionDb = slope * kneePosition * kneePosition / (2 * kneeDb);
    }
  }
  return Math.min(Math.max(0, reductionDb), Math.max(0, rangeDb));
};

const mixedOutputDb = (inputDb: number, state: CompressorState): number => {
  const reductionDb = computeCompressorReductionDb(
    inputDb,
    state.thresholdDb,
    state.ratio,
    state.kneeDb,
    state.rangeDb,
  );
  const inputGain = 10 ** (inputDb / 20);
  const wetGain = inputGain * 10 ** ((state.makeupDb - reductionDb) / 20);
  const outputGain = inputGain * (1 - state.mix) + wetGain * state.mix;
  return 20 * Math.log10(Math.max(1e-9, outputGain));
};

export const CompressorTransferCurve = ({
  state,
  telemetry,
  title,
  detail,
  inputLabel,
  outputLabel,
  onThresholdChange,
}: CompressorTransferCurveProps): JSX.Element => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const curvePath = useMemo(() => {
    const points = Array.from({ length: 61 }, (_, index) => {
      const inputDb = chartFloorDb + index;
      return `${xForDb(inputDb).toFixed(2)},${yForDb(mixedOutputDb(inputDb, state)).toFixed(2)}`;
    });
    return `M ${points.join(' L ')}`;
  }, [state]);

  const inputPeakDb = Math.max(...telemetry.inputPeakDb, chartFloorDb);
  const outputPeakDb = Math.max(...telemetry.outputPeakDb, chartFloorDb);
  const signalVisible = inputPeakDb > chartFloorDb + 0.5;
  const thresholdX = xForDb(state.thresholdDb);
  const kneeStartX = xForDb(state.thresholdDb - state.kneeDb / 2);
  const kneeEndX = xForDb(state.thresholdDb + state.kneeDb / 2);

  const updateThreshold = (event: PointerEvent<SVGSVGElement>): void => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const normalizedX = clamp((event.clientX - rect.left) / Math.max(1, rect.width), 0, 1);
    const next = chartFloorDb + normalizedX * chartSpanDb;
    onThresholdChange(clamp(Math.round(next * 2) / 2, compressorThresholdMinDb, compressorThresholdMaxDb));
  };

  return (
    <section className="compressor-curve-card">
      <header>
        <div>
          <h3>{title}</h3>
          <p>{detail}</p>
        </div>
        <span>{state.ratio.toFixed(1)}:1</span>
      </header>
      <div className="compressor-curve-stage">
        <span className="compressor-axis-label compressor-axis-label--output">{outputLabel}</span>
        <svg
          ref={svgRef}
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          role="img"
          aria-label={title}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            updateThreshold(event);
          }}
          onPointerMove={(event) => {
            if (event.currentTarget.hasPointerCapture(event.pointerId)) updateThreshold(event);
          }}
        >
          <defs>
            <linearGradient id="compressor-curve-fill" x1="0" x2="1" y1="1" y2="0">
              <stop offset="0" stopColor="#4bc4ea" stopOpacity="0.04" />
              <stop offset="0.62" stopColor="#5c86ec" stopOpacity="0.16" />
              <stop offset="1" stopColor="#8a72ef" stopOpacity="0.28" />
            </linearGradient>
          </defs>
          {[0, 25, 50, 75, 100].map((position) => (
            <g key={position}>
              <line className="compressor-grid-line" x1={position} x2={position} y1="0" y2="100" />
              <line className="compressor-grid-line" x1="0" x2="100" y1={position} y2={position} />
            </g>
          ))}
          <line className="compressor-unity-line" x1="0" x2="100" y1="100" y2="0" />
          <rect className="compressor-knee-zone" x={kneeStartX} width={Math.max(0, kneeEndX - kneeStartX)} y="0" height="100" />
          <path className="compressor-curve-area" d={`${curvePath} L 100,100 L 0,100 Z`} />
          <path className="compressor-curve-line" d={curvePath} />
          <line className="compressor-threshold-line" x1={thresholdX} x2={thresholdX} y1="0" y2="100" />
          <circle className="compressor-threshold-handle" cx={thresholdX} cy={yForDb(mixedOutputDb(state.thresholdDb, state))} r="2.2" />
          {signalVisible ? (
            <g className="compressor-live-point">
              <circle cx={xForDb(inputPeakDb)} cy={yForDb(outputPeakDb)} r="4.6" />
              <circle cx={xForDb(inputPeakDb)} cy={yForDb(outputPeakDb)} r="2" />
            </g>
          ) : null}
        </svg>
        <span className="compressor-axis-label compressor-axis-label--input">{inputLabel}</span>
      </div>
      <footer>
        <span>-60</span><span>-45</span><span>-30</span><span>-15</span><span>0 dBFS</span>
      </footer>
    </section>
  );
};
