import { ImagePlus, RefreshCw, Sparkles } from 'lucide-react';
import { useEffect, useState, useSyncExternalStore } from 'react';
import type { LibraryTrack } from '../../shared/types/library';
import type { PluginCoverCandidate, PluginMetadataCandidate } from '../../shared/types/plugins';
import {
  getWorkshopTrackProviderSnapshot,
  subscribeWorkshopTrackProviders,
} from './WorkshopTrackProviderRegistry';
import '../styles/workshop-track-providers.css';

type MetadataCandidateView = PluginMetadataCandidate & {
  key: string;
  providerName: string;
};

type CoverCandidateView = PluginCoverCandidate & {
  key: string;
  providerName: string;
};

type WorkshopTrackProviderPanelProps = {
  track: LibraryTrack;
  disabled: boolean;
  onApplyMetadata: (candidate: PluginMetadataCandidate) => void;
  onApplyCover: (candidate: PluginCoverCandidate) => void;
};

const requestForTrack = (track: LibraryTrack) => ({
  track: {
    id: track.id,
    title: track.title,
    artist: track.artist,
    album: track.album,
    albumArtist: track.albumArtist,
    durationSeconds: Math.max(0, track.duration),
  },
});

const metadataSummary = (candidate: PluginMetadataCandidate): string => [
  candidate.artist,
  candidate.album,
  candidate.albumArtist,
  candidate.year,
  candidate.genre,
  candidate.bpm ? `${candidate.bpm} BPM` : null,
].filter(Boolean).join(' · ') || '元数据候选';

export const WorkshopTrackProviderPanel = ({
  track,
  disabled,
  onApplyMetadata,
  onApplyCover,
}: WorkshopTrackProviderPanelProps): JSX.Element | null => {
  const providers = useSyncExternalStore(
    subscribeWorkshopTrackProviders,
    getWorkshopTrackProviderSnapshot,
    getWorkshopTrackProviderSnapshot,
  );
  const [metadataCandidates, setMetadataCandidates] = useState<MetadataCandidateView[]>([]);
  const [coverCandidates, setCoverCandidates] = useState<CoverCandidateView[]>([]);
  const [searching, setSearching] = useState<'metadata' | 'cover' | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setMetadataCandidates([]);
    setCoverCandidates([]);
    setMessage(null);
    setSearching(null);
  }, [track.id]);

  const readyMetadataProviders = providers.metadataProviders.filter((provider) => provider.ready);
  const readyCoverProviders = providers.coverProviders.filter((provider) => provider.ready);
  if (providers.metadataProviders.length === 0 && providers.coverProviders.length === 0) return null;

  const searchMetadata = async (): Promise<void> => {
    if (searching || readyMetadataProviders.length === 0) return;
    setSearching('metadata');
    setMessage(null);
    const results = await Promise.allSettled(readyMetadataProviders.map(async (provider) => ({
      provider,
      candidates: await provider.lookup(requestForTrack(track)),
    })));
    const candidates = results.flatMap((result) => result.status === 'fulfilled'
      ? result.value.candidates.map((candidate, index) => ({
          ...candidate,
          key: `${result.value.provider.key}:${index}`,
          providerName: `${result.value.provider.pluginName} · ${result.value.provider.title}`,
        }))
      : []).slice(0, 24);
    setMetadataCandidates(candidates);
    setMessage(candidates.length ? null : '创意工坊提供器没有返回元数据候选。');
    setSearching(null);
  };

  const searchCovers = async (): Promise<void> => {
    if (searching || readyCoverProviders.length === 0) return;
    setSearching('cover');
    setMessage(null);
    const results = await Promise.allSettled(readyCoverProviders.map(async (provider) => ({
      provider,
      candidates: await provider.lookup(requestForTrack(track)),
    })));
    const candidates = results.flatMap((result) => result.status === 'fulfilled'
      ? result.value.candidates.map((candidate, index) => ({
          ...candidate,
          key: `${result.value.provider.key}:${index}`,
          providerName: `${result.value.provider.pluginName} · ${result.value.provider.title}`,
        }))
      : []).slice(0, 24);
    setCoverCandidates(candidates);
    setMessage(candidates.length ? null : '创意工坊提供器没有返回封面候选。');
    setSearching(null);
  };

  return (
    <section className="workshop-track-providers" data-drawer-search-item data-drawer-search-label="创意工坊歌曲增强">
      <header>
        <div><Sparkles size={17} /><strong>创意工坊增强</strong></div>
        <small>{readyMetadataProviders.length + readyCoverProviders.length} 个提供器已就绪</small>
      </header>
      <div className="workshop-track-providers__actions">
        {providers.metadataProviders.length > 0 ? (
          <button type="button" disabled={disabled || Boolean(searching) || readyMetadataProviders.length === 0} onClick={() => void searchMetadata()}>
            {searching === 'metadata' ? <RefreshCw className="spinning-icon" size={15} /> : <Sparkles size={15} />}
            查找标签
          </button>
        ) : null}
        {providers.coverProviders.length > 0 ? (
          <button type="button" disabled={disabled || Boolean(searching) || readyCoverProviders.length === 0} onClick={() => void searchCovers()}>
            {searching === 'cover' ? <RefreshCw className="spinning-icon" size={15} /> : <ImagePlus size={15} />}
            查找封面
          </button>
        ) : null}
      </div>
      {message ? <p role="status">{message}</p> : null}
      {metadataCandidates.length > 0 ? (
        <div className="workshop-track-providers__list" aria-label="创意工坊元数据候选">
          {metadataCandidates.map((candidate) => (
            <article key={candidate.key}>
              <span><strong>{candidate.title || track.title}</strong><small>{metadataSummary(candidate)}</small><em>{candidate.providerName}</em></span>
              <button type="button" disabled={disabled} onClick={() => onApplyMetadata(candidate)}>应用</button>
            </article>
          ))}
        </div>
      ) : null}
      {coverCandidates.length > 0 ? (
        <div className="workshop-track-providers__covers" aria-label="创意工坊封面候选">
          {coverCandidates.map((candidate) => (
            <button
              key={candidate.key}
              type="button"
              disabled={disabled}
              aria-label={`选择封面 ${candidate.title || candidate.source || candidate.providerName}`}
              title={candidate.imageUrl}
              onClick={() => onApplyCover(candidate)}
            >
              <span className="workshop-track-providers__cover-icon"><ImagePlus size={22} /></span>
              <strong>{candidate.title || candidate.source || '封面候选'}</strong>
              <small>{candidate.providerName}</small>
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
};
