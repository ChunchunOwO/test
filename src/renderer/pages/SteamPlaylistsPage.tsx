import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import {
  ArrowRight,
  FilePlus2,
  ListMusic,
  ListPlus,
  Music2,
  Play,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import type {
  LibraryPage,
  LibraryPlaylist,
  LibraryPlaylistItem,
  LibraryTrack,
  PlaylistExportFormat,
  PlaylistSortMode,
} from '../../shared/types/library';
import { TrackList } from '../components/library/TrackList';
import { EchoSearchFieldTools } from '../components/common/EchoSearchFieldTools';
import type { TrackMenuAction } from '../components/library/TrackContextMenu';
import { likedChangedEvent, likedTracksChangedEvent, useLikedTrackIds } from '../hooks/useLikedMedia';
import { useI18n } from '../i18n/I18nProvider';
import { usePlaybackQueue } from '../stores/PlaybackQueueProvider';
import { steamPlaylistText, type SteamPlaylistTextKey } from './steamPlaylistLocalText';
import '../styles/playlists-cinematic.css';

const TrackContextMenu = lazy(() =>
  import('../components/library/TrackContextMenu').then((module) => ({ default: module.TrackContextMenu })),
);

const pageSize = 100;
const playlistItemDragMime = 'application/x-echo-playlist-item-id';
const playlistSortOptions: Array<{ value: PlaylistSortMode; labelKey: SteamPlaylistTextKey }> = [
  { value: 'manual', labelKey: 'sort.manual' },
  { value: 'addedDesc', labelKey: 'sort.addedDesc' },
  { value: 'titleAsc', labelKey: 'sort.titleAsc' },
  { value: 'titleDesc', labelKey: 'sort.titleDesc' },
  { value: 'artistAsc', labelKey: 'sort.artistAsc' },
];
const playlistExportOptions: Array<{ value: PlaylistExportFormat; label: string }> = [
  { value: 'json', label: 'JSON' },
  { value: 'txt', label: 'TXT' },
  { value: 'm3u8', label: 'M3U8' },
  { value: 'csv', label: 'CSV' },
];
const playlistTrackMenuActions: readonly TrackMenuAction[] = [
  'add-to-playlist',
  'play-next',
  'add-to-queue',
  'toggle-liked',
  'remove-from-playlist',
  'show-in-folder',
  'copy-path',
  'open-system',
  'copy-name-artist',
];

const emptyItemsPage = (): LibraryPage<LibraryPlaylistItem> => ({
  items: [],
  page: 1,
  pageSize,
  total: 0,
  hasMore: false,
});

const itemToTrack = (item: LibraryPlaylistItem): LibraryTrack => {
  if (item.track) {
    return {
      ...item.track,
      playlistItemId: item.id,
      unavailable: item.unavailable || item.track.unavailable,
    };
  }

  return {
    id: item.mediaId ?? item.id,
    path: '',
    title: item.titleSnapshot ?? 'Unavailable track',
    artist: item.artistSnapshot ?? 'Unknown artist',
    album: item.albumSnapshot ?? '',
    albumArtist: item.artistSnapshot ?? '',
    trackNo: null,
    discNo: null,
    year: null,
    genre: null,
    duration: item.durationSnapshot ?? 0,
    codec: null,
    sampleRate: null,
    bitDepth: null,
    bitrate: null,
    coverId: item.coverId,
    coverThumb: item.coverThumb,
    fieldSources: {},
    playlistItemId: item.id,
    unavailable: true,
  };
};

export const SteamPlaylistsPage = (): JSX.Element => {
  const { locale, t } = useI18n();
  const lt = useCallback(
    (key: SteamPlaylistTextKey, options?: Record<string, string | number>): string => steamPlaylistText(locale, key, options),
    [locale],
  );
  const { appendTracksToQueue, currentTrackId, playTrack, playTrackNext } = usePlaybackQueue();
  const [playlists, setPlaylists] = useState<LibraryPlaylist[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [itemsPage, setItemsPage] = useState<LibraryPage<LibraryPlaylistItem>>(emptyItemsPage);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isAddingLocalFiles, setIsAddingLocalFiles] = useState(false);
  const [isGeneratingSmartPlaylist, setIsGeneratingSmartPlaylist] = useState(false);
  const [isImportingPlaylistFile, setIsImportingPlaylistFile] = useState(false);
  const [playlistMenuOpen, setPlaylistMenuOpen] = useState(false);
  const [trackMenu, setTrackMenu] = useState<{ track: LibraryTrack; position: { x: number; y: number } } | null>(null);
  const [draggedPlaylistItemId, setDraggedPlaylistItemId] = useState<string | null>(null);
  const [dropTargetPlaylistItemId, setDropTargetPlaylistItemId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const newPlaylistInputRef = useRef<HTMLInputElement | null>(null);
  const playlistMenuRef = useRef<HTMLDivElement | null>(null);
  const selected = useMemo(
    () => playlists.find((playlist) => playlist.id === selectedId) ?? playlists[0] ?? null,
    [playlists, selectedId],
  );
  const tracks = useMemo(() => itemsPage.items.map(itemToTrack), [itemsPage.items]);
  const playableTracks = useMemo(() => tracks.filter((track) => !track.unavailable), [tracks]);
  const likedTrackIds = useLikedTrackIds(tracks.filter((track) => !track.unavailable).map((track) => track.id));
  const isSelectedPlaylistProtected = selected?.kind === 'system';
  const canReorderSelectedPlaylist = Boolean(selected) && !isSelectedPlaylistProtected && selected?.sortMode === 'manual' && search.length === 0 && searchInput.trim().length === 0;
  const source = useMemo(
    () => ({ type: 'manual' as const, label: selected?.name ?? 'Playlist' }),
    [selected?.name],
  );

  const loadPlaylists = useCallback(async (): Promise<void> => {
    const library = window.echo?.library;
    if (!library?.getPlaylists) {
      setError('本地媒体库暂不可用');
      return;
    }

    try {
      const next = (await library.getPlaylists()).filter((playlist) => playlist.sourceProvider === 'local');
      setPlaylists(next);
      setSelectedId((current) => current && next.some((playlist) => playlist.id === current) ? current : next[0]?.id ?? null);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    }
  }, []);

  const loadItems = useCallback(async (
    playlistId: string,
    nextPage = 1,
    mode: 'replace' | 'append' = 'replace',
    searchText = search,
  ): Promise<void> => {
    const library = window.echo?.library;
    if (!library?.getPlaylistItems) {
      setItemsPage(emptyItemsPage());
      return;
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setIsLoading(true);
    setError(null);

    try {
      const result = await library.getPlaylistItems(playlistId, { page: nextPage, pageSize, search: searchText });
      if (requestIdRef.current !== requestId) {
        return;
      }

      setItemsPage((current) => mode === 'append' ? { ...result, items: [...current.items, ...result.items] } : result);
    } catch (loadError) {
      if (requestIdRef.current === requestId) {
        setError(loadError instanceof Error ? loadError.message : String(loadError));
      }
    } finally {
      if (requestIdRef.current === requestId) {
        setIsLoading(false);
      }
    }
  }, [search]);

  const loadAllPlayableTracks = useCallback(async (): Promise<LibraryTrack[]> => {
    const library = window.echo?.library;
    if (!selected?.id || !library?.getPlaylistItems) {
      return playableTracks;
    }

    const allItems: LibraryPlaylistItem[] = [];
    for (let nextPage = 1; ; nextPage += 1) {
      const result = await library.getPlaylistItems(selected.id, { page: nextPage, pageSize: 500, search });
      allItems.push(...result.items);
      if (!result.hasMore || result.items.length === 0) {
        break;
      }
    }

    return allItems.map(itemToTrack).filter((track) => !track.unavailable);
  }, [playableTracks, search, selected?.id]);

  useEffect(() => {
    void loadPlaylists();
  }, [loadPlaylists]);

  useEffect(() => {
    const handleChanged = (): void => {
      void loadPlaylists();
      if (selected?.id) {
        void loadItems(selected.id, 1, 'replace');
      }
    };

    window.addEventListener('library:playlists-changed', handleChanged);
    return () => window.removeEventListener('library:playlists-changed', handleChanged);
  }, [loadItems, loadPlaylists, selected?.id]);

  useEffect(() => {
    if (!selected?.id) {
      requestIdRef.current += 1;
      setItemsPage(emptyItemsPage());
      setIsLoading(false);
      return;
    }

    void loadItems(selected.id, 1, 'replace', search);
  }, [loadItems, search, selected?.id]);

  useEffect(() => {
    if (showCreateForm) {
      newPlaylistInputRef.current?.focus();
    }
  }, [showCreateForm]);

  useEffect(() => {
    if (!playlistMenuOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent): void => {
      if (!playlistMenuRef.current?.contains(event.target as Node)) {
        setPlaylistMenuOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        setPlaylistMenuOpen(false);
      }
    };
    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [playlistMenuOpen]);

  const handleCreate = async (): Promise<void> => {
    const name = newName.trim();
    const library = window.echo?.library;
    if (!name || !library?.createPlaylist) return;
    try {
      const created = await library.createPlaylist({ name });
      setNewName('');
      setShowCreateForm(false);
      await loadPlaylists();
      setSelectedId(created.id);
      window.dispatchEvent(new Event('library:playlists-changed'));
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : String(createError));
    }
  };

  const handleGenerateSmartPlaylist = async (): Promise<void> => {
    const library = window.echo?.library;
    if (!library?.createSmartPlaylist) {
      setError(lt('error.smartUnavailable'));
      return;
    }

    setIsGeneratingSmartPlaylist(true);
    setError(null);
    setStatusMessage(lt('status.generatingSmart'));
    try {
      const result = await library.createSmartPlaylist({ limit: 30, recentDays: 180 });
      await loadPlaylists();
      setSelectedId(result.playlist.id);
      setSearchInput('');
      setSearch('');
      await loadItems(result.playlist.id, 1, 'replace', '');
      setStatusMessage(lt('status.generatedSmart', { name: result.playlist.name, count: result.items.length }));
      window.dispatchEvent(new Event('library:playlists-changed'));
    } catch (generateError) {
      setError(generateError instanceof Error ? generateError.message : String(generateError));
      setStatusMessage(null);
    } finally {
      setIsGeneratingSmartPlaylist(false);
    }
  };

  const handleImportPlaylistFile = async (): Promise<void> => {
    const library = window.echo?.library;
    if (!library?.importPlaylistFile) {
      setError(lt('error.importUnavailable'));
      return;
    }

    setIsImportingPlaylistFile(true);
    setError(null);
    setStatusMessage(null);
    try {
      const result = await library.importPlaylistFile();
      if (!result) {
        return;
      }
      await loadPlaylists();
      setSelectedId(result.playlistId);
      setSearchInput('');
      setSearch('');
      await loadItems(result.playlistId, 1, 'replace', '');
      setStatusMessage(lt('status.importedFile', { name: result.playlistName, count: result.importedCount }));
      window.dispatchEvent(new Event('library:playlists-changed'));
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : String(importError));
    } finally {
      setIsImportingPlaylistFile(false);
    }
  };

  const handleRenamePlaylist = async (): Promise<void> => {
    const library = window.echo?.library;
    if (!library?.updatePlaylist || !selected || selected.kind === 'system') {
      return;
    }
    setPlaylistMenuOpen(false);
    const name = window.prompt(lt('prompt.rename'), selected.name)?.trim();
    if (!name || name === selected.name) {
      return;
    }

    try {
      const updated = await library.updatePlaylist({ playlistId: selected.id, name });
      await loadPlaylists();
      setSelectedId(updated.id);
      setStatusMessage(lt('status.renamed'));
      window.dispatchEvent(new Event('library:playlists-changed'));
    } catch (renameError) {
      setError(renameError instanceof Error ? renameError.message : String(renameError));
    }
  };

  const handleUpdatePlaylistSort = async (sortMode: PlaylistSortMode): Promise<void> => {
    const library = window.echo?.library;
    if (!library?.updatePlaylist || !selected || selected.sortMode === sortMode) {
      setPlaylistMenuOpen(false);
      return;
    }

    try {
      setPlaylistMenuOpen(false);
      const updated = await library.updatePlaylist({ playlistId: selected.id, sortMode });
      await loadPlaylists();
      setSelectedId(updated.id);
      setSearchInput('');
      setSearch('');
      await loadItems(updated.id, 1, 'replace', '');
      setStatusMessage(lt('status.sortUpdated'));
      window.dispatchEvent(new Event('library:playlists-changed'));
    } catch (sortError) {
      setError(sortError instanceof Error ? sortError.message : String(sortError));
    }
  };

  const handleExportPlaylist = async (format: PlaylistExportFormat): Promise<void> => {
    const library = window.echo?.library;
    if (!library?.exportPlaylist || !selected) {
      setError(lt('error.exportUnavailable'));
      return;
    }

    try {
      setPlaylistMenuOpen(false);
      const exportedPath = await library.exportPlaylist({ playlistId: selected.id, format, sourceProvider: 'local' });
      if (exportedPath) {
        setStatusMessage(lt('status.exported', { path: exportedPath }));
      }
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : String(exportError));
    }
  };

  const handleChoosePlaylistCover = async (): Promise<void> => {
    const library = window.echo?.library;
    if (!library?.chooseTrackCover || !library.updatePlaylist || !selected) {
      return;
    }

    try {
      const selection = await library.chooseTrackCover();
      if (!selection) {
        return;
      }
      await library.updatePlaylist({ playlistId: selected.id, coverPath: selection.path });
      await loadPlaylists();
      setStatusMessage(lt('status.coverUpdated'));
      window.dispatchEvent(new Event('library:playlists-changed'));
    } catch (coverError) {
      setError(coverError instanceof Error ? coverError.message : String(coverError));
    }
  };

  const handleClearPlaylistCover = async (): Promise<void> => {
    const library = window.echo?.library;
    if (!library?.updatePlaylist || !selected) {
      return;
    }

    try {
      await library.updatePlaylist({ playlistId: selected.id, coverId: null });
      await loadPlaylists();
      setStatusMessage(lt('status.coverReset'));
      window.dispatchEvent(new Event('library:playlists-changed'));
    } catch (coverError) {
      setError(coverError instanceof Error ? coverError.message : String(coverError));
    }
  };

  const handleDelete = async (): Promise<void> => {
    const library = window.echo?.library;
    if (!selected || selected.kind === 'system' || !library?.deletePlaylist || !window.confirm(lt('confirm.delete', { name: selected.name }))) return;
    try {
      await library.deletePlaylist(selected.id);
      await loadPlaylists();
      window.dispatchEvent(new Event('library:playlists-changed'));
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : String(deleteError));
    }
  };

  const handleTrackMenuAction = useCallback(async (
    action: TrackMenuAction,
    track: LibraryTrack,
    playlistTarget?: LibraryPlaylist,
  ): Promise<void> => {
    const library = window.echo?.library;
    setTrackMenu(null);
    if (track.unavailable && action !== 'remove-from-playlist') {
      return;
    }

    try {
      setError(null);
      switch (action) {
        case 'add-to-playlist':
          if (library?.addTrackToPlaylist && playlistTarget) {
            await library.addTrackToPlaylist(playlistTarget.id, track.id);
            setStatusMessage(lt('status.addedToPlaylist', { name: playlistTarget.name }));
            window.dispatchEvent(new Event('library:playlists-changed'));
          }
          return;
        case 'play-next':
          playTrackNext(track, source);
          setStatusMessage(lt('status.queuedNext', { title: track.title }));
          return;
        case 'add-to-queue':
          appendTracksToQueue([track], source);
          setStatusMessage(lt('status.queued', { title: track.title }));
          return;
        case 'toggle-liked':
          if (library?.toggleTrackLiked) {
            await library.toggleTrackLiked(track.id);
            window.dispatchEvent(new Event(likedTracksChangedEvent));
            window.dispatchEvent(new Event(likedChangedEvent));
          }
          return;
        case 'remove-from-playlist':
          if (library?.removePlaylistItem && selected?.id && track.playlistItemId) {
            await library.removePlaylistItem(track.playlistItemId);
            await loadItems(selected.id, 1, 'replace');
            await loadPlaylists();
            setStatusMessage(lt('status.itemRemoved', { title: track.title }));
            window.dispatchEvent(new Event('library:playlists-changed'));
          }
          return;
        case 'show-in-folder':
          await library?.openTrackInFolder?.(track.id);
          return;
        case 'copy-path':
          await library?.copyTrackPath?.(track.id);
          setStatusMessage(lt('status.pathCopied'));
          return;
        case 'open-system':
          await library?.openTrackWithSystem?.(track.id);
          return;
        case 'copy-name-artist':
          await library?.copyTrackNameArtist?.(track.id);
          setStatusMessage(lt('status.nameCopied'));
          return;
        default:
          return;
      }
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : String(actionError));
    }
  }, [appendTracksToQueue, loadItems, loadPlaylists, lt, playTrackNext, selected?.id, source]);

  const handlePlay = async (track: LibraryTrack): Promise<void> => {
    try {
      const allTracks = await loadAllPlayableTracks();
      const target = allTracks.find((item) => item.playlistItemId === track.playlistItemId) ?? track;
      await playTrack(target, { replaceQueueWith: allTracks.length > 0 ? allTracks : playableTracks, source });
    } catch (playError) {
      setError(playError instanceof Error ? playError.message : String(playError));
    }
  };

  const handlePlayAll = async (): Promise<void> => {
    try {
      const allTracks = await loadAllPlayableTracks();
      const firstTrack = allTracks[0];
      if (firstTrack) {
        await playTrack(firstTrack, { replaceQueueWith: allTracks, source });
      }
    } catch (playError) {
      setError(playError instanceof Error ? playError.message : String(playError));
    }
  };

  const handleAddAllToQueue = async (): Promise<void> => {
    try {
      const allTracks = await loadAllPlayableTracks();
      appendTracksToQueue(allTracks, source);
    } catch (queueError) {
      setError(queueError instanceof Error ? queueError.message : String(queueError));
    }
  };

  const handleAddLocalFiles = async (): Promise<void> => {
    const library = window.echo?.library;
    if (!selected || selected.kind === 'system' || !library?.chooseImportFiles || !library.addLocalAudioFilesToPlaylist) {
      setError('本地歌曲导入暂不可用。');
      return;
    }

    setIsAddingLocalFiles(true);
    setError(null);
    setStatusMessage(null);
    try {
      const filePaths = await library.chooseImportFiles();
      if (!filePaths?.length) {
        return;
      }

      const result = await library.addLocalAudioFilesToPlaylist(selected.id, filePaths);
      setSearchInput('');
      setSearch('');
      await loadPlaylists();
      await loadItems(selected.id, 1, 'replace', '');
      window.dispatchEvent(new Event('library:changed'));
      window.dispatchEvent(new Event('library:playlists-changed'));
      setStatusMessage(
        result.addedCount > 0
          ? `已添加 ${result.addedCount} 首本地歌曲${result.skippedCount + result.failedCount > 0 ? `，跳过 ${result.skippedCount + result.failedCount} 个文件` : ''}`
          : '没有找到可添加的本地歌曲。',
      );
    } catch (addError) {
      setError(addError instanceof Error ? addError.message : String(addError));
    } finally {
      setIsAddingLocalFiles(false);
    }
  };

  const isTrackReorderable = useCallback(
    (track: LibraryTrack): boolean => canReorderSelectedPlaylist && Boolean(track.playlistItemId),
    [canReorderSelectedPlaylist],
  );

  const handlePlaylistItemDragStart = useCallback((event: DragEvent<HTMLDivElement>, track: LibraryTrack): void => {
    if (!canReorderSelectedPlaylist || !track.playlistItemId) {
      event.preventDefault();
      return;
    }
    setDraggedPlaylistItemId(track.playlistItemId);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData(playlistItemDragMime, track.playlistItemId);
    event.dataTransfer.setData('text/plain', track.playlistItemId);
  }, [canReorderSelectedPlaylist]);

  const handlePlaylistItemDragOver = useCallback((event: DragEvent<HTMLDivElement>, track: LibraryTrack): void => {
    if (!canReorderSelectedPlaylist || !track.playlistItemId || draggedPlaylistItemId === track.playlistItemId) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    setDropTargetPlaylistItemId(track.playlistItemId);
  }, [canReorderSelectedPlaylist, draggedPlaylistItemId]);

  const handlePlaylistItemDrop = useCallback((event: DragEvent<HTMLDivElement>, targetTrack: LibraryTrack): void => {
    event.preventDefault();
    const library = window.echo?.library;
    const playlist = selected;
    const sourceItemId = draggedPlaylistItemId || event.dataTransfer.getData(playlistItemDragMime) || event.dataTransfer.getData('text/plain');
    const targetItemId = targetTrack.playlistItemId ?? '';
    setDraggedPlaylistItemId(null);
    setDropTargetPlaylistItemId(null);

    if (!canReorderSelectedPlaylist || !library?.movePlaylistItem || !playlist || !sourceItemId || !targetItemId || sourceItemId === targetItemId) {
      return;
    }
    const fromIndex = itemsPage.items.findIndex((item) => item.id === sourceItemId);
    const toIndex = itemsPage.items.findIndex((item) => item.id === targetItemId);
    if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) {
      return;
    }

    setItemsPage((current) => {
      const nextItems = [...current.items];
      const currentFromIndex = nextItems.findIndex((item) => item.id === sourceItemId);
      const currentToIndex = nextItems.findIndex((item) => item.id === targetItemId);
      if (currentFromIndex < 0 || currentToIndex < 0 || currentFromIndex === currentToIndex) {
        return current;
      }
      const [movedItem] = nextItems.splice(currentFromIndex, 1);
      nextItems.splice(Math.max(0, Math.min(currentToIndex, nextItems.length)), 0, movedItem);
      return { ...current, items: nextItems.map((item, index) => ({ ...item, position: index })) };
    });

    void (async () => {
      try {
        await library.movePlaylistItem(playlist.id, sourceItemId, toIndex);
        await loadItems(playlist.id, 1, 'replace', '');
        setStatusMessage(lt('status.itemMoved'));
        window.dispatchEvent(new Event('library:playlists-changed'));
      } catch (moveError) {
        setError(moveError instanceof Error ? moveError.message : String(moveError));
        await loadItems(playlist.id, 1, 'replace', '');
      }
    })();
  }, [canReorderSelectedPlaylist, draggedPlaylistItemId, itemsPage.items, loadItems, lt, selected]);

  const handlePlaylistItemDragEnd = useCallback((): void => {
    setDraggedPlaylistItemId(null);
    setDropTargetPlaylistItemId(null);
  }, []);

  const handleOpenSongs = (): void => {
    window.dispatchEvent(new CustomEvent('app:navigate:route', { detail: 'songs' }));
  };

  const handleLoadMore = (): void => {
    if (!selected?.id || isLoading || !itemsPage.hasMore) {
      return;
    }
    void loadItems(selected.id, itemsPage.page + 1, 'append', search);
  };

  return (
    <div className="playlists-page playlists-page--local-only">
      <aside className="playlist-sidebar" aria-label={t('route.playlists.label')}>
        <div className="playlist-sidebar-header">
          <h1>{t('route.playlists.label')}</h1>
          <button
            className="tool-button"
            type="button"
            aria-label={t('playlistsPage.action.importFile')}
            title={t('playlistsPage.action.importFile')}
            disabled={isImportingPlaylistFile}
            onClick={() => void handleImportPlaylistFile()}
          >
            {isImportingPlaylistFile ? <span aria-hidden="true">…</span> : <FilePlus2 size={17} />}
          </button>
          <button
            className="tool-button"
            type="button"
            aria-label={t('playlistsPage.action.newLocal')}
            title={t('playlistsPage.action.newLocal')}
            onClick={() => setShowCreateForm(true)}
          >
            <Plus size={17} />
          </button>
        </div>

        {showCreateForm ? (
          <form
            className="playlist-create-form"
            onSubmit={(event) => {
              event.preventDefault();
              void handleCreate();
            }}
          >
            <input
              ref={newPlaylistInputRef}
              value={newName}
              aria-label={t('playlistsPage.form.nameAria')}
              placeholder={t('playlistsPage.form.placeholder')}
              onChange={(event) => setNewName(event.target.value)}
            />
            <button className="secondary-action" type="submit" disabled={!newName.trim()}>
              <Plus size={15} />
              <span>{t('playlistsPage.form.create')}</span>
            </button>
            <button
              className="tool-button"
              type="button"
              aria-label={t('playlistsPage.form.cancel')}
              title={t('playlistsPage.form.cancel')}
              onClick={() => {
                setShowCreateForm(false);
                setNewName('');
              }}
            >
              <X size={15} />
            </button>
          </form>
        ) : null}

        <div className="playlist-sidebar-panel">
          <button
            className="playlist-smart-generate"
            type="button"
            disabled={isGeneratingSmartPlaylist}
            onClick={() => void handleGenerateSmartPlaylist()}
          >
            {isGeneratingSmartPlaylist ? <span aria-hidden="true">…</span> : <ListPlus size={16} />}
            <span>
              <strong>{lt('smart.title')}</strong>
              <small>{lt('smart.subtitle')}</small>
            </span>
          </button>
          <div className="playlist-list">
            {playlists.map((playlist) => (
              <button
                className="playlist-list-item"
                data-active={playlist.id === selected?.id ? 'true' : undefined}
                key={playlist.id}
                type="button"
                onClick={() => setSelectedId(playlist.id)}
              >
                <ListMusic className="playlist-list-drag-handle" size={15} aria-hidden="true" />
                <span>
                  <strong><span>{playlist.name}</span></strong>
                  <small>{t('albumMenu.playlistSubmenu.itemCount', { count: playlist.itemCount })}</small>
                </span>
              </button>
            ))}
            {playlists.length === 0 ? <p className="playlist-empty">{t('playlistsPage.empty.local')}</p> : null}
          </div>
        </div>
      </aside>

      <section className="playlist-detail">
        {selected ? (
          <div className="playlist-detail-panel">
            <header className="playlist-detail-header" data-has-art={selected.coverThumb ? 'true' : undefined}>
              {selected.coverThumb ? (
                <div className="playlist-detail-hero-art" aria-hidden="true">
                  <img alt="" draggable={false} src={selected.coverThumb} />
                </div>
              ) : null}
              <div className="playlist-cover" data-empty={!selected.coverThumb}>
                {selected.coverThumb ? <img alt="" src={selected.coverThumb} /> : <Music2 size={34} />}
                <button
                  className="playlist-cover-button"
                  type="button"
                  aria-label={lt('action.changeCover')}
                  title={lt('action.changeCover')}
                  onClick={() => void handleChoosePlaylistCover()}
                >
                  <Plus size={16} />
                </button>
                {selected.coverId ? (
                  <button
                    className="playlist-cover-reset"
                    type="button"
                    aria-label={lt('action.resetCover')}
                    title={lt('action.resetCover')}
                    onClick={() => void handleClearPlaylistCover()}
                  >
                    <X size={16} />
                  </button>
                ) : null}
              </div>
              <div className="playlist-detail-copy">
                <h2>{selected.name}</h2>
                <p>{selected.description || 'Manual local playlist'}</p>
                <small>{t('albumMenu.playlistSubmenu.itemCount', { count: itemsPage.total })}</small>
              </div>
              <div className="playlist-actions">
                <form
                  className="playlist-search echo-search-surface"
                  role="search"
                  onSubmit={(event) => {
                    event.preventDefault();
                    setSearch(searchInput.trim());
                  }}
                >
                  <Search size={15} aria-hidden="true" />
                  <input
                    aria-label="搜索歌单歌曲"
                    placeholder="搜索歌单歌曲"
                    value={searchInput}
                    onChange={(event) => setSearchInput(event.target.value)}
                  />
                  {searchInput ? (
                    <EchoSearchFieldTools
                      clearLabel={t('common.search.clear')}
                      count={search ? itemsPage.total : null}
                      onClear={() => {
                        setSearchInput('');
                        setSearch('');
                      }}
                    />
                  ) : null}
                </form>
                <button className="primary-action" type="button" disabled={itemsPage.total === 0} onClick={() => void handlePlayAll()}>
                  <Play size={16} />
                  <span>播放歌单</span>
                </button>
                <button className="secondary-action" type="button" disabled={itemsPage.total === 0} onClick={() => void handleAddAllToQueue()}>
                  <ListPlus size={16} />
                  <span>添加到队列</span>
                </button>
                {!isSelectedPlaylistProtected ? (
                  <button className="secondary-action" type="button" disabled={isAddingLocalFiles} onClick={() => void handleAddLocalFiles()}>
                    <FilePlus2 size={16} />
                    <span>{isAddingLocalFiles ? lt('action.addingLocalFiles') : lt('action.addLocalFiles')}</span>
                  </button>
                ) : null}
                <div className="playlist-menu-wrap" ref={playlistMenuRef}>
                  <button
                    className="tool-button"
                    type="button"
                    aria-label={lt('menu.aria')}
                    aria-haspopup="menu"
                    aria-expanded={playlistMenuOpen}
                    title={lt('menu.aria')}
                    onClick={() => setPlaylistMenuOpen((current) => !current)}
                  >
                    <span aria-hidden="true">•••</span>
                  </button>
                  {playlistMenuOpen ? (
                    <div className="playlist-action-menu" role="menu" aria-label={lt('menu.aria')}>
                      {!isSelectedPlaylistProtected ? (
                        <button className="playlist-action-menu-item" type="button" role="menuitem" onClick={() => void handleRenamePlaylist()}>
                          <span aria-hidden="true">✎</span>
                          <span>{lt('menu.rename')}</span>
                        </button>
                      ) : null}
                      <div className="playlist-action-menu-section" role="presentation">
                        <span>{lt('menu.sort')}</span>
                        {playlistSortOptions.map((option) => (
                          <button
                            className="playlist-action-menu-item playlist-action-menu-item--checkable"
                            type="button"
                            role="menuitemradio"
                            aria-checked={selected.sortMode === option.value}
                            key={option.value}
                            onClick={() => void handleUpdatePlaylistSort(option.value)}
                          >
                            <span>{lt(option.labelKey)}</span>
                            {selected.sortMode === option.value ? <span aria-hidden="true">✓</span> : null}
                          </button>
                        ))}
                      </div>
                      <div className="playlist-action-menu-section" role="presentation">
                        <span>{lt('menu.export')}</span>
                        {playlistExportOptions.map((option) => (
                          <button
                            className="playlist-action-menu-item"
                            type="button"
                            role="menuitem"
                            key={option.value}
                            onClick={() => void handleExportPlaylist(option.value)}
                          >
                            <ArrowRight size={14} />
                            <span>{option.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
                {selected.kind !== 'system' ? (
                  <button className="tool-button danger" type="button" aria-label="删除歌单" title="删除歌单" onClick={() => void handleDelete()}>
                    <Trash2 size={17} />
                  </button>
                ) : null}
              </div>
            </header>
            {!isLoading && !error && itemsPage.total === 0 ? (
              <div className="playlist-empty-guide" data-kind={search ? 'search' : selected.kind === 'system' ? 'system' : 'manual'}>
                <div className="playlist-empty-guide-icon" aria-hidden="true">
                  {search ? <Search size={30} /> : <Music2 size={32} />}
                </div>
                <div className="playlist-empty-guide-copy">
                  <span>{search ? '没有搜索结果' : selected.kind === 'system' ? '等待你的收藏' : '等待第一首歌'}</span>
                  <h3>{search ? '没有找到匹配的歌曲' : selected.kind === 'system' ? '这里还没有收藏歌曲' : '让这个歌单开始播放'}</h3>
                  <p>
                    {search
                      ? '换个关键词试试，或清除搜索查看这个歌单里的全部歌曲。'
                      : selected.kind === 'system'
                        ? '前往歌曲库收藏喜欢的歌曲，它们会自动出现在这里。'
                        : '直接选择本地音频，或前往歌曲库继续挑选并加入这个歌单。'}
                  </p>
                </div>
                <div className="playlist-empty-guide-actions">
                  {search ? (
                    <button
                      className="primary-action"
                      type="button"
                      onClick={() => {
                        setSearchInput('');
                        setSearch('');
                      }}
                    >
                      <X size={16} />
                      <span>清除搜索</span>
                    </button>
                  ) : selected.kind !== 'system' ? (
                    <button className="primary-action" type="button" disabled={isAddingLocalFiles} onClick={() => void handleAddLocalFiles()}>
                      <FilePlus2 size={16} />
                      <span>{isAddingLocalFiles ? '添加中' : '添加本地歌曲'}</span>
                    </button>
                  ) : null}
                  <button className="secondary-action" type="button" onClick={handleOpenSongs}>
                    <span>去歌曲库挑选</span>
                    <ArrowRight size={16} />
                  </button>
                </div>
                {!search && selected.kind !== 'system' ? (
                  <div className="playlist-empty-guide-note">
                    <ListMusic size={15} aria-hidden="true" />
                    <span>之后也可以在歌曲菜单中继续添加到歌单</span>
                  </div>
                ) : null}
              </div>
            ) : (
              <TrackList
                tracks={tracks}
                currentTrackId={currentTrackId}
                canLoadMore={itemsPage.hasMore && !isLoading}
                totalCount={itemsPage.total}
                loadedCount={tracks.length}
                isLoadingMore={isLoading}
                onEndReached={handleLoadMore}
                onPlay={(track) => void handlePlay(track)}
                onAddToQueue={(track) => appendTracksToQueue([track], source)}
                likedTrackIds={likedTrackIds}
                onToggleLiked={(track) => void handleTrackMenuAction('toggle-liked', track)}
                onOpenTrackMenu={(track, position) => setTrackMenu({ track, position })}
                isTrackDraggable={isTrackReorderable}
                draggedTrackId={draggedPlaylistItemId}
                dropTargetTrackId={dropTargetPlaylistItemId}
                onTrackDragStart={handlePlaylistItemDragStart}
                onTrackDragOver={handlePlaylistItemDragOver}
                onTrackDrop={handlePlaylistItemDrop}
                onTrackDragEnd={handlePlaylistItemDragEnd}
              />
            )}
          </div>
        ) : (
          <div className="playlist-detail-panel playlist-detail-panel--empty">
            <div className="playlist-start">
              <Music2 size={36} />
              <strong>{t('playlistsPage.empty.createFirst')}</strong>
              <button className="primary-action" type="button" onClick={() => setShowCreateForm(true)}>
                <Plus size={16} />
                <span>{t('playlistsPage.empty.create')}</span>
              </button>
            </div>
          </div>
        )}

        {error || statusMessage || isLoading ? (
          <div className="list-footer" role={error ? 'alert' : 'status'}>
            <span>{error ?? statusMessage ?? t('playlistsPage.status.loading')}</span>
          </div>
        ) : null}

        {trackMenu ? (
          <Suspense fallback={null}>
            <TrackContextMenu
              track={trackMenu.track}
              position={trackMenu.position}
              liked={likedTrackIds[trackMenu.track.id] === true}
              enabledActions={playlistTrackMenuActions}
              showRemoveFromPlaylist={!isSelectedPlaylistProtected && Boolean(trackMenu.track.playlistItemId)}
              onAction={(action, track, playlist) => void handleTrackMenuAction(action, track, playlist)}
              onClose={() => setTrackMenu(null)}
            />
          </Suspense>
        ) : null}
      </section>
    </div>
  );
};
