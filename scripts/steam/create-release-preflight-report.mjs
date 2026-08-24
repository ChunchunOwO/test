import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { createReadStream, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptRoot = fileURLToPath(new URL('../..', import.meta.url));
const normalizeRelativePath = (value) => value.replaceAll('\\', '/');

const walkFiles = (directory) => {
  if (!existsSync(directory)) {
    return [];
  }
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = join(directory, entry.name);
    return entry.isDirectory() ? walkFiles(entryPath) : [entryPath];
  });
};

const sha256File = (filePath) => new Promise((resolveHash, reject) => {
  const hash = createHash('sha256');
  const stream = createReadStream(filePath);
  stream.on('data', (chunk) => hash.update(chunk));
  stream.on('error', reject);
  stream.on('end', () => resolveHash(hash.digest('hex')));
});

const safeGitValue = (root, args, fallback, { allowEmpty = false } = {}) => {
  try {
    const value = execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    }).trim();
    return allowEmpty ? value : value || fallback;
  } catch {
    return fallback;
  }
};

export const readGitMetadata = (root) => {
  const porcelain = safeGitValue(root, ['status', '--porcelain'], 'unknown', { allowEmpty: true });
  return {
    sha: safeGitValue(root, ['rev-parse', 'HEAD'], 'unknown'),
    branch: safeGitValue(root, ['branch', '--show-current'], 'detached'),
    clean: porcelain === '',
  };
};

const sanitizeOutput = (value, roots) => {
  let result = String(value ?? '').trim();
  for (const [rootPath, label] of roots) {
    result = result.replaceAll(rootPath, label).replaceAll(rootPath.replaceAll('\\', '/'), label);
  }
  return result;
};

const runNodeCheck = ({ root, script, args = [], sanitizeRoots, env }) => {
  const result = spawnSync(process.execPath, [join(root, script), ...args], {
    cwd: root,
    encoding: 'utf8',
    env,
    windowsHide: true,
  });
  return {
    name: script,
    passed: result.status === 0 && !result.error,
    output: sanitizeOutput(result.error?.message || result.stderr || result.stdout, sanitizeRoots),
  };
};

const markdownReport = (report) => {
  const lines = [
    '# ECHO Steam release preflight',
    '',
    `- Result: **${report.result.toUpperCase()}**`,
    `- Generated: ${report.build.generatedAt}`,
    `- Version: ${report.build.version}`,
    `- Commit: ${report.build.gitSha}`,
    `- Branch: ${report.build.gitBranch}`,
    `- Worktree clean: ${report.build.gitClean ? 'yes' : 'no'}`,
    `- Steam App ID: ${report.build.appId ?? 'not configured'}`,
    `- Artifact: ${report.artifact.name}`,
    `- Files: ${report.artifact.fileCount}`,
    `- Bytes: ${report.artifact.totalBytes}`,
    '',
    '## Checks',
    '',
    ...report.checks.map((check) => `- ${check.passed ? 'PASS' : 'FAIL'} — ${check.name}${check.output ? `: ${check.output.replaceAll('\n', ' | ')}` : ''}`),
    '',
    '## Findings',
    '',
    ...(report.findings.length > 0 ? report.findings.map((finding) => `- ${finding}`) : ['- None']),
    '',
    'The JSON report contains the complete relative file inventory and SHA-256 hashes. No credentials or absolute local paths are recorded.',
    '',
  ];
  return lines.join('\n');
};

export const createSteamReleasePreflight = async ({
  root = process.cwd(),
  artifactRoot = join(root, 'dist', 'win-unpacked'),
  outputRoot = join(root, 'artifacts', 'steam-preflight'),
  env = process.env,
  now = new Date(),
  git = readGitMetadata(root),
  runCheck = runNodeCheck,
} = {}) => {
  const resolvedRoot = resolve(root);
  const resolvedArtifactRoot = resolve(artifactRoot);
  const resolvedOutputRoot = resolve(outputRoot);
  const sanitizeRoots = [
    [resolvedArtifactRoot, '<artifact>'],
    [resolvedRoot, '<workspace>'],
  ];
  const packageManifest = JSON.parse(readFileSync(join(resolvedRoot, 'package.json'), 'utf8'));
  const findings = [];
  const releaseAppId = env.ECHO_STEAM_RELEASE_APP_ID?.trim() ?? '';
  const proDlcAppId = env.ECHO_STEAM_PRO_DLC_APP_ID?.trim() ?? '';

  if (!/^[1-9]\d*$/u.test(releaseAppId)) {
    findings.push('ECHO_STEAM_RELEASE_APP_ID must be configured as a positive numeric App ID.');
  }
  if (!/^[1-9]\d*$/u.test(proDlcAppId)) {
    findings.push('ECHO_STEAM_PRO_DLC_APP_ID must be configured as a positive numeric DLC App ID.');
  }
  if (!git.clean) {
    findings.push('Git worktree is not clean; release provenance is ambiguous.');
  }
  for (const required of ['ECHO.exe', 'resources/app.asar']) {
    if (!existsSync(join(resolvedArtifactRoot, ...required.split('/')))) {
      findings.push(`Artifact is missing required file: ${required}`);
    }
  }

  const inventory = [];
  for (const filePath of walkFiles(resolvedArtifactRoot)) {
    const relativePath = normalizeRelativePath(relative(resolvedArtifactRoot, filePath));
    const stats = statSync(filePath);
    inventory.push({
      path: relativePath,
      size: stats.size,
      sha256: await sha256File(filePath),
    });
    if (/(^|\/)(?:steam_appid\.txt|[^/]+\.vdf)$/iu.test(relativePath)) {
      findings.push(`Artifact contains forbidden Steam local/build file: ${relativePath}`);
    }
  }

  inventory.sort((left, right) => left.path.localeCompare(right.path));
  const checks = [
    ['scripts/check-steam-distribution.mjs', []],
    ['scripts/check-steam-artifact.mjs', [resolvedArtifactRoot]],
    ['scripts/check-third-party-notices.mjs', []],
    ['scripts/verify-win-release-signatures.mjs', ['--optional', '--unpacked-only', `--unpacked-dir=${resolvedArtifactRoot}`]],
  ].map(([script, args]) => runCheck({ root: resolvedRoot, script, args, sanitizeRoots, env }));

  for (const check of checks) {
    if (!check.passed) {
      findings.push(`Required check failed: ${check.name}`);
    }
  }

  const report = {
    schemaVersion: 1,
    result: findings.length === 0 ? 'pass' : 'fail',
    build: {
      product: packageManifest.build?.productName ?? packageManifest.productName ?? packageManifest.name,
      version: packageManifest.version,
      generatedAt: now.toISOString(),
      gitSha: git.sha,
      gitBranch: git.branch,
      gitClean: git.clean,
      appId: /^[1-9]\d*$/u.test(releaseAppId) ? Number(releaseAppId) : null,
    },
    artifact: {
      name: basename(resolvedArtifactRoot),
      fileCount: inventory.length,
      totalBytes: inventory.reduce((total, file) => total + file.size, 0),
      files: inventory,
    },
    checks,
    findings: [...new Set(findings)],
  };

  mkdirSync(resolvedOutputRoot, { recursive: true });
  const jsonPath = join(resolvedOutputRoot, 'steam-release-preflight.json');
  const markdownPath = join(resolvedOutputRoot, 'steam-release-preflight.md');
  const manifestPath = join(resolvedOutputRoot, 'artifact-manifest.sha256');
  writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  writeFileSync(markdownPath, markdownReport(report), 'utf8');
  writeFileSync(manifestPath, `${inventory.map((file) => `${file.sha256}  ${file.path}`).join('\n')}\n`, 'utf8');

  return { report, jsonPath, markdownPath, manifestPath };
};

const isDirectRun = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isDirectRun) {
  const artifactArgument = process.argv.find((argument) => argument.startsWith('--artifact='));
  const artifactRoot = artifactArgument ? resolve(scriptRoot, artifactArgument.slice('--artifact='.length)) : undefined;
  const result = await createSteamReleasePreflight({ root: scriptRoot, artifactRoot });
  console.log(`${result.report.result === 'pass' ? 'PASS' : 'FAIL'} Steam release preflight report: ${result.markdownPath}`);
  if (result.report.result !== 'pass') {
    process.exitCode = 1;
  }
}
