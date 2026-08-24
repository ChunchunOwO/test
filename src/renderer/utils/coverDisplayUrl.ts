const localCoverVariantPattern = /^echo-cover:\/\/(?:thumb|album|large|original)\//u;

export const largeCoverUrlFromCachedVariant = (coverUrl: string | null | undefined): string | null => {
  const largeUrl = coverUrl?.replace(localCoverVariantPattern, 'echo-cover://large/') ?? null;
  return largeUrl?.startsWith('echo-cover://large/') ? largeUrl : null;
};

export const albumCoverUrlFromCachedVariant = (coverUrl: string | null | undefined): string | null => {
  const albumUrl = coverUrl?.replace(localCoverVariantPattern, 'echo-cover://album/') ?? null;
  return albumUrl?.startsWith('echo-cover://album/') ? albumUrl : null;
};

export const originalCoverUrlFromCachedVariant = (coverUrl: string | null | undefined): string | null => {
  const originalUrl = coverUrl?.replace(localCoverVariantPattern, 'echo-cover://original/') ?? null;
  return originalUrl?.startsWith('echo-cover://original/') ? originalUrl : null;
};

export const localCoverBackgroundUrl = (
  coverId: string | null | undefined,
  cachedCoverUrl?: string | null,
): string | null =>
  coverId
    ? `echo-cover://original/${encodeURIComponent(coverId)}`
    : originalCoverUrlFromCachedVariant(cachedCoverUrl);

export const localCoverDisplayUrl = (
  coverId: string | null | undefined,
  cachedCoverUrl?: string | null,
): string | null =>
  coverId
    ? `echo-cover://large/${encodeURIComponent(coverId)}`
    : largeCoverUrlFromCachedVariant(cachedCoverUrl);

export const remoteCoverUrlAtSize = (
  coverUrl: string | null | undefined,
  size: number,
): string | null => {
  if (!coverUrl) {
    return null;
  }
  try {
    const parsed = new URL(coverUrl);
    if (parsed.protocol === 'echo-image:' && parsed.hostname === 'subsonic-cover') {
      parsed.searchParams.set('size', String(Math.max(80, Math.min(1024, Math.round(size)))));
      return parsed.toString();
    }
  } catch {
    return coverUrl;
  }
  return coverUrl;
};

export const playerCoverDisplayUrl = (
  coverId: string | null | undefined,
  cachedCoverUrl?: string | null,
): string | null =>
  localCoverDisplayUrl(coverId, cachedCoverUrl) ?? remoteCoverUrlAtSize(cachedCoverUrl, 512);
