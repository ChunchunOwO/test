import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const defaultEvidencePath = join(projectRoot, 'misc', 'macos-doctor.json');

const runProbe = (command, args = ['--version']) => {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    shell: false,
  });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
  return {
    ok: !result.error && result.status === 0,
    output: output || (result.error?.message ?? `exit ${result.status ?? 'unknown'}`),
  };
};

const parseVersion = (value) => {
  const match = String(value ?? '').match(/(\d+)\.(\d+)(?:\.(\d+))?/u);
  return match ? match.slice(1).map((part) => Number(part ?? 0)) : null;
};

const versionAtLeast = (actual, required) => {
  for (let index = 0; index < required.length; index += 1) {
    if ((actual?.[index] ?? 0) > required[index]) return true;
    if ((actual?.[index] ?? 0) < required[index]) return false;
  }
  return true;
};

export const evaluateMacosDevelopmentEnvironment = ({
  platform = process.platform,
  arch = process.arch,
  nodeVersion = process.versions.node,
  npmVersion,
  probe = runProbe,
  compileOnly = false,
}) => {
  const checks = [];
  const add = (name, ok, detail, level = 'required', fix = '') => {
    checks.push({ name, ok, detail, level, fix });
  };

  add('macOS host', platform === 'darwin', `${platform}/${arch}`, 'required', 'Run this command on the target Apple Silicon Mac.');
  if (platform !== 'darwin') {
    return { checks, ready: false, releaseToolsReady: false };
  }

  add('Apple Silicon process', arch === 'arm64', arch, 'required', 'Use the arm64 Node.js build on Apple Silicon; do not develop the release under Rosetta.');
  const node = parseVersion(nodeVersion);
  add('Node.js', node?.[0] === 22 && versionAtLeast(node, [22, 23, 2]), `v${nodeVersion}`, 'required', 'Install the repository-pinned Node.js 22.23.2 arm64 build.');
  const npm = parseVersion(npmVersion);
  add('npm', npm?.[0] === 10 && npm?.[1] === 9 && npm?.[2] === 8, npmVersion ?? 'not found', 'required', 'Use npm 10.9.8 from packageManager/Volta metadata.');

  const requiredCommands = [
    ['Xcode developer directory', 'xcode-select', ['-p'], 'Install Xcode and select it with xcode-select.'],
    ['Apple Clang', 'xcrun', ['--find', 'clang'], 'Install Xcode Command Line Tools.'],
    ['macOS SDK', 'xcrun', ['--sdk', 'macosx', '--show-sdk-path'], 'Install a macOS SDK through Xcode.'],
    ['CMake 3.24+', 'cmake', ['--version'], 'brew install cmake'],
    ['pkg-config', 'pkg-config', ['--version'], 'brew install pkg-config'],
    ['FFmpeg CLI', 'ffmpeg', ['-hide_banner', '-version'], 'brew install ffmpeg'],
    ['FFmpeg development packages', 'pkg-config', ['--exists', 'libavformat', 'libavcodec', 'libswresample', 'libavutil'], 'Install FFmpeg headers and pkg-config metadata.'],
  ];

  for (const [name, command, args, fix] of requiredCommands) {
    const result = probe(command, args);
    const version = name === 'CMake 3.24+' ? parseVersion(result.output) : null;
    const ok = name === 'CMake 3.24+'
      ? result.ok && versionAtLeast(version, [3, 24, 0])
      : result.ok;
    add(name, ok, result.output, 'required', fix);
  }

  const machine = probe('uname', ['-m']);
  add('Native machine architecture', machine.ok && machine.output.trim() === 'arm64', machine.output, 'required', 'Use an Apple Silicon machine and an arm64 terminal session.');
  const translated = probe('sysctl', ['-in', 'sysctl.proc_translated']);
  add('Rosetta translation disabled', !translated.ok || translated.output.trim() !== '1', translated.ok ? translated.output : 'native or unavailable', 'required', 'Restart Terminal outside Rosetta and reinstall arm64 Node/native dependencies.');

  if (!compileOnly) {
    for (const [name, command, args, fix] of [
      ['codesign', 'xcrun', ['--find', 'codesign'], 'Install full Xcode before release signing work.'],
      ['notarytool', 'xcrun', ['--find', 'notarytool'], 'Install a current full Xcode before notarization work.'],
      ['stapler', 'xcrun', ['--find', 'stapler'], 'Install a current full Xcode before notarization work.'],
    ]) {
      const result = probe(command, args);
      add(name, result.ok, result.output, 'release', fix);
    }
  }

  return {
    checks,
    ready: checks.filter((check) => check.level === 'required').every((check) => check.ok),
    releaseToolsReady: checks.filter((check) => check.level === 'release').every((check) => check.ok),
  };
};

export const createMacosDoctorEvidence = ({
  report,
  compileOnly,
  platform = process.platform,
  arch = process.arch,
  nodeVersion = process.versions.node,
  npmVersion = null,
  timestamp = new Date().toISOString(),
}) => ({
  result: report.ready ? 'pass' : 'fail',
  kind: compileOnly ? 'compile-prerequisites' : 'development-and-release-tools',
  timestamp,
  platform,
  arch,
  nodeVersion,
  npmVersion,
  compileReady: report.ready,
  releaseToolsChecked: !compileOnly,
  releaseToolsReady: compileOnly ? null : report.releaseToolsReady,
  checks: report.checks,
});

const isMain = process.argv[1]
  ? import.meta.url === pathToFileURL(resolve(process.argv[1])).href
  : false;

if (isMain) {
  const compileOnly = process.argv.includes('--compile-only');
  const readArg = (name) => {
    const index = process.argv.indexOf(name);
    return index >= 0 ? process.argv[index + 1] : null;
  };
  const npmProbe = runProbe('npm', ['--version']);
  const report = evaluateMacosDevelopmentEnvironment({
    npmVersion: npmProbe.ok ? npmProbe.output : null,
    compileOnly,
  });
  const evidence = createMacosDoctorEvidence({
    report,
    compileOnly,
    npmVersion: npmProbe.ok ? npmProbe.output : null,
  });
  const evidencePath = resolve(readArg('--json-out') ?? defaultEvidencePath);
  mkdirSync(dirname(evidencePath), { recursive: true });
  writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');

  console.log('\nECHO macOS development environment\n');
  for (const check of report.checks) {
    const marker = check.ok ? 'OK' : check.level === 'release' ? 'LATER' : 'MISSING';
    console.log(`[${marker}] ${check.name}: ${check.detail}`);
    if (!check.ok && check.fix) console.log(`  Fix: ${check.fix}`);
  }

  if (!report.ready) {
    console.error(`\n[doctor:mac] Evidence: ${evidencePath}`);
    console.error('\n[doctor:mac] Required macOS development prerequisites are incomplete.');
    process.exit(1);
  }
  console.log(`[doctor:mac] Evidence: ${evidencePath}`);
  console.log(compileOnly
    ? '\n[doctor:mac] Compile prerequisites ready.'
    : `\n[doctor:mac] Compile prerequisites ready; release tools ${report.releaseToolsReady ? 'ready' : 'still incomplete'}.`);
}
