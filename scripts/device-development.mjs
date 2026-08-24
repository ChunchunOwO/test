import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const action = process.argv[2] ?? 'status';
const forwardedArgs = process.argv.slice(3);

const runCapture = (command, args, { allowFailure = false } = {}) => {
  try {
    return execFileSync(command, args, {
      cwd: projectRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    }).trim();
  } catch (error) {
    if (allowFailure) return null;
    const stderr = typeof error?.stderr === 'string' ? error.stderr.trim() : '';
    throw new Error(`${command} ${args.join(' ')} failed${stderr ? `: ${stderr}` : ''}`);
  }
};

const runInherited = (command, args, options = {}) => {
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

export const selectDeviceNpmScript = ({ platform, arch, task, quick = false }) => {
  if (platform === 'darwin') {
    if (arch !== 'arm64') {
      throw new Error(`ECHO macOS development requires native Apple Silicon. Current architecture is ${arch}.`);
    }
    if (task === 'setup') return 'setup:mac';
    if (task === 'doctor') return 'doctor:mac';
    if (task === 'start') return quick ? 'dev:mac:quick' : 'dev:mac';
  }
  if (platform === 'win32') {
    if (task === 'setup') return 'setup';
    if (task === 'doctor') return 'doctor';
    if (task === 'start') return 'dev';
  }
  throw new Error(`Device switching currently supports Windows x64 and Apple Silicon macOS. Current platform is ${platform}/${arch}.`);
};

export const parseAheadBehind = (value) => {
  const [aheadText, behindText] = String(value).trim().split(/\s+/u);
  const ahead = Number.parseInt(aheadText, 10);
  const behind = Number.parseInt(behindText, 10);
  if (!Number.isInteger(ahead) || !Number.isInteger(behind)) {
    throw new Error(`Unable to parse Git divergence: ${value}`);
  }
  return { ahead, behind };
};

export const evaluateHandoffState = ({ branch, upstream, dirtyFiles, ahead, behind }) => {
  const blockers = [];
  if (!branch) blockers.push('HEAD is detached; switch to a named branch first.');
  if (dirtyFiles.length > 0) blockers.push(`Working tree has ${dirtyFiles.length} uncommitted path(s). Commit or intentionally preserve them first.`);
  if (!upstream) blockers.push('The current branch has no upstream. Publish it with git push -u before switching devices.');
  if (ahead > 0) blockers.push(`The current branch is ahead by ${ahead} commit(s). Push before switching devices.`);
  if (behind > 0) blockers.push(`The current branch is behind by ${behind} commit(s). Fast-forward it before handing off.`);
  return blockers;
};

export const shouldRunDeviceSetup = ({ platform, nodeModulesPresent, changedPaths }) => {
  if (!nodeModulesPresent) return true;
  const setupInputs = new Set(['package-lock.json', '.node-version', '.nvmrc']);
  if (platform === 'darwin') setupInputs.add('build-resources/macos/Brewfile.dev');
  return changedPaths.some((path) => setupInputs.has(path.replaceAll('\\', '/')));
};

const inspectGitState = () => {
  const branch = runCapture('git', ['symbolic-ref', '--quiet', '--short', 'HEAD'], { allowFailure: true });
  const head = runCapture('git', ['rev-parse', 'HEAD']);
  const upstream = runCapture('git', ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}'], { allowFailure: true });
  const dirtyOutput = runCapture('git', ['status', '--porcelain=v1', '--untracked-files=all']);
  const dirtyFiles = dirtyOutput ? dirtyOutput.split(/\r?\n/u) : [];
  const divergence = upstream
    ? parseAheadBehind(runCapture('git', ['rev-list', '--left-right', '--count', `HEAD...${upstream}`]))
    : { ahead: 0, behind: 0 };
  return { branch, head, upstream, dirtyFiles, ...divergence };
};

const npmVersion = () => {
  if (!process.env.npm_execpath) return null;
  return runCapture(process.execPath, [process.env.npm_execpath, '--version'], { allowFailure: true });
};

const printStatus = (state) => {
  console.log('\nECHO cross-device development');
  console.log(`Platform: ${process.platform}/${process.arch}`);
  console.log(`Node/npm: ${process.version}/${npmVersion() ?? 'unknown'}`);
  console.log(`Branch: ${state.branch ?? '(detached HEAD)'}`);
  console.log(`HEAD: ${state.head.slice(0, 12)}`);
  console.log(`Upstream: ${state.upstream ?? '(none)'}`);
  console.log(`Divergence: ahead ${state.ahead}, behind ${state.behind}`);
  console.log(`Working tree: ${state.dirtyFiles.length === 0 ? 'clean' : `${state.dirtyFiles.length} changed path(s)`}`);
};

const requireNpm = () => {
  if (!process.env.npm_execpath) {
    throw new Error('Run this command through npm so the repository-pinned npm CLI can be reused.');
  }
};

const runNpmScript = (script, args = []) => {
  requireNpm();
  console.log(`\n[device-dev] Running npm run ${script}${args.length ? ` -- ${args.join(' ')}` : ''}`);
  runInherited(process.execPath, [process.env.npm_execpath, 'run', script, ...(args.length ? ['--', ...args] : [])]);
};

const requireCleanNamedBranch = (state) => {
  if (!state.branch) throw new Error('HEAD is detached. Switch to a named branch before syncing devices.');
  if (state.dirtyFiles.length > 0) {
    throw new Error(`Working tree has ${state.dirtyFiles.length} uncommitted path(s). Sync will not stash, overwrite, or merge them.`);
  }
  if (!state.upstream) throw new Error('The current branch has no upstream. Run git push -u first.');
};

const writeHandoffReport = (state, blockers) => {
  const reportPath = join(projectRoot, 'misc', 'device-handoff.json');
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify({
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    platform: process.platform,
    arch: process.arch,
    node: process.version,
    npm: npmVersion(),
    branch: state.branch,
    head: state.head,
    upstream: state.upstream,
    ahead: state.ahead,
    behind: state.behind,
    dirtyPathCount: state.dirtyFiles.length,
    ready: blockers.length === 0,
  }, null, 2)}\n`, 'utf8');
  return reportPath;
};

const handoff = () => {
  const state = inspectGitState();
  printStatus(state);
  const blockers = evaluateHandoffState(state);
  const reportPath = writeHandoffReport(state, blockers);
  if (blockers.length > 0) {
    console.error('\nDevice handoff is not ready:');
    for (const blocker of blockers) console.error(`- ${blocker}`);
    console.error(`\nLocal report: ${reportPath}`);
    process.exitCode = 1;
    return;
  }
  console.log(`\nDevice handoff ready. Local report: ${reportPath}`);
  console.log('On the other device, run: npm run dev:switch');
};

const resumeAndStart = () => {
  let state = inspectGitState();
  const startingHead = state.head;
  printStatus(state);
  requireCleanNamedBranch(state);

  console.log('\n[device-dev] Refreshing the tracked branch...');
  runInherited('git', ['fetch', '--prune']);
  state = inspectGitState();
  requireCleanNamedBranch(state);
  if (state.ahead > 0) {
    throw new Error(`Local branch is ahead by ${state.ahead} commit(s). Push or reconcile it before resuming on this device.`);
  }
  if (state.behind > 0) {
    console.log(`[device-dev] Fast-forwarding ${state.branch} by ${state.behind} commit(s)...`);
    runInherited('git', ['merge', '--ff-only', state.upstream]);
  }

  state = inspectGitState();
  const changedInputs = state.head === startingHead
    ? []
    : runCapture('git', [
      'diff', '--name-only', startingHead, state.head, '--',
      'package-lock.json', '.node-version', '.nvmrc', 'build-resources/macos/Brewfile.dev',
    ]).split(/\r?\n/u).filter(Boolean);
  const needsSetup = shouldRunDeviceSetup({
    platform: process.platform,
    nodeModulesPresent: existsSync(join(projectRoot, 'node_modules')),
    changedPaths: changedInputs,
  });
  const preparationTask = needsSetup ? 'setup' : 'doctor';
  const preparationScript = selectDeviceNpmScript({
    platform: process.platform,
    arch: process.arch,
    task: preparationTask,
  });
  if (needsSetup) {
    console.log('[device-dev] Dependencies or pinned toolchain inputs need preparation on this device.');
  }
  runNpmScript(preparationScript);

  const script = selectDeviceNpmScript({ platform: process.platform, arch: process.arch, task: 'start' });
  runNpmScript(script, forwardedArgs);
};

const runSelectedTask = (task, { quick = false } = {}) => {
  const script = selectDeviceNpmScript({ platform: process.platform, arch: process.arch, task, quick });
  runNpmScript(script, forwardedArgs);
};

export const runDeviceDevelopment = () => {
  if (action === 'status') {
    printStatus(inspectGitState());
    return;
  }
  if (action === 'handoff') return handoff();
  if (action === 'resume') return resumeAndStart();
  if (action === 'start') return runSelectedTask('start');
  if (action === 'quick') return runSelectedTask('start', { quick: true });
  if (action === 'setup') return runSelectedTask('setup');
  if (action === 'doctor') return runSelectedTask('doctor');
  throw new Error(`Unknown action "${action}". Use status, handoff, resume, start, quick, setup, or doctor.`);
};

const isMain = process.argv[1]
  ? import.meta.url === pathToFileURL(resolve(process.argv[1])).href
  : false;

if (isMain) {
  try {
    runDeviceDevelopment();
  } catch (error) {
    console.error('\n[device-dev] Failed.');
    console.error(`[device-dev] ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
