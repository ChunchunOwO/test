import type { SteamListeningStatId } from '../types/steam';

export const steamListeningStatsMilestones: Partial<Record<SteamListeningStatId, readonly number[]>> = {
  'listening-minutes': [6_000],
  'completed-plays': [250, 500, 1_000, 2_500, 5_000, 10_000],
  'unique-tracks': [100],
  'longest-streak-days': [7],
  'night-minutes': [300],
  'completed-albums': [10],
};

export const nextSteamListeningStatsMilestone = (
  statId: SteamListeningStatId,
  value: number,
): number | null => steamListeningStatsMilestones[statId]?.find((target) => value < target) ?? null;
