import type {
  WorkshopPluginResolvedSource,
  WorkshopPluginSourceSearchResult,
} from '../../shared/types/workshop';

export const workshopSourceProviderLimits = Object.freeze({
  maximumQueryLength: 240,
  maximumPageSize: 50,
  maximumResultBytes: 64 * 1024,
  maximumProviderTrackIdLength: 512,
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const optionalText = (value: unknown, maximumLength: number): string | null =>
  typeof value === 'string' && value.trim() ? value.trim().slice(0, maximumLength) : null;

const assertBoundedJson = (value: unknown): unknown => {
  const serialized = JSON.stringify(value);
  if (serialized === undefined
    || new TextEncoder().encode(serialized).byteLength > workshopSourceProviderLimits.maximumResultBytes) {
    throw new Error('source-provider-result-too-large');
  }
  return JSON.parse(serialized) as unknown;
};

export const sanitizeWorkshopSourceSearchRequest = (value: unknown): {
  query: string;
  page: number;
  pageSize: number;
} => {
  const input = isRecord(value) ? value : {};
  const query = typeof input.query === 'string'
    ? input.query.trim().slice(0, workshopSourceProviderLimits.maximumQueryLength)
    : '';
  const page = typeof input.page === 'number' && Number.isInteger(input.page)
    ? Math.max(1, Math.min(10_000, input.page))
    : 1;
  const pageSize = typeof input.pageSize === 'number' && Number.isInteger(input.pageSize)
    ? Math.max(1, Math.min(workshopSourceProviderLimits.maximumPageSize, input.pageSize))
    : 24;
  return { query, page, pageSize };
};

export const sanitizeWorkshopSourceSearchResult = (value: unknown): WorkshopPluginSourceSearchResult => {
  const normalized = assertBoundedJson(value);
  const input = isRecord(normalized) ? normalized : {};
  const tracks = (Array.isArray(input.tracks) ? input.tracks : [])
    .slice(0, workshopSourceProviderLimits.maximumPageSize)
    .flatMap((candidate) => {
      if (!isRecord(candidate)) return [];
      const providerTrackId = optionalText(candidate.providerTrackId, workshopSourceProviderLimits.maximumProviderTrackIdLength);
      const title = optionalText(candidate.title, 180);
      if (!providerTrackId || !title) return [];
      const durationSeconds = typeof candidate.durationSeconds === 'number'
        && Number.isFinite(candidate.durationSeconds)
        && candidate.durationSeconds >= 0
        && candidate.durationSeconds <= 7 * 24 * 60 * 60
        ? candidate.durationSeconds
        : null;
      return [{
        providerTrackId,
        title,
        artist: optionalText(candidate.artist, 180),
        album: optionalText(candidate.album, 180),
        durationSeconds,
        source: optionalText(candidate.source, 120),
        playable: candidate.playable !== false,
        unavailableReason: optionalText(candidate.unavailableReason, 180),
      }];
    });
  const total = typeof input.total === 'number' && Number.isInteger(input.total) && input.total >= 0
    ? Math.min(input.total, 1_000_000)
    : null;
  return { tracks, total, hasMore: input.hasMore === true };
};

export const sanitizeWorkshopResolvedSource = (value: unknown): WorkshopPluginResolvedSource => {
  const normalized = assertBoundedJson(value);
  if (!isRecord(normalized)) throw new Error('source-provider-invalid-playback');
  const url = optionalText(normalized.url, 2_048);
  if (!url) throw new Error('source-provider-invalid-playback');
  return {
    url,
    title: optionalText(normalized.title, 180),
    artist: optionalText(normalized.artist, 180),
    album: optionalText(normalized.album, 180),
    live: normalized.live === true,
  };
};
