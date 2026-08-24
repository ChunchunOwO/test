export const playbackCommandRequestEvent = 'playback:command-request';

/**
 * Transport commands a renderer surface may hand back to PlaybackCommandController,
 * which owns the Connect / Spotify / HQPlayer / native fallbacks behind each action.
 */
export const playbackCommandRequestActions = ['playPause', 'previousTrack', 'nextTrack'] as const;

export type PlaybackCommandRequestAction = (typeof playbackCommandRequestActions)[number];

export const isPlaybackCommandRequestAction = (value: unknown): value is PlaybackCommandRequestAction =>
  typeof value === 'string' && (playbackCommandRequestActions as readonly string[]).includes(value);

export const requestPlaybackCommand = (action: PlaybackCommandRequestAction): void => {
  window.dispatchEvent(new CustomEvent(playbackCommandRequestEvent, { detail: action }));
};
