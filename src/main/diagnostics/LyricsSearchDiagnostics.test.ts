import { describe, expect, it } from 'vitest';
import { beginLyricsSearchDiagnostic, getLyricsSearchDiagnosticsSnapshot } from './LyricsSearchDiagnostics';

const beginSearch = (staleKey: string) => beginLyricsSearchDiagnostic({
  kind: 'track',
  trigger: 'manual',
  providerId: null,
  enabledProviderCount: 0,
  networkEnabled: false,
  deepSearchEnabled: false,
  trackIdHash: `track:${staleKey}`,
  queryHash: `query:${staleKey}`,
  staleKey,
  input: {
    searchTextChars: 0,
    titleChars: 4,
    artistChars: 0,
    albumChars: 0,
    hasDuration: false,
    hasFilePath: false,
    hasSourceId: false,
    hasStableKey: false,
    mediaType: null,
  },
  lyricsCacheHitBeforeSearch: false,
});

const finishSearch = (search: ReturnType<typeof beginSearch>): void => {
  search.finish({
    status: 'completed',
    rawCandidateCount: 0,
    returnedCandidateCount: 0,
    storedCandidateRowsTouched: 0,
    storedCandidateCacheHits: 0,
    storedCandidateWrites: 0,
    rejectedCandidateCount: 0,
  });
};

describe('LyricsSearchDiagnostics', () => {
  it('keeps an older overlapping search stale until every search for the key finishes', () => {
    const older = beginSearch('same-track');
    const newer = beginSearch('same-track');

    expect(older.isStale()).toBe(true);
    expect(newer.isStale()).toBe(false);

    finishSearch(newer);
    expect(older.isStale()).toBe(true);

    finishSearch(older);
    expect(getLyricsSearchDiagnosticsSnapshot().activeSearchCount).toBe(0);
  });
});
