import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { prepareSteamDepot } from './prepare-steam-depot.mjs';
import { createSteamReleasePreflight } from './create-release-preflight-report.mjs';

const steamCmdPath = resolve(process.env.STEAMCMD_PATH?.trim() || '');
const buildAccount = process.env.STEAM_BUILD_ACCOUNT?.trim() ?? '';

if (!process.env.STEAMCMD_PATH || !existsSync(steamCmdPath)) {
  throw new Error('STEAMCMD_PATH must point to an installed SteamCMD executable.');
}
if (!buildAccount || /[\r\n\s]/u.test(buildAccount)) {
  throw new Error('STEAM_BUILD_ACCOUNT must identify the dedicated Steam build account.');
}

const plan = prepareSteamDepot({ upload: true });
const preflight = await createSteamReleasePreflight({ artifactRoot: plan.contentRoot });
if (preflight.report.result !== 'pass') {
  console.error('[steam-depot] Upload blocked by release preflight:');
  for (const finding of preflight.report.findings) {
    console.error(`- ${finding}`);
  }
  console.error(`[steam-depot] Review the local report: ${preflight.markdownPath}`);
  process.exit(1);
}

console.log(`[steam-depot] Uploading to private branch: ${plan.branch}`);
console.log('[steam-depot] SteamCMD will use its cached login or prompt interactively; no password is passed on the command line.');

const result = spawnSync(
  steamCmdPath,
  ['+login', buildAccount, '+run_app_build', plan.appConfigPath, '+quit'],
  { stdio: 'inherit', shell: false },
);

if (result.error) {
  throw result.error;
}
if (result.status !== 0) {
  process.exit(result.status ?? 1);
}
