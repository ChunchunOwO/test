type CompressorHistoryProps = {
  values: number[];
  title: string;
  windowLabel: string;
};

const historyWidth = 320;
const historyHeight = 72;
const maximumDisplayReductionDb = 24;

export const CompressorHistory = ({ values, title, windowLabel }: CompressorHistoryProps): JSX.Element => {
  const safeValues = values.length > 1 ? values : [0, ...(values.length === 1 ? values : [0])];
  const points = safeValues.map((value, index) => {
    const x = index / Math.max(1, safeValues.length - 1) * historyWidth;
    const y = Math.min(1, Math.max(0, value / maximumDisplayReductionDb)) * historyHeight;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const linePath = `M ${points.join(' L ')}`;
  const areaPath = `${linePath} L ${historyWidth},0 L 0,0 Z`;

  return (
    <section className="compressor-history-card">
      <header><strong>{title}</strong><span>{windowLabel}</span></header>
      <svg viewBox={`0 0 ${historyWidth} ${historyHeight}`} preserveAspectRatio="none" role="img" aria-label={title}>
        {[0, 6, 12, 18, 24].map((db) => {
          const y = db / maximumDisplayReductionDb * historyHeight;
          return <line key={db} x1="0" x2={historyWidth} y1={y} y2={y} />;
        })}
        <path className="compressor-history-area" d={areaPath} />
        <path className="compressor-history-line" d={linePath} />
      </svg>
      <footer><span>0</span><span>-6</span><span>-12</span><span>-18</span><span>-24 dB</span></footer>
    </section>
  );
};
