import { describe, expect, it, vi } from 'vitest';
import { SteamStartupAchievementCoordinator } from './SteamStartupAchievementCoordinator';

describe('SteamStartupAchievementCoordinator', () => {
  it('settles launch and crash recovery without a library dependency', () => {
    const unlock = vi.fn(() => true);
    const coordinator = new SteamStartupAchievementCoordinator({
      achievements: { isUnlocked: () => false, unlock },
      crashes: { getLastCrashSummary: () => ({ reason: 'abnormalExit' }) },
      pollIntervalMs: 60_000,
    });

    coordinator.start();

    expect(unlock).toHaveBeenCalledWith('ECHO_FIRST_LAUNCH');
    expect(unlock).toHaveBeenCalledWith('ECHO_FIRST_CRASH_RECOVERY');
    coordinator.dispose();
  });

  it('retries startup milestones when Steam becomes ready later', () => {
    vi.useFakeTimers();
    let ready = false;
    const unlock = vi.fn(() => ready);
    const coordinator = new SteamStartupAchievementCoordinator({
      achievements: { isUnlocked: () => false, unlock },
      crashes: { getLastCrashSummary: () => null },
      pollIntervalMs: 1_000,
    });
    coordinator.start();
    expect(unlock).toHaveBeenCalledTimes(1);

    ready = true;
    vi.advanceTimersByTime(1_000);
    expect(unlock).toHaveBeenCalledTimes(2);

    coordinator.dispose();
    vi.useRealTimers();
  });
});
