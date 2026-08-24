import { describe, expect, it, vi } from 'vitest';
import type { EqPreset, EqState } from '../../../shared/types/eq';
import type { LibraryTrack, PlaybackHistoryEntry } from '../../../shared/types/library';
import type { PersistedPlaybackSessionV1, PersistedQueueItem } from '../../../shared/types/playback';
import {
  SteamAchievementProgressTracker,
  type AudioAchievementStatus,
} from './SteamAchievementProgress';

const track = (id: string, overrides: Partial<LibraryTrack> = {}): LibraryTrack => ({
  id,
  path: `C:\\Music\\${id}.flac`,
  title: id,
  artist: 'ECHO',
  album: 'Pixel Album',
  albumArtist: 'ECHO',
  trackNo: Number(id.replace(/\D/g, '')) || 1,
  discNo: 1,
  year: 2026,
  genre: null,
  duration: 100,
  codec: 'FLAC',
  sampleRate: 48_000,
  bitDepth: 24,
  bitrate: 1_000_000,
  coverId: null,
  coverThumb: null,
  fieldSources: {},
  ...overrides,
});

const status = (item: LibraryTrack, overrides: Partial<AudioAchievementStatus> = {}): AudioAchievementStatus => ({
  state: 'playing',
  bitPerfectCandidate: false,
  currentFilePath: item.path,
  currentTrackId: item.id,
  currentQueueItemId: `queue-${item.id}`,
  positionSeconds: 0,
  durationSeconds: item.duration,
  volume: 0.8,
  playbackRate: 1,
  ...overrides,
});

const historyEntry = (item: LibraryTrack, startedAt: string): PlaybackHistoryEntry => ({
  id: `history-${item.id}`,
  trackId: item.id,
  trackPath: item.path,
  mediaType: 'local',
  provider: null,
  providerTrackId: null,
  stableKey: null,
  title: item.title,
  artist: item.artist,
  album: item.album,
  albumArtist: item.albumArtist,
  coverId: null,
  coverThumb: null,
  startedAt,
  endedAt: startedAt,
  playedSeconds: item.duration,
  durationSeconds: item.duration,
  durationSnapshot: item.duration,
  coverSnapshot: null,
  playCount: 1,
  completed: true,
  sourceType: 'album',
  sourceLabel: item.album,
  queueId: `old-${item.id}`,
});

const queueItem = (item: LibraryTrack, sourceType: 'continuous-play' | 'manual' = 'continuous-play'): PersistedQueueItem => ({
  queueId: `queue-${item.id}`,
  track: item,
  source: sourceType === 'continuous-play'
    ? { type: sourceType, label: 'Local Smart Radio', mode: 'similar' }
    : { type: sourceType, label: 'Manual' },
  addedAt: '2026-08-14T00:00:00.000Z',
});

const session = (
  items: PersistedQueueItem[],
  modeOverrides: Partial<PersistedPlaybackSessionV1['mode']> = {},
): PersistedPlaybackSessionV1 => ({
  version: 1,
  revision: 1,
  items,
  currentQueueId: items[0]?.queueId ?? null,
  currentTrackId: items[0]?.track.id ?? null,
  lastPlayedTrack: null,
  history: [],
  mode: {
    isShuffleEnabled: false,
    repeatMode: 'off',
    automixEnabled: false,
    autoFillQueueEnabled: true,
    continuousPlayMode: 'similar',
    continuousPlayPreferences: [],
    ...modeOverrides,
  },
  resume: null,
  updatedAt: '2026-08-14T00:00:00.000Z',
});

const flatState: EqState = {
  enabled: false,
  preampDb: 0,
  bands: [],
  presetId: 'flat',
  presetName: 'Flat',
  clippingRisk: false,
};

const createHarness = (options: {
  tracks?: LibraryTrack[];
  history?: PlaybackHistoryEntry[];
  playbackSession?: PersistedPlaybackSessionV1 | null;
  eqState?: EqState;
  presets?: EqPreset[];
} = {}) => {
  let now = Date.parse('2026-08-14T12:00:00.000Z');
  let playbackSession = options.playbackSession ?? null;
  const tracks = options.tracks ?? [];
  const byId = new Map(tracks.map((item) => [item.id, item]));
  const unlock = vi.fn();
  const recordPlaybackFact = vi.fn();
  const album = { id: 'album-1', albumKey: 'album-1', title: 'Pixel Album', albumArtist: 'ECHO', year: 2026, trackCount: tracks.length, duration: tracks.reduce((sum, item) => sum + item.duration, 0), coverId: null, coverThumb: null };
  const tracker = new SteamAchievementProgressTracker({
    library: {
      getTrack: (id) => byId.get(id) ?? null,
      getTrackByPath: (path) => tracks.find((item) => item.path === path) ?? null,
      getAlbumForTrack: (id) => byId.has(id) ? album : null,
      getAllAlbumTracks: () => tracks,
      recordSteamAchievementPlaybackFact: recordPlaybackFact,
      getSteamAchievementPlaybackFacts: (query = {}) => (options.history ?? []).map((entry) => ({
        id: entry.id,
        trackId: entry.trackId ?? '',
        artist: entry.artist,
        startedAtMs: Date.parse(entry.startedAt),
        endedAtMs: Date.parse(entry.endedAt ?? entry.startedAt),
        playedSeconds: entry.playedSeconds,
        durationSeconds: entry.durationSeconds,
        qualifiedCompletion: entry.durationSeconds > 0 && entry.playedSeconds >= entry.durationSeconds * 0.75,
        source: 'legacy-history' as const,
      })).filter((fact) =>
        (!query.trackId || fact.trackId === query.trackId) &&
        (!Number.isFinite(query.fromMs) || fact.endedAtMs >= query.fromMs!) &&
        (!Number.isFinite(query.toMs) || fact.endedAtMs < query.toMs!) &&
        (!query.qualifiedOnly || fact.qualifiedCompletion),
      ),
    },
    playbackSession: { load: () => playbackSession },
    eq: {
      getState: () => options.eqState ?? flatState,
      listPresets: () => options.presets ?? [],
    },
    unlock,
    nowMs: () => now,
  });

  return {
    tracker,
    unlock,
    recordPlaybackFact,
    advance: (seconds: number) => {
      now += seconds * 1000;
    },
    setPlaybackSession: (value: PersistedPlaybackSessionV1 | null) => {
      playbackSession = value;
    },
    setNow: (timestampMs: number) => {
      now = timestampMs;
    },
  };
};

const complete = (
  harness: ReturnType<typeof createHarness>,
  item: LibraryTrack,
  playedSeconds = 85,
): void => {
  harness.tracker.onAudioStatus(status(item));
  harness.advance(playedSeconds);
  harness.tracker.onAudioStatus(status(item, { positionSeconds: playedSeconds }));
  harness.tracker.onPlaybackEnded(status(item, { state: 'ended', positionSeconds: item.duration }));
};

describe('SteamAchievementProgressTracker', () => {
  it('records only Audio Core observed 75-percent natural completions as qualified facts', () => {
    const item = track('trusted-fact', { duration: 100 });
    const completed = createHarness({ tracks: [item] });
    complete(completed, item, 75);
    expect(completed.recordPlaybackFact).toHaveBeenCalledWith(expect.objectContaining({
      trackId: item.id,
      qualifiedCompletion: true,
    }));
    expect(completed.recordPlaybackFact.mock.calls[0]?.[0].playedSeconds).toBeGreaterThanOrEqual(75);

    const abandoned = createHarness({ tracks: [item] });
    abandoned.tracker.onAudioStatus(status(item));
    abandoned.advance(60);
    abandoned.tracker.onAudioStatus(status(item, { positionSeconds: 60 }));
    abandoned.tracker.onAudioStatus(status(item, { state: 'stopped', positionSeconds: 60 }));
    expect(abandoned.recordPlaybackFact).toHaveBeenCalledWith(expect.objectContaining({
      trackId: item.id,
      playedSeconds: 60,
      qualifiedCompletion: false,
    }));
  });

  it('unlocks the long-track achievement after 80 percent of a 20-minute track was actually played', () => {
    const longTrack = track('long', { duration: 1_200 });
    const harness = createHarness({ tracks: [longTrack] });

    complete(harness, longTrack, 960);

    expect(harness.unlock).toHaveBeenCalledWith('ECHO_LONG_TRACK');
  });

  it('accepts a sub-two-second natural-end sampling gap at a playback threshold', () => {
    const longTrack = track('long-boundary', { duration: 1_200 });
    const harness = createHarness({ tracks: [longTrack] });

    complete(harness, longTrack, 959);

    expect(harness.unlock).toHaveBeenCalledWith('ECHO_LONG_TRACK');
  });

  it('does not count a forward seek as long-track playback progress', () => {
    const longTrack = track('long-seek', { duration: 1_200 });
    const harness = createHarness({ tracks: [longTrack] });

    harness.tracker.onAudioStatus(status(longTrack));
    harness.advance(1);
    harness.tracker.onAudioStatus(status(longTrack, { positionSeconds: 1_080 }));
    harness.tracker.onPlaybackEnded(status(longTrack, { state: 'ended', positionSeconds: 1_200 }));

    expect(harness.unlock).not.toHaveBeenCalledWith('ECHO_LONG_TRACK');
  });

  it('unlocks a full album after every track completes in library order', () => {
    const albumTracks = [1, 2, 3, 4].map((number) => track(`track-${number}`, { trackNo: number }));
    const harness = createHarness({ tracks: albumTracks });

    albumTracks.forEach((item) => complete(harness, item));

    expect(harness.unlock).toHaveBeenCalledWith('ECHO_FULL_ALBUM');
  });

  it('keeps album progress when the user only appends songs to the queue tail', () => {
    const albumTracks = [1, 2, 3, 4].map((number) => track(`appended-album-${number}`, { trackNo: number }));
    const extra = track('appended-after-album', { album: 'Later' });
    const initialItems = albumTracks.map((item) => queueItem(item, 'manual'));
    const harness = createHarness({ tracks: albumTracks, playbackSession: session(initialItems) });

    complete(harness, albumTracks[0]!);
    harness.tracker.onAudioStatus(status(albumTracks[1]!));
    harness.setPlaybackSession(session([...initialItems, queueItem(extra, 'manual')]));
    harness.advance(75);
    harness.tracker.onAudioStatus(status(albumTracks[1]!, { positionSeconds: 75 }));
    harness.tracker.onPlaybackEnded(status(albumTracks[1]!, { state: 'ended', positionSeconds: 100 }));
    albumTracks.slice(2).forEach((item) => complete(harness, item, 75));

    expect(harness.unlock).toHaveBeenCalledWith('ECHO_FULL_ALBUM');
  });

  it('resets album progress when a track changes without a natural completion', () => {
    const albumTracks = [1, 2, 3, 4].map((number) => track(`track-${number}`, { trackNo: number }));
    const harness = createHarness({ tracks: albumTracks });

    complete(harness, albumTracks[0]!);
    harness.tracker.onAudioStatus(status(albumTracks[1]!));
    harness.advance(20);
    harness.tracker.onAudioStatus(status(albumTracks[2]!));
    complete(harness, albumTracks[2]!);
    complete(harness, albumTracks[3]!);

    expect(harness.unlock).not.toHaveBeenCalledWith('ECHO_FULL_ALBUM');
  });

  it('unlocks gapless only from the Audio Core gapless boundary event', () => {
    const first = track('track-1');
    const harness = createHarness({ tracks: [first] });
    harness.tracker.onAudioStatus(status(first));
    harness.advance(85);

    harness.tracker.onTrackAdvance({ status: status(first, { positionSeconds: 85 }), nextTrackId: 'track-2', gapless: true });

    expect(harness.unlock).toHaveBeenCalledWith('ECHO_FIRST_GAPLESS');
  });

  it('unlocks rediscovery after completing a local track last heard over 90 days ago', () => {
    const oldTrack = track('old-friend');
    const oldPlay = historyEntry(oldTrack, '2026-05-01T12:00:00.000Z');
    const harness = createHarness({ tracks: [oldTrack], history: [oldPlay] });

    complete(harness, oldTrack);

    expect(harness.unlock).toHaveBeenCalledWith('ECHO_LONG_TIME_NO_SEE');
  });

  it('unlocks after three distinct continuous-play recommendations complete', () => {
    const recommendations = [1, 2, 3].map((number) => track(`radio-${number}`));
    const harness = createHarness({
      tracks: recommendations,
      playbackSession: session(recommendations.map((item) => queueItem(item))),
    });

    recommendations.forEach((item) => complete(harness, item));

    expect(harness.unlock).toHaveBeenCalledWith('ECHO_CONTINUOUS_PLAY_FIVE');
  });

  it('resets continuous-play progress when a queued recommendation is manually removed', () => {
    const recommendations = [1, 2, 3, 4].map((number) => track(`edited-radio-${number}`));
    const initialItems = recommendations.map((item) => queueItem(item));
    const harness = createHarness({
      tracks: recommendations,
      playbackSession: session(initialItems),
    });

    complete(harness, recommendations[0]!);
    harness.tracker.onAudioStatus(status(recommendations[1]!));
    harness.setPlaybackSession(session(initialItems.slice(0, -1)));
    harness.advance(85);
    harness.tracker.onAudioStatus(status(recommendations[1]!, { positionSeconds: 85 }));
    harness.tracker.onPlaybackEnded(status(recommendations[1]!, { state: 'ended', positionSeconds: 100 }));
    recommendations.slice(2, 4).forEach((item) => complete(harness, item));

    expect(harness.unlock).not.toHaveBeenCalledWith('ECHO_CONTINUOUS_PLAY_FIVE');
  });

  it('keeps continuous-play progress when only completed items before the current track are pruned', () => {
    const recommendations = [1, 2, 3].map((number) => track(`pruned-radio-${number}`));
    const initialItems = recommendations.map((item) => queueItem(item));
    const harness = createHarness({
      tracks: recommendations,
      playbackSession: session(initialItems),
    });

    complete(harness, recommendations[0]!);
    harness.tracker.onAudioStatus(status(recommendations[1]!));
    harness.setPlaybackSession(session(initialItems.slice(1)));
    harness.advance(85);
    harness.tracker.onAudioStatus(status(recommendations[1]!, { positionSeconds: 85 }));
    harness.tracker.onPlaybackEnded(status(recommendations[1]!, { state: 'ended', positionSeconds: 100 }));
    recommendations.slice(2).forEach((item) => complete(harness, item));

    expect(harness.unlock).toHaveBeenCalledWith('ECHO_CONTINUOUS_PLAY_FIVE');
  });

  it('unlocks when a saved custom EQ remains enabled for a completed track', () => {
    const item = track('tuned');
    const customPreset: EqPreset = {
      id: 'my-room',
      name: 'My Room',
      preampDb: -2,
      bands: [],
      createdAt: '2026-08-14T00:00:00.000Z',
      updatedAt: '2026-08-14T00:00:00.000Z',
      readonly: false,
    };
    const harness = createHarness({
      tracks: [item],
      presets: [customPreset],
      eqState: { ...flatState, enabled: true, presetId: customPreset.id, presetName: customPreset.name },
    });

    complete(harness, item);

    expect(harness.unlock).toHaveBeenCalledWith('ECHO_CUSTOM_EQ_TRACK');
  });

  it('unlocks a saved custom EQ track when the daemon advances without gapless', () => {
    const item = track('tuned-daemon-advance');
    const customPreset: EqPreset = {
      id: 'my-daemon-room',
      name: 'My Daemon Room',
      preampDb: -2,
      bands: [],
      createdAt: '2026-08-14T00:00:00.000Z',
      updatedAt: '2026-08-14T00:00:00.000Z',
      readonly: false,
    };
    const harness = createHarness({
      tracks: [item],
      presets: [customPreset],
      eqState: { ...flatState, enabled: true, presetId: customPreset.id, presetName: customPreset.name },
    });

    harness.tracker.onAudioStatus(status(item));
    harness.advance(85);
    harness.tracker.onTrackAdvance({
      status: status(item, { positionSeconds: 85 }),
      nextTrackId: 'next-track',
      gapless: false,
    });

    expect(harness.unlock).toHaveBeenCalledWith('ECHO_CUSTOM_EQ_TRACK');
  });

  it('arms a saved custom EQ selected near the beginning of playback', () => {
    const item = track('tuned-after-start');
    const customPreset: EqPreset = {
      id: 'early-room',
      name: 'Early Room',
      preampDb: -2,
      bands: [],
      createdAt: '2026-08-14T00:00:00.000Z',
      updatedAt: '2026-08-14T00:00:00.000Z',
      readonly: false,
    };
    const harness = createHarness({ tracks: [item], presets: [customPreset] });

    harness.tracker.onAudioStatus(status(item));
    harness.advance(8);
    harness.tracker.onEqState({ ...flatState, enabled: true, presetId: customPreset.id, presetName: customPreset.name });
    harness.advance(77);
    harness.tracker.onAudioStatus(status(item, { positionSeconds: 85 }));
    harness.tracker.onPlaybackEnded(status(item, { state: 'ended', positionSeconds: 100 }));

    expect(harness.unlock).toHaveBeenCalledWith('ECHO_CUSTOM_EQ_TRACK');
  });

  it('does not arm a custom EQ selected after the opening grace period', () => {
    const item = track('tuned-too-late');
    const customPreset: EqPreset = {
      id: 'late-room',
      name: 'Late Room',
      preampDb: -2,
      bands: [],
      createdAt: '2026-08-14T00:00:00.000Z',
      updatedAt: '2026-08-14T00:00:00.000Z',
      readonly: false,
    };
    const harness = createHarness({ tracks: [item], presets: [customPreset] });

    harness.tracker.onAudioStatus(status(item));
    harness.advance(11);
    harness.tracker.onEqState({ ...flatState, enabled: true, presetId: customPreset.id, presetName: customPreset.name });
    harness.advance(74);
    harness.tracker.onAudioStatus(status(item, { positionSeconds: 85 }));
    harness.tracker.onPlaybackEnded(status(item, { state: 'ended', positionSeconds: 100 }));

    expect(harness.unlock).not.toHaveBeenCalledWith('ECHO_CUSTOM_EQ_TRACK');
  });

  it('does not unlock when the custom EQ is disabled during playback', () => {
    const item = track('untuned-mid-track');
    const customPreset: EqPreset = {
      id: 'custom-room',
      name: 'Custom Room',
      preampDb: -2,
      bands: [],
      createdAt: '2026-08-14T00:00:00.000Z',
      updatedAt: '2026-08-14T00:00:00.000Z',
      readonly: false,
    };
    const harness = createHarness({
      tracks: [item],
      presets: [customPreset],
      eqState: { ...flatState, enabled: true, presetId: customPreset.id, presetName: customPreset.name },
    });

    harness.tracker.onAudioStatus(status(item));
    harness.advance(40);
    harness.tracker.onAudioStatus(status(item, { positionSeconds: 40 }));
    harness.tracker.onEqState(flatState);
    harness.advance(45);
    harness.tracker.onAudioStatus(status(item, { positionSeconds: 85 }));
    harness.tracker.onPlaybackEnded(status(item, { state: 'ended', positionSeconds: 100 }));

    expect(harness.unlock).not.toHaveBeenCalledWith('ECHO_CUSTOM_EQ_TRACK');
  });

  it('unlocks treasure for a local track imported 180 days ago and never played before', () => {
    const treasure = track('treasure', { createdAt: '2026-01-01T00:00:00.000Z' });
    const harness = createHarness({ tracks: [treasure], history: [] });

    complete(harness, treasure);

    expect(harness.unlock).toHaveBeenCalledWith('ECHO_OLD_UNPLAYED_TREASURE');
  });

  it('unlocks same title different artist for consecutive completed local tracks', () => {
    const first = track('same-a', { title: 'Echo', artist: 'Artist A' });
    const second = track('same-b', { title: ' echo ', artist: 'Artist B' });
    const harness = createHarness({ tracks: [first, second] });

    complete(harness, first);
    complete(harness, second);

    expect(harness.unlock).toHaveBeenCalledWith('ECHO_SAME_TITLE_DIFFERENT_ARTIST');
  });

  it('unlocks the time machine after four completed local tracks from different decades', () => {
    const decades = [1972, 1984, 1996, 2008].map((year) => track(`year-${year}`, { year }));
    const harness = createHarness({ tracks: decades });

    decades.forEach((item) => complete(harness, item));

    expect(harness.unlock).toHaveBeenCalledWith('ECHO_FIVE_DECADES_SESSION');
  });

  it('resets time-machine decades after the playback session stops', () => {
    const decades = [1972, 1984, 1996, 2008].map((year) => track(`stopped-${year}`, { year }));
    const harness = createHarness({ tracks: decades });

    decades.slice(0, 3).forEach((item) => complete(harness, item));
    harness.tracker.onAudioStatus(status(decades[2]!, { state: 'stopped' }));
    complete(harness, decades[3]!);

    expect(harness.unlock).not.toHaveBeenCalledWith('ECHO_FIVE_DECADES_SESSION');
  });

  it('unlocks reverse album after four tracks complete in reverse library order', () => {
    const albumTracks = [1, 2, 3, 4].map((number) => track(`reverse-${number}`, { trackNo: number }));
    const reverseItems = [...albumTracks].reverse().map((item) => queueItem(item, 'manual'));
    const harness = createHarness({ tracks: albumTracks, playbackSession: session(reverseItems) });

    [...albumTracks].reverse().forEach((item) => complete(harness, item));

    expect(harness.unlock).toHaveBeenCalledWith('ECHO_REVERSE_ALBUM');
  });

  it('unlocks midnight bridge only after a two-minute local track crosses local midnight', () => {
    const bridge = track('midnight-bridge', { duration: 180 });
    const harness = createHarness({ tracks: [bridge] });
    harness.setNow(new Date(2026, 7, 14, 23, 59, 0).getTime());

    complete(harness, bridge, 153);

    expect(harness.unlock).toHaveBeenCalledWith('ECHO_MIDNIGHT_BRIDGE');
  });

  it('unlocks the hidden prism easter egg after completing a Pink Floyd local track', () => {
    const item = track('prism', { artist: 'Various Artists', albumArtist: ' Pink Floyd ' });
    const harness = createHarness({ tracks: [item] });

    complete(harness, item);

    expect(harness.unlock).toHaveBeenCalledWith('ECHO_DARK_SIDE_OF_THE_MOON');
  });

  it('does not unlock the prism easter egg for tribute artists', () => {
    const item = track('tribute-prism', { artist: 'Pink Floyd Tribute Band' });
    const harness = createHarness({ tracks: [item] });

    complete(harness, item);

    expect(harness.unlock).not.toHaveBeenCalledWith('ECHO_DARK_SIDE_OF_THE_MOON');
  });

  it('recognizes Pink Floyd inside a multi-artist tag without accepting tribute names', () => {
    const item = track('multi-artist-prism', { artist: 'Pink Floyd / David Gilmour' });
    const harness = createHarness({ tracks: [item] });

    complete(harness, item);

    expect(harness.unlock).toHaveBeenCalledWith('ECHO_DARK_SIDE_OF_THE_MOON');
  });

  it.each([
    ['Wish You Were Here', 'ECHO_PF_WISH_YOU_WERE_HERE'],
    ['The Wall', 'ECHO_PF_THE_WALL'],
    ['Animals', 'ECHO_PF_ANIMALS'],
    ['Meddle', 'ECHO_PF_MEDDLE'],
    ['The Division Bell', 'ECHO_PF_DIVISION_BELL'],
    ['Atom Heart Mother', 'ECHO_PF_ATOM_HEART_MOTHER'],
  ] as const)('unlocks the hidden %s album easter egg after a verified full-album run', (album, achievementId) => {
    const albumTracks = [1, 2, 3, 4].map((number) => track(`${achievementId}-${number}`, {
      album,
      artist: 'Pink Floyd',
      albumArtist: 'Pink Floyd',
      trackNo: number,
    }));
    const harness = createHarness({
      tracks: albumTracks,
      playbackSession: session(albumTracks.map((item) => queueItem(item, 'manual'))),
    });

    albumTracks.forEach((item) => complete(harness, item));

    expect(harness.unlock).toHaveBeenCalledWith(achievementId);
  });

  it('recognizes a remastered album suffix in a verified Pink Floyd album run', () => {
    const albumTracks = [1, 2, 3, 4].map((number) => track(`remastered-meddle-${number}`, {
      album: 'Meddle (2011 Remastered)',
      artist: 'Pink Floyd / David Gilmour',
      albumArtist: 'Pink Floyd',
      trackNo: number,
    }));
    const harness = createHarness({
      tracks: albumTracks,
      playbackSession: session(albumTracks.map((item) => queueItem(item, 'manual'))),
    });

    albumTracks.forEach((item) => complete(harness, item));

    expect(harness.unlock).toHaveBeenCalledWith('ECHO_PF_MEDDLE');
  });

  it('unlocks a Pink Floyd album easter egg for an 85-percent-complete single-file album rip', () => {
    const wholeAlbum = track('single-file-meddle', {
      title: 'Meddle (Full Album)',
      album: 'Meddle',
      artist: 'Pink Floyd',
      albumArtist: 'Pink Floyd',
      duration: 2_760,
    });
    const harness = createHarness({ tracks: [wholeAlbum] });

    complete(harness, wholeAlbum, 2_346);

    expect(harness.unlock).toHaveBeenCalledWith('ECHO_PF_MEDDLE');
    expect(harness.unlock).not.toHaveBeenCalledWith('ECHO_FULL_ALBUM');
  });

  it('does not unlock a single-file Pink Floyd album easter egg below 85 percent actual playback', () => {
    const wholeAlbum = track('incomplete-single-file-meddle', {
      title: 'Meddle (Full Album)',
      album: 'Meddle',
      artist: 'Pink Floyd',
      albumArtist: 'Pink Floyd',
      duration: 2_760,
    });
    const harness = createHarness({ tracks: [wholeAlbum] });

    complete(harness, wholeAlbum, 2_300);

    expect(harness.unlock).not.toHaveBeenCalledWith('ECHO_PF_MEDDLE');
  });

  it('does not treat one completed track from a multi-track Pink Floyd album as a single-file album rip', () => {
    const albumTracks = [1, 2].map((number) => track(`partial-single-file-wall-${number}`, {
      album: 'The Wall',
      artist: 'Pink Floyd',
      albumArtist: 'Pink Floyd',
      trackNo: number,
      duration: 2_760,
    }));
    const harness = createHarness({ tracks: albumTracks });

    complete(harness, albumTracks[0]!, 2_346);

    expect(harness.unlock).not.toHaveBeenCalledWith('ECHO_PF_THE_WALL');
  });

  it('does not unlock a Pink Floyd album easter egg for a tribute album', () => {
    const albumTracks = [1, 2, 3, 4].map((number) => track(`tribute-wall-${number}`, {
      album: 'The Wall',
      artist: number === 3 ? 'Pink Floyd Tribute Band' : 'Pink Floyd',
      albumArtist: number === 3 ? 'Pink Floyd Tribute Band' : 'Pink Floyd',
      trackNo: number,
    }));
    const harness = createHarness({
      tracks: albumTracks,
      playbackSession: session(albumTracks.map((item) => queueItem(item, 'manual'))),
    });

    albumTracks.forEach((item) => complete(harness, item));

    expect(harness.unlock).not.toHaveBeenCalledWith('ECHO_PF_THE_WALL');
  });

  it('does not unlock a Pink Floyd album easter egg after an incompatible queue edit', () => {
    const albumTracks = [1, 2, 3, 4].map((number) => track(`edited-wish-${number}`, {
      album: 'Wish You Were Here',
      artist: 'Pink Floyd',
      albumArtist: 'Pink Floyd',
      trackNo: number,
    }));
    const initialItems = albumTracks.map((item) => queueItem(item, 'manual'));
    const harness = createHarness({ tracks: albumTracks, playbackSession: session(initialItems) });

    complete(harness, albumTracks[0]!);
    harness.tracker.onAudioStatus(status(albumTracks[1]!));
    harness.setPlaybackSession(session(initialItems.slice(0, -1)));
    harness.advance(85);
    harness.tracker.onAudioStatus(status(albumTracks[1]!, { positionSeconds: 85 }));
    harness.tracker.onPlaybackEnded(status(albumTracks[1]!, { state: 'ended', positionSeconds: 100 }));
    albumTracks.slice(2).forEach((item) => complete(harness, item));

    expect(harness.unlock).not.toHaveBeenCalledWith('ECHO_PF_WISH_YOU_WERE_HERE');
  });

  it('unlocks the dedicated Echoes achievement after 80 percent actual playback', () => {
    const echoes = track('echoes-special', {
      title: 'Echoes（2011 重制版）',
      artist: 'Pink Floyd × Richard Wright',
      album: 'Meddle',
      albumArtist: 'Pink Floyd',
      duration: 1_400,
    });
    const harness = createHarness({ tracks: [echoes] });

    complete(harness, echoes, 1_120);

    expect(harness.unlock).toHaveBeenCalledWith('ECHO_PF_ECHOES');
  });

  it('does not unlock the dedicated Echoes achievement below 80 percent actual playback', () => {
    const echoes = track('echoes-incomplete', {
      title: 'Echoes',
      artist: 'Pink Floyd',
      album: 'Meddle',
      albumArtist: 'Pink Floyd',
      duration: 1_400,
    });
    const harness = createHarness({ tracks: [echoes] });

    complete(harness, echoes, 1_100);

    expect(harness.unlock).not.toHaveBeenCalledWith('ECHO_PF_ECHOES');
  });

  it('does not unlock the dedicated Echoes achievement for a tribute recording', () => {
    const echoes = track('echoes-tribute', {
      title: 'Echoes',
      artist: 'Pink Floyd Tribute Band',
      albumArtist: 'Pink Floyd Tribute Band',
      duration: 1_400,
    });
    const harness = createHarness({ tracks: [echoes] });

    complete(harness, echoes, 1_260);

    expect(harness.unlock).not.toHaveBeenCalledWith('ECHO_PF_ECHOES');
  });

  it('unlocks play again after the same local track completes twice with an immediate replay', () => {
    const item = track('play-again');
    const harness = createHarness({ tracks: [item] });

    complete(harness, item, 80);
    harness.advance(25);
    complete(harness, item, 80);

    expect(harness.unlock).toHaveBeenCalledWith('ECHO_PLAY_AGAIN');
  });

  it('does not unlock play again when the replay begins too late', () => {
    const item = track('play-again-late');
    const harness = createHarness({ tracks: [item] });

    complete(harness, item, 80);
    harness.advance(31);
    complete(harness, item, 80);

    expect(harness.unlock).not.toHaveBeenCalledWith('ECHO_PLAY_AGAIN');
  });

  it('unlocks rewind life after returning from halfway to the opening fifth', () => {
    const item = track('favorite-part', { duration: 200 });
    const harness = createHarness({ tracks: [item] });

    harness.tracker.onAudioStatus(status(item));
    harness.advance(100);
    harness.tracker.onAudioStatus(status(item, { positionSeconds: 100 }));
    harness.tracker.onAudioStatus(status(item, { positionSeconds: 20 }));
    harness.advance(160);
    harness.tracker.onAudioStatus(status(item, { positionSeconds: 180 }));
    harness.tracker.onPlaybackEnded(status(item, { state: 'ended', positionSeconds: 200 }));

    expect(harness.unlock).toHaveBeenCalledWith('ECHO_FAVORITE_PART');
  });

  it('unlocks flip side after disc one ends and disc two begins', () => {
    const albumTracks = [1, 2].flatMap((discNo) => [1, 2, 3, 4].map((trackNo) => track(
      `disc-${discNo}-track-${trackNo}`,
      { discNo, trackNo },
    )));
    const harness = createHarness({ tracks: albumTracks });

    complete(harness, albumTracks[3]!);
    complete(harness, albumTracks[4]!);

    expect(harness.unlock).toHaveBeenCalledWith('ECHO_FLIP_SIDE');
  });

  it('unlocks shuffle fate after five distinct shuffled tracks complete', () => {
    const items = Array.from({ length: 5 }, (_, index) => track(`shuffle-${index + 1}`));
    const harness = createHarness({
      tracks: items,
      playbackSession: session(items.map((item) => queueItem(item, 'manual')), { isShuffleEnabled: true }),
    });

    items.forEach((item) => complete(harness, item));

    expect(harness.unlock).toHaveBeenCalledWith('ECHO_SHUFFLE_FATE');
  });

  it('keeps friendly shuffle progress when one skipped or non-shuffled track does not count', () => {
    const items = Array.from({ length: 7 }, (_, index) => track(`shuffle-reset-${index + 1}`));
    const queuedItems = items.map((item) => queueItem(item, 'manual'));
    const harness = createHarness({
      tracks: items,
      playbackSession: session(queuedItems, { isShuffleEnabled: true }),
    });

    items.slice(0, 2).forEach((item) => complete(harness, item));
    harness.tracker.onAudioStatus(status(items[2]!));
    harness.setPlaybackSession(session(queuedItems, { isShuffleEnabled: false }));
    harness.advance(85);
    harness.tracker.onAudioStatus(status(items[2]!, { positionSeconds: 85 }));
    harness.tracker.onPlaybackEnded(status(items[2]!, { state: 'ended', positionSeconds: 100 }));
    harness.setPlaybackSession(session(queuedItems, { isShuffleEnabled: true }));
    items.slice(3).forEach((item) => complete(harness, item));

    expect(harness.unlock).toHaveBeenCalledWith('ECHO_SHUFFLE_FATE');
  });

  it('unlocks after the curtain when the final album track is followed by 30 quiet seconds', () => {
    const albumTracks = [1, 2, 3, 4].map((trackNo) => track(`curtain-${trackNo}`, { trackNo }));
    const harness = createHarness({ tracks: albumTracks });

    complete(harness, albumTracks[3]!);
    harness.advance(30);
    harness.tracker.onAudioStatus(status(albumTracks[3]!, { state: 'ended' }));

    expect(harness.unlock).toHaveBeenCalledWith('ECHO_AFTER_CURTAIN');
  });

  it('unlocks four seasons when playback history and the current completion cover all quarters', () => {
    const item = track('four-seasons');
    const history = [
      historyEntry(item, '2026-02-01T12:00:00.000Z'),
      historyEntry(item, '2026-05-01T12:00:00.000Z'),
      historyEntry(item, '2026-08-01T12:00:00.000Z'),
    ];
    const harness = createHarness({ tracks: [item], history });
    harness.setNow(new Date(2026, 10, 1, 12, 0, 0).getTime());

    complete(harness, item);

    expect(harness.unlock).toHaveBeenCalledWith('ECHO_FOUR_SEASONS');
  });

  it('unlocks loop victim after three repeat-one completions of the same track', () => {
    const item = track('repeat-one');
    const harness = createHarness({
      tracks: [item],
      playbackSession: session([queueItem(item, 'manual')], { repeatMode: 'one' }),
    });

    Array.from({ length: 3 }, () => complete(harness, item));

    expect(harness.unlock).toHaveBeenCalledWith('ECHO_REPEAT_ONE_FIVE');
  });

  it('unlocks again and again after the third completion in a rolling 24-hour window', () => {
    const item = track('three-today');
    const history = [
      historyEntry(item, new Date(2026, 7, 13, 13).toISOString()),
      historyEntry(item, new Date(2026, 7, 13, 23).toISOString()),
    ];
    const harness = createHarness({ tracks: [item], history });
    harness.setNow(new Date(2026, 7, 14, 12).getTime());

    complete(harness, item);

    expect(harness.unlock).toHaveBeenCalledWith('ECHO_TRACK_THREE_IN_DAY');
  });

  it('unlocks not a picky listener after three tagged genres in one session', () => {
    const items = ['Pop', 'Rock', 'Jazz']
      .map((genre, index) => track(`genre-${index}`, { genre }));
    const harness = createHarness({ tracks: items });

    items.forEach((item) => complete(harness, item));

    expect(harness.unlock).toHaveBeenCalledWith('ECHO_FIVE_GENRES_SESSION');
  });

  it('unlocks one-person festival after five known artists in one session', () => {
    const items = Array.from({ length: 5 }, (_, index) => track(`artist-${index}`, { artist: `Artist ${index}` }));
    const harness = createHarness({ tracks: items });

    items.forEach((item) => complete(harness, item));

    expect(harness.unlock).toHaveBeenCalledWith('ECHO_TEN_ARTISTS_SESSION');
  });

  it('unlocks golden three minutes within the friendly 2:55 to 3:05 window', () => {
    const item = track('golden-three', { duration: 176 });
    const harness = createHarness({ tracks: [item] });

    complete(harness, item, 150);

    expect(harness.unlock).toHaveBeenCalledWith('ECHO_GOLDEN_THREE_MINUTES');
  });

  it('unlocks wait dont end after a five-second pause in the final ten seconds', () => {
    const item = track('pause-near-end', { duration: 120 });
    const harness = createHarness({ tracks: [item] });

    harness.tracker.onAudioStatus(status(item));
    harness.advance(110);
    harness.tracker.onAudioStatus(status(item, { state: 'paused', positionSeconds: 110 }));
    harness.advance(5);
    harness.tracker.onAudioStatus(status(item, { positionSeconds: 110 }));
    harness.advance(10);
    harness.tracker.onAudioStatus(status(item, { positionSeconds: 120 }));
    harness.tracker.onPlaybackEnded(status(item, { state: 'ended', positionSeconds: 120 }));

    expect(harness.unlock).toHaveBeenCalledWith('ECHO_PAUSE_NEAR_END');
  });

  it('unlocks quietly all the way after 85 percent of three uninterrupted minutes', () => {
    const item = track('quietly-all-way', { duration: 180 });
    const harness = createHarness({ tracks: [item] });

    complete(harness, item, 153);

    expect(harness.unlock).toHaveBeenCalledWith('ECHO_UNINTERRUPTED_FOUR_MINUTES');
  });

  it('unlocks still sounds good after three distinct coverless tracks', () => {
    const items = Array.from({ length: 3 }, (_, index) => track(`coverless-${index}`));
    const harness = createHarness({ tracks: items });

    items.forEach((item) => complete(harness, item));

    expect(harness.unlock).toHaveBeenCalledWith('ECHO_FIVE_COVERLESS');
  });

  it('unlocks three is just right after an exact manual three-track queue', () => {
    const items = Array.from({ length: 3 }, (_, index) => track(`manual-three-${index}`));
    const harness = createHarness({
      tracks: items,
      playbackSession: session(items.map((item) => queueItem(item, 'manual'))),
    });

    items.forEach((item) => complete(harness, item));

    expect(harness.unlock).toHaveBeenCalledWith('ECHO_MANUAL_QUEUE_THREE');
  });

  it('unlocks the one-hour club after one hour of actual session listening', () => {
    const item = track('hour-club', { duration: 3_600 });
    const harness = createHarness({ tracks: [item] });

    complete(harness, item, 3_600);

    expect(harness.unlock).toHaveBeenCalledWith('ECHO_ONE_HOUR_SESSION');
  });

  it('unlocks three flavors after three completed file formats', () => {
    const items = [
      track('format-flac'),
      track('format-mp3', { path: 'C:\\Music\\format-mp3.mp3' }),
      track('format-wav', { path: 'C:\\Music\\format-wav.wav' }),
    ];
    const harness = createHarness({ tracks: items });

    items.forEach((item) => complete(harness, item));

    expect(harness.unlock).toHaveBeenCalledWith('ECHO_THREE_AUDIO_FORMATS');
  });

  it('unlocks short and long after completing both duration extremes', () => {
    const short = track('short-pair', { duration: 60 });
    const long = track('long-pair', { duration: 480 });
    const harness = createHarness({ tracks: [short, long] });

    complete(harness, short, 60);
    complete(harness, long, 480);

    expect(harness.unlock).toHaveBeenCalledWith('ECHO_SHORT_AND_LONG');
  });

  it('unlocks volume slide after three meaningful volume changes during one completed track', () => {
    const item = track('volume-slide');
    const harness = createHarness({ tracks: [item] });

    harness.tracker.onAudioStatus(status(item, { volume: 0.5 }));
    for (const [positionSeconds, volume] of [[25, 0.6], [50, 0.7], [75, 0.8]] as const) {
      harness.advance(25);
      harness.tracker.onAudioStatus(status(item, { positionSeconds, volume }));
    }
    harness.advance(10);
    harness.tracker.onAudioStatus(status(item, { positionSeconds: 85, volume: 0.8 }));
    harness.tracker.onPlaybackEnded(status(item, { state: 'ended', positionSeconds: 100, volume: 0.8 }));

    expect(harness.unlock).toHaveBeenCalledWith('ECHO_VOLUME_SLIDE');
  });

  it('unlocks album bookends after the first and last tracks complete in either order', () => {
    const items = Array.from({ length: 4 }, (_, index) => track(`bookend-${index + 1}`, { trackNo: index + 1 }));
    const harness = createHarness({ tracks: items });

    complete(harness, items[3]!);
    complete(harness, items[0]!);

    expect(harness.unlock).toHaveBeenCalledWith('ECHO_ALBUM_BOOKENDS');
  });

  it('unlocks early bird for a completion between six and nine in the morning', () => {
    const item = track('early-bird');
    const harness = createHarness({ tracks: [item] });
    harness.setNow(new Date(2026, 7, 14, 7).getTime());

    complete(harness, item);

    expect(harness.unlock).toHaveBeenCalledWith('ECHO_EARLY_BIRD');
  });

  it('unlocks midnight three after three distinct late-night completions', () => {
    const items = Array.from({ length: 3 }, (_, index) => track(`midnight-three-${index}`));
    const harness = createHarness({ tracks: items });
    harness.setNow(new Date(2026, 7, 14, 1).getTime());

    items.forEach((item) => complete(harness, item));

    expect(harness.unlock).toHaveBeenCalledWith('ECHO_MIDNIGHT_THREE');
  });

  it('unlocks yesterday once more after the same track on three consecutive days', () => {
    const item = track('three-day-streak');
    const history = [
      historyEntry(item, new Date(2026, 7, 12, 12).toISOString()),
      historyEntry(item, new Date(2026, 7, 13, 12).toISOString()),
    ];
    const harness = createHarness({ tracks: [item], history });
    harness.setNow(new Date(2026, 7, 14, 12).getTime());

    complete(harness, item);

    expect(harness.unlock).toHaveBeenCalledWith('ECHO_THREE_DAY_TRACK_STREAK');
  });

  it('unlocks from morning to night for three different tracks from one four-track album', () => {
    const items = Array.from({ length: 4 }, (_, index) => track(`all-day-${index}`, { trackNo: index + 1 }));
    const history = [
      historyEntry(items[0]!, new Date(2026, 7, 14, 7).toISOString()),
      historyEntry(items[1]!, new Date(2026, 7, 14, 13).toISOString()),
    ];
    const harness = createHarness({ tracks: items, history });
    harness.setNow(new Date(2026, 7, 14, 21).getTime());

    complete(harness, items[2]!);

    expect(harness.unlock).toHaveBeenCalledWith('ECHO_ALBUM_ALL_DAY');
  });

  it('unlocks looks off the charts after completing a local track whose artist contains 赵小六', () => {
    const item = track('zhao-xiaoliu', { artist: '赵小六 / 特邀嘉宾' });
    const harness = createHarness({ tracks: [item] });

    complete(harness, item);

    expect(harness.unlock).toHaveBeenCalledWith('ECHO_ZHAO_XIAOLIU_HANDSOME');
  });

  it('settles looks off the charts when the daemon advances without a gapless transition', () => {
    const item = track('zhao-xiaoliu-daemon-advance', { artist: 'MC赵小六' });
    const harness = createHarness({ tracks: [item] });

    harness.tracker.onAudioStatus(status(item));
    harness.advance(90);
    harness.tracker.onTrackAdvance({
      status: status(item, { positionSeconds: 90 }),
      nextTrackId: 'next-track',
      gapless: false,
    });

    expect(harness.unlock).toHaveBeenCalledWith('ECHO_ZHAO_XIAOLIU_HANDSOME');
    expect(harness.unlock).not.toHaveBeenCalledWith('ECHO_FIRST_GAPLESS');
  });

  it('does not unlock looks off the charts below 75 percent actual playback', () => {
    const item = track('zhao-xiaoliu-incomplete', { artist: '赵小六' });
    const harness = createHarness({ tracks: [item] });

    complete(harness, item, 73);

    expect(harness.unlock).not.toHaveBeenCalledWith('ECHO_ZHAO_XIAOLIU_HANDSOME');
  });
});
