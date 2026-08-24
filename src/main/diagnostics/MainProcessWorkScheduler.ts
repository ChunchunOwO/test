import { beginMainBackgroundTask, markPlaybackBreadcrumb } from './PlaybackPerformanceDiagnostics';

export type MainWorkDeferralReason = 'playback-active';

const playbackPressureStates = new Set(['loading', 'playing']);

export const runMainBackgroundTask = async <T>(name: string, work: () => Promise<T> | T): Promise<T> => {
  const clearBackgroundTask = beginMainBackgroundTask(name);
  try {
    return await work();
  } finally {
    clearBackgroundTask();
  }
};

export const isPlaybackActiveForMainWork = async (): Promise<boolean> => {
  try {
    const { getAudioSession } = await import('../audio/AudioSession');
    const session = getAudioSession() as {
      getPlaybackState?: () => string;
      getStatus: () => { state?: string };
    };
    const state = session.getPlaybackState?.() ?? session.getStatus().state;
    return typeof state === 'string' && playbackPressureStates.has(state);
  } catch {
    return false;
  }
};

export const runNonCriticalMainWork = async <T>(options: {
  name: string;
  work: () => Promise<T> | T;
  fallback: (reason: MainWorkDeferralReason) => Promise<T> | T;
}): Promise<T> => {
  if (await isPlaybackActiveForMainWork()) {
    markPlaybackBreadcrumb(`${options.name}:deferred-for-playback`);
    return options.fallback('playback-active');
  }

  return runMainBackgroundTask(options.name, options.work);
};
