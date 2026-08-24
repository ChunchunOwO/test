import { spawnSync } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const repositoryRoot = resolve(import.meta.dirname, '..', '..');
const outputDirectory = resolve(repositoryRoot, 'dist', 'workshop-sdk');
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error('npm_execpath is unavailable; run this command through npm.');

const check = spawnSync(process.execPath, [resolve(repositoryRoot, 'scripts', 'workshop', 'check-sdk-package.mjs')], {
  cwd: repositoryRoot,
  stdio: 'inherit',
});
if (check.status !== 0) process.exit(check.status ?? 1);

await mkdir(outputDirectory, { recursive: true });
const packed = spawnSync(process.execPath, [npmCli, 'pack', resolve(repositoryRoot, 'docs', 'workshop-sdk'), '--pack-destination', outputDirectory], {
  cwd: repositoryRoot,
  stdio: 'inherit',
});
if (packed.status !== 0) process.exit(packed.status ?? 1);

console.log(`[echo-workshop-sdk] Package written to ${outputDirectory}`);
