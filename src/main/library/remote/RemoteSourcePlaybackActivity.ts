export type RemoteSourcePlaybackActivity = {
  active: boolean;
  lowLoadEnhanced: boolean;
};

type RemoteSourcePlaybackActivityListener = (activity: RemoteSourcePlaybackActivity) => void;

const listeners = new Set<RemoteSourcePlaybackActivityListener>();
let currentActivity: RemoteSourcePlaybackActivity = {
  active: false,
  lowLoadEnhanced: false,
};

export const readRemoteSourcePlaybackActivity = (): RemoteSourcePlaybackActivity => ({ ...currentActivity });

export const setRemoteSourcePlaybackActivity = (
  active: boolean,
  options: { lowLoadEnhanced?: boolean } = {},
): void => {
  const nextActivity = {
    active,
    lowLoadEnhanced: active && options.lowLoadEnhanced === true,
  };
  if (
    nextActivity.active === currentActivity.active &&
    nextActivity.lowLoadEnhanced === currentActivity.lowLoadEnhanced
  ) {
    return;
  }

  currentActivity = nextActivity;
  for (const listener of listeners) {
    listener(readRemoteSourcePlaybackActivity());
  }
};

export const subscribeRemoteSourcePlaybackActivity = (
  listener: RemoteSourcePlaybackActivityListener,
): (() => void) => {
  listeners.add(listener);
  listener(readRemoteSourcePlaybackActivity());
  return () => listeners.delete(listener);
};

export const resetRemoteSourcePlaybackActivityForTests = (): void => {
  listeners.clear();
  currentActivity = {
    active: false,
    lowLoadEnhanced: false,
  };
};
