export const unclassifiedGenreKey = '__unclassified__';

export const genreKeyFromTag = (value: string | null | undefined): string => {
  const key = (value ?? '').normalize('NFKC').trim().toLocaleLowerCase();
  return key.length > 0 ? key : unclassifiedGenreKey;
};

export const genreKeyFromSqlValue = (value: unknown): string => {
  if (typeof value === 'string') {
    return genreKeyFromTag(value);
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return genreKeyFromTag(String(value));
  }
  if (typeof value === 'bigint') {
    return genreKeyFromTag(String(value));
  }
  if (value instanceof Uint8Array) {
    return genreKeyFromTag(new TextDecoder().decode(value));
  }
  return unclassifiedGenreKey;
};

export const isUnclassifiedGenreKey = (value: string | null | undefined): boolean =>
  value === unclassifiedGenreKey || genreKeyFromTag(value) === unclassifiedGenreKey;
