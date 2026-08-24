import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { findMacosDevApp } from './macos-dev-app-paths.mjs';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const electronBuilder = join(projectRoot, 'node_modules', '.bin', 'electron-builder');
const verifier = join(projectRoot, 'scripts', 'verify-macos-dev-app.mjs');
const auditReport = join(projectRoot, 'misc', 'macos-dev-app-audit.json');

const fail = (message) => {
  console.error(`[build:mac:dev-app] ${message}`);
  process.exit(1);
};

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    stdio: 'inherit',
    shell: false,
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.status}`);
  }
};

try {
  if (process.platform !== 'darwin') {
    fail(
      `Unsigned macOS development apps must be built on macOS. Current platform is ${process.platform}/${process.arch}.`,
    );
  }
  if (process.arch !== 'arm64') {
    fail(`Unsigned macOS development app packaging currently supports arm64 only. Current architecture is ${process.arch}.`);
  }
  if (!existsSync(electronBuilder)) {
    fail(`Missing electron-builder: ${electronBuilder}. Run npm ci on the Mac first.`);
  }

  run('npm', ['run', 'build:mac:foundation']);
  run('npm', ['run', 'prepare:mac-icon']);

  run(electronBuilder, ['--mac', '--dir', '--arm64', '-c.mac.identity=null'], {
    env: {
      ...process.env,
      CSC_IDENTITY_AUTO_DISCOVERY: 'false',
    },
  });

  const appPath = findMacosDevApp({ projectRoot, arch: process.arch });
  if (!appPath) {
    throw new Error(`electron-builder did not create ECHO.app under ${join(projectRoot, 'dist')}`);
  }

  run(process.execPath, [
    verifier,
    '--app',
    appPath,
    '--arch',
    process.arch,
    '--json-out',
    auditReport,
  ]);
  console.log(`[build:mac:dev-app] Development app ready: ${appPath}`);
  console.log(`[build:mac:dev-app] Local audit report: ${auditReport}`);
  console.log('[build:mac:dev-app] This unsigned app is local-only and is not a distributable or Steam release artifact.');
} catch (error) {
  console.error('[build:mac:dev-app] Failed.');
  console.error(`[build:mac:dev-app] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
