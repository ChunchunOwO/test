import { createHash } from 'node:crypto';
import { normalizeAlbumTitleForLooseMerge } from './AlbumService';

export type AlbumGroupingIdentity = {
  albumKey: string;
  trackIds: ReadonlySet<string>;
};

export type PreviousAlbumGroupingIdentity = AlbumGroupingIdentity & {
  id: string;
};

export type LooseAlbumGroupingCandidate = {
  albumKey: string;
  title: string;
  coverMatchKey: string | null;
};

export const coverBackedLooseAlbumKey = (title: string, coverMatchKey: string): string =>
  createHash('sha1')
    .update(`loose-cover\u0000${normalizeAlbumTitleForLooseMerge(title)}\u0000${coverMatchKey}`)
    .digest('hex');

const isKnownAlbumTitle = (value: string): boolean => value.length > 0 && value !== 'unknown album';
export const isKnownLooseAlbumTitle = (value: string): boolean =>
  isKnownAlbumTitle(normalizeAlbumTitleForLooseMerge(value));

export const albumTitleSimilarity = (left: string, right: string): number => {
  const a = normalizeAlbumTitleForLooseMerge(left);
  const b = normalizeAlbumTitleForLooseMerge(right);
  if (!isKnownAlbumTitle(a) || !isKnownAlbumTitle(b)) return 0;
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;

  const grams = new Map<string, number>();
  for (let index = 0; index < a.length - 1; index += 1) {
    const gram = a.slice(index, index + 2);
    grams.set(gram, (grams.get(gram) ?? 0) + 1);
  }

  let matches = 0;
  for (let index = 0; index < b.length - 1; index += 1) {
    const gram = b.slice(index, index + 2);
    const count = grams.get(gram) ?? 0;
    if (count > 0) {
      matches += 1;
      grams.set(gram, count - 1);
    }
  }
  return (2 * matches) / (a.length + b.length - 2);
};

export const makeCoverBackedLooseAlbumKeys = (
  candidates: readonly LooseAlbumGroupingCandidate[],
  createKey: (candidate: LooseAlbumGroupingCandidate) => string,
): Map<string, string> => {
  const result = new Map<string, string>();
  const clusters: Array<{ albumKey: string; title: string; coverMatchKey: string }> = [];

  for (const candidate of candidates) {
    const normalizedTitle = normalizeAlbumTitleForLooseMerge(candidate.title);
    const matching =
      candidate.coverMatchKey && isKnownAlbumTitle(normalizedTitle)
        ? clusters.find(
            (cluster) =>
              cluster.coverMatchKey === candidate.coverMatchKey && albumTitleSimilarity(candidate.title, cluster.title) >= 0.9,
          )
        : undefined;
    const albumKey = matching?.albumKey ?? createKey(candidate);
    result.set(candidate.albumKey, albumKey);
    if (!matching && candidate.coverMatchKey && isKnownAlbumTitle(normalizedTitle)) {
      clusters.push({ albumKey, title: candidate.title, coverMatchKey: candidate.coverMatchKey });
    }
  }
  return result;
};

const intersectionSize = (left: ReadonlySet<string>, right: ReadonlySet<string>): number => {
  let count = 0;
  const [smaller, larger] = left.size <= right.size ? [left, right] : [right, left];
  for (const value of smaller) if (larger.has(value)) count += 1;
  return count;
};

export const assignStableAlbumIds = (
  nextAlbums: readonly AlbumGroupingIdentity[],
  previousAlbums: readonly PreviousAlbumGroupingIdentity[],
  createId: () => string,
): Map<string, string> => {
  const result = new Map<string, string>();
  const usedIds = new Set<string>();
  const previousByKey = new Map(previousAlbums.map((album) => [album.albumKey, album]));

  for (const album of nextAlbums) {
    const exact = previousByKey.get(album.albumKey);
    if (exact && !usedIds.has(exact.id)) {
      result.set(album.albumKey, exact.id);
      usedIds.add(exact.id);
    }
  }

  for (const album of [...nextAlbums].sort((left, right) => left.albumKey.localeCompare(right.albumKey))) {
    if (result.has(album.albumKey)) continue;
    const best = previousAlbums
      .filter((previous) => !usedIds.has(previous.id))
      .map((previous) => ({ previous, overlap: intersectionSize(album.trackIds, previous.trackIds) }))
      .filter(({ overlap }) => overlap > 0)
      .sort((left, right) => right.overlap - left.overlap || left.previous.id.localeCompare(right.previous.id))[0]?.previous;
    const id = best?.id ?? createId();
    result.set(album.albumKey, id);
    usedIds.add(id);
  }
  return result;
};

export const mapPreviousAlbumsToNextIds = (
  previousAlbums: readonly PreviousAlbumGroupingIdentity[],
  nextAlbums: readonly (AlbumGroupingIdentity & { id: string })[],
): Map<string, string[]> =>
  new Map(
    previousAlbums.map((previous) => [
      previous.id,
      nextAlbums
        .map((next) => ({ id: next.id, overlap: intersectionSize(previous.trackIds, next.trackIds) }))
        .filter(({ overlap }) => overlap > 0)
        .sort((left, right) => right.overlap - left.overlap || left.id.localeCompare(right.id))
        .map(({ id }) => id),
    ]),
  );
