import type { SteamAchievementId, SteamAchievementService } from './SteamCapabilityServices';

type AchievementPort = Pick<SteamAchievementService, 'isUnlocked' | 'unlock'>;

type CrashSummaryPort = {
  getLastCrashSummary(): { reason: string } | null;
};

export type SteamStartupAchievementCoordinatorOptions = {
  achievements: AchievementPort;
  crashes: CrashSummaryPort;
  pollIntervalMs?: number;
};

export class SteamStartupAchievementCoordinator {
  private readonly achievements: AchievementPort;
  private readonly crashes: CrashSummaryPort;
  private readonly pollIntervalMs: number;
  private readonly completed = new Set<SteamAchievementId>();
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(options: SteamStartupAchievementCoordinatorOptions) {
    this.achievements = options.achievements;
    this.crashes = options.crashes;
    this.pollIntervalMs = options.pollIntervalMs ?? 15_000;
  }

  start(): void {
    if (this.timer) {
      return;
    }
    this.evaluate();
    this.timer = setInterval(() => this.evaluate(), this.pollIntervalMs);
    this.timer.unref?.();
  }

  dispose(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private evaluate(): void {
    this.tryUnlock('ECHO_FIRST_LAUNCH');
    try {
      if (this.crashes.getLastCrashSummary()?.reason === 'abnormalExit') {
        this.tryUnlock('ECHO_FIRST_CRASH_RECOVERY');
      }
    } catch {
      // Diagnostics can be temporarily unavailable during early startup.
    }
  }

  private tryUnlock(achievementId: SteamAchievementId): void {
    if (this.completed.has(achievementId)) {
      return;
    }
    try {
      if (this.achievements.isUnlocked(achievementId) === true || this.achievements.unlock(achievementId)) {
        this.completed.add(achievementId);
      }
    } catch {
      // Steam can become ready after startup; retry on the next tick.
    }
  }
}
