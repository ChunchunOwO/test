import { existsSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const quick = process.argv.includes('--quick');
const forwardedArgs = process.argv.slice(2).filter((arg) => arg !== '--quick');

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    env: process.env,
    stdio: 'inherit',
    shell: false,
    ...options,
  });
  if (result.error) throw result.error;
  if (result.signal === 'SIGINT' || result.signal === 'SIGTERM') return;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.status ?? 'unknown'}`);
  }
};

const assertFile = (filePath, label, executable = false) => {
  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    throw new Error(`Missing ${label}: ${filePath}. Run npm run dev:mac once without --quick.`);
  }
  if (executable && (statSync(filePath).mode & 0o111) === 0) {
    throw new Error(`${label} is not executable: ${filePath}`);
  }
};

export const assertMacosQuickDevelopmentInputs = ({ root = projectRoot } = {}) => {
  assertFile(join(root, 'node_modules', 'better-sqlite3', 'build', 'Release', 'better_sqlite3.node'), 'Electron native ABI');
  assertFile(join(root, 'electron-app', 'build', 'echo-audio-host'), 'macOS audio host', true);
  assertFile(join(root, 'electron-app', 'build', 'echo-native-scanner'), 'macOS native scanner', true);
};

export const runMacosDevelopment = () => {
  if (process.platform !== 'darwin' || process.arch !== 'arm64') {
    throw new Error(`dev:mac requires native Apple Silicon macOS. Current platform is ${process.platform}/${process.arch}.`);
  }

  if (quick) {
    run(process.execPath, [join(projectRoot, 'scripts', 'doctor-macos.mjs'), '--compile-only']);
    assertMacosQuickDevelopmentInputs();
    console.log('[dev:mac] Quick mode is reusing existing native outputs.');
  } else {
    run(process.execPath, [join(projectRoot, 'scripts', 'prepare-macos-native.mjs')]);
  }

  const electronVite = join(projectRoot, 'node_modules', '.bin', 'electron-vite');
  assertFile(electronVite, 'electron-vite CLI', true);
  console.log('[dev:mac] Starting Electron development mode. Audio/device truth remains in the Native Audio Host.');
  run(electronVite, ['dev', ...forwardedArgs]);
};

const isMain = process.argv[1]
  ? import.meta.url === pathToFileURL(resolve(process.argv[1])).href
  : false;

if (isMain) {
  try {
    runMacosDevelopment();
  } catch (error) {
    console.error('[dev:mac] Failed.');
    console.error(`[dev:mac] ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
