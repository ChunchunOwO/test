import { createRequire } from 'node:module';
import { app } from 'electron';
import { join } from 'node:path';

export type NativeLeaderboardEntry = {
  steamId: string;
  rank: number;
  score: number;
  playerName: string | null;
  details: number[];
};

export type NativeLeaderboardUploadResult = {
  changed: boolean;
  score: number;
  globalRank: number;
  previousGlobalRank: number;
};

export type SteamLeaderboardNativeBinding = {
  initialize(dllPath: string): boolean;
  findLeaderboard(name: string): Promise<bigint>;
  uploadScore(handle: bigint, score: number, details: number[]): Promise<NativeLeaderboardUploadResult>;
  downloadEntries(
    handle: bigint,
    request: 0 | 1 | 2,
    start: number,
    end: number,
  ): Promise<NativeLeaderboardEntry[]>;
};

export type SteamLeaderboardNativeRuntime = {
  addonPath: string;
  dllPath: string;
};

const require = createRequire(import.meta.url);

export const getSteamLeaderboardNativeRuntime = (): SteamLeaderboardNativeRuntime => {
  if (app.isPackaged) {
    return {
      addonPath: join(process.resourcesPath, 'echo-steam-leaderboards.node'),
      dllPath: join(
        process.resourcesPath,
        'app.asar.unpacked',
        'node_modules',
        'steamworks.js',
        'dist',
        'win64',
        'steam_api64.dll',
      ),
    };
  }
  const projectRoot = app.getAppPath();
  return {
    addonPath: join(projectRoot, 'electron-app', 'build', 'echo-steam-leaderboards.node'),
    dllPath: join(projectRoot, 'node_modules', 'steamworks.js', 'dist', 'win64', 'steam_api64.dll'),
  };
};

export const loadSteamLeaderboardNativeBinding = (): SteamLeaderboardNativeBinding => {
  if (process.platform !== 'win32') {
    throw new Error('Steam leaderboards are available only in the Windows Steam release.');
  }
  const runtime = getSteamLeaderboardNativeRuntime();
  const binding = require(runtime.addonPath) as SteamLeaderboardNativeBinding;
  binding.initialize(runtime.dllPath);
  return binding;
};
