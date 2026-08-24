import { ChevronLeft, ChevronRight, Play, Radio, Search, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import type {
  WorkshopPluginSourceProviderSummary,
  WorkshopPluginSourceSearchResult,
  WorkshopPluginSourceTrack,
  WorkshopPluginSummary,
} from '../../shared/types/workshop';
import '../styles/workshop-source-provider.css';

type WorkshopSourceProviderDialogProps = {
  plugin: WorkshopPluginSummary;
  provider: WorkshopPluginSourceProviderSummary;
  ready: boolean;
  onClose: () => void;
  onSearch: (query: string, page: number) => Promise<WorkshopPluginSourceSearchResult>;
  onPlay: (track: WorkshopPluginSourceTrack) => Promise<void>;
};

const formatDuration = (durationSeconds: number | null): string | null => {
  if (durationSeconds === null) return null;
  const totalSeconds = Math.round(durationSeconds);
  const minutes = Math.floor(totalSeconds / 60);
  return `${minutes}:${String(totalSeconds % 60).padStart(2, '0')}`;
};

export const WorkshopSourceProviderDialog = ({
  plugin,
  provider,
  ready,
  onClose,
  onSearch,
  onPlay,
}: WorkshopSourceProviderDialogProps): JSX.Element => {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<WorkshopPluginSourceSearchResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setQuery('');
    setPage(1);
    setResult(null);
    setError(null);
  }, [plugin.itemId, provider.id]);

  const search = useCallback(async (nextPage = 1): Promise<void> => {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    try {
      setResult(await onSearch(query, nextPage));
      setPage(nextPage);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : '音源搜索失败');
    } finally {
      setBusy(false);
    }
  }, [busy, onSearch, query, ready]);

  const play = useCallback(async (track: WorkshopPluginSourceTrack): Promise<void> => {
    if (!track.playable || playingId) return;
    setPlayingId(track.providerTrackId);
    setError(null);
    try {
      await onPlay(track);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : '音源播放失败');
    } finally {
      setPlayingId(null);
    }
  }, [onPlay, playingId]);

  return (
    <section className="workshop-source-provider" role="dialog" aria-modal="true" aria-label={`${plugin.name}：${provider.title}`}>
      <header>
        <div><Radio size={17} /><strong>{provider.title}</strong><span>{plugin.name}</span></div>
        <button type="button" aria-label="关闭音源提供器" onClick={onClose}><X size={17} /></button>
      </header>
      {provider.description ? <p>{provider.description}</p> : null}
      <form onSubmit={(event) => { event.preventDefault(); void search(1); }}>
        <input
          value={query}
          maxLength={240}
          placeholder="搜索此创意工坊音源"
          aria-label="音源搜索词"
          onChange={(event) => setQuery(event.target.value)}
        />
        <button type="submit" disabled={!ready || busy}><Search size={15} />{busy ? '搜索中…' : '搜索'}</button>
      </form>
      {!ready ? <p role="status">音源提供器正在加载。</p> : null}
      {error ? <p className="workshop-source-provider__error" role="alert">{error}</p> : null}
      {result ? (
        <div className="workshop-source-provider__results" aria-live="polite">
          <small>{result.total === null ? `${result.tracks.length} 个结果` : `${result.tracks.length} / ${result.total} 个结果`}</small>
          {result.tracks.length === 0 ? <p>这个提供器没有返回可显示的音源。</p> : null}
          {result.tracks.map((track) => {
            const duration = formatDuration(track.durationSeconds);
            return (
              <article key={track.providerTrackId}>
                <span>
                  <strong>{track.title}</strong>
                  <small>{[track.artist, track.album, track.source, duration].filter(Boolean).join(' · ') || '社区音源'}</small>
                  {!track.playable && track.unavailableReason ? <em>{track.unavailableReason}</em> : null}
                </span>
                <button
                  type="button"
                  disabled={!track.playable || playingId !== null}
                  aria-label={`播放 ${track.title}`}
                  onClick={() => void play(track)}
                >
                  <Play size={15} />{playingId === track.providerTrackId ? '解析中…' : '播放'}
                </button>
              </article>
            );
          })}
          <nav className="workshop-source-provider__pagination" aria-label="音源结果分页">
            <button type="button" disabled={busy || page <= 1} onClick={() => void search(page - 1)}>
              <ChevronLeft size={15} />上一页
            </button>
            <span>第 {page} 页</span>
            <button type="button" disabled={busy || !result.hasMore} onClick={() => void search(page + 1)}>
              下一页<ChevronRight size={15} />
            </button>
          </nav>
        </div>
      ) : null}
    </section>
  );
};
