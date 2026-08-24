import type { TrackLyrics } from '../../../shared/types/lyrics';

type TrackLyricsPreviewPanelProps = {
  lyrics: TrackLyrics;
  label: string;
};

const formatTimelineTime = (timeMs: number): string => {
  const safeTimeMs = Math.max(0, Math.round(timeMs));
  const minutes = Math.floor(safeTimeMs / 60_000);
  const seconds = Math.floor((safeTimeMs % 60_000) / 1_000);
  const centiseconds = Math.floor((safeTimeMs % 1_000) / 10);
  return `[${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(centiseconds).padStart(2, '0')}]`;
};

export const TrackLyricsPreviewPanel = ({ lyrics, label }: TrackLyricsPreviewPanelProps): JSX.Element => {
  const fallbackLines = (lyrics.plainText || lyrics.syncedText || '')
    .split(/\r?\n/u)
    .filter((line) => line.trim().length > 0);
  const hasTimeline = lyrics.kind === 'synced' && lyrics.lines.length > 0;

  return (
    <section className="tag-editor-lyrics-preview" aria-label={label}>
      <header>
        <strong>{label}</strong>
        <span>{hasTimeline ? '同步时间轴' : '纯文本'} · {lyrics.lines.length || fallbackLines.length} 行</span>
      </header>
      <div className="tag-editor-lyrics-preview__lines" data-timeline={hasTimeline}>
        {lyrics.lines.length
          ? lyrics.lines.map((line, index) => (
              <div className="tag-editor-lyrics-preview__line" key={`${line.timeMs}-${index}`}>
                {hasTimeline ? <time dateTime={`PT${Math.max(0, line.timeMs) / 1000}S`}>{formatTimelineTime(line.timeMs)}</time> : null}
                <div>
                  <p>{line.text}</p>
                  {line.translation ? <small>{line.translation}</small> : null}
                  {line.romanization ? <small>{line.romanization}</small> : null}
                </div>
              </div>
            ))
          : fallbackLines.map((line, index) => (
              <div className="tag-editor-lyrics-preview__line" key={`${index}-${line}`}>
                <div><p>{line}</p></div>
              </div>
            ))}
      </div>
    </section>
  );
};
