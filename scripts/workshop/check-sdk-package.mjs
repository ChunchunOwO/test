import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

const repositoryRoot = resolve(import.meta.dirname, '..', '..');
const sdkRoot = resolve(repositoryRoot, 'docs', 'workshop-sdk');
const cliPath = resolve(sdkRoot, 'bin', 'echo-workshop-sdk.mjs');
const tsxCliPath = resolve(repositoryRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs');

const run = (arguments_, expectedStatus = 0) => {
  const result = spawnSync(process.execPath, [cliPath, ...arguments_], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  });
  if (result.status !== expectedStatus) {
    throw new Error(`SDK command failed (${arguments_.join(' ')}):\n${result.stdout}\n${result.stderr}`);
  }
  return `${result.stdout}${result.stderr}`;
};

const runProductionValidation = (projectRoot) => {
  const result = spawnSync(process.execPath, [
    tsxCliPath,
    resolve(repositoryRoot, 'scripts', 'workshop', 'authoring-cli.ts'),
    'validate',
    projectRoot,
  ], { cwd: repositoryRoot, encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`Production Workshop validation rejected the SDK starter:\n${result.stdout}\n${result.stderr}`);
  }
};

const main = async () => {
  const descriptor = JSON.parse(await readFile(resolve(sdkRoot, 'echo-workshop-sdk.json'), 'utf8'));
  const packageJson = JSON.parse(await readFile(resolve(sdkRoot, 'package.json'), 'utf8'));
  JSON.parse(await readFile(resolve(sdkRoot, 'schemas', 'echo.workshop.schema.json'), 'utf8'));
  JSON.parse(await readFile(resolve(sdkRoot, 'schemas', 'plugin-package.schema.json'), 'utf8'));
  const catalog = JSON.parse(await readFile(resolve(sdkRoot, 'templates', 'catalog.json'), 'utf8'));
  JSON.parse(await readFile(resolve(sdkRoot, 'examples', 'complete-ui-theme', 'manifest.fragment.json'), 'utf8'));
  if (descriptor.sdkVersion !== Number(packageJson.version.split('.')[0])) {
    throw new Error('SDK package major version must match sdkVersion.');
  }
  if (descriptor.packageVersion !== packageJson.version) {
    throw new Error('SDK descriptor packageVersion must match package.json.');
  }
  if (descriptor.plugin.currentApiVersion !== 2 || packageJson.types !== './echo-workshop-plugin.d.ts') {
    throw new Error('SDK package metadata is inconsistent.');
  }
  run(['doctor']);

  const temporaryRoot = await mkdtemp(resolve(tmpdir(), 'echo-workshop-sdk-'));
  try {
    if (catalog.templates.length !== 6) throw new Error('SDK template catalog must contain six content kinds.');
    for (const template of catalog.templates) {
      const projectRoot = resolve(temporaryRoot, template.kind);
      run(['init', projectRoot, '--id', `echo.sdk-${template.kind}`, '--title', `SDK ${template.kind}`, '--holder', 'ECHO SDK', '--kind', template.kind]);
      run(['validate', projectRoot]);
      run(['test', projectRoot]);
      runProductionValidation(projectRoot);
    }
    for (const example of ['lyrics-source', 'author-agent', 'network-source', 'listen-together', 'metadata-provider']) {
      const syntax = spawnSync(process.execPath, ['--check', resolve(sdkRoot, 'examples', example, 'plugin.js')], { encoding: 'utf8' });
      if (syntax.status !== 0) throw new Error(`SDK example ${example} has invalid JavaScript:\n${syntax.stderr}`);
    }
    const projectRoot = resolve(temporaryRoot, 'plugin-package');
    const qualityFailure = run(['quality', projectRoot], 1);
    if (!qualityFailure.includes('preview-size')) throw new Error('SDK quality report did not inspect preview dimensions.');
    const packagePath = resolve(projectRoot, 'content', 'community.echo');
    const packageValue = JSON.parse(await readFile(packagePath, 'utf8'));
    packageValue.files[0].content += '\n// tampered';
    await writeFile(packagePath, `${JSON.stringify(packageValue, null, 2)}\n`, 'utf8');
    const failure = run(['validate', projectRoot], 1);
    if (!failure.includes('Manifest hash mismatch')) {
      throw new Error('SDK validator did not fail closed on a modified content file.');
    }
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
  console.log('PASS ECHO Workshop SDK templates, mock tests, quality report, production validation and hash guard.');
};

await main();
