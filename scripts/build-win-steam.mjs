import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const publisherName = process.env.ECHO_WINDOWS_PUBLISHER_NAME?.trim();
const steamAppId = process.env.ECHO_STEAM_RELEASE_APP_ID?.trim();
const steamProDlcAppId = process.env.ECHO_STEAM_PRO_DLC_APP_ID?.trim();

if (!steamAppId || !/^[1-9]\d*$/u.test(steamAppId)) {
  throw new Error(
    'ECHO_STEAM_RELEASE_APP_ID must be a positive numeric App ID for a Steam depot build.',
  );
}

if (!steamProDlcAppId || !/^[1-9]\d*$/u.test(steamProDlcAppId)) {
  throw new Error(
    'ECHO_STEAM_PRO_DLC_APP_ID must be a positive numeric DLC App ID for a Steam depot build.',
  );
}

const electronBuilderCli = fileURLToPath(new URL('../node_modules/electron-builder/cli.js', import.meta.url));
const builderArguments = [
  electronBuilderCli,
  '--win',
  '--dir',
  '--publish',
  'never',
];
if (publisherName) {
  builderArguments.push(`--config.win.signtoolOptions.publisherName=${publisherName}`);
} else {
  console.log('[build:win:steam] No publisher configured; producing an unsigned Steam depot artifact.');
}
const result = spawnSync(
  process.execPath,
  builderArguments,
  { cwd: fileURLToPath(new URL('..', import.meta.url)), env: process.env, stdio: 'inherit' },
);

if (result.error) {
  throw result.error;
}
if (result.status !== 0) {
  process.exit(result.status ?? 1);
}
