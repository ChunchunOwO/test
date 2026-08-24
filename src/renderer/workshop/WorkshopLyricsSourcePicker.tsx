import { Check, Database, Search } from 'lucide-react';
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import type { LibraryTrack } from '../../shared/types/library';
import type { LyricsTrackSnapshotRequest, TrackLyrics } from '../../shared/types/lyrics';
import {
  getWorkshopLyricsProvidersSnapshot,
  searchWorkshopLyricsProvider,
  subscribeWorkshopLyricsProviders,
  type WorkshopLyricsProviderCandidate,
} from './WorkshopLyricsProviderRegistry';
import '../styles/workshop-lyrics-controls.css';

type LyricsTarget = {
  trackId: string | null;
  snapshot: LyricsTrackSnapshotRequest | null;
};

type WorkshopLyricsSourcePickerProps = {
  currentTrack: LibraryTrack | null;
  disabled?: boolean;
  resolveTarget: () => Promise<LyricsTarget>;
  onApplied: (trackId: string, lyrics: TrackLyrics) => void;
};

export const WorkshopLyricsSourcePicker = ({
  currentTrack,
  disabled = false,
  resolveTarget,
  onApplied,
}: WorkshopLyricsSourcePickerProps): JSX.Element | null => {
  const providers = useSyncExternalStore(
    subscribeWorkshopLyricsProviders,
    getWorkshopLyricsProvidersSnapshot,
    getWorkshopLyricsProvidersSnapshot,
  );
  const readyProviders = useMemo(() => providers.filter((provider) => provider.ready), [providers]);
  const [providerKey, setProviderKey] = useState('');
  const [query, setQuery] = useState('');
  const [candidates, setCandidates] = useState<WorkshopLyricsProviderCandidate[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (readyProviders.some((provider) => provider.key === providerKey)) return;
    setProviderKey(readyProviders[0]?.key ?? '');
    setCandidates([]);
  }, [providerKey, readyProviders]);

  if (providers.length === 0) return null;

  const selectedProvider = readyProviders.find((provider) => provider.key === providerKey) ?? null;

  const search = async (): Promise<void> => {
    if (!selectedProvider || !currentTrack) return;
    setBusy(true);
    setMessage('正在向创意工坊歌词源查询…');
    setCandidates([]);
    try {
      const result = await searchWorkshopLyricsProvider(selectedProvider.key, {
        track: {
          id: currentTrack.id,
          title: currentTrack.title.trim() || 'Untitled',
          artist: currentTrack.artist.trim() || currentTrack.albumArtist.trim() || 'Unknown Artist',
          album: currentTrack.album.trim() || null,
          durationSeconds: currentTrack.duration > 0 ? currentTrack.duration : null,
        },
        ...(query.trim() ? { query: query.trim().slice(0, 240) } : {}),
      });
      setCandidates(result.map((candidate, index) => ({
        ...candidate,
        id: `${selectedProvider.key}:${index}`,
      })));
      setMessage(result.length > 0 ? `找到 ${result.length} 个候选` : '这个歌词源没有返回候选');
    } catch (error) {
      setMessage(`歌词源查询失败：${error instanceof Error ? error.message : 'unknown'}`);
    } finally {
      setBusy(false);
    }
  };

  const apply = async (candidate: WorkshopLyricsProviderCandidate): Promise<void> => {
    const lyricsApi = window.echo?.lyrics;
    const body = candidate.lrc ?? candidate.text;
    if (!lyricsApi || !body || !selectedProvider) return;
    setBusy(true);
    setMessage('正在应用歌词…');
    try {
      const target = await resolveTarget();
      if (!target.trackId) throw new Error('no-playing-track');
      const fileName = `${selectedProvider.pluginName}-${selectedProvider.title}.lrc`;
      const lyrics = target.snapshot && lyricsApi.applyCustomLrcForSnapshot
        ? await lyricsApi.applyCustomLrcForSnapshot(target.snapshot, body, fileName)
        : await lyricsApi.applyCustomLrc?.(target.trackId, body, fileName);
      if (!lyrics) throw new Error('custom-lyrics-unavailable');
      onApplied(target.trackId, lyrics);
      setMessage(`已应用 ${candidate.title ?? selectedProvider.title} 的歌词`);
    } catch (error) {
      setMessage(`歌词应用失败：${error instanceof Error ? error.message : 'unknown'}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="workshop-lyrics-source-picker" data-drawer-search-item="">
      <div className="lyrics-color-panel__header">
        <span><Database size={15} /><strong>创意工坊歌词源</strong></span>
        <em>{readyProviders.length}/{providers.length} 可用</em>
      </div>
      <p>只把当前歌曲的标题、艺人、专辑和时长交给你选择的插件，不提供文件路径。</p>
      <label className="lyrics-drawer-select">
        <span>选择歌词源</span>
        <select value={providerKey} disabled={disabled || busy || readyProviders.length === 0} onChange={(event) => {
          setProviderKey(event.currentTarget.value);
          setCandidates([]);
          setMessage(null);
        }}>
          {readyProviders.map((provider) => (
            <option value={provider.key} key={provider.key}>{provider.pluginName} · {provider.title}</option>
          ))}
        </select>
      </label>
      {selectedProvider?.description ? <p>{selectedProvider.description}</p> : null}
      <div className="echo-search-field workshop-lyrics-source-picker__search">
        <Search size={15} aria-hidden="true" />
        <input
          value={query}
          maxLength={240}
          placeholder="可选：覆盖默认搜索词"
          disabled={disabled || busy || !selectedProvider || !currentTrack}
          onChange={(event) => setQuery(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void search();
          }}
        />
        <button type="button" disabled={disabled || busy || !selectedProvider || !currentTrack} onClick={() => void search()}>
          查询
        </button>
      </div>
      {candidates.length > 0 ? (
        <div className="lyrics-candidate-list" aria-label="创意工坊歌词候选">
          {candidates.map((candidate) => (
            <button
              className="lyrics-candidate lyrics-candidate--lyrics"
              type="button"
              key={candidate.id}
              disabled={disabled || busy}
              onClick={() => void apply(candidate)}
            >
              <span className="lyrics-candidate-copy">
                <span className="lyrics-candidate-heading">
                  <strong>{candidate.title ?? currentTrack?.title ?? '歌词候选'}</strong>
                  <small className="lyrics-candidate-source">{candidate.source ?? selectedProvider?.title}</small>
                </span>
                <em>{[candidate.language, candidate.lrc ? '同步/文本歌词' : '文本歌词'].filter(Boolean).join(' · ')}</em>
              </span>
              <span className="lyrics-candidate-action" aria-hidden="true"><Check size={14} />应用</span>
            </button>
          ))}
        </div>
      ) : null}
      {message ? <p role="status">{message}</p> : null}
    </div>
  );
};
