import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const brewfilePath = join(projectRoot, 'build-resources', 'macos', 'Brewfile.dev');

export const assertPinnedMacosJavaScriptToolchain = ({
  nodeVersion = process.versions.node,
  npmUserAgent = process.env.npm_config_user_agent ?? '',
} = {}) => {
  const nodeParts = String(nodeVersion).split('.').map((part) => Number(part));
  const nodeReady = nodeParts[0] === 22 && (
    nodeParts[1] > 23 || (nodeParts[1] === 23 && (nodeParts[2] ?? 0) >= 2)
  );
  if (!nodeReady) {
    throw new Error(`Node.js 22.23.2 arm64 is required before setup. Current version is ${nodeVersion}.`);
  }
  const npmVersion = npmUserAgent.match(/(?:^|\s)npm\/(\d+\.\d+\.\d+)/u)?.[1] ?? null;
  if (npmVersion !== '10.9.8') {
    throw new Error(`npm 10.9.8 is required before setup. Current npm user agent is ${npmUserAgent || 'unknown'}.`);
  }
};

export const createMacosSetupSteps = ({
  root = projectRoot,
  npmExecPath = process.env.npm_execpath,
  nodePath = process.execPath,
} = {}) => {
  if (!npmExecPath) {
    throw new Error('Run setup through npm so the pinned npm CLI can be reused: npm run setup:mac');
  }
  const brewfile = join(root, 'build-resources', 'macos', 'Brewfile.dev');
  return [
    {
      label: 'Homebrew development dependencies',
      command: 'brew',
      args: ['bundle', `--file=${brewfile}`],
      env: { HOMEBREW_NO_AUTO_UPDATE: '1' },
    },
    {
      label: 'locked Node dependencies',
      command: nodePath,
      args: [npmExecPath, 'ci'],
    },
    {
      label: 'macOS development doctor',
      command: nodePath,
      args: [join(root, 'scripts', 'doctor-macos.mjs'), '--compile-only'],
    },
  ];
};

const runStep = (step) => {
  console.log(`[setup:mac] Installing/checking ${step.label}...`);
  const result = spawnSync(step.command, step.args, {
    cwd: projectRoot,
    env: { ...process.env, ...step.env },
    stdio: 'inherit',
    shell: false,
  });
  if (result.error) {
    const hint = step.command === 'brew'
      ? ' Install Homebrew first, then rerun npm run setup:mac.'
      : '';
    throw new Error(`${step.label} could not start: ${result.error.message}.${hint}`);
  }
  if (result.status !== 0) {
    throw new Error(`${step.label} failed with exit code ${result.status ?? 'unknown'}`);
  }
};

export const setupMacosDevelopment = () => {
  if (process.platform !== 'darwin' || process.arch !== 'arm64') {
    throw new Error(
      `macOS setup requires a native Apple Silicon session. Current platform is ${process.platform}/${process.arch}.`,
    );
  }
  assertPinnedMacosJavaScriptToolchain();
  if (!existsSync(brewfilePath)) {
    throw new Error(`Missing Homebrew dependency manifest: ${brewfilePath}`);
  }
  for (const step of createMacosSetupSteps()) runStep(step);
  console.log('\n[setup:mac] Development setup is ready. Start the app with: npm run dev:mac');
};

const isMain = process.argv[1]
  ? import.meta.url === pathToFileURL(resolve(process.argv[1])).href
  : false;

if (isMain) {
  try {
    setupMacosDevelopment();
  } catch (error) {
    console.error('[setup:mac] Failed.');
    console.error(`[setup:mac] ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
