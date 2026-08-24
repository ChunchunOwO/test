import { copyFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import electronPackage from 'electron/package.json' with { type: 'json' };

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceDir = join(projectRoot, 'native', 'steam-leaderboards');
const nodeGyp = join(projectRoot, 'node_modules', 'node-gyp', 'bin', 'node-gyp.js');
const builtAddon = join(sourceDir, 'build', 'Release', 'echo-steam-leaderboards.node');
const outputDir = join(projectRoot, 'electron-app', 'build');
const outputAddon = join(outputDir, 'echo-steam-leaderboards.node');
const buildInputs = [
  join(sourceDir, 'binding.gyp'),
  join(sourceDir, 'src', 'main.cpp'),
  join(projectRoot, 'node_modules', 'electron', 'package.json'),
  join(projectRoot, 'node_modules', 'node-addon-api', 'package.json'),
];

if (process.platform !== 'win32') {
  console.log('[build:steam-leaderboards] Skipped: Windows-only Steam release bridge.');
  process.exit(0);
}
if (!existsSync(nodeGyp)) {
  throw new Error('node-gyp is unavailable; run npm install first.');
}
if (
  existsSync(outputAddon) &&
  buildInputs.every((input) => existsSync(input) && statSync(input).mtimeMs <= statSync(outputAddon).mtimeMs)
) {
  console.log('[build:steam-leaderboards] Existing Electron addon is up to date.');
  process.exit(0);
}

const result = spawnSync(
  process.execPath,
  [
    nodeGyp,
    'rebuild',
    '--directory', sourceDir,
    `--target=${electronPackage.version}`,
    '--arch=x64',
    '--dist-url=https://electronjs.org/headers',
  ],
  { cwd: projectRoot, stdio: 'inherit', shell: false },
);
if (result.error) throw result.error;
if (result.status !== 0) throw new Error(`node-gyp failed with exit code ${result.status}`);
if (!existsSync(builtAddon)) throw new Error(`Built addon was not found: ${builtAddon}`);

mkdirSync(outputDir, { recursive: true });
copyFileSync(builtAddon, outputAddon);
console.log(`[build:steam-leaderboards] Copied to ${outputAddon}`);
