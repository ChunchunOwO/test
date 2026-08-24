import type { SteamAchievementHistoryStats } from '../../library/SteamAchievementHistoryStats';
import type { SteamAchievementId } from './SteamCapabilityServices';

export const steamDataAchievementIds = [
  'ECHO_STATS_LISTENING_100_HOURS',
  'ECHO_STATS_100_COMPLETED_TRACKS',
  'ECHO_STATS_SEVEN_DAY_STREAK',
  'ECHO_STATS_NIGHT_5_HOURS',
  'ECHO_STATS_FAVORITE_ALBUM',
] as const satisfies readonly SteamAchievementId[];

export const steamHistoricalAchievementIds = [
  ...steamDataAchievementIds,
  'ECHO_TEN_SHORT_TRACKS',
  'ECHO_COMPLETED_250',
  'ECHO_COMPLETED_500',
  'ECHO_COMPLETED_1000',
  'ECHO_COMPLETED_2500',
  'ECHO_COMPLETED_5000',
  'ECHO_COMPLETED_10000',
  'ECHO_TEN_ALBUMS',
] as const satisfies readonly SteamAchievementId[];

const oneHundredHoursSeconds = 100 * 60 * 60;
const fiveHoursSeconds = 5 * 60 * 60;

export const qualifiedSteamDataAchievements = (
  stats: SteamAchievementHistoryStats,
): SteamAchievementId[] => {
  const qualified: SteamAchievementId[] = [];
  if (stats.totalPlayedSeconds >= oneHundredHoursSeconds) {
    qualified.push('ECHO_STATS_LISTENING_100_HOURS');
  }
  if (stats.completedUniqueTracks >= 100) {
    qualified.push('ECHO_STATS_100_COMPLETED_TRACKS');
  }
  if (stats.longestCompletionStreakDays >= 7) {
    qualified.push('ECHO_STATS_SEVEN_DAY_STREAK');
  }
  if (stats.nightPlayedSeconds >= fiveHoursSeconds) {
    qualified.push('ECHO_STATS_NIGHT_5_HOURS');
  }
  if (stats.hasFavoriteAlbum) {
    qualified.push('ECHO_STATS_FAVORITE_ALBUM');
  }
  if (stats.completedShortUniqueTracks >= 5) {
    qualified.push('ECHO_TEN_SHORT_TRACKS');
  }
  if (stats.qualifiedCompletedPlayCount >= 250) {
    qualified.push('ECHO_COMPLETED_250');
  }
  if (stats.qualifiedCompletedPlayCount >= 500) {
    qualified.push('ECHO_COMPLETED_500');
  }
  if (stats.qualifiedCompletedPlayCount >= 1_000) {
    qualified.push('ECHO_COMPLETED_1000');
  }
  if (stats.qualifiedCompletedPlayCount >= 2_500) {
    qualified.push('ECHO_COMPLETED_2500');
  }
  if (stats.qualifiedCompletedPlayCount >= 5_000) {
    qualified.push('ECHO_COMPLETED_5000');
  }
  if (stats.qualifiedCompletedPlayCount >= 10_000) {
    qualified.push('ECHO_COMPLETED_10000');
  }
  if (stats.completedUniqueAlbums >= 10) {
    qualified.push('ECHO_TEN_ALBUMS');
  }
  return qualified;
};
