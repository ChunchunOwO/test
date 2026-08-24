import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent } from 'react';
import type { AudioLevelTelemetry } from '../../../shared/types/audio';
import type { EqBand, EqFilterType } from '../../../shared/types/eq';
import { eqFrequenciesHz, eqMaxFrequencyHz, eqMaxGainDb, eqMaxQ, eqMinFrequencyHz, eqMinGainDb, eqMinQ } from '../../../shared/types/eq';
import { useI18n } from '../../i18n/I18nProvider';
import type { TranslationKey } from '../../i18n/locales';
import {
  clamp,
  computeEqBandNodePoint,
  computeEqResponseGainDbFromCoefficients,
  computeEqSpectrumBars,
  interpolateEqResponseGainDb,
  makeEqBiquadCoefficients,
  type EqAnalyzerMode,
  formatDb,
  formatFrequencyLabel,
  isEqFilterGainEditable,
  resolveGraphicEqBandGainDb,
  resolveBandFrequency,
} from './eqPanelUtils';

type EqCurveViewProps = {
  bands: EqBand[];
  enabled: boolean;
  frequencyUnlocked: boolean;
  selectedBandIndex: number;
  spectrumEnabled?: boolean;
  analyzerMode?: EqAnalyzerMode;
  visualSpectrum?: number[];
  visualTelemetryState?: AudioLevelTelemetry['visualTelemetryState'];
  visibleBandIndexes?: number[];
  curveFirst?: boolean;
  graphicWorkbench?: boolean;
  onBandSelect: (index: number) => void;
  onBandChange: (index: number, gainDb: number) => void;
  onBandCommit: (index: number, gainDb: number) => void;
  onBandFrequencyChange: (index: number, frequencyHz: number) => void;
  onBandFrequencyCommit: (index: number, frequencyHz: number) => void;
  onBandQCommit?: (index: number, q: number) => void;
  onBandDelete?: (index: number) => void;
  onAddBandAt?: (frequencyHz: number, gainDb: number) => void;
};

type DragPoint = {
  rawFrequencyHz: number;
  frequencyHz: number;
  gainDb: number;
};

type HoverReadout = {
  x: number;
  y: number;
  frequencyHz: number;
  totalGainDb: number;
  bandGainDb: number;
};

type DisplayBandEntry = {
  band: EqBand;
  index: number;
};

const paddingLeft = 62;
const paddingRight = 56;
const paddingTop = 30;
const paddingBottom = 42;
type PlotLayout = {
  width: number;
  height: number;
  plotWidth: number;
  plotHeight: number;
};
const fallbackPlotLayout: PlotLayout = {
  width: 920,
  height: 360,
  plotWidth: 920 - paddingLeft - paddingRight,
  plotHeight: 360 - paddingTop - paddingBottom,
};
const createPlotLayout = (width: number, height: number): PlotLayout => {
  const nextWidth = Math.round(width);
  const nextHeight = Math.round(height);
  if (nextWidth < 2 || nextHeight < 2) {
    return fallbackPlotLayout;
  }

  return {
    width: nextWidth,
    height: nextHeight,
    plotWidth: Math.max(1, nextWidth - paddingLeft - paddingRight),
    plotHeight: Math.max(1, nextHeight - paddingTop - paddingBottom),
  };
};
const defaultPlotLayout = fallbackPlotLayout;
const responsePointCount = 180;
const defaultAxisLimitDb = 12;
const graphicFaderHitHalfWidth = 11;
const graphicZeroSnapReleaseDb = 0.15;
const graphicFrequencyDragPx = 10;
const parametricGrabDistance = 36;
const parametricQDragPx = 160;
const axisLimitStepsDb = [12, 18, 24, 36];
const axisFrequenciesHz = [20, 31.5, 50, 80, 125, 200, 315, 500, 800, 1250, 2000, 3200, 5000, 8000, 12500, 20000] as const;
const eqCurveBandColorCount = 7;
export const getEqCurveBandColor = (index: number): string => {
  const slot = ((index % eqCurveBandColorCount) + eqCurveBandColorCount) % eqCurveBandColorCount;
  return `var(--eq-band-color-${slot})`;
};
const eqFilterLabelKeys: Record<EqFilterType, TranslationKey> = {
  peaking: 'settings.eq.filter.peaking',
  lowShelf: 'settings.eq.filter.lowShelf',
  highShelf: 'settings.eq.filter.highShelf',
  lowPass: 'settings.eq.filter.lowPass',
  highPass: 'settings.eq.filter.highPass',
  notch: 'settings.eq.filter.notch',
};

const filterNodeKinds: Record<EqFilterType, 'peak' | 'shelf' | 'pass' | 'notch'> = {
  peaking: 'peak',
  lowShelf: 'shelf',
  highShelf: 'shelf',
  lowPass: 'pass',
  highPass: 'pass',
  notch: 'notch',
};

const filterNodeGlyphs: Record<EqFilterType, string> = {
  peaking: 'P',
  lowShelf: 'S',
  highShelf: 'S',
  lowPass: 'F',
  highPass: 'F',
  notch: 'N',
};

const bandToSvgPoint = (band: EqBand, axisLimitDb: number, plot: PlotLayout): { x: number; y: number } => {
  const basePoint = computeEqBandNodePoint(band);
  const gainDb = band.enabled === false || !isEqFilterGainEditable(band.filterType) ? 0 : band.gainDb;
  return {
    x: paddingLeft + basePoint.x * plot.plotWidth,
    y: gainToY(gainDb, axisLimitDb, plot),
  };
};

const resolveAxisLimitDb = (maxAbsGainDb: number): number => {
  const steppedLimitDb = axisLimitStepsDb.find((limitDb) => maxAbsGainDb <= limitDb - 0.5);
  if (steppedLimitDb) {
    return steppedLimitDb;
  }

  return Math.min(72, Math.ceil((maxAbsGainDb + 1) / 12) * 12);
};

const buildAxisGains = (axisLimitDb: number): number[] => {
  const stepDb = axisLimitDb <= 12 ? 3 : axisLimitDb <= 24 ? 6 : 12;
  const values: number[] = [];

  for (let gainDb = axisLimitDb; gainDb >= -axisLimitDb; gainDb -= stepDb) {
    values.push(gainDb);
  }

  if (!values.includes(0)) {
    values.push(0);
    values.sort((left, right) => right - left);
  }

  return values;
};

const frequencyAtNormalizedX = (normalized: number): number => {
  const minLog = Math.log10(eqMinFrequencyHz);
  const maxLog = Math.log10(eqMaxFrequencyHz);
  return 10 ** (minLog + clamp(normalized, 0, 1) * (maxLog - minLog));
};

const frequencyToSvgX = (frequencyHz: number, plot: PlotLayout): number => {
  const minLog = Math.log10(eqMinFrequencyHz);
  const maxLog = Math.log10(eqMaxFrequencyHz);
  const normalized = (Math.log10(clamp(frequencyHz, eqMinFrequencyHz, eqMaxFrequencyHz)) - minLog) / (maxLog - minLog);
  return paddingLeft + normalized * plot.plotWidth;
};

const gainToY = (gainDb: number, axisLimitDb: number, plot: PlotLayout): number => {
  const minGainDb = -axisLimitDb;
  const maxGainDb = axisLimitDb;
  const normalized = (clamp(gainDb, minGainDb, maxGainDb) - minGainDb) / (maxGainDb - minGainDb);
  return paddingTop + (1 - normalized) * plot.plotHeight;
};

const yToGainRaw = (y: number, axisLimitDb: number, plot: PlotLayout): number => {
  const normalized = 1 - clamp((y - paddingTop) / plot.plotHeight, 0, 1);
  const minGainDb = -axisLimitDb;
  const maxGainDb = axisLimitDb;
  return clamp(minGainDb + normalized * (maxGainDb - minGainDb), eqMinGainDb, eqMaxGainDb);
};

const yToGain = (y: number, axisLimitDb: number, plot: PlotLayout): number => (
  Math.round(yToGainRaw(y, axisLimitDb, plot) * 10) / 10
);

const xToFrequency = (x: number, plot: PlotLayout): number => {
  const minLog = Math.log10(eqMinFrequencyHz);
  const maxLog = Math.log10(eqMaxFrequencyHz);
  const normalized = clamp((x - paddingLeft) / plot.plotWidth, 0, 1);
  const frequencyHz = 10 ** (minLog + normalized * (maxLog - minLog));

  return frequencyHz < 1000 ? Math.round(frequencyHz) : Math.round(frequencyHz / 10) * 10;
};

const isStandardFrequencySlot = (band: EqBand, index: number): boolean => {
  const standardFrequency = eqFrequenciesHz[index];
  if (!standardFrequency) {
    return false;
  }

  return Math.abs(Math.log2(band.frequencyHz / standardFrequency)) < 0.025;
};

const buildXAxisLabelEntries = (
  entries: DisplayBandEntry[],
  axisLimitDb: number,
  selectedBandIndex: number,
  activeBand: number | null,
  hoverBand: number | null,
  plot: PlotLayout,
): Array<DisplayBandEntry & { x: number; y: number }> => {
  const candidates = entries.map((entry) => ({
    ...entry,
    ...bandToSvgPoint(entry.band, axisLimitDb, plot),
  }));
  const prioritized = [...candidates].sort((left, right) => {
    const leftSelected = left.index === selectedBandIndex || left.index === activeBand || left.index === hoverBand;
    const rightSelected = right.index === selectedBandIndex || right.index === activeBand || right.index === hoverBand;
    if (leftSelected !== rightSelected) {
      return leftSelected ? -1 : 1;
    }

    const leftGain = isEqFilterGainEditable(left.band.filterType) ? Math.abs(left.band.gainDb) : defaultAxisLimitDb;
    const rightGain = isEqFilterGainEditable(right.band.filterType) ? Math.abs(right.band.gainDb) : defaultAxisLimitDb;
    return rightGain - leftGain || left.x - right.x;
  });
  const kept: Array<DisplayBandEntry & { x: number; y: number }> = [];
  const minimumDistance = 42;

  for (const candidate of prioritized) {
    if (kept.every((entry) => Math.abs(entry.x - candidate.x) >= minimumDistance)) {
      kept.push(candidate);
    }
  }

  return kept.sort((left, right) => left.x - right.x);
};

const makeSmoothPath = (points: Array<{ x: number; y: number }>): string => {
  if (points.length === 0) {
    return '';
  }

  if (points.length === 1) {
    return `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  }

  const commands = [`M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`];

  for (let index = 0; index < points.length - 1; index += 1) {
    const current = points[index];
    const next = points[index + 1];
    const previous = points[index - 1] ?? current;
    const afterNext = points[index + 2] ?? next;
    const cp1x = current.x + (next.x - previous.x) / 6;
    const cp1y = current.y + (next.y - previous.y) / 6;
    const cp2x = next.x - (afterNext.x - current.x) / 6;
    const cp2y = next.y - (afterNext.y - current.y) / 6;
    commands.push(`C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${next.x.toFixed(1)} ${next.y.toFixed(1)}`);
  }

  return commands.join(' ');
};

const hoverReadoutsEqual = (left: HoverReadout | null, right: HoverReadout | null): boolean => {
  if (left === right) {
    return true;
  }

  if (!left || !right) {
    return false;
  }

  return left.x === right.x
    && left.y === right.y
    && left.frequencyHz === right.frequencyHz
    && left.totalGainDb === right.totalGainDb
    && left.bandGainDb === right.bandGainDb;
};

type ParentDragNotify = {
  index: number;
  gainDb: number;
  frequencyHz: number;
  notifyGain: boolean;
  notifyFrequency: boolean;
};

type CurveDragPointerEvent = Pick<PointerEvent, 'clientX' | 'clientY' | 'pointerId' | 'shiftKey'>;

const EqCurveViewComponent = ({
  bands,
  enabled,
  frequencyUnlocked,
  selectedBandIndex,
  spectrumEnabled = false,
  analyzerMode = 'input',
  visualSpectrum,
  visualTelemetryState,
  visibleBandIndexes,
  curveFirst = false,
  graphicWorkbench = false,
  onBandSelect,
  onBandChange,
  onBandCommit,
  onBandFrequencyChange,
  onBandFrequencyCommit,
  onBandQCommit,
  onBandDelete,
  onAddBandAt,
}: EqCurveViewProps): JSX.Element => {
  const { t } = useI18n();
  const svgRef = useRef<SVGSVGElement | null>(null);
  const screenCtmCacheRef = useRef<{
    inverse: DOMMatrix;
    width: number;
    height: number;
    left: number;
    top: number;
  } | null>(null);
  const parentDragFrameRef = useRef<number | null>(null);
  const pendingParentDragRef = useRef<ParentDragNotify | null>(null);
  const parentDragHandlersRef = useRef({ onBandChange, onBandFrequencyChange });
  parentDragHandlersRef.current = { onBandChange, onBandFrequencyChange };
  const graphicDragRef = useRef<{
    index: number;
    startClientX: number;
    originFrequencyHz: number;
    frequencyArmed: boolean;
  } | null>(null);
  const parametricDragRef = useRef<{
    index: number;
    originQ: number;
    startClientX: number;
  } | null>(null);
  const activeBandRef = useRef<number | null>(null);
  const activePointerIdRef = useRef<number | null>(null);
  const windowDragHandlersRef = useRef<{
    move: (event: CurveDragPointerEvent) => void;
    finish: (event: CurveDragPointerEvent) => void;
  }>({ move: () => undefined, finish: () => undefined });
  const [activeBand, setActiveBand] = useState<number | null>(null);
  const [hoverBand, setHoverBand] = useState<number | null>(null);
  const [hoverReadout, setHoverReadout] = useState<HoverReadout | null>(null);
  const [fineEdit, setFineEdit] = useState(false);
  const [dragAxis, setDragAxis] = useState<'y' | 'xy' | 'q' | null>(null);
  const [dragPreview, setDragPreview] = useState<{ index: number; band: EqBand } | null>(null);
  const studioCurve = curveFirst || graphicWorkbench;
  const [plot, setPlot] = useState(defaultPlotLayout);
  const activePlot = studioCurve ? plot : defaultPlotLayout;
  const { width, height, plotWidth, plotHeight } = activePlot;

  useLayoutEffect(() => {
    if (!studioCurve) {
      setPlot(defaultPlotLayout);
      return;
    }

    const svg = svgRef.current;
    if (!svg) {
      return;
    }

    const syncPlot = (): void => {
      const next = createPlotLayout(svg.clientWidth, svg.clientHeight);
      setPlot((current) => (current.width === next.width && current.height === next.height ? current : next));
    };

    syncPlot();
    if (typeof ResizeObserver === 'undefined') {
      return;
    }

    const observer = new ResizeObserver(syncPlot);
    observer.observe(svg);
    return () => observer.disconnect();
  }, [studioCurve]);
  const displayBands = useMemo(
    () => (dragPreview ? bands.map((band, index) => (index === dragPreview.index ? dragPreview.band : band)) : bands),
    [bands, dragPreview],
  );
  const displayBandEntries = useMemo<DisplayBandEntry[]>(
    () => displayBands.map((band, index) => ({ band, index })),
    [displayBands],
  );
  const bandCoefficients = useMemo(
    () => displayBands.map(makeEqBiquadCoefficients),
    [displayBands],
  );
  const hasParametricLayout = useMemo(
    () => curveFirst || displayBandEntries.some(({ band, index }) => band.enabled !== false && !isStandardFrequencySlot(band, index)),
    [curveFirst, displayBandEntries],
  );
  const showFrequencyAxis = studioCurve || hasParametricLayout;
  const responsePoints = useMemo(() => {
    const normalizedPositions = Array.from({ length: responsePointCount }, (_unused, index) => (
      index / (responsePointCount - 1)
    ));
    if (graphicWorkbench) {
      normalizedPositions.push(...displayBands.map((band) => computeEqBandNodePoint(band).x));
      normalizedPositions.sort((left, right) => left - right);
    }

    const uniquePositions = normalizedPositions.filter((normalized, index) => (
      index === 0 || Math.abs(normalized - normalizedPositions[index - 1]) > 1e-7
    ));
    return uniquePositions.map((normalized) => {
      return {
        x: normalized,
        gainDb: computeEqResponseGainDbFromCoefficients(bandCoefficients, frequencyAtNormalizedX(normalized)),
      };
    });
  }, [bandCoefficients, displayBands, graphicWorkbench]);
  const interpolateResponseGainDb = useCallback(
    (normalizedX: number): number => interpolateEqResponseGainDb(responsePoints, normalizedX),
    [responsePoints],
  );
  const axisLimitDb = useMemo(() => {
    if (curveFirst || graphicWorkbench) {
      return defaultAxisLimitDb;
    }

    const responseMaxAbsGainDb = responsePoints.reduce((maxGainDb, point) => Math.max(maxGainDb, Math.abs(point.gainDb)), defaultAxisLimitDb);
    const bandMaxAbsGainDb = displayBands.reduce((maxGainDb, band) => (
      band.enabled === false || !isEqFilterGainEditable(band.filterType) ? maxGainDb : Math.max(maxGainDb, Math.abs(band.gainDb))
    ), defaultAxisLimitDb);
    return resolveAxisLimitDb(Math.max(responseMaxAbsGainDb, bandMaxAbsGainDb));
  }, [curveFirst, displayBands, graphicWorkbench, responsePoints]);
  const axisGains = useMemo(() => buildAxisGains(axisLimitDb), [axisLimitDb]);
  const points = useMemo(
    () => responsePoints.map((point) => ({
      x: paddingLeft + point.x * plotWidth,
      y: gainToY(point.gainDb, axisLimitDb, activePlot),
    })),
    [activePlot, axisLimitDb, responsePoints],
  );
  const path = useMemo(() => makeSmoothPath(points), [points]);
  const zeroY = gainToY(0, axisLimitDb, activePlot);
  const fillPath = useMemo(
    () => (path ? `${path} L ${paddingLeft + plotWidth} ${zeroY.toFixed(1)} L ${paddingLeft} ${zeroY.toFixed(1)} Z` : ''),
    [path, plotWidth, zeroY],
  );
  const readoutBandIndex = activeBand ?? hoverBand ?? selectedBandIndex;
  const selectedBand = displayBands[readoutBandIndex];
  const selectedBandCoefficients = useMemo(
    () => (selectedBand ? [makeEqBiquadCoefficients(selectedBand)] : []),
    [selectedBand],
  );
  const pointForBand = useCallback((band: EqBand): { x: number; y: number } => {
    const point = bandToSvgPoint(band, axisLimitDb, activePlot);
    return graphicWorkbench
      ? { ...point, y: gainToY(computeEqResponseGainDbFromCoefficients(bandCoefficients, band.frequencyHz), axisLimitDb, activePlot) }
      : point;
  }, [activePlot, axisLimitDb, bandCoefficients, graphicWorkbench]);
  const selectedPoint = selectedBand ? pointForBand(selectedBand) : null;
  const selectedResponseGainDb = selectedBand
    ? computeEqResponseGainDbFromCoefficients(bandCoefficients, selectedBand.frequencyHz)
    : 0;
  const focusPoint = selectedPoint;
  const selectedReadoutPosition = selectedPoint && curveFirst
    ? {
        x: selectedPoint.x <= paddingLeft + plotWidth - 154 ? selectedPoint.x + 88 : selectedPoint.x - 88,
        y: clamp(selectedPoint.y + 14, paddingTop + 36, paddingTop + plotHeight - 36),
        placeLeft: selectedPoint.x > paddingLeft + plotWidth - 154,
        placeAbove: false,
      }
    : selectedPoint && graphicWorkbench
      ? selectedPoint.y >= paddingTop + 80
        ? {
            x: selectedPoint.x,
            y: selectedPoint.y - 43,
            placeLeft: false,
            placeAbove: true,
          }
        : {
            x: selectedPoint.x > paddingLeft + plotWidth - 150 ? selectedPoint.x - 88 : selectedPoint.x + 88,
            y: clamp(selectedPoint.y, paddingTop + 30, paddingTop + plotHeight - 30),
            placeLeft: selectedPoint.x > paddingLeft + plotWidth - 150,
            placeAbove: false,
          }
      : null;
  const curveNodeEntries = useMemo(
    () => visibleBandIndexes
      ? visibleBandIndexes
        .map((index) => displayBandEntries[index])
        .filter((entry): entry is DisplayBandEntry => Boolean(entry))
      : displayBandEntries,
    [displayBandEntries, visibleBandIndexes],
  );
  const readoutDisplayIndex = Math.max(0, curveNodeEntries.findIndex(({ index }) => index === readoutBandIndex));
  const xAxisLabelEntries = useMemo(
    () => buildXAxisLabelEntries(
      hasParametricLayout ? curveNodeEntries : displayBandEntries,
      axisLimitDb,
      selectedBandIndex,
      activeBand,
      hoverBand,
      activePlot,
    ),
    [activeBand, activePlot, axisLimitDb, curveNodeEntries, displayBandEntries, hasParametricLayout, hoverBand, selectedBandIndex],
  );
  const selectedBandPath = useMemo(
    () => {
      if (selectedBandCoefficients.length === 0) {
        return '';
      }

      return makeSmoothPath(Array.from({ length: responsePointCount }, (_unused, index) => {
        const normalized = index / (responsePointCount - 1);
        return {
          x: paddingLeft + normalized * plotWidth,
          y: gainToY(computeEqResponseGainDbFromCoefficients(selectedBandCoefficients, frequencyAtNormalizedX(normalized)), axisLimitDb, activePlot),
        };
      }));
    },
    [activePlot, axisLimitDb, selectedBandCoefficients],
  );
  const selectedBandFillPath = useMemo(() => {
    if (!curveFirst || !selectedBandPath || selectedBand?.enabled === false) {
      return '';
    }

    const selectedGainDb = selectedBand && isEqFilterGainEditable(selectedBand.filterType) ? selectedBand.gainDb : 0;
    if (isEqFilterGainEditable(selectedBand?.filterType) && Math.abs(selectedGainDb) < 0.05 && (selectedBand?.filterType ?? 'peaking') === 'peaking') {
      return '';
    }

    return `${selectedBandPath} L ${paddingLeft + plotWidth} ${zeroY.toFixed(1)} L ${paddingLeft} ${zeroY.toFixed(1)} Z`;
  }, [curveFirst, plotWidth, selectedBand, selectedBandPath, zeroY]);
  const showSelectedBandResponse = Boolean(curveFirst && selectedBandPath && selectedBand?.enabled !== false);
  const spectrumBars = useMemo(
    () => (spectrumEnabled
      ? computeEqSpectrumBars(
        visualSpectrum,
        displayBands,
        analyzerMode,
        analyzerMode === 'postEq' ? interpolateResponseGainDb : undefined,
      )
      : []),
    [analyzerMode, displayBands, interpolateResponseGainDb, spectrumEnabled, visualSpectrum],
  );
  const hasLiveSpectrum = spectrumBars.length > 0 && visualTelemetryState !== 'fallback';
  const spectrumAreaPath = useMemo(() => {
    if (!studioCurve || spectrumBars.length === 0) {
      return '';
    }

    const spectrumPoints = spectrumBars.map((bar) => ({
      x: paddingLeft + bar.x * plotWidth,
      y: paddingTop + plotHeight - Math.max(2, bar.value * plotHeight * 0.58),
    }));
    const spectrumPath = makeSmoothPath(spectrumPoints);
    return spectrumPath
      ? `${spectrumPath} L ${paddingLeft + plotWidth} ${paddingTop + plotHeight} L ${paddingLeft} ${paddingTop + plotHeight} Z`
      : '';
  }, [plotHeight, plotWidth, spectrumBars, studioCurve]);
  const selectedBandGainEditable = selectedBand ? isEqFilterGainEditable(selectedBand.filterType) : true;
  const selectedBandType = selectedBand?.filterType ?? 'peaking';
  const readoutModeLabel = fineEdit
    ? t('settings.eq.curve.fineEdit')
    : frequencyUnlocked
      ? t('settings.eq.curve.freeFrequency')
      : null;

  const flushParentDrag = (): void => {
    parentDragFrameRef.current = null;
    const pending = pendingParentDragRef.current;
    if (!pending) {
      return;
    }

    pendingParentDragRef.current = null;
    if (pending.notifyGain) {
      parentDragHandlersRef.current.onBandChange(pending.index, pending.gainDb);
    }
    if (pending.notifyFrequency) {
      parentDragHandlersRef.current.onBandFrequencyChange(pending.index, pending.frequencyHz);
    }
  };

  const queueParentDrag = (pending: ParentDragNotify, immediate: boolean): void => {
    pendingParentDragRef.current = pending;
    if (immediate) {
      if (parentDragFrameRef.current !== null) {
        window.cancelAnimationFrame(parentDragFrameRef.current);
        parentDragFrameRef.current = null;
      }
      flushParentDrag();
      return;
    }

    if (parentDragFrameRef.current === null) {
      parentDragFrameRef.current = window.requestAnimationFrame(flushParentDrag);
    }
  };

  useEffect(() => () => {
    if (parentDragFrameRef.current !== null) {
      window.cancelAnimationFrame(parentDragFrameRef.current);
    }
  }, []);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || !studioCurve) {
      return;
    }

    const preventPageScroll = (event: WheelEvent): void => {
      event.preventDefault();
    };

    svg.addEventListener('wheel', preventPageScroll, { passive: false });
    return () => svg.removeEventListener('wheel', preventPageScroll);
  }, [studioCurve]);

  const eventToSvgPoint = (event: { clientX: number; clientY: number }): { x: number; y: number } => {
    const svg = svgRef.current;
    const rect = svg?.getBoundingClientRect();
    const mappedPoint = {
      x: rect && rect.width > 0 ? (event.clientX - rect.left) * (width / rect.width) : paddingLeft,
      y: rect && rect.height > 0 ? (event.clientY - rect.top) * (height / rect.height) : zeroY,
    };
    if (studioCurve || !svg || !rect || rect.width <= 0 || rect.height <= 0) {
      return mappedPoint;
    }

    const cache = screenCtmCacheRef.current;
    const rectChanged = !cache
      || cache.width !== rect.width
      || cache.height !== rect.height
      || cache.left !== rect.left
      || cache.top !== rect.top;

    if (rectChanged) {
      try {
        const screenMatrix = svg.getScreenCTM?.();
        screenCtmCacheRef.current = screenMatrix
          ? {
            inverse: screenMatrix.inverse(),
            width: rect.width,
            height: rect.height,
            left: rect.left,
            top: rect.top,
          }
          : null;
      } catch {
        screenCtmCacheRef.current = null;
      }
    }

    const inverse = screenCtmCacheRef.current?.inverse;
    if (!inverse) {
      return mappedPoint;
    }

    try {
      const svgPoint = svg.createSVGPoint?.();
      const transformedPoint = svgPoint
        ? (() => {
          svgPoint.x = event.clientX;
          svgPoint.y = event.clientY;
          return svgPoint.matrixTransform(inverse);
        })()
        : typeof DOMPoint === 'function'
          ? new DOMPoint(event.clientX, event.clientY).matrixTransform(inverse)
          : null;
      if (
        transformedPoint
        && Number.isFinite(transformedPoint.x)
        && Number.isFinite(transformedPoint.y)
      ) {
        return { x: transformedPoint.x, y: transformedPoint.y };
      }
    } catch {
      return mappedPoint;
    }

    return mappedPoint;
  };

  const isPointInPlot = (point: { x: number; y: number }): boolean => (
    point.x >= paddingLeft
    && point.x <= paddingLeft + plotWidth
    && point.y >= paddingTop
    && point.y <= paddingTop + plotHeight
  );

  const findNearestGraphicBandIndex = (svgX: number): number => {
    let nearestIndex = curveNodeEntries[0]?.index ?? 0;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (const entry of curveNodeEntries) {
      const distance = Math.abs(bandToSvgPoint(entry.band, axisLimitDb, activePlot).x - svgX);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = entry.index;
      }
    }
    return nearestIndex;
  };

  const findNearestCurveNode = (point: { x: number; y: number }): { index: number; distance: number } => {
    let nearestIndex = curveNodeEntries[0]?.index ?? 0;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (const entry of curveNodeEntries) {
      const node = bandToSvgPoint(entry.band, axisLimitDb, activePlot);
      const distance = Math.hypot(node.x - point.x, node.y - point.y);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = entry.index;
      }
    }
    return { index: nearestIndex, distance: nearestDistance };
  };

  const focusGraphicBand = (index: number): void => {
    svgRef.current?.querySelector<SVGGElement>(`[data-testid="eq-curve-node-${index}"]`)?.focus();
  };

  const quantizeGain = (gainDb: number, fine: boolean): number => {
    const step = fine ? 0.1 : 0.5;
    return Math.round(gainDb / step) * step;
  };

  const quantizeStudioGain = (gainDb: number, extraFine: boolean): number => {
    const step = extraFine ? 0.01 : 0.1;
    return Math.round(gainDb / step) * step;
  };

  const pointFromEvent = (event: CurveDragPointerEvent): DragPoint => {
    const { x, y } = eventToSvgPoint(event);
    const rawFrequencyHz = xToFrequency(x, activePlot);
    const rawGainDb = yToGainRaw(y, axisLimitDb, activePlot);
    setFineEdit(event.shiftKey);
    return {
      rawFrequencyHz,
      frequencyHz: resolveBandFrequency(rawFrequencyHz, frequencyUnlocked || graphicWorkbench),
      gainDb: studioCurve
        ? quantizeStudioGain(rawGainDb, event.shiftKey)
        : quantizeGain(Math.round(rawGainDb * 10) / 10, event.shiftKey),
    };
  };

  const qFromDragDelta = (originQ: number, deltaPx: number): number => {
    const q = originQ * (2 ** (-deltaPx / parametricQDragPx));
    return Math.round(clamp(q, eqMinQ, eqMaxQ) * 100) / 100;
  };

  const zeroGraphicBand = (index: number): void => {
    if (!isEqFilterGainEditable(bands[index]?.filterType)) {
      return;
    }

    onBandSelect(index);
    onBandChange(index, 0);
    onBandCommit(index, 0);
    focusGraphicBand(index);
  };

  const nudgeGraphicGain = (index: number, deltaY: number, fine: boolean): void => {
    if (!isEqFilterGainEditable(bands[index]?.filterType) || deltaY === 0) {
      return;
    }

    const step = fine ? 0.1 : 0.5;
    const gainDb = Math.round(clamp(
      (bands[index]?.gainDb ?? 0) + (deltaY < 0 ? step : -step),
      eqMinGainDb,
      eqMaxGainDb,
    ) * 10) / 10;
    onBandSelect(index);
    onBandChange(index, gainDb);
    onBandCommit(index, gainDb);
  };

  const handleDoubleClick = (event: ReactMouseEvent<SVGSVGElement>): void => {
    const { x, y } = eventToSvgPoint(event);
    if (graphicWorkbench) {
      if (!isPointInPlot({ x, y })) {
        return;
      }
      event.preventDefault();
      zeroGraphicBand(findNearestGraphicBandIndex(x));
      return;
    }

    if (!onAddBandAt || (event.target as Element).closest('.eq-curve-node-group')) {
      return;
    }

    onAddBandAt(
      resolveBandFrequency(xToFrequency(x, activePlot), frequencyUnlocked),
      studioCurve
        ? quantizeStudioGain(yToGainRaw(y, axisLimitDb, activePlot), event.shiftKey)
        : quantizeGain(yToGain(y, axisLimitDb, activePlot), event.shiftKey),
    );
  };

  const updateHoverReadout = (event: ReactPointerEvent<SVGElement>): void => {
    const { x, y } = eventToSvgPoint(event);
    if (graphicWorkbench) {
      if (!isPointInPlot({ x, y })) {
        setHoverBand(null);
        setHoverReadout(null);
        return;
      }

      const nearestIndex = findNearestGraphicBandIndex(x);
      setHoverBand((current) => (current === nearestIndex ? current : nearestIndex));
      setHoverReadout(null);
      return;
    }

    if ((event.target as Element).closest('.eq-curve-node-group')) {
      setHoverReadout(null);
      return;
    }

    const frequencyHz = xToFrequency(x, activePlot);
    const nextReadout: HoverReadout = {
      x: Math.round(clamp(x, paddingLeft, paddingLeft + plotWidth)),
      y: Math.round(clamp(y, paddingTop, paddingTop + plotHeight)),
      frequencyHz,
      totalGainDb: computeEqResponseGainDbFromCoefficients(bandCoefficients, frequencyHz),
      bandGainDb: computeEqResponseGainDbFromCoefficients(selectedBandCoefficients, frequencyHz),
    };
    setHoverReadout((current) => (hoverReadoutsEqual(current, nextReadout) ? current : nextReadout));
  };

  const updateBandFromEvent = (
    event: CurveDragPointerEvent,
    index: number,
    immediate = false,
  ): DragPoint => {
    const point = pointFromEvent(event);
    const band = bands[index] ?? { frequencyHz: point.frequencyHz, gainDb: 0, q: 1, filterType: 'peaking' as const, enabled: true };
    const gainEditable = isEqFilterGainEditable(band.filterType);
    const graphicDrag = graphicWorkbench ? graphicDragRef.current : null;
    if (graphicDrag && graphicDrag.index === index && !graphicDrag.frequencyArmed && Math.abs(event.clientX - graphicDrag.startClientX) >= graphicFrequencyDragPx) {
      graphicDrag.frequencyArmed = true;
      setDragAxis('xy');
    }
    const lockParametricFrequency = curveFirst && event.shiftKey;
    const nextFrequencyHz = graphicDrag
      ? (graphicDrag.frequencyArmed ? point.frequencyHz : graphicDrag.originFrequencyHz)
      : frequencyUnlocked && !lockParametricFrequency
        ? point.frequencyHz
        : band.frequencyHz;
    const resolvedGainDb = gainEditable && graphicWorkbench
      ? quantizeStudioGain(resolveGraphicEqBandGainDb(
        bands,
        index,
        nextFrequencyHz,
        point.gainDb,
      ), event.shiftKey)
      : point.gainDb;
    const nextBand: EqBand = {
      ...band,
      frequencyHz: nextFrequencyHz,
      gainDb: gainEditable ? resolvedGainDb : 0,
    };
    setDragPreview((current) => (
      current
      && current.index === index
      && current.band.gainDb === nextBand.gainDb
      && current.band.frequencyHz === nextBand.frequencyHz
        ? current
        : { index, band: nextBand }
    ));
    queueParentDrag({
      index,
      gainDb: resolvedGainDb,
      frequencyHz: nextFrequencyHz,
      notifyGain: gainEditable,
      notifyFrequency: nextFrequencyHz !== bands[index]?.frequencyHz,
    }, immediate);
    return {
      ...point,
      frequencyHz: nextFrequencyHz,
      gainDb: resolvedGainDb,
    };
  };

  const applyParametricQDrag = (event: CurveDragPointerEvent, index: number): void => {
    const drag = parametricDragRef.current;
    if (!drag || drag.index !== index || !onBandQCommit) {
      return;
    }

    const q = qFromDragDelta(drag.originQ, event.clientX - drag.startClientX);
    const band = bands[index] ?? {
      frequencyHz: eqMinFrequencyHz,
      gainDb: 0,
      q: 1,
      filterType: 'peaking' as const,
      enabled: true,
    };
    const nextBand: EqBand = { ...band, q };
    setDragPreview((current) => (
      current && current.index === index && current.band.q === nextBand.q
        ? current
        : { index, band: nextBand }
    ));
    onBandQCommit(index, q);
  };

  const handlePointerDown = (event: ReactPointerEvent<SVGElement>, index: number): void => {
    event.preventDefault();
    event.stopPropagation();
    if (graphicWorkbench && event.detail === 2) {
      svgRef.current?.releasePointerCapture?.(event.pointerId);
      graphicDragRef.current = null;
      parametricDragRef.current = null;
      setDragAxis(null);
      setActiveBand(null);
      setDragPreview(null);
      zeroGraphicBand(index);
      return;
    }

    if (!graphicWorkbench && (event.ctrlKey || event.metaKey) && onBandDelete) {
      graphicDragRef.current = null;
      parametricDragRef.current = null;
      setDragAxis(null);
      onBandSelect(index);
      onBandDelete(index);
      return;
    }

    if (curveFirst && event.altKey && onBandQCommit) {
      graphicDragRef.current = null;
      parametricDragRef.current = {
        index,
        originQ: bands[index]?.q ?? 1,
        startClientX: event.clientX,
      };
      svgRef.current?.setPointerCapture?.(event.pointerId);
      setHoverReadout(null);
      setHoverBand(index);
      activeBandRef.current = index;
      activePointerIdRef.current = event.pointerId;
      setActiveBand(index);
      setDragAxis('q');
      onBandSelect(index);
      return;
    }

    parametricDragRef.current = null;
    if (graphicWorkbench) {
      graphicDragRef.current = {
        index,
        startClientX: event.clientX,
        originFrequencyHz: bands[index]?.frequencyHz ?? 0,
        frequencyArmed: false,
      };
      setDragAxis('y');
    } else {
      graphicDragRef.current = null;
      setDragAxis('xy');
    }

    svgRef.current?.setPointerCapture?.(event.pointerId);
    setHoverReadout(null);
    setHoverBand(index);
    activeBandRef.current = index;
    activePointerIdRef.current = event.pointerId;
    setActiveBand(index);
    onBandSelect(index);
    updateBandFromEvent(event, index, true);
  };

  const handlePlotPointerDown = (event: ReactPointerEvent<SVGSVGElement>): void => {
    if ((event.target as Element).closest('.eq-curve-node-group')) {
      return;
    }

    const point = eventToSvgPoint(event);
    if (!isPointInPlot(point)) {
      return;
    }

    if (graphicWorkbench) {
      handlePointerDown(event, findNearestGraphicBandIndex(point.x));
      return;
    }

    if (!curveFirst) {
      return;
    }

    const nearest = findNearestCurveNode(point);
    if (nearest.distance <= parametricGrabDistance) {
      handlePointerDown(event, nearest.index);
    }
  };

  const handleNodeWheel = (event: ReactWheelEvent<SVGGElement>, index: number): void => {
    if (event.deltaY === 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    setHoverReadout(null);
    if (graphicWorkbench) {
      nudgeGraphicGain(index, event.deltaY, event.shiftKey);
      return;
    }

    if (!onBandQCommit) {
      return;
    }

    onBandSelect(index);
    const step = event.shiftKey ? 0.1 : 0.2;
    const direction = event.deltaY < 0 ? 1 : -1;
    const q = Math.round(clamp((bands[index]?.q ?? 1) + direction * step, eqMinQ, eqMaxQ) * 10) / 10;
    onBandQCommit(index, q);
  };

  const handlePlotWheel = (event: ReactWheelEvent<SVGSVGElement>): void => {
    if (event.deltaY === 0 || (event.target as Element).closest('.eq-curve-node-group')) {
      return;
    }

    const point = eventToSvgPoint(event);
    if (!isPointInPlot(point)) {
      return;
    }

    if (graphicWorkbench) {
      event.preventDefault();
      nudgeGraphicGain(findNearestGraphicBandIndex(point.x), event.deltaY, event.shiftKey);
      return;
    }

    if (!curveFirst || !onBandQCommit) {
      return;
    }

    event.preventDefault();
    const index = hoverBand ?? selectedBandIndex;
    const step = event.shiftKey ? 0.1 : 0.2;
    const direction = event.deltaY < 0 ? 1 : -1;
    const q = Math.round(clamp((bands[index]?.q ?? 1) + direction * step, eqMinQ, eqMaxQ) * 10) / 10;
    onBandSelect(index);
    onBandQCommit(index, q);
  };

  const continuePointerDrag = (event: CurveDragPointerEvent): void => {
    const bandIndex = activeBandRef.current;
    if (bandIndex === null || activePointerIdRef.current !== event.pointerId) {
      return;
    }
    if (parametricDragRef.current) {
      applyParametricQDrag(event, bandIndex);
      return;
    }

    updateBandFromEvent(event, bandIndex);
  };

  const finishPointerDrag = (event: CurveDragPointerEvent): void => {
    const bandIndex = activeBandRef.current;
    if (bandIndex === null || activePointerIdRef.current !== event.pointerId) {
      return;
    }

    if (!parametricDragRef.current) {
      const point = updateBandFromEvent(event, bandIndex, true);
      const snapZero = graphicWorkbench && !event.shiftKey && Math.abs(point.gainDb) <= graphicZeroSnapReleaseDb;
      const gainDb = snapZero ? 0 : point.gainDb;
      if (isEqFilterGainEditable(bands[bandIndex]?.filterType)) {
        if (snapZero && point.gainDb !== 0) {
          onBandChange(bandIndex, 0);
        }
        onBandCommit(bandIndex, gainDb);
      }
      if ((graphicWorkbench || frequencyUnlocked) && point.frequencyHz !== bands[bandIndex]?.frequencyHz) {
        onBandFrequencyCommit(bandIndex, point.frequencyHz);
      }
    }

    const svg = svgRef.current;
    if (svg?.hasPointerCapture?.(event.pointerId)) {
      svg.releasePointerCapture(event.pointerId);
    }
    focusGraphicBand(bandIndex);
    graphicDragRef.current = null;
    parametricDragRef.current = null;
    activeBandRef.current = null;
    activePointerIdRef.current = null;
    setDragAxis(null);
    setActiveBand(null);
    setDragPreview(null);
  };

  windowDragHandlersRef.current = {
    move: continuePointerDrag,
    finish: finishPointerDrag,
  };

  useLayoutEffect(() => {
    if (activeBand === null) {
      return;
    }

    const handleWindowPointerMove = (event: PointerEvent): void => {
      windowDragHandlersRef.current.move(event);
    };
    const handleWindowPointerEnd = (event: PointerEvent): void => {
      windowDragHandlersRef.current.finish(event);
    };

    window.addEventListener('pointermove', handleWindowPointerMove, true);
    window.addEventListener('pointerup', handleWindowPointerEnd, true);
    window.addEventListener('pointercancel', handleWindowPointerEnd, true);
    return () => {
      window.removeEventListener('pointermove', handleWindowPointerMove, true);
      window.removeEventListener('pointerup', handleWindowPointerEnd, true);
      window.removeEventListener('pointercancel', handleWindowPointerEnd, true);
    };
  }, [activeBand]);

  const handleKeyDown = (event: ReactKeyboardEvent<SVGGElement>, index: number): void => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onBandSelect(index);
      return;
    }

    if (graphicWorkbench && (event.key === 'Home' || event.key === '0' || event.key === 'Delete' || event.key === 'Backspace')) {
      event.preventDefault();
      zeroGraphicBand(index);
      return;
    }

    if (event.key === 'Delete' && onBandDelete) {
      event.preventDefault();
      onBandSelect(index);
      onBandDelete(index);
      return;
    }

    if ((event.key === '[' || event.key === ']') && onBandQCommit && !graphicWorkbench) {
      event.preventDefault();
      onBandSelect(index);
      const direction = event.key === ']' ? 1 : -1;
      const step = event.shiftKey ? 0.1 : 0.2;
      const q = Math.round(clamp((bands[index]?.q ?? 1) + direction * step, eqMinQ, eqMaxQ) * 10) / 10;
      onBandQCommit(index, q);
      return;
    }

    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
      return;
    }

    event.preventDefault();
    onBandSelect(index);

    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      if (!isEqFilterGainEditable(bands[index].filterType)) {
        return;
      }

      const delta = event.shiftKey ? 0.1 : 0.5;
      const gainDb = Math.round(clamp(bands[index].gainDb + (event.key === 'ArrowUp' ? delta : -delta), eqMinGainDb, eqMaxGainDb) * 10) / 10;
      onBandChange(index, gainDb);
      onBandCommit(index, gainDb);
      return;
    }

    if (graphicWorkbench) {
      const currentPosition = Math.max(0, curveNodeEntries.findIndex((entry) => entry.index === index));
      const nextPosition = clamp(currentPosition + (event.key === 'ArrowRight' ? 1 : -1), 0, Math.max(0, curveNodeEntries.length - 1));
      const nextIndex = curveNodeEntries[nextPosition]?.index ?? index;
      onBandSelect(nextIndex);
      focusGraphicBand(nextIndex);
      return;
    }

    if (!frequencyUnlocked) {
      const direction = event.key === 'ArrowRight' ? 1 : -1;
      const currentFrequency = bands[index].frequencyHz;
      const currentIndex = eqFrequenciesHz.reduce((nearestIndex, candidate, candidateIndex) => {
        const currentDistance = Math.abs(Math.log2(currentFrequency / eqFrequenciesHz[nearestIndex]));
        const nextDistance = Math.abs(Math.log2(currentFrequency / candidate));
        return nextDistance < currentDistance ? candidateIndex : nearestIndex;
      }, 0);
      const frequencyHz = eqFrequenciesHz[clamp(currentIndex + direction, 0, eqFrequenciesHz.length - 1)] ?? currentFrequency;
      onBandFrequencyChange(index, frequencyHz);
      onBandFrequencyCommit(index, frequencyHz);
      return;
    }

    const ratio = event.shiftKey ? 2 ** (1 / 3) : 2 ** (1 / 12);
    const frequencyHz = Math.round(clamp(
      event.key === 'ArrowRight' ? bands[index].frequencyHz * ratio : bands[index].frequencyHz / ratio,
      eqMinFrequencyHz,
      eqMaxFrequencyHz,
    ));
    onBandFrequencyChange(index, frequencyHz);
    onBandFrequencyCommit(index, frequencyHz);
  };

  return (
    <div className="eq-curve-shell" data-enabled={enabled} data-graphic={graphicWorkbench}>
      <svg
        className="eq-curve-view"
        data-parametric={hasParametricLayout}
        data-curve-first={curveFirst}
        data-graphic={graphicWorkbench}
        data-drag-axis={dragAxis ?? undefined}
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio={studioCurve ? 'none' : 'xMidYMid meet'}
        role="img"
        aria-label={t('settings.eq.curve.aria')}
        ref={svgRef}
        onPointerMove={(event) => {
          if (activeBandRef.current === null) {
            updateHoverReadout(event);
          }
        }}
        onPointerDown={handlePlotPointerDown}
        onPointerLeave={() => {
          setHoverReadout(null);
          if (activeBand === null) {
            setHoverBand(null);
          }
        }}
        onWheel={handlePlotWheel}
        onDoubleClick={handleDoubleClick}
      >
        <defs>
          <linearGradient id="eqCurveStroke" x1="0%" x2="100%" y1="0%" y2="0%">
            <stop className="eq-curve-stroke-stop eq-curve-stroke-stop--start" offset="0%" />
            <stop className="eq-curve-stroke-stop eq-curve-stroke-stop--mid" offset="50%" />
            <stop className="eq-curve-stroke-stop eq-curve-stroke-stop--end" offset="100%" />
          </linearGradient>
          <linearGradient id="eqCurveFill" x1="0%" x2="0%" y1="0%" y2="100%">
            <stop className="eq-curve-fill-stop eq-curve-fill-stop--start" offset="0%" />
            <stop className="eq-curve-fill-stop eq-curve-fill-stop--end" offset="100%" />
          </linearGradient>
        </defs>

        {axisGains.map((gainDb) => {
          const y = gainToY(gainDb, axisLimitDb, activePlot);
          return (
            <g key={gainDb}>
              <line className="eq-grid-line" data-major={gainDb % 6 === 0} x1={paddingLeft} x2={paddingLeft + plotWidth} y1={y} y2={y} />
              {!studioCurve || gainDb % 6 === 0 ? (
                <text className="eq-y-label" x={studioCurve ? paddingLeft - 10 : width - paddingRight + 10} y={y + 4}>
                  {`${gainDb > 0 ? '+' : ''}${gainDb} dB`}
                </text>
              ) : null}
            </g>
          );
        })}

        {showFrequencyAxis ? (
          <g className="eq-frequency-axis" aria-hidden="true">
            {axisFrequenciesHz.map((frequencyHz) => {
              const x = frequencyToSvgX(frequencyHz, activePlot);
              return (
                <g key={frequencyHz}>
                  <line className="eq-grid-line eq-grid-line--frequency" x1={x} x2={x} y1={paddingTop} y2={paddingTop + plotHeight} />
                  <text className="eq-x-label eq-x-label--axis" x={x} y={height - 14}>
                    {formatFrequencyLabel(frequencyHz)}
                  </text>
                </g>
              );
            })}
            {studioCurve ? <text className="eq-x-unit" x={width - 10} y={height - 5}>Hz</text> : null}
          </g>
        ) : null}

        <line className="eq-zero-line" x1={paddingLeft} x2={paddingLeft + plotWidth} y1={zeroY} y2={zeroY} />
        {studioCurve && focusPoint ? (
          <line
            className="eq-curve-focus-line"
            x1={focusPoint.x.toFixed(1)}
            x2={focusPoint.x.toFixed(1)}
            y1={paddingTop}
            y2={paddingTop + plotHeight}
          />
        ) : null}
        {graphicWorkbench && focusPoint && (activeBand !== null || hoverBand !== null) ? (
          <line
            className="eq-curve-focus-line eq-curve-focus-line--horizontal"
            x1={paddingLeft}
            x2={paddingLeft + plotWidth}
            y1={focusPoint.y.toFixed(1)}
            y2={focusPoint.y.toFixed(1)}
          />
        ) : null}
        {curveFirst && onAddBandAt && curveNodeEntries.length === 0 ? (
          <text className="eq-curve-add-hint" x={paddingLeft + plotWidth / 2} y={paddingTop + plotHeight - 28}>
              {t('settings.eq.curve.addFilterHint')}
          </text>
        ) : null}
        {spectrumEnabled ? (
          <g className="eq-spectrum-overlay" data-state={visualTelemetryState ?? 'fallback'} aria-label={t('settings.eq.analyzer.overlayAria')}>
            {studioCurve && spectrumAreaPath ? <path className="eq-spectrum-area" d={spectrumAreaPath} data-live={hasLiveSpectrum} data-mode={analyzerMode} /> : spectrumBars.map((bar, index) => {
              const x = paddingLeft + bar.x * plotWidth;
              const barHeight = Math.max(2, bar.value * plotHeight * 0.58);
              return (
                <line
                  className="eq-spectrum-bar"
                  data-live={hasLiveSpectrum}
                  data-mode={analyzerMode}
                  key={index}
                  x1={x.toFixed(1)}
                  x2={x.toFixed(1)}
                  y1={(paddingTop + plotHeight).toFixed(1)}
                  y2={(paddingTop + plotHeight - barHeight).toFixed(1)}
                />
              );
            })}
          </g>
        ) : null}
        <path className="eq-curve-fill" d={fillPath} />
        {showSelectedBandResponse ? (
          <g
            className="eq-curve-selected-layer"
            style={{ '--eq-band-node-color': getEqCurveBandColor(readoutDisplayIndex) } as CSSProperties}
          >
            {selectedBandFillPath ? <path className="eq-curve-selected-fill" d={selectedBandFillPath} /> : null}
            <path className="eq-curve-selected-band" d={selectedBandPath} />
          </g>
        ) : selectedBandPath && !curveFirst && !graphicWorkbench ? (
          <path className="eq-curve-selected-band" d={selectedBandPath} />
        ) : null}
        <path className="eq-curve-stroke" d={path} />
        <path className="eq-curve-hit-area" d={path} />

        {([...curveNodeEntries]
          .map((entry, displayIndex) => ({ ...entry, displayIndex }))
          .sort((left, right) => {
            const rank = (index: number): number => (
              activeBand === index ? 3 : selectedBandIndex === index ? 2 : hoverBand === index ? 1 : 0
            );
            return rank(left.index) - rank(right.index);
          })
          .map(({ band, index, displayIndex }) => {
          const point = pointForBand(band);
          const selected = selectedBandIndex === index;
          const adjusted = isEqFilterGainEditable(band.filterType) && Math.abs(band.gainDb) >= 0.25;
          return (
            <g
              className="eq-curve-node-group"
              aria-label={t('settings.eq.curve.dragBand', { frequency: formatFrequencyLabel(band.frequencyHz) })}
              aria-keyshortcuts={graphicWorkbench ? 'ArrowUp ArrowDown ArrowLeft ArrowRight Home' : 'ArrowUp ArrowDown ArrowLeft ArrowRight Delete'}
              data-active={selected}
              data-adjusted={adjusted}
              data-bypassed={band.enabled === false}
              data-dragging={activeBand === index}
              data-filter-kind={filterNodeKinds[band.filterType ?? 'peaking']}
              data-testid={`eq-curve-node-${index}`}
              key={`eq-node-${index}`}
              role="button"
              style={{ '--eq-band-node-color': getEqCurveBandColor(displayIndex) } as CSSProperties}
              tabIndex={0}
              transform={`translate(${point.x.toFixed(1)} ${point.y.toFixed(1)})`}
              onClick={() => onBandSelect(index)}
              onFocus={() => onBandSelect(index)}
              onKeyDown={(event) => handleKeyDown(event, index)}
              onWheel={(event) => handleNodeWheel(event, index)}
              onPointerEnter={() => {
                setHoverReadout(null);
                setHoverBand(index);
              }}
              onPointerLeave={() => {
                if (!graphicWorkbench) {
                  setHoverBand((current) => (current === index ? null : current));
                }
              }}
              onPointerDown={(event) => handlePointerDown(event, index)}
            >
              <title>
                {`${t(eqFilterLabelKeys[band.filterType ?? 'peaking'])} / ${formatFrequencyLabel(band.frequencyHz)} / ${isEqFilterGainEditable(band.filterType) ? formatDb(band.gainDb) : t('settings.eq.band.gainFixed')} / Q ${Number(band.q ?? 1).toFixed(1)}`}
              </title>
              {graphicWorkbench ? (
                <rect
                  className="eq-curve-fader-hit"
                  data-testid={`eq-curve-fader-${index}`}
                  height={plotHeight}
                  width={graphicFaderHitHalfWidth * 2}
                  x={-graphicFaderHitHalfWidth}
                  y={paddingTop - point.y}
                />
              ) : null}
              {graphicWorkbench ? <line className="eq-curve-stem" x1="0" x2="0" y1={(zeroY - point.y).toFixed(1)} y2="0" /> : null}
              <circle className="eq-curve-node-hit" r="16" />
              {curveFirst && selected ? <circle className="eq-curve-node-selection" r="12.5" /> : null}
              <circle className="eq-curve-node" r={graphicWorkbench ? (selected ? 7 : adjusted ? 5.8 : 4.8) : hasParametricLayout ? (selected ? 9.2 : 8) : (selected ? 9 : 7.5)} />
              {graphicWorkbench ? (
                (band.filterType ?? 'peaking') !== 'peaking' ? (
                  <text className="eq-curve-node-type" y="-9">
                    {filterNodeGlyphs[band.filterType ?? 'peaking']}
                  </text>
                ) : null
              ) : (
                <text className="eq-curve-node-type" y={hasParametricLayout ? 3 : -10}>
                  {curveFirst ? String(displayIndex + 1) : filterNodeGlyphs[band.filterType ?? 'peaking']}
                </text>
              )}
              {!hasParametricLayout && !graphicWorkbench ? (
                <text className="eq-curve-node-number" y="3.5">
                  {formatFrequencyLabel(band.frequencyHz)}
                </text>
              ) : null}
            </g>
          );
        }))}

        {!hasParametricLayout && !graphicWorkbench && xAxisLabelEntries.map(({ band, index, x }) => {
          return (
            <text className="eq-x-label" x={x} y={height - 14} key={`${band.frequencyHz}-${index}-label`}>
              {formatFrequencyLabel(band.frequencyHz)}
            </text>
          );
        })}

        {selectedBand && selectedPoint && (!graphicWorkbench || activeBand !== null || hoverBand !== null) ? (
          <g
            className="eq-selected-readout"
            data-curve-first={curveFirst}
            data-graphic={graphicWorkbench}
            data-place-left={selectedReadoutPosition?.placeLeft}
            data-place-above={selectedReadoutPosition?.placeAbove}
            style={{ '--eq-band-node-color': getEqCurveBandColor(readoutDisplayIndex) } as CSSProperties}
            transform={`translate(${(selectedReadoutPosition?.x ?? clamp(selectedPoint.x, paddingLeft + 100, paddingLeft + plotWidth - 100)).toFixed(1)} ${(selectedReadoutPosition?.y ?? clamp(selectedPoint.y - 54, paddingTop + 24, paddingTop + plotHeight - 34)).toFixed(1)})`}
          >
            {curveFirst ? (
              <>
                <path className="eq-selected-readout-caret" d={selectedReadoutPosition?.placeLeft ? 'M 59 -8 L 72 0 L 59 8 Z' : 'M -59 -8 L -72 0 L -59 8 Z'} />
                <rect x="-59" y="-31" width="118" height="62" rx="7" />
                <text className="eq-selected-readout-frequency" x="-46" y="-12" textAnchor="start">
                  {formatFrequencyLabel(selectedBand.frequencyHz)}
                </text>
                <text className="eq-selected-readout-gain" x="-46" y="7" textAnchor="start">
                  {selectedBandGainEditable ? formatDb(selectedBand.gainDb) : t('settings.eq.band.gainFixed')}
                </text>
                <text className="eq-selected-readout-meta" x="-46" y="25" textAnchor="start">
                  {`Q ${Number(selectedBand.q ?? 1).toFixed(2)}`}
                </text>
              </>
            ) : graphicWorkbench ? (
              <>
                <path
                  className="eq-selected-readout-caret"
                  d={
                    selectedReadoutPosition?.placeAbove
                      ? 'M -7 27 L 0 36 L 7 27 Z'
                      : selectedReadoutPosition?.placeLeft
                        ? 'M 72 -7 L 82 0 L 72 7 Z'
                        : 'M -72 -7 L -82 0 L -72 7 Z'
                  }
                />
                <rect x="-72" y="-27" width="144" height="54" rx="9" />
                <text className="eq-selected-readout-frequency" y="-11">
                  {formatFrequencyLabel(selectedBand.frequencyHz)}
                </text>
                <text className="eq-selected-readout-meta" y="5">
                  {t('settings.eq.curve.bandSetting', {
                    value: selectedBandGainEditable ? formatDb(selectedBand.gainDb) : t('settings.eq.band.gainFixed'),
                  })}
                </text>
                <text className="eq-selected-readout-gain" data-testid="eq-simple-response-readout" y="19">
                  {t('settings.eq.curve.totalResponse', { value: formatDb(selectedResponseGainDb) })}
                </text>
              </>
            ) : (
              <>
                <path className="eq-selected-readout-caret" d="M -7 22 L 0 30 L 7 22 Z" />
                <rect x="-96" y="-22" width="192" height="44" rx="7" />
                <text className="eq-selected-readout-frequency" y="-5">
                  {`${String(readoutBandIndex + 1).padStart(2, '0')}  ·  ${formatFrequencyLabel(selectedBand.frequencyHz)}  ·  ${selectedBandGainEditable ? formatDb(selectedBand.gainDb) : t('settings.eq.band.gainFixed')}`}
                </text>
                <text className="eq-selected-readout-gain" y="12">
                  {`${t(eqFilterLabelKeys[selectedBandType])}  ·  Q ${Number(selectedBand.q ?? 1).toFixed(1)}${readoutModeLabel ? `  ·  ${readoutModeLabel}` : ''}`}
                </text>
              </>
            )}
          </g>
        ) : null}
        {hoverReadout && hoverBand === null && activeBand === null && !graphicWorkbench ? (
          <g className="eq-hover-readout" transform={`translate(${hoverReadout.x.toFixed(1)} ${Math.max(paddingTop + 22, hoverReadout.y - 30).toFixed(1)})`}>
            <line x1="0" x2="0" y1={(paddingTop - hoverReadout.y).toFixed(1)} y2={(paddingTop + plotHeight - hoverReadout.y).toFixed(1)} />
            <rect x="-64" y="-22" width="128" height="32" rx="7" />
            <text y="-8">
              {`${formatFrequencyLabel(hoverReadout.frequencyHz)} / ${formatDb(hoverReadout.totalGainDb)}`}
            </text>
            <text y="5">
              {`${t(eqFilterLabelKeys[selectedBandType])} ${formatDb(hoverReadout.bandGainDb)}`}
            </text>
          </g>
        ) : null}
      </svg>
      {graphicWorkbench && activeBand === null && hoverBand === null && displayBands.every((band) => Math.abs(band.gainDb) < 0.05) ? (
        <p className="eq-curve-simple-hint">{t('settings.eq.curve.dragHint')}</p>
      ) : null}
    </div>
  );
};

export const EqCurveView = memo(EqCurveViewComponent);
EqCurveView.displayName = 'EqCurveView';
