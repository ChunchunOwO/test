import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { listPackage } from '@electron/asar';
import { findMacosDevApp } from './macos-dev-app-paths.mjs';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const supportedArchitectures = new Set(['arm64', 'x64']);
const requiredDocumentExtensions = ['flac', 'mp3', 'wav', 'm4a', 'aiff', 'cue'];

export const parseMacosDocumentExtensions = (value) => {
  const documentTypes = typeof value === 'string' ? JSON.parse(value) : value;
  if (!Array.isArray(documentTypes)) return [];
  return Array.from(new Set(documentTypes.flatMap((documentType) =>
    Array.isArray(documentType?.CFBundleTypeExtensions)
      ? documentType.CFBundleTypeExtensions.map((extension) => String(extension).trim().toLowerCase()).filter(Boolean)
      : []
  ))).sort();
};

export const parseOtoolDependencies = (value) => String(value ?? '')
  .split(/\r?\n/u)
  .slice(1)
  .map((line) => line.trim().replace(/\s+\(compatibility version.*$/u, ''))
  .filter(Boolean);

const isSystemOrBundleRelativeDependency = (dependency) =>
  dependency.startsWith('/System/Library/') ||
  dependency.startsWith('/usr/lib/') ||
  dependency.startsWith('@rpath/') ||
  dependency.startsWith('@loader_path/') ||
  dependency.startsWith('@executable_path/');

const normalizeAsarEntry = (entry) => {
  const normalized = String(entry).replace(/\\/gu, '/');
  return normalized.startsWith('/') ? normalized : `/${normalized}`;
};

const assertFile = (filePath, label, executable = false) => {
  if (!existsSync(filePath)) {
    throw new Error(`Missing ${label}: ${filePath}`);
  }
  const stats = statSync(filePath);
  if (!stats.isFile()) {
    throw new Error(`${label} is not a file: ${filePath}`);
  }
  if (executable && (stats.mode & 0o111) === 0) {
    throw new Error(`${label} is not executable: ${filePath}`);
  }
};

const listRelativeFiles = (root) => {
  const files = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const fullPath = join(directory, entry.name);
      if (entry.isDirectory()) visit(fullPath);
      else if (entry.isFile()) files.push(relative(root, fullPath).replace(/\\/gu, '/'));
    }
  };
  visit(root);
  return files.sort();
};

const runCapture = (command, args) => {
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    encoding: 'utf8',
    shell: false,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = `${result.stderr ?? result.stdout ?? ''}`.trim();
    throw new Error(`${command} ${args.join(' ')} failed${detail ? `: ${detail}` : ''}`);
  }
  return `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
};

export const verifyMacosDevApp = ({
  appPath,
  arch,
  platform = process.platform,
  commandRunner = runCapture,
}) => {
  const resolvedAppPath = resolve(appPath);
  if (!supportedArchitectures.has(arch)) {
    throw new Error(`Unsupported macOS bundle architecture: ${arch}`);
  }
  if (!resolvedAppPath.endsWith('.app') || !existsSync(resolvedAppPath) || !statSync(resolvedAppPath).isDirectory()) {
    throw new Error(`macOS app bundle was not found: ${resolvedAppPath}`);
  }

  const contents = join(resolvedAppPath, 'Contents');
  const resources = join(contents, 'Resources');
  const asarPath = join(resources, 'app.asar');
  const unpackedRoot = join(resources, 'app.asar.unpacked');
  const steamworksRoot = join(unpackedRoot, 'node_modules', 'steamworks.js', 'dist', 'osx');
  const nativePaths = {
    appExecutable: join(contents, 'MacOS', 'ECHO'),
    audioHost: join(resources, 'echo-audio-host'),
    nativeScanner: join(resources, 'echo-native-scanner'),
    betterSqlite: join(unpackedRoot, 'node_modules', 'better-sqlite3', 'build', 'Release', 'better_sqlite3.node'),
    steamApi: join(steamworksRoot, 'libsteam_api.dylib'),
    steamworks: join(steamworksRoot, `steamworksjs.darwin-${arch}.node`),
  };

  assertFile(join(contents, 'Info.plist'), 'Info.plist');
  assertFile(asarPath, 'app.asar');
  for (const [label, filePath] of Object.entries(nativePaths)) {
    const executable = platform !== 'win32' &&
      (label === 'appExecutable' || label === 'audioHost' || label === 'nativeScanner');
    assertFile(filePath, label, executable);
  }

  const asarEntries = new Set(listPackage(asarPath).map(normalizeAsarEntry));
  for (const requiredEntry of ['/out/main/index.js', '/package.json', '/THIRD_PARTY_NOTICES.md']) {
    if (!asarEntries.has(requiredEntry)) {
      throw new Error(`app.asar is missing required entry: ${requiredEntry}`);
    }
  }

  const resourceFiles = listRelativeFiles(resources);
  const forbiddenFiles = resourceFiles.filter((file) =>
    /\.(?:dll|exe)$/iu.test(file) ||
    /(?:^|\/)(?:steam_appid\.txt|.*\.vdf)$/iu.test(file) ||
    /(?:^|\/)(?:echo-smtc-host|echo-taskbar-host|echo-taskbar-thumbnail-helper)(?:\.exe|\.node)?$/iu.test(file) ||
    /(?:^|\/)(?:msvcp\d*|vcruntime\d*(?:_\d+)?)\.dll$/iu.test(file) ||
    /node_modules\/steamworks\.js\/dist\/win64\//iu.test(file) ||
    /node_modules\/@lox-audioserver\/node-libraop\/prebuilds\/win32-/iu.test(file),
  );
  if (forbiddenFiles.length > 0) {
    throw new Error(`macOS app contains Windows/local-only files: ${forbiddenFiles.join(', ')}`);
  }

  const warnings = [];
  const dynamicLibraries = {};
  const externalDynamicLibraries = {};
  let documentExtensions = [];
  if (platform === 'darwin') {
    const infoPlist = join(contents, 'Info.plist');
    commandRunner('plutil', ['-lint', infoPlist]);
    const bundleId = commandRunner('plutil', ['-extract', 'CFBundleIdentifier', 'raw', infoPlist]);
    if (bundleId.trim() !== 'app.echo.steam') {
      throw new Error(`Unexpected CFBundleIdentifier: ${bundleId.trim() || 'missing'}`);
    }
    documentExtensions = parseMacosDocumentExtensions(
      commandRunner('plutil', ['-extract', 'CFBundleDocumentTypes', 'json', '-o', '-', infoPlist]),
    );
    const missingDocumentExtensions = requiredDocumentExtensions.filter((extension) => !documentExtensions.includes(extension));
    if (missingDocumentExtensions.length > 0) {
      throw new Error(`Info.plist is missing core audio document associations: ${missingDocumentExtensions.join(', ')}`);
    }

    for (const [label, filePath] of Object.entries(nativePaths)) {
      commandRunner('lipo', ['-verify_arch', arch, filePath]);
      const dependencies = commandRunner('otool', ['-L', filePath]);
      const parsedDependencies = parseOtoolDependencies(dependencies);
      dynamicLibraries[label] = parsedDependencies;
      const externalDependencies = parsedDependencies.filter((dependency) =>
        dependency.startsWith('/') && !isSystemOrBundleRelativeDependency(dependency)
      );
      externalDynamicLibraries[label] = externalDependencies;
      if (externalDependencies.length > 0) {
        warnings.push(
          `${label} still links to machine-local libraries (${externalDependencies.join(', ')}); ` +
          'this is acceptable only for the local development app.',
        );
      }
    }
  }

  const report = {
    result: 'pass',
    kind: 'unsigned-local-development-app',
    appPath: resolvedAppPath,
    appName: basename(resolvedAppPath),
    arch,
    checkedFiles: Object.values(nativePaths).length + 2,
    warnings,
    dynamicLibraries,
    externalDynamicLibraries,
    documentExtensions,
  };
  return report;
};

const isMain = process.argv[1]
  ? import.meta.url === pathToFileURL(resolve(process.argv[1])).href
  : false;

if (isMain) {
  try {
    if (process.platform !== 'darwin') {
      throw new Error(`macOS app verification must run on macOS. Current platform is ${process.platform}/${process.arch}.`);
    }
    const readArg = (name) => {
      const index = process.argv.indexOf(name);
      return index >= 0 ? process.argv[index + 1] : null;
    };
    const arch = readArg('--arch') ?? process.arch;
    const defaultAppPath = findMacosDevApp({ projectRoot, arch })
      ?? join(projectRoot, 'dist', `mac-${arch}`, 'ECHO.app');
    const appPath = readArg('--app') ?? defaultAppPath;
    const report = verifyMacosDevApp({ appPath, arch });
    const jsonOut = readArg('--json-out');

    if (jsonOut) {
      const resolvedJsonOut = resolve(jsonOut);
      mkdirSync(dirname(resolvedJsonOut), { recursive: true });
      writeFileSync(resolvedJsonOut, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
      console.log(`[verify:mac:dev-app] Report: ${resolvedJsonOut}`);
    }

    console.log(`[verify:mac:dev-app] PASS ${report.appPath} arch=${report.arch}`);
    for (const warning of report.warnings) {
      console.warn(`[verify:mac:dev-app] WARNING ${warning}`);
    }
    console.log('[verify:mac:dev-app] This verifies a local unsigned development app, not a distributable release.');
  } catch (error) {
    console.error('[verify:mac:dev-app] FAIL');
    console.error(`[verify:mac:dev-app] ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
