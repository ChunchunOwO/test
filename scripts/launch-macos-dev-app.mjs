import { existsSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { findMacosDevApp } from './macos-dev-app-paths.mjs';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export const createMacosDevAppLaunch = ({
  appPath,
  finder = false,
  appArgs = [],
} = {}) => finder
  ? { command: 'open', args: ['-n', appPath, ...(appArgs.length > 0 ? ['--args', ...appArgs] : [])] }
  : { command: join(appPath, 'Contents', 'MacOS', 'ECHO'), args: appArgs };

export const launchMacosDevApp = () => {
  if (process.platform !== 'darwin' || process.arch !== 'arm64') {
    throw new Error(
      `launch:mac:dev-app requires native Apple Silicon macOS. Current platform is ${process.platform}/${process.arch}.`,
    );
  }
  const finder = process.argv.includes('--finder');
  const appArgs = process.argv.slice(2).filter((arg) => arg !== '--finder');
  const appPath = findMacosDevApp({ projectRoot, arch: process.arch });
  if (!appPath) {
    throw new Error('ECHO.app was not found under dist/. Run npm run build:mac:dev-app first.');
  }
  const launch = createMacosDevAppLaunch({ appPath, finder, appArgs });
  if (!finder && (!existsSync(launch.command) || !statSync(launch.command).isFile())) {
    throw new Error(`App executable is missing: ${launch.command}`);
  }

  console.log(`[launch:mac:dev-app] Starting ${appPath}${finder ? ' through LaunchServices' : ' with terminal logs'}.`);
  const result = spawnSync(launch.command, launch.args, {
    cwd: projectRoot,
    env: {
      ...process.env,
      ELECTRON_ENABLE_LOGGING: '1',
      ELECTRON_ENABLE_STACK_DUMPING: '1',
    },
    stdio: 'inherit',
    shell: false,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Development app exited with code ${result.status ?? 'unknown'}`);
  }
};

const isMain = process.argv[1]
  ? import.meta.url === pathToFileURL(resolve(process.argv[1])).href
  : false;

if (isMain) {
  try {
    launchMacosDevApp();
  } catch (error) {
    console.error('[launch:mac:dev-app] Failed.');
    console.error(`[launch:mac:dev-app] ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
