import { spawn } from 'node:child_process';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';

const projectRoot = process.cwd();
const electronBuilderCli = join(projectRoot, 'node_modules', 'electron-builder', 'cli.js');
const child = spawn(process.execPath, [electronBuilderCli, '--win', '--dir', '--publish', 'never'], {
  cwd: projectRoot,
  env: {
    ...process.env,
    CSC_IDENTITY_AUTO_DISCOVERY: 'false',
  },
  stdio: 'inherit',
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  if ((code ?? 1) === 0) {
    const outputRoot = join(projectRoot, 'dist', 'win-unpacked');
    // ShinawaseLoader is an external component installed only after this build finishes.
    Promise.all([
      rm(join(outputRoot, 'ShinawaseLoader'), { recursive: true, force: true }),
      rm(join(outputRoot, 'Mods'), { recursive: true, force: true }),
    ]).then(() => process.exit(0)).catch((error) => { console.error(error); process.exit(1); });
    return;
  }
  process.exit(code ?? 1);
});
