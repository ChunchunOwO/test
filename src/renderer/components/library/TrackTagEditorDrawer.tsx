import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent as ReactKeyboardEvent, MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { Check, Copy, Disc3, FileText, Gauge, ImagePlus, RefreshCw, Save, Search, Tag, Undo2, X } from 'lucide-react';
import type { EditableTrackTags, LibraryTrack, TrackCoverSelection } from '../../../shared/types/library';
import type { PluginCoverCandidate, PluginMetadataCandidate } from '../../../shared/types/plugins';
import type { LyricsEmbedToTrackResult, LyricsProviderId, LyricsSearchCandidate, TrackLyrics } from '../../../shared/types/lyrics';
import { DrawerSmartSearch } from '../common/DrawerSmartSearch';
import {
  editableTagsFromForm,
  fieldDefinitions,
  getValidationErrors,
  hasValidationErrors,
  stateFromEditableTags,
  stateFromTrack,
} from './trackTagEditorFields';
import type { FieldDefinition, NumericField, TagFormState, TagSection } from './trackTagEditorFields';
import { TrackLyricsPreviewPanel } from './TrackLyricsPreviewPanel';
import { WorkshopTrackProviderPanel } from '../../workshop/WorkshopTrackProviderPanel';
import '../../styles/track-tag-editor.css';

type TrackTagEditorDrawerProps = {
  track: LibraryTrack | null;
  isOpen: boolean;
  isSaving: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (track: LibraryTrack, tags: EditableTrackTags, coverPath: string | null, coverUrl: string | null, coverMimeType: string | null) => void;
  onTrackUpdated?: (track: LibraryTrack) => void;
};

type EditorTab = 'tags' | 'lyrics' | 'file';
type BpmMeasureTone = 'success' | 'warning';

const editorTabs: Array<{ key: EditorTab; label: string }> = [
  { key: 'tags', label: '标签' },
  { key: 'lyrics', label: '歌词' },
  { key: 'file', label: '文件' },
];

const sectionLabels: Record<TagSection, string> = {
  basic: '基本信息',
  album: '专辑信息',
  order: '排序与其他',
};

const fieldSourceLabels: Record<string, string> = {
  title: '标题',
  artist: '艺术家',
  composer: '作曲',
  album: '专辑',
  albumArtist: '专辑艺术家',
  genre: '流派',
  year: '年份',
  trackNo: '音轨号',
  totalTracks: '总音轨数',
  discNo: '碟片号',
  totalDiscs: '总碟数',
  bpm: 'BPM',
  comment: '注释',
  cover: '封面',
  codec: '编码',
  encoding: '编码',
  sampleRate: '采样率',
  bitDepth: '位深',
  bitrate: '比特率',
  channels: '声道',
  duration: '时长',
  mqa: 'MQA',
  replayGainAlbumGainDb: '专辑响度增益',
  replayGainAlbumPeak: '专辑峰值',
  replayGainIntegratedLufs: '综合响度',
  replayGainTrackGainDb: '曲目响度增益',
  replayGainTrackPeak: '曲目峰值',
  replayGainTruePeak: '真实峰值',
  beatOffsetMs: '节拍偏移',
  bpmAnalysisVersion: 'BPM 分析版本',
};

const metadataSourceLabels: Record<string, string> = {
  embedded: '内嵌标签',
  technical: '技术信息',
  filename: '文件名',
  folder: '文件夹',
  artist_fallback: '艺术家回退',
  manual: '手动编辑',
  audio_analysis: '音频分析',
  osu: 'osu! 谱面',
  local: '本地媒体库',
  remote: '远程媒体库',
  subsonic: 'Subsonic',
  network: '网络元数据',
  missing: '未记录',
  none: '未记录',
  unknown: '未记录',
};

const labelFieldSource = (field: string): string => fieldSourceLabels[field] ?? field;
const labelMetadataSource = (source: string): string => metadataSourceLabels[source] ?? source;

const lyricSearchProviders: LyricsProviderId[] = ['local', 'lrclib', 'amll-ttml', 'netease', 'qqmusic', 'kugou', 'kuwo'];

const lyricProviderLabels: Record<LyricsProviderId, string> = {
  local: '本地',
  lrclib: 'LRCLIB',
  'amll-ttml': 'AMLL TTML',
  netease: '网易云',
  qqmusic: 'QQ 音乐',
  kugou: '酷狗',
  kuwo: '酷我',
  musixmatch: 'Musixmatch',
  genius: 'Genius',
  manual: '手动',
};

const lyricRiskLabels: Record<NonNullable<LyricsSearchCandidate['risk']>, string> = {
  low: '低风险',
  medium: '需确认',
  high: '高风险',
};

type LyricsCandidateDisplayKind = 'instrumental' | 'synced' | 'plain' | 'lyrics';

const lyricsCandidateDisplayKind = (candidate: LyricsSearchCandidate): LyricsCandidateDisplayKind => {
  if (candidate.instrumental) return 'instrumental';
  if (candidate.hasSynced) return 'synced';
  if (candidate.hasPlain) return 'plain';
  return 'lyrics';
};

const lyricCandidateDisplayLabels: Record<LyricsCandidateDisplayKind, string> = {
  instrumental: '纯音乐',
  synced: '同步歌词',
  plain: '纯文本',
  lyrics: '无文本',
};

const previewCoverUrl = (coverId: string | null | undefined, coverThumb: string | null | undefined): string | null => {
  if (coverId) {
    return `echo-cover://large/${encodeURIComponent(coverId)}`;
  }

  if (coverThumb?.startsWith('echo-cover://thumb/')) {
    return coverThumb.replace('echo-cover://thumb/', 'echo-cover://album/');
  }

  return coverThumb ?? null;
};

const formatDuration = (seconds: number | null | undefined): string => {
  if (!seconds || !Number.isFinite(seconds)) {
    return '未知时长';
  }

  const total = Math.round(seconds);
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `${minutes}:${String(rest).padStart(2, '0')}`;
};

const formatAudioSummary = (track: LibraryTrack): string =>
  [
    track.codec?.toUpperCase(),
    track.sampleRate ? `${Math.round(track.sampleRate / 100) / 10}kHz` : null,
    track.bitDepth ? `${track.bitDepth}bit` : null,
    track.bpm ? `${Math.round(track.bpm)} BPM` : null,
  ]
    .filter(Boolean)
    .join(' / ') || '本地音频';

const dedupeLyricsCandidates = (candidateLists: LyricsSearchCandidate[][]): LyricsSearchCandidate[] => {
  const byId = new Map<string, LyricsSearchCandidate>();
  for (const candidate of candidateLists.flat()) {
    const existing = byId.get(candidate.id);
    if (!existing || candidate.score > existing.score) {
      byId.set(candidate.id, candidate);
    }
  }

  return [...byId.values()].sort((left, right) => right.score - left.score);
};

const formatLyricsScore = (score: number): string => `${Math.round(Math.max(0, Math.min(1, score)) * 100)}%`;

const bpmMeasureErrorMessage = (error: unknown): string => {
  const message = error instanceof Error ? error.message : String(error || '');
  if (message.includes('disabled in Settings')) {
    return '请先在设置中开启“音频分析”，再测量 BPM。';
  }
  if (message.includes('track_file_missing')) {
    return '找不到本地音频文件，无法测量 BPM。';
  }
  if (message.includes('bpm_not_detected')) {
    return '没有检测到稳定的 BPM，请试听后手动填写。';
  }
  if (message.includes('service is unavailable')) {
    return 'BPM 分析服务暂时不可用，请重启 ECHO 后重试。';
  }
  return message || 'BPM 测量失败。';
};

const lyricsKindLabel = (lyrics: TrackLyrics | null): string => {
  if (!lyrics) {
    return '未应用';
  }
  if (lyrics.kind === 'synced') {
    return '逐字/逐行同步';
  }
  if (lyrics.kind === 'plain') {
    return '纯文本';
  }
  if (lyrics.kind === 'instrumental') {
    return '纯音乐';
  }
  return '空歌词';
};

const canEmbedLyricsIntoTrack = (track: LibraryTrack): boolean =>
  track.mediaType !== 'remote' && track.mediaType !== 'streaming' && track.isTemporary !== true && Boolean(track.path);

export const TrackTagEditorDrawer = ({ track, isOpen, isSaving, error, onClose, onSave, onTrackUpdated }: TrackTagEditorDrawerProps): JSX.Element | null => {
  const [form, setForm] = useState<TagFormState>(() => stateFromTrack(track));
  const [baselineForm, setBaselineForm] = useState<TagFormState>(() => stateFromTrack(track));
  const [activeTab, setActiveTab] = useState<EditorTab>('tags');
  const [activeSection, setActiveSection] = useState<TagSection>('basic');
  const [selectedCover, setSelectedCover] = useState<TrackCoverSelection | null>(null);
  const [selectedCoverUrl, setSelectedCoverUrl] = useState<string | null>(null);
  const [loadedCoverThumb, setLoadedCoverThumb] = useState<string | null>(null);
  const [isLoadingEmbedded, setIsLoadingEmbedded] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [lyricsCandidates, setLyricsCandidates] = useState<LyricsSearchCandidate[]>([]);
  const [currentLyrics, setCurrentLyrics] = useState<TrackLyrics | null>(null);
  const [loadingLyricsCandidateId, setLoadingLyricsCandidateId] = useState<string | null>(null);
  const [lyricsCandidatePreviews, setLyricsCandidatePreviews] = useState<Record<string, TrackLyrics>>({});
  const [lyricsMessage, setLyricsMessage] = useState<string | null>(null);
  const [isSearchingLyrics, setIsSearchingLyrics] = useState(false);
  const [applyingLyricsCandidateId, setApplyingLyricsCandidateId] = useState<string | null>(null);
  const [embeddingLyricsCandidateId, setEmbeddingLyricsCandidateId] = useState<string | null>(null);
  const [extendedTagsLoaded, setExtendedTagsLoaded] = useState(false);
  const [isHydratingExtendedTags, setIsHydratingExtendedTags] = useState(false);
  const [isMeasuringBpm, setIsMeasuringBpm] = useState(false);
  const [bpmMeasureMessage, setBpmMeasureMessage] = useState<string | null>(null);
  const [bpmMeasureTone, setBpmMeasureTone] = useState<BpmMeasureTone>('success');
  const lyricsSearchRequestIdRef = useRef(0);
  const embeddedLoadRequestIdRef = useRef(0);
  const bpmMeasureRequestIdRef = useRef(0);
  const editedFieldsRef = useRef<Set<keyof TagFormState>>(new Set());
  const drawerScrollRef = useRef<HTMLDivElement | null>(null);

  const fileName = useMemo(() => track?.path.split(/[\\/]/).pop() ?? '', [track?.path]);
  const previewCover =
    selectedCover?.dataUrl ??
    (loadedCoverThumb ? previewCoverUrl(null, loadedCoverThumb) : previewCoverUrl(track?.coverId, track?.coverThumb));
  const validationErrors = useMemo(() => getValidationErrors(form), [form]);
  const isBusy = isSaving || isLoadingEmbedded;
  const isLyricsBusy = isSearchingLyrics || Boolean(applyingLyricsCandidateId) || Boolean(embeddingLyricsCandidateId);
  const isDirty = useMemo(
    () =>
      Boolean(
        track &&
          (JSON.stringify(form) !== JSON.stringify(baselineForm) ||
            selectedCover || selectedCoverUrl),
      ),
    [baselineForm, form, selectedCover, selectedCoverUrl, track],
  );
  const changedFields = useMemo(
    () => fieldDefinitions.filter((field) => form[field.key] !== baselineForm[field.key]),
    [baselineForm, form],
  );
  const changedCountBySection = useMemo<Record<TagSection, number>>(
    () => ({
      basic: changedFields.filter((field) => field.group === 'basic').length,
      album: changedFields.filter((field) => field.group === 'album').length,
      order: changedFields.filter((field) => field.group === 'order').length,
    }),
    [changedFields],
  );
  const canEmbedLyrics = track ? canEmbedLyricsIntoTrack(track) : false;
  const coverChanged = Boolean(selectedCover || selectedCoverUrl);
  const changedCount = changedFields.length + (coverChanged ? 1 : 0);

  useEffect(() => {
    if (track) {
      const nextForm = stateFromTrack(track);
      setActiveTab('tags');
      setActiveSection('basic');
      setForm(nextForm);
      setBaselineForm(nextForm);
      setSelectedCover(null);
      setSelectedCoverUrl(null);
      setLoadedCoverThumb(null);
      setExtendedTagsLoaded(false);
      setIsHydratingExtendedTags(false);
      setIsMeasuringBpm(false);
      setBpmMeasureMessage(null);
      setBpmMeasureTone('success');
      setStatusMessage(null);
      setLocalError(null);
      setShowDiscardConfirm(false);
      setLyricsCandidates([]);
      setCurrentLyrics(null);
      setLoadingLyricsCandidateId(null);
      setLyricsCandidatePreviews({});
      setLyricsMessage(null);
      setIsSearchingLyrics(false);
      setApplyingLyricsCandidateId(null);
      setEmbeddingLyricsCandidateId(null);
      lyricsSearchRequestIdRef.current += 1;
      embeddedLoadRequestIdRef.current += 1;
      bpmMeasureRequestIdRef.current += 1;
      editedFieldsRef.current.clear();

      const lyricsApi = window.echo?.lyrics;
      if (lyricsApi?.getForTrack) {
        void lyricsApi.getForTrack(track.id).then(setCurrentLyrics).catch(() => undefined);
      }
    }
  }, [track?.id]);

  useEffect(() => {
    const library = window.echo?.library;
    if (!isOpen || !track || track.mediaType === 'remote' || track.mediaType === 'streaming' || !library?.loadEmbeddedTrackTags) {
      return undefined;
    }

    const requestId = embeddedLoadRequestIdRef.current + 1;
    embeddedLoadRequestIdRef.current = requestId;
    setIsHydratingExtendedTags(true);

    void library.loadEmbeddedTrackTags(track.id)
      .then((result) => {
        if (embeddedLoadRequestIdRef.current !== requestId) {
          return;
        }

        const loadedForm = stateFromEditableTags(result.tags, result.track);
        setBaselineForm(loadedForm);
        setForm((current) => {
          const next = { ...current };
          for (const field of fieldDefinitions) {
            if (!editedFieldsRef.current.has(field.key)) {
              next[field.key] = loadedForm[field.key];
            }
          }
          return next;
        });
        setLoadedCoverThumb(result.coverThumb);
        setExtendedTagsLoaded(true);
      })
      .catch(() => undefined)
      .finally(() => {
        if (embeddedLoadRequestIdRef.current === requestId) {
          setIsHydratingExtendedTags(false);
        }
      });

    return () => {
      if (embeddedLoadRequestIdRef.current === requestId) {
        embeddedLoadRequestIdRef.current += 1;
      }
    };
  }, [isOpen, track?.id, track?.mediaType]);

  useEffect(() => {
    if (!isOpen) {
      bpmMeasureRequestIdRef.current += 1;
      setIsMeasuringBpm(false);
      setBpmMeasureMessage(null);
    }
  }, [isOpen]);

  const requestClose = (): void => {
    if (isSaving) {
      return;
    }
    if (isDirty) {
      setShowDiscardConfirm(true);
      return;
    }
    onClose();
  };

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        if (isSaving) {
          return;
        }
        if (isDirty) {
          setShowDiscardConfirm(true);
          return;
        }
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isDirty, isOpen, isSaving, onClose]);

  if (!track) {
    return null;
  }

  const updateField = (field: keyof TagFormState, value: string): void => {
    editedFieldsRef.current.add(field);
    setForm((current) => ({ ...current, [field]: value }));
    if (field === 'bpm') {
      setBpmMeasureMessage(null);
    }
    setShowDiscardConfirm(false);
  };

  const handleApplyWorkshopMetadata = (candidate: PluginMetadataCandidate): void => {
    const values: Partial<Record<keyof TagFormState, string>> = {
      ...(candidate.title ? { title: candidate.title } : {}),
      ...(candidate.artist ? { artist: candidate.artist } : {}),
      ...(candidate.album ? { album: candidate.album } : {}),
      ...(candidate.albumArtist ? { albumArtist: candidate.albumArtist } : {}),
      ...(candidate.genre ? { genre: candidate.genre } : {}),
      ...(candidate.year !== undefined ? { year: String(candidate.year) } : {}),
      ...(candidate.trackNo !== undefined ? { trackNo: String(candidate.trackNo) } : {}),
      ...(candidate.discNo !== undefined ? { discNo: String(candidate.discNo) } : {}),
      ...(candidate.bpm !== undefined ? { bpm: String(candidate.bpm) } : {}),
    };
    for (const field of Object.keys(values) as Array<keyof TagFormState>) editedFieldsRef.current.add(field);
    setForm((current) => ({ ...current, ...values }));
    setActiveTab('tags');
    setStatusMessage(`已应用创意工坊元数据候选，共 ${Object.keys(values).length} 个字段；保存后写入。`);
    setLocalError(null);
    setShowDiscardConfirm(false);
  };

  const handleApplyWorkshopCover = (candidate: PluginCoverCandidate): void => {
    setSelectedCover(null);
    setSelectedCoverUrl(candidate.imageUrl);
    setLoadedCoverThumb(null);
    setStatusMessage('已选择创意工坊封面候选；保存后下载并写入。');
    setLocalError(null);
    setShowDiscardConfirm(false);
  };

  const focusEditorField = (field: keyof TagFormState): void => {
    const definition = fieldDefinitions.find((candidate) => candidate.key === field);
    if (!definition) {
      return;
    }

    setActiveTab('tags');
    setActiveSection(definition.group);
    window.requestAnimationFrame(() => {
      const fieldNode = drawerScrollRef.current?.querySelector<HTMLElement>(`[data-field-key="${field}"]`);
      const control = fieldNode?.querySelector<HTMLElement>('input, textarea');
      if (fieldNode && typeof fieldNode.scrollIntoView === 'function') {
        fieldNode.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      control?.focus();
    });
  };

  const handleResetField = (field: keyof TagFormState): void => {
    if (field === 'bpm') {
      bpmMeasureRequestIdRef.current += 1;
      setIsMeasuringBpm(false);
      setBpmMeasureMessage(null);
    }
    editedFieldsRef.current.delete(field);
    setForm((current) => ({ ...current, [field]: baselineForm[field] }));
    setStatusMessage(null);
    setLocalError(null);
    setShowDiscardConfirm(false);
  };

  const handleSearchMatch = (element: HTMLElement): void => {
    const panel = element.closest<HTMLElement>('[data-editor-tab]');
    const tab = panel?.dataset.editorTab;
    if (tab === 'tags' || tab === 'lyrics' || tab === 'file') {
      setActiveTab(tab);
    }

    const section = element.closest<HTMLElement>('[data-section]')?.dataset.section;
    if (section === 'basic' || section === 'album' || section === 'order') {
      setActiveSection(section);
    }
  };

  const handleFormKeyDown = (event: ReactKeyboardEvent<HTMLFormElement>): void => {
    if (event.defaultPrevented || event.key !== 'Enter' || (!event.ctrlKey && !event.metaKey)) {
      return;
    }

    event.preventDefault();
    if (!isDirty || isSaving || isMeasuringBpm) {
      return;
    }
    event.currentTarget.requestSubmit();
  };

  const handleMeasureBpm = async (): Promise<void> => {
    const library = window.echo?.library;
    if (track.mediaType === 'remote' || track.mediaType === 'streaming' || !track.path) {
      setLocalError('BPM 测量仅支持本地音频文件。');
      return;
    }
    if (!library?.measureTrackBpm) {
      setLocalError('当前运行环境不支持 BPM 测量。');
      return;
    }

    const requestId = bpmMeasureRequestIdRef.current + 1;
    bpmMeasureRequestIdRef.current = requestId;
    setIsMeasuringBpm(true);
    setBpmMeasureMessage('正在分析音频节拍…');
    setBpmMeasureTone('success');
    setLocalError(null);

    try {
      const result = await library.measureTrackBpm(track.id);
      if (bpmMeasureRequestIdRef.current !== requestId) {
        return;
      }
      if (result.status === 'error' || result.bpm === null) {
        throw new Error(result.error || '没有检测到稳定的 BPM。');
      }

      const measuredBpm = Math.round(result.bpm * 100) / 100;
      const confidence = Math.round(Math.max(0, Math.min(1, result.confidence)) * 100);
      const isLowConfidence = result.status === 'low_confidence';
      editedFieldsRef.current.add('bpm');
      setForm((current) => ({ ...current, bpm: String(measuredBpm) }));
      setBpmMeasureTone(isLowConfidence ? 'warning' : 'success');
      setBpmMeasureMessage(
        `测量结果 ${measuredBpm} BPM · ${confidence}% 置信度${isLowConfidence ? '，置信度偏低，请试听确认。' : '，保存后写入标签。'}`,
      );
      setShowDiscardConfirm(false);
    } catch (measureError) {
      if (bpmMeasureRequestIdRef.current === requestId) {
        setBpmMeasureMessage(null);
        setLocalError(bpmMeasureErrorMessage(measureError));
      }
    } finally {
      if (bpmMeasureRequestIdRef.current === requestId) {
        setIsMeasuringBpm(false);
      }
    }
  };

  const handleSubmit = (event: FormEvent): void => {
    event.preventDefault();
    setLocalError(null);
    if (isMeasuringBpm) {
      return;
    }
    if (hasValidationErrors(validationErrors)) {
      setLocalError('请先修正标红字段，再保存标签。');
      const firstInvalidField = fieldDefinitions.find((definition) => validationErrors[definition.key as NumericField]);
      if (firstInvalidField) {
        focusEditorField(firstInvalidField.key);
      }
      return;
    }
    onSave(
      track,
      editableTagsFromForm(form, extendedTagsLoaded, editedFieldsRef.current),
      selectedCover?.path ?? null,
      selectedCoverUrl,
      null,
    );
  };

  const handleResetChanges = (): void => {
    bpmMeasureRequestIdRef.current += 1;
    setIsMeasuringBpm(false);
    setBpmMeasureMessage(null);
    setForm(baselineForm);
    editedFieldsRef.current.clear();
    setSelectedCover(null);
    setSelectedCoverUrl(null);
    setStatusMessage(null);
    setLocalError(null);
    setShowDiscardConfirm(false);
  };

  const handleNavigateSection = (section: TagSection): void => {
    setActiveSection(section);
  };

  const handleChooseCover = async (): Promise<void> => {
    const library = window.echo?.library;

    if (!library?.chooseTrackCover) {
      setLocalError('当前运行环境不支持选择封面。');
      return;
    }

    try {
      setLocalError(null);
      const selection = await library.chooseTrackCover();
      if (selection) {
        setSelectedCover(selection);
        setSelectedCoverUrl(null);
        setLoadedCoverThumb(null);
        setShowDiscardConfirm(false);
      }
    } catch (chooseError) {
      setLocalError(chooseError instanceof Error ? chooseError.message : String(chooseError));
    }
  };

  const handleLoadEmbedded = async (): Promise<void> => {
    const library = window.echo?.library;

    if (!library?.loadEmbeddedTrackTags) {
      setLocalError('当前运行环境不支持读取内嵌标签。');
      return;
    }

    embeddedLoadRequestIdRef.current += 1;
    bpmMeasureRequestIdRef.current += 1;
    setIsHydratingExtendedTags(false);
    setIsMeasuringBpm(false);
    setBpmMeasureMessage(null);
    setIsLoadingEmbedded(true);
    setLocalError(null);

    try {
      const result = await library.loadEmbeddedTrackTags(track.id);
      const loadedForm = stateFromEditableTags(result.tags, result.track);
      onTrackUpdated?.(result.track);
      setForm(loadedForm);
      setBaselineForm(loadedForm);
      setExtendedTagsLoaded(true);
      editedFieldsRef.current.clear();
      setSelectedCover(null);
      setSelectedCoverUrl(null);
      setLoadedCoverThumb(result.coverThumb);
      setStatusMessage('已从源文件内嵌标签重新加载，并同步更新媒体库。');
      setShowDiscardConfirm(false);
    } catch (loadError) {
      setLocalError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setIsLoadingEmbedded(false);
    }
  };

  const handleCoverContextMenu = (event: MouseEvent<HTMLDivElement>): void => {
    event.preventDefault();
    event.stopPropagation();

    const library = window.echo?.library;
    if (!previewCover || selectedCover || selectedCoverUrl || !library?.copyTrackOriginalCover) {
      setLocalError(
        selectedCover || selectedCoverUrl
          ? '新选择的封面需要先保存后，才能复制文件里的封面原图。'
          : '这首歌没有可复制的封面原图。',
      );
      return;
    }

    void (async () => {
      try {
        setLocalError(null);
        const copied = await library.copyTrackOriginalCover(track.id);
        if (!copied) {
          setLocalError('这首歌没有可复制的封面原图。');
          return;
        }

        setStatusMessage('已复制封面原图。');
      } catch (copyError) {
        setLocalError(copyError instanceof Error ? copyError.message : '复制封面失败。');
      }
    })();
  };

  const handleCopyTrackPath = async (): Promise<void> => {
    const library = window.echo?.library;
    if (!library?.copyTrackPath) {
      setLocalError('当前运行环境不支持复制文件路径。');
      return;
    }

    try {
      setLocalError(null);
      await library.copyTrackPath(track.id);
      setStatusMessage('已复制文件路径。');
    } catch (copyError) {
      setLocalError(copyError instanceof Error ? copyError.message : '复制文件路径失败。');
    }
  };

  const handleSearchLyrics = async (): Promise<void> => {
    const lyricsApi = window.echo?.lyrics;
    if (!lyricsApi?.searchCandidates) {
      setLocalError('当前运行环境不支持歌词搜索。');
      return;
    }

    const requestId = lyricsSearchRequestIdRef.current + 1;
    lyricsSearchRequestIdRef.current = requestId;
    const searchText = [form.title || track.title, form.artist || track.artist].filter(Boolean).join(' ');
    const providers = lyricSearchProviders;

    setActiveTab('lyrics');
    setIsSearchingLyrics(true);
    setLocalError(null);
    setLyricsMessage('正在搜索歌词候选...');

    try {
      const results = await Promise.allSettled(
        providers.map((providerId) => lyricsApi.searchCandidates(track.id, searchText, providerId)),
      );
      if (lyricsSearchRequestIdRef.current !== requestId) {
        return;
      }

      const candidateLists = results
        .filter((result): result is PromiseFulfilledResult<LyricsSearchCandidate[]> => result.status === 'fulfilled')
        .map((result) => result.value);
      const nextCandidates = dedupeLyricsCandidates(candidateLists).slice(0, 12);
      setLyricsCandidates(nextCandidates);
      setLyricsCandidatePreviews({});
      setLyricsMessage(nextCandidates.length ? null : '没有找到合适的歌词候选。');
    } catch (searchError) {
      if (lyricsSearchRequestIdRef.current === requestId) {
        setLyricsCandidates([]);
        setLyricsMessage(null);
        setLocalError(searchError instanceof Error ? searchError.message : '歌词搜索暂时不可用，请稍后再试。');
      }
    } finally {
      if (lyricsSearchRequestIdRef.current === requestId) {
        setIsSearchingLyrics(false);
      }
    }
  };

  const handlePreviewLyricsCandidate = async (candidate: LyricsSearchCandidate): Promise<void> => {
    if (lyricsCandidatePreviews[candidate.id]) {
      return;
    }

    const lyricsApi = window.echo?.lyrics;
    if (!lyricsApi?.previewCandidate) {
      setLocalError('当前运行环境不支持完整歌词预览。');
      return;
    }

    setLoadingLyricsCandidateId(candidate.id);
    setLocalError(null);
    try {
      const preview = await lyricsApi.previewCandidate(track.id, candidate.id);
      setLyricsCandidatePreviews((current) => ({ ...current, [candidate.id]: preview }));
    } catch (previewError) {
      setLocalError(previewError instanceof Error ? previewError.message : '加载完整歌词预览失败。');
    } finally {
      setLoadingLyricsCandidateId(null);
    }
  };

  const handleApplyLyricsCandidate = async (candidate: LyricsSearchCandidate): Promise<void> => {
    const lyricsApi = window.echo?.lyrics;
    if (!lyricsApi?.applyCandidate) {
      setLocalError('当前运行环境不支持应用歌词。');
      return;
    }

    setApplyingLyricsCandidateId(candidate.id);
    setLocalError(null);
    setLyricsMessage(null);

    try {
      const lyrics = await lyricsApi.applyCandidate(track.id, candidate.id);
      setCurrentLyrics(lyrics);
      setLyricsMessage('已应用到歌词库，不会写入源音频文件。');
      window.dispatchEvent(new CustomEvent('lyrics:candidate-applied', { detail: { trackId: track.id, lyrics } }));
    } catch (applyError) {
      setLocalError(applyError instanceof Error ? applyError.message : '应用歌词失败。');
    } finally {
      setApplyingLyricsCandidateId(null);
    }
  };

  const refreshCurrentLyrics = async (): Promise<void> => {
    const lyricsApi = window.echo?.lyrics;
    if (lyricsApi?.getForTrack) {
      const lyrics = await lyricsApi.getForTrack(track.id);
      setCurrentLyrics(lyrics);
    }
  };

  const handleEmbedLyrics = async (candidate?: LyricsSearchCandidate): Promise<void> => {
    const lyricsApi = window.echo?.lyrics;
    if (!lyricsApi?.embedToTrack) {
      setLocalError('当前运行环境不支持嵌入歌词到文件。');
      return;
    }

    if (!canEmbedLyrics) {
      setLocalError('远程、流媒体或临时曲目不能写入源文件，只能应用到歌词库。');
      return;
    }

    const pendingId = candidate?.id ?? 'current';
    setEmbeddingLyricsCandidateId(pendingId);
    setLocalError(null);
    setLyricsMessage(null);

    try {
      const result: LyricsEmbedToTrackResult = await lyricsApi.embedToTrack(
        track.id,
        candidate ? { candidateId: candidate.id, preferSynced: true } : { preferSynced: true },
      );
      await refreshCurrentLyrics();
      setLyricsMessage(result.message);
      if (candidate) {
        window.dispatchEvent(new CustomEvent('lyrics:candidate-applied', { detail: { trackId: track.id } }));
      }
    } catch (embedError) {
      setLocalError(embedError instanceof Error ? embedError.message : '嵌入歌词失败。');
    } finally {
      setEmbeddingLyricsCandidateId(null);
    }
  };

  const renderField = (definition: FieldDefinition): JSX.Element => {
    const numericError = definition.inputMode ? validationErrors[definition.key as NumericField] : null;
    const isChanged = form[definition.key] !== baselineForm[definition.key];
    const controlId = `track-tag-${definition.key}`;
    const control = definition.kind === 'textarea'
      ? (
          <textarea
            id={controlId}
            disabled={isBusy || (definition.key === 'bpm' && isMeasuringBpm)}
            value={form[definition.key]}
            maxLength={definition.maxLength}
            rows={3}
            onChange={(event) => updateField(definition.key, event.target.value)}
          />
        )
      : (
          <input
            id={controlId}
            autoFocus={definition.key === 'title'}
            disabled={isBusy || (definition.key === 'bpm' && isMeasuringBpm)}
            inputMode={definition.inputMode}
            value={form[definition.key]}
            aria-invalid={Boolean(numericError)}
            maxLength={definition.maxLength}
            onChange={(event) => updateField(definition.key, event.target.value)}
          />
        );
    return (
      <div
        key={definition.key}
        className="tag-editor-field"
        data-drawer-search-item
        data-drawer-search-label={definition.label}
        data-drawer-search-description={definition.description}
        data-drawer-search-value={form[definition.key].trim() || '未填写'}
        data-search-keywords={definition.keywords}
        data-field-key={definition.key}
        data-changed={isChanged}
        data-invalid={Boolean(numericError)}
        data-kind={definition.kind ?? 'input'}
      >
        <label className="tag-editor-field-label" htmlFor={controlId}>{definition.label}</label>
        <div className="tag-editor-field-control">
          {control}
          {definition.key === 'bpm' ? (
            <button
              className="tag-editor-field-action"
              type="button"
              aria-label="测量 BPM"
              onClick={() => void handleMeasureBpm()}
              disabled={isBusy || isMeasuringBpm || track.mediaType === 'remote' || track.mediaType === 'streaming'}
            >
              {isMeasuringBpm ? <RefreshCw className="spinning-icon" size={16} /> : <Gauge size={16} />}
              {isMeasuringBpm ? '测量中' : '测量'}
            </button>
          ) : null}
          {isChanged ? (
            <button
              className="tag-editor-field-reset"
              type="button"
              aria-label={`还原${definition.label}`}
              title="还原此字段"
              disabled={isBusy || (definition.key === 'bpm' && isMeasuringBpm)}
              onClick={() => handleResetField(definition.key)}
            >
              <Undo2 size={15} />
            </button>
          ) : null}
        </div>
        {definition.key === 'bpm' && bpmMeasureMessage ? (
          <small className="tag-editor-field-note" data-tone={bpmMeasureTone}>{bpmMeasureMessage}</small>
        ) : null}
        {numericError ? <em>{numericError}</em> : null}
      </div>
    );
  };

  const fieldSourceEntries = Object.entries(track.fieldSources ?? {}).filter(([, source]) => source);
  const coverChangeLabel = selectedCover
    ? '已选择本地封面'
    : selectedCoverUrl
      ? '已选择创意工坊封面'
    : loadedCoverThumb
      ? '已载入内嵌封面'
      : null;

  const editor = (
    <div className="tag-editor-root" data-open={isOpen}>
      <button className="tag-editor-scrim" type="button" aria-label="关闭编辑标签" onClick={requestClose} />
      <form
        className="tag-editor-drawer track-tag-editor-drawer"
        data-active-tab={activeTab}
        aria-keyshortcuts="Control+Enter Meta+Enter"
        onKeyDown={handleFormKeyDown}
        onSubmit={handleSubmit}
      >
        <div className="tag-editor-scroll" ref={drawerScrollRef}>
          <header className="tag-editor-header">
            <div>
              <Tag size={23} />
              <div>
                <h2>编辑标签</h2>
                <p>单曲元数据</p>
              </div>
            </div>
            <button className="tag-editor-close" type="button" aria-label="关闭编辑标签" onClick={requestClose}>
              <X size={22} />
            </button>
          </header>

          {activeTab !== 'lyrics' ? (
            <DrawerSmartSearch
              rootRef={drawerScrollRef}
              enabled={isOpen}
              closeOnActivate
              showResultList={false}
              label="搜索编辑标签内容"
              placeholder="搜索字段或文件信息"
              clearLabel="清空搜索"
              enabledValueLabel="已启用"
              disabledValueLabel="已停用"
              noResultsLabel="没有匹配项"
              resultCountLabel={(count) => `${count} 个匹配项`}
              resultLabel={(result) => `跳转到 ${result}`}
              nextLabel="下一个匹配项"
              previousLabel="上一个匹配项"
              shortcutHint="Ctrl+F 搜索，回车跳转"
              onActivateMatch={handleSearchMatch}
            />
          ) : null}

          <div className="tag-editor-workbench">
            <aside className="tag-editor-rail">
              <section
                className="tag-editor-cover-card tag-editor-track-overview"
                aria-label="当前曲目"
                data-drawer-search-item
                data-drawer-search-label="当前曲目"
                data-drawer-search-description="封面、标题与音频摘要"
                data-search-keywords="封面 歌曲 音频 摘要"
              >
                <div
                  className="tag-editor-cover"
                  data-empty={!previewCover}
                  onContextMenu={handleCoverContextMenu}
                  title={previewCover ? '右键复制封面原图' : undefined}
                >
                  {previewCover ? <img alt="" src={previewCover} /> : <Disc3 size={42} />}
                </div>
                <div className="tag-editor-file">
                  <strong>{form.title || fileName}</strong>
                  <span>{[form.artist, form.album].filter(Boolean).join(' · ') || '未填写艺术家与专辑'}</span>
                  <small>{[formatAudioSummary(track), formatDuration(track.duration)].filter(Boolean).join(' · ')}</small>
                  {coverChangeLabel ? <em>{coverChangeLabel}</em> : null}
                </div>
                <div className="tag-editor-tool-row">
                  <button type="button" data-drawer-search-item data-drawer-search-label="更换封面" data-search-keywords="选择 本地 图片" onClick={() => void handleChooseCover()} disabled={isBusy}>
                    <ImagePlus size={17} />
                    更换封面
                  </button>
                  <button type="button" data-drawer-search-item data-drawer-search-label="读取内嵌标签" data-search-keywords="刷新 重新加载 文件标签" onClick={() => void handleLoadEmbedded()} disabled={isBusy || isMeasuringBpm}>
                    <RefreshCw size={17} />
                    {isLoadingEmbedded ? '读取中' : '读取内嵌标签'}
                  </button>
                </div>
              </section>

              <WorkshopTrackProviderPanel
                track={track}
                disabled={isBusy || isMeasuringBpm}
                onApplyMetadata={handleApplyWorkshopMetadata}
                onApplyCover={handleApplyWorkshopCover}
              />

            </aside>

            <main className="tag-editor-main">
              <div className="tag-editor-tabs" role="tablist" aria-label="编辑标签分段">
                {editorTabs.map((tab) => (
                    <button
                      key={tab.key}
                      type="button"
                      role="tab"
                      aria-selected={activeTab === tab.key}
                      data-active={activeTab === tab.key}
                      onClick={() => setActiveTab(tab.key)}
                    >
                      {tab.label}
                      {tab.key === 'tags' && changedFields.length ? <span>{changedFields.length}</span> : null}
                    </button>
                ))}
              </div>

              <div
                className="tag-editor-tab-panel tag-editor-tab-panel--tags"
                data-editor-tab="tags"
                hidden={activeTab !== 'tags'}
                role="tabpanel"
              >
                  <nav className="tag-editor-section-nav" aria-label="标签字段页面" role="tablist">
                    {(Object.keys(sectionLabels) as TagSection[]).map((section) => (
                      <button
                        key={section}
                        type="button"
                        id={`tag-editor-section-tab-${section}`}
                        role="tab"
                        aria-controls={`tag-editor-section-panel-${section}`}
                        aria-selected={activeSection === section}
                        data-active={activeSection === section}
                        onClick={() => handleNavigateSection(section)}
                      >
                        <span>{sectionLabels[section]}</span>
                        {changedCountBySection[section] ? <em>{changedCountBySection[section]}</em> : null}
                      </button>
                    ))}
                  </nav>

                  <section
                    className="tag-editor-section"
                    id="tag-editor-section-panel-basic"
                    role="tabpanel"
                    aria-labelledby="tag-editor-section-tab-basic"
                    hidden={activeSection !== 'basic'}
                    data-section="basic"
                    data-drawer-search-item
                    data-drawer-search-label="基本信息"
                    data-drawer-search-description="标题、艺术家、作曲与流派"
                  >
                    <div className="tag-editor-section-heading">
                      <h3>基本信息</h3>
                      {changedCountBySection.basic
                        ? <span className="tag-editor-change-count">{changedCountBySection.basic} 项修改</span>
                        : <span>{isHydratingExtendedTags ? '正在读取扩展标签…' : '标题、艺术家、作曲与流派'}</span>}
                    </div>
                    <div className="tag-editor-grid tag-editor-grid--basic">{fieldDefinitions.filter((field) => field.group === 'basic').map(renderField)}</div>
                  </section>

                  <section
                    className="tag-editor-section"
                    id="tag-editor-section-panel-album"
                    role="tabpanel"
                    aria-labelledby="tag-editor-section-tab-album"
                    hidden={activeSection !== 'album'}
                    data-section="album"
                    data-drawer-search-item
                    data-drawer-search-label="专辑信息"
                    data-drawer-search-description="专辑归类与发行信息"
                  >
                    <div className="tag-editor-section-heading">
                      <h3>专辑信息</h3>
                      {changedCountBySection.album
                        ? <span className="tag-editor-change-count">{changedCountBySection.album} 项修改</span>
                        : <span>专辑归类与发行信息</span>}
                    </div>
                    <div className="tag-editor-grid">{fieldDefinitions.filter((field) => field.group === 'album').map(renderField)}</div>
                  </section>

                  <section
                    className="tag-editor-section"
                    id="tag-editor-section-panel-order"
                    role="tabpanel"
                    aria-labelledby="tag-editor-section-tab-order"
                    hidden={activeSection !== 'order'}
                    data-section="order"
                    data-drawer-search-item
                    data-drawer-search-label="排序与其他"
                    data-drawer-search-description="曲序、碟序与文件注释"
                    data-search-keywords="顺序 节拍 备注"
                  >
                    <div className="tag-editor-section-heading">
                      <h3>排序与其他</h3>
                      {changedCountBySection.order
                        ? <span className="tag-editor-change-count">{changedCountBySection.order} 项修改</span>
                        : <span>曲序、碟序与文件注释</span>}
                    </div>
                    <div className="tag-editor-grid tag-editor-grid--compact">{fieldDefinitions.filter((field) => field.group === 'order').map(renderField)}</div>
                  </section>
                </div>

              <section
                className="tag-editor-section tag-editor-lyrics-panel tag-editor-tab-panel"
                aria-label="歌词搜索与嵌入"
                data-editor-tab="lyrics"
                data-drawer-search-item
                data-drawer-search-label="歌词"
                data-drawer-search-description="搜索、应用与嵌入歌词"
                data-search-keywords="歌词 lrc 同步歌词 纯文本"
                hidden={activeTab !== 'lyrics'}
                role="tabpanel"
              >
                  <div className="tag-editor-section-heading">
                    <h3>歌词</h3>
                    <button type="button" onClick={() => void handleSearchLyrics()} disabled={isLyricsBusy}>
                      <Search size={16} />
                      {isSearchingLyrics ? '搜索中' : '搜索歌词'}
                    </button>
                  </div>

                  <div
                    className="tag-editor-lyrics-status"
                    data-drawer-search-item
                    data-drawer-search-label="当前歌词库"
                    data-drawer-search-description="查看并嵌入当前歌词"
                    data-drawer-search-value={lyricsKindLabel(currentLyrics)}
                  >
                    <div>
                      <span>当前歌词库</span>
                      <strong>{lyricsKindLabel(currentLyrics)}</strong>
                    </div>
                    <button type="button" onClick={() => void handleEmbedLyrics()} disabled={!canEmbedLyrics || isLyricsBusy || !currentLyrics || currentLyrics.kind === 'instrumental' || currentLyrics.kind === 'empty'}>
                      <FileText size={16} />
                      嵌入当前歌词
                    </button>
                  </div>

                  {currentLyrics && currentLyrics.kind !== 'instrumental' && currentLyrics.kind !== 'empty' ? (
                    <TrackLyricsPreviewPanel lyrics={currentLyrics} label="当前完整歌词" />
                  ) : null}

                  {!canEmbedLyrics ? <p className="tag-editor-network-message">此曲目只能应用到歌词库，不能写入源文件。</p> : null}
                  {lyricsMessage ? <p className="tag-editor-network-message">{lyricsMessage}</p> : null}

                  {lyricsCandidates.length ? (
                    <div className="tag-editor-lyrics-candidates">
                      {lyricsCandidates.map((candidate) => {
                        const candidateKind = lyricsCandidateDisplayKind(candidate);
                        const canEmbedCandidate = canEmbedLyrics &&
                          !candidate.instrumental &&
                          (candidate.hasSynced || candidate.hasPlain);
                        return (
                          <article
                            key={candidate.id}
                            className={`tag-editor-lyrics-candidate tag-editor-lyrics-candidate--${candidateKind}`}
                            data-drawer-search-item
                            data-drawer-search-label={candidate.title || '未知标题'}
                            data-drawer-search-description={[candidate.artist, candidate.album, candidate.sourceLabel].filter(Boolean).join(' · ')}
                            data-lyrics-kind={candidateKind}
                          >
                            <div className="tag-editor-lyrics-candidate__main">
                              <span className="tag-editor-kicker">{candidate.sourceLabel || lyricProviderLabels[candidate.provider]}</span>
                              <strong>{candidate.title || '未知标题'}</strong>
                              <em>{candidate.artist || '未知艺术家'}</em>
                              <small>{[candidate.album, formatDuration(candidate.durationSeconds)].filter(Boolean).join(' · ')}</small>
                            </div>
                            <div className="tag-editor-lyrics-badges">
                              <span>{formatLyricsScore(candidate.score)}</span>
                              <span>{candidate.risk ? lyricRiskLabels[candidate.risk] : '普通匹配'}</span>
                              <span>{lyricCandidateDisplayLabels[candidateKind]}</span>
                            </div>
                            <div className="tag-editor-lyrics-actions">
                              {!lyricsCandidatePreviews[candidate.id] ? (
                                <button
                                  type="button"
                                  aria-label={`预览 ${candidate.title || '未知标题'} 的完整歌词`}
                                  onClick={() => void handlePreviewLyricsCandidate(candidate)}
                                  disabled={loadingLyricsCandidateId === candidate.id}
                                >
                                  <Search size={16} />
                                  {loadingLyricsCandidateId === candidate.id ? '加载中' : '预览完整歌词'}
                                </button>
                              ) : null}
                              <button type="button" onClick={() => void handleApplyLyricsCandidate(candidate)} disabled={isLyricsBusy}>
                                <Check size={16} />
                                {applyingLyricsCandidateId === candidate.id ? '应用中' : '应用到歌词库'}
                              </button>
                              <button type="button" onClick={() => void handleEmbedLyrics(candidate)} disabled={!canEmbedCandidate || isLyricsBusy}>
                                <FileText size={16} />
                                {embeddingLyricsCandidateId === candidate.id ? '排队中' : '应用并嵌入文件'}
                              </button>
                            </div>
                            {lyricsCandidatePreviews[candidate.id] ? (
                              <TrackLyricsPreviewPanel lyrics={lyricsCandidatePreviews[candidate.id]} label={`${candidate.title || '未知标题'} · 完整歌词`} />
                            ) : null}
                          </article>
                        );
                      })}
                    </div>
                  ) : null}
                </section>

              <section
                className="tag-editor-section tag-editor-file-panel tag-editor-tab-panel"
                aria-label="文件信息"
                data-editor-tab="file"
                data-drawer-search-item
                data-drawer-search-label="文件信息"
                data-drawer-search-description="路径、写入能力、音频参数与标签来源"
                data-search-keywords="文件 路径 编码 来源"
                hidden={activeTab !== 'file'}
                role="tabpanel"
              >
                  <div className="tag-editor-section-heading">
                    <h3>文件</h3>
                    <span>本地写入会走后台队列</span>
                  </div>
                  <div className="tag-editor-file-grid">
                    <div
                      data-drawer-search-item
                      data-drawer-search-label="文件路径"
                      data-drawer-search-description="复制本地音频文件路径"
                      data-drawer-search-value={track.path}
                    >
                      <span>路径</span>
                      <div className="tag-editor-path-value">
                        <strong title={track.path}>{track.path}</strong>
                        <button type="button" aria-label="复制文件路径" title="复制文件路径" onClick={() => void handleCopyTrackPath()}>
                          <Copy size={15} />
                        </button>
                      </div>
                    </div>
                    <div data-drawer-search-item data-drawer-search-label="写入状态" data-drawer-search-value={canEmbedLyrics ? '支持写入源文件' : '仅缓存到媒体库'}>
                      <span>写入状态</span>
                      <strong>{canEmbedLyrics ? '支持写入源文件' : '仅缓存到媒体库'}</strong>
                    </div>
                    <div data-drawer-search-item data-drawer-search-label="音频信息" data-drawer-search-value={formatAudioSummary(track)} data-search-keywords="编码 采样率 位深 BPM">
                      <span>音频</span>
                      <strong>{formatAudioSummary(track)}</strong>
                    </div>
                    <div data-drawer-search-item data-drawer-search-label="字段来源" data-drawer-search-value={fieldSourceEntries.length ? `${fieldSourceEntries.length} 项已记录` : '暂无来源记录'}>
                      <span>字段来源</span>
                      <strong>{fieldSourceEntries.length ? `${fieldSourceEntries.length} 项已记录` : '暂无来源记录'}</strong>
                    </div>
                  </div>
                  {fieldSourceEntries.length ? (
                    <div className="tag-editor-source-list">
                      {fieldSourceEntries.map(([field, source]) => (
                        <span
                          key={field}
                          data-drawer-search-item
                          data-drawer-search-label={labelFieldSource(field)}
                          data-drawer-search-description="字段来源"
                          data-drawer-search-value={labelMetadataSource(source)}
                        >
                          <b>{labelFieldSource(field)}</b>
                          {labelMetadataSource(source)}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </section>
            </main>
          </div>

        {statusMessage ? <p className="tag-editor-network-message tag-editor-status-message">{statusMessage}</p> : null}
        {error || localError ? <p className="tag-editor-error">{error ?? localError}</p> : null}

        {showDiscardConfirm ? (
          <div className="tag-editor-discard" role="alert">
            <span>有未保存更改，确认关闭并丢弃吗？</span>
            <button type="button" onClick={() => setShowDiscardConfirm(false)}>
              继续编辑
            </button>
            <button type="button" onClick={onClose}>
              丢弃更改
            </button>
          </div>
        ) : null}

        <footer className="tag-editor-actions">
          <span className="tag-editor-action-status" role="status" aria-live="polite">
            <span>{changedCount ? `${changedCount} 项修改尚未保存` : '没有待保存的修改'}</span>
            <small><kbd>Ctrl</kbd><kbd>Enter</kbd> 保存</small>
          </span>
          <button className="tag-editor-reset" type="button" onClick={handleResetChanges} disabled={!isDirty || isSaving || isMeasuringBpm}>
            <Undo2 size={17} />
            撤销修改
          </button>
          <button className="tag-editor-cancel" type="button" onClick={requestClose} disabled={isSaving}>
            取消
          </button>
          <button className="tag-editor-save" type="submit" disabled={!isDirty || isSaving || isMeasuringBpm || hasValidationErrors(validationErrors)}>
            <Save size={18} />
            {isSaving ? '保存中' : '保存标签'}
          </button>
        </footer>
        </div>
      </form>
    </div>
  );

  return createPortal(editor, document.body);
};
