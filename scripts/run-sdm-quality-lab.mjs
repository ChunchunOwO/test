import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const scriptPath = fileURLToPath(import.meta.url);
const projectRoot = resolve(dirname(scriptPath), '..');
const sourceDir = join(projectRoot, 'native', 'audio-host', 'tools', 'sdm-quality-lab');
const buildDir = join(projectRoot, 'out', 'native', 'sdm-quality-lab');
const config = process.env.ECHO_SDM_QUALITY_LAB_CONFIG || 'Release';
const isWindows = process.platform === 'win32';
const outputArgumentIndex = process.argv.indexOf('--output');
const outputPath = resolve(
  projectRoot,
  outputArgumentIndex >= 0 && process.argv[outputArgumentIndex + 1]
    ? process.argv[outputArgumentIndex + 1]
    : join('out', 'sdm-quality-lab', 'sdm-quality-baseline.json'),
);

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    shell: false,
    ...options,
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    const stderr = typeof result.stderr === 'string' ? result.stderr.trim() : '';
    throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.status}${stderr ? `: ${stderr}` : ''}`);
  }
  return result;
};

const findExecutable = () => {
  const name = isWindows ? 'echo-sdm-quality-lab.exe' : 'echo-sdm-quality-lab';
  const candidates = [
    join(buildDir, config, name),
    join(buildDir, name),
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
};

try {
  const configureArgs = ['-S', sourceDir, '-B', buildDir];
  if (isWindows) {
    configureArgs.push('-G', 'Visual Studio 17 2022', '-A', 'x64');
  } else {
    configureArgs.push(`-DCMAKE_BUILD_TYPE=${config}`);
  }
  run('cmake', configureArgs, { stdio: 'inherit' });
  run(
    'cmake',
    isWindows
      ? ['--build', buildDir, '--config', config, '--parallel']
      : ['--build', buildDir, '--parallel'],
    { stdio: 'inherit' },
  );

  const executable = findExecutable();
  if (!executable) {
    throw new Error(`SDM quality lab executable was not found under ${buildDir}`);
  }
  const result = run(executable, [], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  const report = JSON.parse(result.stdout);
  const commitResult = spawnSync('git', ['rev-parse', 'HEAD'], {
    cwd: projectRoot,
    encoding: 'utf8',
    shell: false,
  });
  report.generatedAt = new Date().toISOString();
  report.commit = commitResult.status === 0 ? commitResult.stdout.trim() : null;

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  console.log('\nSDM Quality Lab');
  console.log('Rate\tProfile\tInterpolation\tResidual dB\tRT ratio\tRecoveries\tDeterministic');
  for (const measurement of report.measurements) {
    console.log([
      measurement.rate,
      measurement.profile,
      measurement.interpolation,
      measurement.inBandResidualDb.toFixed(2),
      measurement.realtimeRatio.toFixed(3),
      measurement.stabilityRecoveries,
      measurement.deterministic ? 'yes' : 'no',
    ].join('\t'));
  }
  console.log(`\nReport: ${outputPath}`);
  console.log('Scope: software modulator baseline only; this is not DAC/native-ASIO hardware proof.');
} catch (error) {
  console.error('[sdm:quality-lab] Failed.');
  console.error(`[sdm:quality-lab] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
