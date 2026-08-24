import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  readRemoteSourcePlaybackActivity,
  resetRemoteSourcePlaybackActivityForTests,
  setRemoteSourcePlaybackActivity,
  subscribeRemoteSourcePlaybackActivity,
} from './RemoteSourcePlaybackActivity';

afterEach(() => resetRemoteSourcePlaybackActivityForTests());

describe('remote source playback activity', () => {
  it('records playback state without requiring a remote source service', () => {
    setRemoteSourcePlaybackActivity(true, { lowLoadEnhanced: true });

    expect(readRemoteSourcePlaybackActivity()).toEqual({
      active: true,
      lowLoadEnhanced: true,
    });

    setRemoteSourcePlaybackActivity(false, { lowLoadEnhanced: true });
    expect(readRemoteSourcePlaybackActivity()).toEqual({
      active: false,
      lowLoadEnhanced: false,
    });
  });

  it('hydrates a late subscriber and stops notifying after unsubscribe', () => {
    setRemoteSourcePlaybackActivity(true);
    const listener = vi.fn();
    const unsubscribe = subscribeRemoteSourcePlaybackActivity(listener);

    expect(listener).toHaveBeenLastCalledWith({ active: true, lowLoadEnhanced: false });

    setRemoteSourcePlaybackActivity(false);
    expect(listener).toHaveBeenLastCalledWith({ active: false, lowLoadEnhanced: false });

    unsubscribe();
    setRemoteSourcePlaybackActivity(true, { lowLoadEnhanced: true });
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
