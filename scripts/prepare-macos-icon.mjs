import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceIcon = join(projectRoot, 'build-resources', 'icons', 'echo-app-icon.png');
const outputDir = join(projectRoot, 'electron-app', 'build', 'macos');
const outputIcon = join(outputDir, 'echo-app-icon.icns');
const miscRoot = join(projectRoot, 'misc');

const fail = (message) => {
  console.error(`[prepare:mac-icon] ${message}`);
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

if (process.platform !== 'darwin') {
  fail(`macOS icon generation must run on macOS. Current platform is ${process.platform}/${process.arch}.`);
}
if (!existsSync(sourceIcon)) {
  fail(`Missing source icon: ${sourceIcon}`);
}

mkdirSync(miscRoot, { recursive: true });
const tempRoot = mkdtempSync(join(miscRoot, 'macos-icon-'));
const iconsetDir = join(tempRoot, 'ECHO.iconset');

try {
  mkdirSync(iconsetDir, { recursive: true });
  const outputs = [
    ['icon_16x16.png', 16],
    ['icon_16x16@2x.png', 32],
    ['icon_32x32.png', 32],
    ['icon_32x32@2x.png', 64],
    ['icon_128x128.png', 128],
    ['icon_128x128@2x.png', 256],
    ['icon_256x256.png', 256],
    ['icon_256x256@2x.png', 512],
    ['icon_512x512.png', 512],
    ['icon_512x512@2x.png', 1024],
  ];

  for (const [name, size] of outputs) {
    run('sips', ['-z', String(size), String(size), sourceIcon, '--out', join(iconsetDir, name)]);
  }

  mkdirSync(outputDir, { recursive: true });
  run('iconutil', ['-c', 'icns', iconsetDir, '-o', outputIcon]);
  if (!existsSync(outputIcon)) {
    throw new Error(`iconutil did not create ${outputIcon}`);
  }
  console.log(`[prepare:mac-icon] Prepared ${outputIcon}`);
} catch (error) {
  console.error('[prepare:mac-icon] Failed.');
  console.error(`[prepare:mac-icon] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  const resolvedTempRoot = resolve(tempRoot);
  const resolvedMiscRoot = `${resolve(miscRoot)}${sep}`;
  if (resolvedTempRoot.startsWith(resolvedMiscRoot)) {
    rmSync(resolvedTempRoot, { recursive: true, force: true });
  }
}
