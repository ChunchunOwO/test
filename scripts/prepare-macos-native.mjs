import { existsSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export const createMacosNativePreparationSteps = ({
  root = projectRoot,
  nodePath = process.execPath,
} = {}) => [
  {
    label: 'development environment',
    command: nodePath,
    args: [join(root, 'scripts', 'doctor-macos.mjs'), '--compile-only'],
  },
  {
    label: 'Electron native ABI',
    command: nodePath,
    args: [join(root, 'scripts', 'ensure-native-abi.mjs'), 'electron'],
  },
  {
    label: 'Native Audio Host',
    command: nodePath,
    args: [join(root, 'scripts', 'build-audio-host.mjs')],
    env: {
      ECHO_ENABLE_ASIO: 'OFF',
      ECHO_ENABLE_CUDA_DSP: 'OFF',
    },
  },
  {
    label: 'native library scanner',
    command: nodePath,
    args: [join(root, 'scripts', 'build-native-scanner.mjs')],
  },
];

const assertExecutableFile = (filePath, label) => {
  if (!existsSync(filePath)) {
    throw new Error(`Missing ${label}: ${filePath}`);
  }
  const stats = statSync(filePath);
  if (!stats.isFile() || (stats.mode & 0o111) === 0) {
    throw new Error(`${label} is not executable: ${filePath}`);
  }
};

const runStep = (step) => {
  console.log(`[prepare:mac:native] Preparing ${step.label}...`);
  const result = spawnSync(step.command, step.args, {
    cwd: projectRoot,
    env: { ...process.env, ...step.env },
    stdio: 'inherit',
    shell: false,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${step.label} failed with exit code ${result.status ?? 'unknown'}`);
  }
};

export const prepareMacosNativeDevelopment = () => {
  if (process.platform !== 'darwin' || process.arch !== 'arm64') {
    throw new Error(
      `macOS native preparation requires a native Apple Silicon session. Current platform is ${process.platform}/${process.arch}.`,
    );
  }

  for (const step of createMacosNativePreparationSteps()) runStep(step);

  assertExecutableFile(join(projectRoot, 'electron-app', 'build', 'echo-audio-host'), 'macOS audio host');
  assertExecutableFile(join(projectRoot, 'electron-app', 'build', 'echo-native-scanner'), 'macOS native scanner');
  console.log('[prepare:mac:native] Native development prerequisites are ready.');
};

const isMain = process.argv[1]
  ? import.meta.url === pathToFileURL(resolve(process.argv[1])).href
  : false;

if (isMain) {
  try {
    prepareMacosNativeDevelopment();
  } catch (error) {
    console.error('[prepare:mac:native] Failed.');
    console.error(`[prepare:mac:native] ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
