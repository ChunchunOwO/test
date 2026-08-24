import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const hostPath = join(projectRoot, 'electron-app', 'build', 'echo-audio-host');
const scannerPath = join(projectRoot, 'electron-app', 'build', 'echo-native-scanner');
const evidencePath = join(projectRoot, 'misc', 'macos-native-smoke.json');
const allowNoDevice = process.argv.includes('--allow-no-device');

const fail = (message) => {
  mkdirSync(dirname(evidencePath), { recursive: true });
  writeFileSync(evidencePath, `${JSON.stringify({
    result: 'fail',
    platform: process.platform,
    arch: process.arch,
    timestamp: new Date().toISOString(),
    hostPath,
    scannerPath,
    allowNoDevice,
    error: message,
  }, null, 2)}\n`, 'utf8');
  console.error(`[smoke:mac:native] ${message}`);
  console.error(`[smoke:mac:native] Evidence: ${evidencePath}`);
  process.exit(1);
};

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    encoding: 'utf8',
    shell: false,
    ...options,
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error || result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed: ${result.error?.message ?? `exit ${result.status}`}`);
  }
  return result;
};

try {
  if (process.platform !== 'darwin' || process.arch !== 'arm64') {
    fail(`This smoke must run natively on Apple Silicon macOS. Current platform is ${process.platform}/${process.arch}.`);
  }
  if (!existsSync(hostPath)) fail(`Missing Audio Host: ${hostPath}. Run npm run build:mac:foundation first.`);
  if (!existsSync(scannerPath)) fail(`Missing native scanner: ${scannerPath}. Run npm run build:mac:foundation first.`);

  run(process.execPath, [join(projectRoot, 'scripts', 'smoke-audio-host-headless.mjs')]);
  run(process.execPath, [join(projectRoot, 'scripts', 'smoke-native-scanner.mjs')]);

  const listResult = run(hostPath, ['-list']);
  const devices = `${listResult.stdout ?? ''}`
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
  if (devices.length === 0 && !allowNoDevice) {
    throw new Error('CoreAudio device enumeration returned no devices. CI may use --allow-no-device; a real Mac smoke may not.');
  }

  const evidence = {
    result: 'pass',
    platform: process.platform,
    arch: process.arch,
    timestamp: new Date().toISOString(),
    hostPath,
    scannerPath,
    headlessDecodeAndDaemon: true,
    scannerProtocol: true,
    coreAudioDeviceCount: devices.length,
    coreAudioDevices: devices,
    allowNoDevice,
  };
  mkdirSync(dirname(evidencePath), { recursive: true });
  writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  console.log(`[smoke:mac:native] PASS devices=${devices.length}`);
  console.log(`[smoke:mac:native] Evidence: ${evidencePath}`);
  console.log('[smoke:mac:native] This proves native decode/daemon/scanner/device enumeration only; audible playback and app UI still require manual smoke.');
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
