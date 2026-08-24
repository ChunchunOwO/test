#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import { access, cp, lstat, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, extname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildQualityReport } from '../lib/quality-report.mjs';
import { startMockHost, testPluginPackage } from '../lib/mock-host.mjs';
import {
  createTemplateEntry,
  templateEntryForKind,
  templateTagForKind,
  workshopTemplateKinds,
} from '../lib/project-templates.mjs';

const sdkRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifestFileName = 'echo.workshop.json';
const projectFileName = 'echo.workshop.project.json';
const versionPattern = /^\d+\.\d+\.\d+(?:-[0-9a-z]+(?:[.-][0-9a-z]+)*)?$/iu;
const idPattern = /^[a-z0-9](?:[a-z0-9._-]{1,78}[a-z0-9])?$/u;
const itemIdPattern = /^[1-9]\d{0,19}$/u;
const sha256Pattern = /^[a-f0-9]{64}$/u;
const allowedSourceExtensions = new Set(['.css', '.html', '.js', '.json']);
const previewPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');

const usage = `ECHO Workshop SDK

Commands:
  init <directory> --id <id> --title <title> --holder <holder> [--kind <kind>] [--min-version <version>]
  sync <directory>
  validate <directory>
  quality <directory>
  test <directory>
  dev <directory> [--port <port>]
  doctor
`;

const fail = (message) => { throw new Error(message); };
const normalizeText = (value, field, maximum) => {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text || text.length > maximum) fail(`${field} is invalid`);
  return text;
};
const parseArguments = (values) => {
  const positional = [];
  const options = new Map();
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value.startsWith('--')) { positional.push(value); continue; }
    const next = values[index + 1];
    if (!next || next.startsWith('--')) fail(`Missing value for ${value}`);
    options.set(value.slice(2), next);
    index += 1;
  }
  return { positional, options };
};
const requiredOption = (options, name) => normalizeText(options.get(name), `--${name}`, 160);
const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));
const writeJson = async (path, value) => writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
const hash = (content) => createHash('sha256').update(content).digest('hex');
const toSlash = (value) => value.split('\\').join('/');
const isSafeRelativePath = (value) => typeof value === 'string'
  && value.length > 0 && value.length <= 240 && !isAbsolute(value) && !value.includes('\\')
  && !value.split('/').some((segment) => !segment || segment === '.' || segment === '..');
const projectPath = (root, value, field) => {
  if (!isSafeRelativePath(value)) fail(`${field} is unsafe`);
  const path = resolve(root, ...value.split('/'));
  const fromRoot = relative(root, path);
  if (fromRoot.startsWith('..') || isAbsolute(fromRoot)) fail(`${field} escapes the project`);
  return path;
};

const collectSourceFiles = async (root, current = root) => {
  const output = [];
  for (const entry of await readdir(current, { withFileTypes: true })) {
    const path = resolve(current, entry.name);
    if (entry.isSymbolicLink()) fail(`Source symlink is not allowed: ${entry.name}`);
    if (entry.isDirectory()) { output.push(...await collectSourceFiles(root, path)); continue; }
    if (!entry.isFile()) fail(`Special source file is not allowed: ${entry.name}`);
    const relativePath = toSlash(relative(root, path));
    if (!allowedSourceExtensions.has(extname(relativePath).toLowerCase())) fail(`Unsupported source file: ${relativePath}`);
    const content = await readFile(path, 'utf8');
    if (Buffer.byteLength(content) > 512 * 1024) fail(`Source file exceeds 512 KB: ${relativePath}`);
    output.push({ path: relativePath, content });
  }
  return output.sort((left, right) => left.path.localeCompare(right.path));
};

const collectContentInventory = async (root, current = root) => {
  const output = [];
  for (const entry of await readdir(current, { withFileTypes: true })) {
    const path = resolve(current, entry.name);
    if (entry.isSymbolicLink()) fail(`Content symlink is not allowed: ${entry.name}`);
    if (entry.isDirectory()) { output.push(...await collectContentInventory(root, path)); continue; }
    if (!entry.isFile()) fail(`Special content file is not allowed: ${entry.name}`);
    const relativePath = toSlash(relative(root, path));
    if (relativePath.toLowerCase() === manifestFileName) continue;
    const content = await readFile(path);
    if (content.byteLength > 16 * 1024 * 1024) fail(`Content file exceeds 16 MB: ${relativePath}`);
    output.push({ path: relativePath, size: content.byteLength, sha256: hash(content) });
  }
  return output.sort((left, right) => left.path.localeCompare(right.path));
};

const validatePackage = (value, expectedId) => {
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.type !== 'echo-plugin-package' || value.version !== 1) fail('community.echo has an invalid package header');
  const manifest = value.manifest;
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) fail('community.echo manifest is missing');
  if (manifest.id !== expectedId || !idPattern.test(manifest.id)) fail('Plug-in id must match the outer manifest');
  if (!versionPattern.test(manifest.version) || ![1, 2].includes(manifest.apiVersion)) fail('Plug-in version or apiVersion is unsupported');
  if (!isSafeRelativePath(manifest.entry) || !Array.isArray(value.files) || value.files.length < 1 || value.files.length > 128) fail('Plug-in entry or files are invalid');
  const paths = new Set();
  for (const file of value.files) {
    if (!file || !isSafeRelativePath(file.path) || typeof file.content !== 'string' || Buffer.byteLength(file.content) > 512 * 1024) fail('Plug-in file is invalid');
    const key = file.path.toLowerCase();
    if (paths.has(key)) fail(`Duplicate plug-in file: ${file.path}`);
    paths.add(key);
  }
  if (!paths.has(manifest.entry.toLowerCase())) fail('Plug-in entry is not packaged');
};

const validateProject = async (rootInput) => {
  const root = resolve(rootInput);
  const project = await readJson(resolve(root, projectFileName));
  if (project.schemaVersion !== 1 || project.appId !== '5105090' || !/^(?:0|[1-9]\d{0,19})$/u.test(project.publishedFileId)) fail('Project configuration is invalid');
  if (!['private', 'friends-only', 'unlisted', 'public'].includes(project.visibility)) fail('Project visibility is invalid');
  const contentRoot = projectPath(root, project.contentDirectory, 'contentDirectory');
  const manifest = await readJson(resolve(contentRoot, manifestFileName));
  if (manifest.type !== 'echo-workshop-item' || manifest.schemaVersion !== 1 || !idPattern.test(manifest.id)) fail('Outer manifest header is invalid');
  if (!versionPattern.test(manifest.version) || !workshopTemplateKinds.includes(manifest.content?.kind) || !isSafeRelativePath(manifest.content.entry)) fail('Outer manifest content is invalid');
  if (!versionPattern.test(manifest.compatibility?.minEchoVersion)) fail('Compatibility declaration is invalid');
  if (manifest.content.kind === 'plugin-package' && ![1, 2].includes(manifest.compatibility?.pluginApiVersion)) fail('Plug-in compatibility declaration is invalid');
  if (!Array.isArray(manifest.files) || manifest.files.length < 1 || manifest.files.length > 512) fail('Outer manifest file inventory is invalid');
  const inventory = await collectContentInventory(contentRoot);
  const expected = new Map(inventory.map((file) => [file.path.toLowerCase(), file]));
  for (const file of manifest.files) {
    const actual = expected.get(String(file.path).toLowerCase());
    if (!actual || actual.size !== file.size || actual.sha256 !== file.sha256 || !sha256Pattern.test(file.sha256)) fail(`Manifest hash mismatch: ${file.path}`);
    expected.delete(String(file.path).toLowerCase());
  }
  if (expected.size > 0) fail(`Manifest is missing files: ${[...expected.values()].map((file) => file.path).join(', ')}`);
  const packagePath = projectPath(contentRoot, manifest.content.entry, 'content.entry');
  const entry = await readJson(packagePath);
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) fail('Workshop entry must be a JSON object');
  if (manifest.content.kind === 'plugin-package') validatePackage(entry, manifest.id);
  const previewPath = projectPath(root, project.previewFile, 'previewFile');
  const preview = await lstat(previewPath);
  if (!preview.isFile() || preview.size < 1 || preview.size >= 1024 * 1024 || !['.gif', '.jpeg', '.jpg', '.png'].includes(extname(previewPath).toLowerCase())) fail('Preview must be JPG, PNG or GIF under 1 MB');
  return { root, id: manifest.id, files: inventory.length, project, manifest, entry };
};

const syncProject = async (rootInput) => {
  const root = resolve(rootInput);
  const project = await readJson(resolve(root, projectFileName));
  const contentRoot = projectPath(root, project.contentDirectory, 'contentDirectory');
  const manifestPath = resolve(contentRoot, manifestFileName);
  const manifest = await readJson(manifestPath);
  if (manifest.content?.kind === 'plugin-package') {
    const sourceFiles = await collectSourceFiles(resolve(root, 'src'));
    const existingPackage = await readJson(projectPath(contentRoot, manifest.content.entry, 'content.entry'));
    const packageValue = { ...existingPackage, files: sourceFiles };
    validatePackage(packageValue, manifest.id);
    await writeJson(projectPath(contentRoot, manifest.content.entry, 'content.entry'), packageValue);
  }
  await writeJson(manifestPath, { ...manifest, files: await collectContentInventory(contentRoot) });
  return validateProject(root);
};

const initProject = async (rootInput, options) => {
  const root = resolve(rootInput);
  await mkdir(root, { recursive: true });
  if ((await readdir(root)).length > 0) fail('Target directory must be empty');
  const id = requiredOption(options, 'id').toLowerCase();
  if (!idPattern.test(id)) fail('Project id is invalid');
  const title = requiredOption(options, 'title');
  const holder = requiredOption(options, 'holder');
  const kind = String(options.get('kind') ?? 'plugin-package');
  if (!workshopTemplateKinds.includes(kind)) fail(`Unsupported template kind: ${kind}`);
  const minVersion = normalizeText(options.get('min-version') ?? '26.8.15', '--min-version', 48);
  if (!versionPattern.test(minVersion)) fail('Minimum ECHO version is invalid');
  await mkdir(resolve(root, 'content'), { recursive: true });
  await mkdir(resolve(root, '.echo-sdk', 'bin'), { recursive: true });
  await mkdir(resolve(root, '.github', 'workflows'), { recursive: true });
  if (kind === 'plugin-package') {
    await mkdir(resolve(root, 'src'), { recursive: true });
    await cp(resolve(sdkRoot, 'templates', 'plugin-basic', 'plugin.js'), resolve(root, 'src', 'plugin.js'));
  }
  await cp(resolve(sdkRoot, 'templates', 'github', 'validate-workshop.yml'), resolve(root, '.github', 'workflows', 'validate-workshop.yml'));
  await cp(resolve(sdkRoot, 'echo-workshop-plugin.d.ts'), resolve(root, '.echo-sdk', 'echo-workshop-plugin.d.ts'));
  await cp(resolve(sdkRoot, 'bin', 'echo-workshop-sdk.mjs'), resolve(root, '.echo-sdk', 'bin', 'echo-workshop-sdk.mjs'));
  await cp(resolve(sdkRoot, 'lib'), resolve(root, '.echo-sdk', 'lib'), { recursive: true });
  const entryPath = templateEntryForKind(kind);
  await writeJson(resolve(root, 'content', entryPath), createTemplateEntry(kind, id, title));
  await writeJson(resolve(root, 'content', manifestFileName), {
    type: 'echo-workshop-item', schemaVersion: 1, id, title, version: '1.0.0',
    content: { kind, entry: entryPath },
    compatibility: { minEchoVersion: minVersion, ...(kind === 'plugin-package' ? { pluginApiVersion: 2 } : {}) }, files: [],
    license: { id: 'All-Rights-Reserved', holder },
  });
  await writeJson(resolve(root, projectFileName), {
    schemaVersion: 1, appId: '5105090', publishedFileId: '0', contentDirectory: 'content',
    previewFile: 'preview.png', visibility: 'private', description: `${title} for ECHO.`,
    changeNote: 'Initial private test upload.', tags: [templateTagForKind(kind)],
  });
  await writeFile(resolve(root, 'preview.png'), previewPng);
  await writeJson(resolve(root, 'package.json'), {
    name: id, version: '1.0.0', private: true, type: 'module',
    scripts: {
      sync: 'node ./.echo-sdk/bin/echo-workshop-sdk.mjs sync .',
      check: 'node ./.echo-sdk/bin/echo-workshop-sdk.mjs sync . && node ./.echo-sdk/bin/echo-workshop-sdk.mjs validate .',
      quality: 'node ./.echo-sdk/bin/echo-workshop-sdk.mjs quality .',
      test: 'node ./.echo-sdk/bin/echo-workshop-sdk.mjs test .',
      dev: 'node ./.echo-sdk/bin/echo-workshop-sdk.mjs dev .',
    },
  });
  await writeJson(resolve(root, 'tsconfig.json'), {
    compilerOptions: { allowJs: true, checkJs: true, noEmit: true, strict: true, target: 'ES2022', lib: ['ES2022', 'DOM'] },
    include: ['src/**/*.js', '.echo-sdk/**/*.d.ts'],
  });
  await writeFile(resolve(root, 'README.md'), `# ${title}\n\nTemplate: \`${kind}\`. Edit \`${kind === 'plugin-package' ? 'src/plugin.js' : `content/${entryPath}`}\`, then run \`npm run test\` and \`npm run quality\`. Use \`npm run dev\` for the local fixture host. Open the project in ECHO Workshop Authoring Studio for production validation and Steam publishing.\n`, 'utf8');
  return syncProject(root);
};

const doctor = async () => {
  const required = ['echo-workshop-sdk.json', 'echo-workshop-plugin.d.ts', 'schemas/echo.workshop.schema.json', 'schemas/plugin-package.schema.json', 'templates/plugin-basic/plugin.js', 'templates/github/validate-workshop.yml', 'lib/project-templates.mjs', 'lib/mock-host.mjs', 'lib/quality-report.mjs'];
  for (const path of required) await access(resolve(sdkRoot, ...path.split('/')), fsConstants.R_OK);
  const descriptor = await readJson(resolve(sdkRoot, 'echo-workshop-sdk.json'));
  if (descriptor.sdkVersion !== 1 || descriptor.plugin?.currentApiVersion !== 2) fail('SDK descriptor is inconsistent');
  return required.length;
};

const main = async () => {
  const { positional, options } = parseArguments(process.argv.slice(2));
  const [command, directory] = positional;
  if (!command || command === 'help') { console.log(usage); return; }
  if (command === 'doctor') { console.log(`[echo-workshop-sdk] Ready: ${await doctor()} portable assets checked.`); return; }
  if (!directory) fail(`Missing project directory.\n\n${usage}`);
  if (command === 'init') {
    const result = await initProject(directory, options);
    console.log(`[echo-workshop-sdk] Created ${result.id} at ${result.root}.`);
    return;
  }
  if (command === 'sync') {
    const result = await syncProject(directory);
    console.log(`[echo-workshop-sdk] Synced ${result.id}: ${result.files} content file(s).`);
    return;
  }
  if (command === 'validate') {
    const result = await validateProject(directory);
    console.log(`[echo-workshop-sdk] Valid ${result.id}: ${result.files} content file(s).`);
    return;
  }
  if (command === 'quality') {
    const result = await syncProject(directory);
    const report = await buildQualityReport(result.root, result.project, result.manifest, result.entry);
    console.log(JSON.stringify(report, null, 2));
    if (!report.ok) process.exitCode = 1;
    return;
  }
  if (command === 'test') {
    const result = await syncProject(directory);
    const report = result.manifest.content.kind === 'plugin-package'
      ? await testPluginPackage(result.entry)
      : { ok: true, kind: result.manifest.content.kind, fixtures: ['schema', 'empty-library', 'missing-lyrics', 'playback-ended', 'provider-offline'] };
    console.log(JSON.stringify(report, null, 2));
    if (!report.ok) process.exitCode = 1;
    return;
  }
  if (command === 'dev') {
    const first = await syncProject(directory);
    const port = Number(options.get('port') ?? 41783);
    if (!Number.isInteger(port) || port < 1024 || port > 65535) fail('--port must be between 1024 and 65535');
    const runTests = async () => {
      const result = await syncProject(directory);
      return result.manifest.content.kind === 'plugin-package'
        ? testPluginPackage(result.entry)
        : { ok: true, kind: result.manifest.content.kind, fixtures: 5 };
    };
    const watchPath = first.manifest.content.kind === 'plugin-package' ? 'src' : `content/${first.manifest.content.entry}`;
    const host = await startMockHost({ root: first.root, port, runTests, watchPath });
    console.log(`[echo-workshop-sdk] Mock host ready at ${host.url}. Watching ${watchPath}.`);
    return;
  }
  fail(`Unknown command: ${command}\n\n${usage}`);
};

main().catch((error) => {
  console.error(`[echo-workshop-sdk] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
