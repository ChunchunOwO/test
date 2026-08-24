export const GENRE_MOSAIC_MAX_TILES = 4;

export const collectUniqueCoverUrls = (
  urls: Array<string | null | undefined>,
  limit = GENRE_MOSAIC_MAX_TILES,
): string[] => {
  const unique: string[] = [];
  const seen = new Set<string>();

  for (const url of urls) {
    const trimmed = url?.trim();
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    unique.push(trimmed);
    if (unique.length >= limit) {
      break;
    }
  }

  return unique;
};

export const sameCoverUrls = (left: readonly string[], right: readonly string[]): boolean =>
  left.length === right.length && left.every((url, index) => url === right[index]);
