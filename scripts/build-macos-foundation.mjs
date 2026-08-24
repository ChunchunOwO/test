import { existsSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const hostBinary = join(projectRoot, 'electron-app', 'build', 'echo-audio-host');
const scannerBinary = join(projectRoot, 'electron-app', 'build', 'echo-native-scanner');

const fail = (message) => {
  console.error(`[build:mac:foundation] ${message}`);
  process.exit(1);
};

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    stdio: 'inherit',
    shell: false,
    ...options,
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.status}`);
  }
};

const assertExecutableFile = (filePath, label) => {
  if (!existsSync(filePath)) {
    throw new Error(`Missing ${label}: ${filePath}`);
  }
  const stats = statSync(filePath);
  if (!stats.isFile() || (stats.mode & 0o111) === 0) {
    throw new Error(`${label} is not an executable file: ${filePath}`);
  }
};

try {
  if (process.platform !== 'darwin') {
    fail(
      `This compile foundation must run on macOS. Current platform is ${process.platform}/${process.arch}; ` +
      'use an Apple Mac or the manual macOS CI workflow.',
    );
  }
  if (process.arch !== 'arm64') {
    fail(`macOS development foundation currently requires native arm64. Current architecture is ${process.arch}.`);
  }

  run(process.execPath, [join(projectRoot, 'scripts', 'prepare-macos-native.mjs')]);
  assertExecutableFile(hostBinary, 'macOS audio host');
  assertExecutableFile(scannerBinary, 'macOS native scanner');
  run('npm', ['run', 'build']);

  console.log('[build:mac:foundation] macOS compile foundation completed.');
  console.log('[build:mac:foundation] No DMG, signing, notarization, Steam depot, or release artifact was produced.');
} catch (error) {
  console.error('[build:mac:foundation] Failed.');
  console.error(`[build:mac:foundation] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
