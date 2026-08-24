import { lazy } from 'react';
import { Disc3, Inbox, MessagesSquare, PackageOpen, Blocks, type LucideIcon } from 'lucide-react';
import { HomePage } from '../pages/HomePage';
import {
  EchoAlbumsIcon,
  EchoArtistsIcon,
  EchoAudioSettingsIcon,
  EchoConnectIcon,
  EchoDspIcon,
  EchoFoldersIcon,
  EchoGenresIcon,
  EchoHistoryIcon,
  EchoHomeIcon,
  EchoImportFileIcon,
  EchoImportFolderIcon,
  EchoLikedIcon,
  EchoLyricsSettingsIcon,
  EchoPlaylistsIcon,
  EchoQueueIcon,
  EchoRemoteIcon,
  EchoSettingsIcon,
  EchoSongsIcon,
} from '../components/layout/NavIcons';
import { EmptyState } from '../components/ui/EmptyState';
import type { TranslationKey } from '../i18n/locales';
import type { SidebarRouteId } from '../../shared/types/sidebar';

export type AppRouteId = SidebarRouteId | 'lyrics' | `plugin:${string}`;
export const pendingAppRouteStorageKey = 'echo.pending-route';
const proOnlyAppRouteIds = new Set<AppRouteId>(['remote', 'connect', 'dsp']);

export const isProOnlyAppRouteId = (routeId: AppRouteId): boolean => proOnlyAppRouteIds.has(routeId);

const pageLoaders = {
  albums: () => import('../pages/AlbumsPage'),
  artists: () => import('../pages/ArtistsPage'),
  genres: () => import('../pages/GenresPage'),
  'audio-cd': () => import('../pages/AudioCdPage'),
  connect: () => import('../pages/ConnectPage'),
  dsp: () => import('../pages/DspPage'),
  history: () => import('../pages/HistoryPage'),
  'import-folder': () => import('../pages/ImportFolderPage'),
  inbox: () => import('../pages/InboxPage'),
  settings: () => import('../pages/SettingsRoute'),
  folders: () => import('../pages/FoldersPage'),
  playlists: () => import('../pages/SteamPlaylistsPage'),
  queue: () => import('../pages/QueuePage'),
  songs: () => import('../pages/SongsPage'),
  lyrics: () => import('../pages/LyricsPage'),
  liked: () => import('../pages/LikedPage'),
  remote: () => import('../components/settings/RemoteSourcesPanel'),
  community: () => import('../pages/CommunityPage'),
  workshop: () => import('../pages/WorkshopPage'),
  mods: () => import('../pages/ModsPage'),
} satisfies Partial<Record<AppRouteId, () => Promise<unknown>>>;

export const preloadAppRoute = async (routeId: AppRouteId): Promise<void> => {
  const loader = pageLoaders[routeId as keyof typeof pageLoaders];
  const preloadContent = routeId === 'settings' ? import('../pages/SettingsPage') : Promise.resolve();
  await Promise.all([loader?.(), preloadContent]).then(() => undefined).catch(() => undefined);
};

export const preloadPendingAppRoute = async (): Promise<void> => {
  try {
    const pendingRouteId = window.localStorage.getItem(pendingAppRouteStorageKey) as AppRouteId | null;
    const proUnlocked = pendingRouteId && isProOnlyAppRouteId(pendingRouteId)
      ? (await window.echo?.app?.getEchoProLocalEntitlementStatus?.()?.catch(() => null))?.unlocked === true
      : true;
    if (pendingRouteId && proUnlocked) {
      await preloadAppRoute(pendingRouteId);
    }
  } catch {
    // localStorage and route preloading are both best-effort during startup.
  }
};

const AlbumsPage = lazy(() => pageLoaders.albums().then((module) => ({ default: module.AlbumsPage })));
const ArtistsPage = lazy(() => pageLoaders.artists().then((module) => ({ default: module.ArtistsPage })));
const GenresPage = lazy(() => pageLoaders.genres().then((module) => ({ default: module.GenresPage })));
const AudioCdPage = lazy(() => pageLoaders['audio-cd']().then((module) => ({ default: module.AudioCdPage })));
const ConnectPage = lazy(() => pageLoaders.connect().then((module) => ({ default: module.ConnectPage })));
const DspPage = lazy(() => pageLoaders.dsp().then((module) => ({ default: module.DspPage })));
const HistoryPage = lazy(() => pageLoaders.history().then((module) => ({ default: module.HistoryPage })));
const ImportFolderPage = lazy(() => pageLoaders['import-folder']().then((module) => ({ default: module.ImportFolderPage })));
const InboxPage = lazy(() => pageLoaders.inbox().then((module) => ({ default: module.InboxPage })));
const SettingsPage = lazy(() => pageLoaders.settings().then((module) => ({ default: module.SettingsRoute })));
const FoldersPage = lazy(() => pageLoaders.folders().then((module) => ({ default: module.FoldersPage })));
const PlaylistsPage = lazy(() => pageLoaders.playlists().then((module) => ({ default: module.SteamPlaylistsPage })));
const QueuePage = lazy(() => pageLoaders.queue().then((module) => ({ default: module.QueuePage })));
const SongsPage = lazy(() => pageLoaders.songs().then((module) => ({ default: module.SongsPage })));
const LyricsPage = lazy(() => pageLoaders.lyrics().then((module) => ({ default: module.LyricsPage })));
const LikedPage = lazy(() => pageLoaders.liked().then((module) => ({ default: module.LikedPage })));
const RemoteSourcesPanel = lazy(() => pageLoaders.remote().then((module) => ({ default: module.RemoteSourcesPanel })));
const CommunityPage = lazy(() => pageLoaders.community().then((module) => ({ default: module.CommunityPage })));
const WorkshopPage = lazy(() => pageLoaders.workshop().then((module) => ({ default: module.WorkshopPage })));
const ModsPage = lazy(() => pageLoaders.mods().then((module) => ({ default: module.ModsPage })));

export type AppRoute = {
  id: AppRouteId;
  label: string;
  labelKey?: TranslationKey;
  description: string;
  descriptionKey?: TranslationKey;
  icon: LucideIcon;
  placement: 'main' | 'utility';
  chrome?: 'shell' | 'standalone';
  hideFromSidebar?: boolean;
  prepareBeforeNavigation?: () => Promise<void>;
  element: JSX.Element;
};

const PlaceholderPage = ({
  icon,
  title,
  description,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
}): JSX.Element => (
  <div className="page-stack">
    <EmptyState icon={icon} title={title} description={description} meta="This view still uses the shared ECHO shell." />
  </div>
);

export const appRoutes: AppRoute[] = [
  {
    id: 'home',
    label: 'Home',
    labelKey: 'route.home.label',
    description: 'Library overview and recent listening.',
    descriptionKey: 'route.home.description',
    icon: EchoHomeIcon,
    placement: 'main',
    element: <HomePage />,
  },
  {
    id: 'songs',
    label: 'Songs',
    labelKey: 'route.songs.label',
    description: 'Local library song list.',
    descriptionKey: 'route.songs.description',
    icon: EchoSongsIcon,
    placement: 'main',
    element: <SongsPage />,
  },
  {
    id: 'lyrics',
    label: 'Lyrics',
    labelKey: 'route.lyrics.label',
    description: 'Lyrics and immersive playback.',
    descriptionKey: 'route.lyrics.description',
    icon: EchoLyricsSettingsIcon,
    placement: 'main',
    chrome: 'standalone',
    // The standalone lyrics page is still reachable from the player controls; avoid a duplicate sidebar entry beside Lyrics Settings.
    hideFromSidebar: true,
    // Lyrics owns several page-specific style chunks. Load them before the
    // shell switches to its floating player layout so the footer never paints
    // in a half-initialized full-width state.
    prepareBeforeNavigation: () => preloadAppRoute('lyrics'),
    element: <LyricsPage />,
  },
  {
    id: 'albums',
    label: 'Albums',
    labelKey: 'route.albums.label',
    description: 'Grouped album wall.',
    descriptionKey: 'route.albums.description',
    icon: EchoAlbumsIcon,
    placement: 'main',
    element: <AlbumsPage />,
  },
  {
    id: 'artists',
    label: 'Artists',
    labelKey: 'route.artists.label',
    description: 'Browse by artist.',
    descriptionKey: 'route.artists.description',
    icon: EchoArtistsIcon,
    placement: 'main',
    element: <ArtistsPage />,
  },
  {
    id: 'genres',
    label: 'Genres',
    labelKey: 'route.genres.label',
    description: 'Browse by embedded genre tags.',
    descriptionKey: 'route.genres.description',
    icon: EchoGenresIcon,
    placement: 'main',
    element: <GenresPage />,
  },
  {
    id: 'folders',
    label: 'Folders',
    labelKey: 'route.folders.label',
    description: 'Local import roots.',
    descriptionKey: 'route.folders.description',
    icon: EchoFoldersIcon,
    placement: 'main',
    element: <FoldersPage />,
  },
  {
    id: 'audio-cd',
    label: 'Audio CD',
    labelKey: 'route.audioCd.label',
    description: 'Direct Audio CD playback.',
    descriptionKey: 'route.audioCd.description',
    icon: Disc3,
    placement: 'main',
    element: <AudioCdPage />,
  },
  {
    id: 'remote',
    label: 'Cloud / Remote',
    labelKey: 'route.remote.label',
    description: 'Remote sources.',
    descriptionKey: 'route.remote.description',
    icon: EchoRemoteIcon,
    placement: 'main',
    element: <RemoteSourcesPanel />,
  },
  {
    id: 'connect',
    label: 'Connect',
    labelKey: 'route.connect.label',
    description: 'DLNA and AirPlay wireless playback.',
    descriptionKey: 'route.connect.description',
    icon: EchoConnectIcon,
    placement: 'main',
    element: <ConnectPage />,
  },
  {
    id: 'community',
    label: 'Community',
    labelKey: 'route.community.label',
    description: 'Discover creations, join discussions, and stay in touch with ECHO listeners.',
    descriptionKey: 'route.community.description',
    icon: MessagesSquare,
    placement: 'main',
    element: <CommunityPage />,
  },
  {
    id: 'workshop',
    label: 'Workshop',
    labelKey: 'route.workshop.label',
    description: 'Manage Steam Workshop subscriptions, verification, and enablement.',
    descriptionKey: 'route.workshop.description',
    icon: PackageOpen,
    placement: 'main',
    element: <WorkshopPage />,
  },
  {
    id: 'dsp',
    label: 'DSP',
    labelKey: 'route.dsp.label',
    description: 'Signal-chain tuning workbench.',
    descriptionKey: 'route.dsp.description',
    icon: EchoDspIcon,
    placement: 'main',
    element: <DspPage />,
  },
  {
    id: 'queue',
    label: 'Queue',
    labelKey: 'route.queue.label',
    description: 'Playback queue.',
    descriptionKey: 'route.queue.description',
    icon: EchoQueueIcon,
    placement: 'main',
    element: <QueuePage />,
  },
  {
    id: 'history',
    label: 'History',
    labelKey: 'route.history.label',
    description: 'Playback history.',
    descriptionKey: 'route.history.description',
    icon: EchoHistoryIcon,
    placement: 'main',
    element: <HistoryPage />,
  },
  {
    id: 'playlists',
    label: 'Playlists',
    labelKey: 'route.playlists.label',
    description: 'User playlists.',
    descriptionKey: 'route.playlists.description',
    icon: EchoPlaylistsIcon,
    placement: 'main',
    element: <PlaylistsPage />,
  },
  {
    id: 'inbox',
    label: 'Inbox',
    labelKey: 'route.inbox.label',
    description: 'New tracks from each scan.',
    descriptionKey: 'route.inbox.description',
    icon: Inbox,
    placement: 'main',
    element: <InboxPage />,
  },
  {
    id: 'liked',
    label: 'Liked',
    labelKey: 'route.liked.label',
    description: 'Saved tracks.',
    descriptionKey: 'route.liked.description',
    icon: EchoLikedIcon,
    placement: 'utility',
    element: <LikedPage />,
  },
  {
    id: 'settings',
    label: 'Settings',
    labelKey: 'route.settings.label',
    description: 'Application settings.',
    descriptionKey: 'route.settings.description',
    icon: EchoSettingsIcon,
    placement: 'utility',
    element: <SettingsPage />,
  },
  {
    id: 'mods',
    label: 'Mods',
    description: 'Manage external ECHOSteam mods.',
    icon: Blocks,
    placement: 'utility',
    element: <ModsPage />,
  },
  {
    id: 'audio-settings',
    label: 'Audio Settings',
    labelKey: 'route.audioSettings.label',
    description: 'Output and decoder settings.',
    descriptionKey: 'route.audioSettings.description',
    icon: EchoAudioSettingsIcon,
    placement: 'utility',
    element: <PlaceholderPage icon={EchoAudioSettingsIcon} title="Audio Settings" description="Output device, sample rate, and decoder options live here." />,
  },
  {
    id: 'lyrics-settings',
    label: 'Lyrics Settings',
    labelKey: 'route.lyricsSettings.label',
    description: 'Lyrics preferences.',
    descriptionKey: 'route.lyricsSettings.description',
    icon: EchoLyricsSettingsIcon,
    placement: 'utility',
    element: <PlaceholderPage icon={EchoLyricsSettingsIcon} title="Lyrics Settings" description="Lyrics sources and timing settings are stored here." />,
  },
  {
    id: 'import-folder',
    label: 'Import Folder',
    labelKey: 'route.importFolder.label',
    description: 'Choose a local music folder.',
    descriptionKey: 'route.importFolder.description',
    icon: EchoImportFolderIcon,
    placement: 'utility',
    element: <ImportFolderPage />,
  },
  {
    id: 'import-file',
    label: 'Import File',
    labelKey: 'route.importFile.label',
    description: 'Import a single audio file.',
    descriptionKey: 'route.importFile.description',
    icon: EchoImportFileIcon,
    placement: 'utility',
    element: <PlaceholderPage icon={EchoImportFileIcon} title="Import File" description="Single-file import will reuse the same metadata pipeline." />,
  },
];
