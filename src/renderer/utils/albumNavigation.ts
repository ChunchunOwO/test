import type { LibraryAlbum, LibraryTrack } from '../../shared/types/library';
import { translateStatic } from '../i18n/translateStatic';

export const albumDetailNavigationEvent = 'app:navigate:album-detail';
export const restoreHomeScrollEvent = 'app:restore-home-scroll';

export const detailReturnTargets = [
  'albums',
  'artists',
  'folders',
  'genres',
  'history',
  'home',
  'liked',
  'lyrics',
  'playlists',
  'queue',
  'songs',
] as const;

export type DetailReturnTarget = (typeof detailReturnTargets)[number];

export const isDetailReturnTarget = (value: string | null | undefined): value is DetailReturnTarget =>
  Boolean(value && (detailReturnTargets as readonly string[]).includes(value));

export const readActiveDetailReturnTarget = (): DetailReturnTarget | undefined => {
  const routeId = document.querySelector<HTMLElement>('.page-surface[data-route-id]:not([hidden])')?.dataset.routeId;
  return isDetailReturnTarget(routeId) ? routeId : undefined;
};

export const dispatchDetailReturnNavigation = (returnTo: DetailReturnTarget | null | undefined): boolean => {
  if (!returnTo) {
    return false;
  }

  if (returnTo === 'songs') {
    window.dispatchEvent(new Event('app:navigate:songs'));
  } else {
    window.dispatchEvent(new CustomEvent('app:navigate:route', { detail: returnTo }));
  }

  if (returnTo === 'home') {
    window.requestAnimationFrame(() => window.dispatchEvent(new Event(restoreHomeScrollEvent)));
  }

  return true;
};

export type AlbumDetailNavigationRequest = {
  album: LibraryAlbum;
  returnTo?: DetailReturnTarget;
};

let pendingAlbumDetail: AlbumDetailNavigationRequest | null = null;

export const requestAlbumDetailNavigation = (album: LibraryAlbum, options: { returnTo?: DetailReturnTarget } = {}): void => {
  const request = { album, returnTo: options.returnTo };
  pendingAlbumDetail = request;
  window.dispatchEvent(new CustomEvent<AlbumDetailNavigationRequest>(albumDetailNavigationEvent, { detail: request }));
};

export const consumePendingAlbumDetailNavigation = (): AlbumDetailNavigationRequest | null => {
  const request = pendingAlbumDetail;
  pendingAlbumDetail = null;
  return request;
};

export const peekPendingAlbumDetailNavigation = (): AlbumDetailNavigationRequest | null => pendingAlbumDetail;

const normalizeAlbumText = (value: string | null | undefined): string =>
  (value ?? '').trim().toLocaleLowerCase().replace(/\s+/g, ' ');

const isSameAlbumCandidate = (candidate: LibraryAlbum, album: LibraryAlbum): boolean => {
  if (album.mediaType && candidate.mediaType && candidate.mediaType !== album.mediaType) {
    return false;
  }

  if (album.sourceId && candidate.sourceId && candidate.sourceId !== album.sourceId) {
    return false;
  }

  const sameTitle = normalizeAlbumText(candidate.title) === normalizeAlbumText(album.title);
  const sameArtist = normalizeAlbumText(candidate.albumArtist) === normalizeAlbumText(album.albumArtist);
  const sameYear = candidate.year === album.year || !candidate.year || !album.year;

  return sameTitle && sameArtist && sameYear;
};

const albumCoverIdentity = (album: LibraryAlbum): string =>
  album.coverId?.trim() || album.coverThumb?.trim() || '';

const isSameAlbumArtworkCandidate = (candidate: LibraryAlbum, album: LibraryAlbum): boolean => {
  if (album.mediaType && candidate.mediaType && candidate.mediaType !== album.mediaType) {
    return false;
  }

  if (album.sourceId && candidate.sourceId && candidate.sourceId !== album.sourceId) {
    return false;
  }

  const sameTitle = normalizeAlbumText(candidate.title) === normalizeAlbumText(album.title);
  const sameYear = candidate.year === album.year || !candidate.year || !album.year;
  const candidateCover = albumCoverIdentity(candidate);
  const albumCover = albumCoverIdentity(album);

  return sameTitle && sameYear && candidateCover.length > 0 && candidateCover === albumCover;
};

const isSameAlbumTitleCandidate = (candidate: LibraryAlbum, album: LibraryAlbum): boolean => {
  if (album.mediaType && candidate.mediaType && candidate.mediaType !== album.mediaType) {
    return false;
  }

  if (album.sourceId && candidate.sourceId && candidate.sourceId !== album.sourceId) {
    return false;
  }

  const sameTitle = normalizeAlbumText(candidate.title) === normalizeAlbumText(album.title);
  const sameYear = candidate.year === album.year || !candidate.year || !album.year;

  return sameTitle && sameYear;
};

const hasReadableAlbumTracks = async (
  library: NonNullable<NonNullable<Window['echo']>['library']>,
  candidate: LibraryAlbum,
  requestedAlbum: LibraryAlbum,
): Promise<boolean> => {
  const expectedTrackCount = Math.max(candidate.trackCount, requestedAlbum.trackCount);
  if (!library.getAlbumTracks || expectedTrackCount <= 0) {
    return true;
  }

  try {
    const result = await library.getAlbumTracks(candidate.id, { page: 1, pageSize: 1 });
    return result.total > 0 || result.items.length > 0;
  } catch {
    return true;
  }
};

const findReadableAlbumCandidate = async (
  library: NonNullable<NonNullable<Window['echo']>['library']>,
  album: LibraryAlbum,
  candidates: LibraryAlbum[],
): Promise<LibraryAlbum | null> => {
  const orderedCandidates: LibraryAlbum[] = [];
  const seenIds = new Set<string>();
  const pushCandidate = (candidate: LibraryAlbum | undefined): void => {
    if (candidate && !seenIds.has(candidate.id)) {
      seenIds.add(candidate.id);
      orderedCandidates.push(candidate);
    }
  };

  pushCandidate(candidates.find((candidate) => candidate.albumKey === album.albumKey));
  candidates.filter((candidate) => isSameAlbumCandidate(candidate, album)).forEach(pushCandidate);
  candidates.filter((candidate) => isSameAlbumArtworkCandidate(candidate, album)).forEach(pushCandidate);

  for (const candidate of orderedCandidates.slice(0, 5)) {
    if (await hasReadableAlbumTracks(library, candidate, album)) {
      return candidate;
    }
  }

  const titleMatches = candidates.filter((candidate) => isSameAlbumTitleCandidate(candidate, album)).slice(0, 5);
  const readableTitleMatches: LibraryAlbum[] = [];
  for (const candidate of titleMatches) {
    if (seenIds.has(candidate.id)) {
      continue;
    }
    if (await hasReadableAlbumTracks(library, candidate, album)) {
      readableTitleMatches.push(candidate);
    }
  }

  if (readableTitleMatches.length === 1) {
    return readableTitleMatches[0]!;
  }

  return null;
};

export const resolveAlbumDetailNavigationTarget = async (album: LibraryAlbum): Promise<LibraryAlbum> => {
  if (
    album.mediaType === 'remote' &&
    album.id.startsWith('remote-album:') &&
    (album.provider === 'subsonic' || album.provider === 'jellyfin' || album.provider === 'emby')
  ) {
    return album;
  }

  const library = window.echo?.library;

  if (!library) {
    return album;
  }

  try {
    const currentAlbum = await library.getAlbum?.(album.id);
    if (currentAlbum && await hasReadableAlbumTracks(library, currentAlbum, album)) {
      return currentAlbum;
    }
  } catch {
    // Fall through to a bounded search so stale cached album ids can recover.
  }

  if (!library.getAlbums) {
    return album;
  }

  const search = album.title.trim() || album.albumArtist.trim();
  if (!search) {
    return album;
  }

  try {
    const result = await library.getAlbums({ page: 1, pageSize: 50, search });
    const readableMatch = await findReadableAlbumCandidate(library, album, result.items);
    if (readableMatch) {
      return readableMatch;
    }
  } catch {
    return album;
  }

  return album;
};

export const openAlbumDetail = async (album: LibraryAlbum, options: { returnTo?: DetailReturnTarget } = {}): Promise<LibraryAlbum> => {
  const resolvedAlbum = await resolveAlbumDetailNavigationTarget(album);
  requestAlbumDetailNavigation(resolvedAlbum, options);
  return resolvedAlbum;
};

export const openAlbumDetailForTrack = async (track: LibraryTrack, options: { returnTo?: DetailReturnTarget } = {}): Promise<LibraryAlbum | null> => {
  const library = window.echo?.library;

  if (!library?.getAlbumForTrack) {
    throw new Error(translateStatic('error.bridge.locateAlbum'));
  }

  const album = await library.getAlbumForTrack(track.id);

  if (album) {
    const resolvedAlbum = await resolveAlbumDetailNavigationTarget(album);
    requestAlbumDetailNavigation(resolvedAlbum, options);
    return resolvedAlbum;
  }

  return album;
};
