import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const defaultGeneratedRoot = join(repoRoot, 'artifacts', 'steam-pipe');

const readPositiveId = (value, name) => {
  const normalized = value?.trim() ?? '';
  if (!/^[1-9]\d*$/u.test(normalized) || !Number.isSafeInteger(Number(normalized))) {
    throw new Error(`${name} must be a positive numeric Steam ID.`);
  }
  return normalized;
};

const normalizePrivateBranch = (value) => {
  const branch = value?.trim() ?? '';
  if (!/^[A-Za-z0-9_-]{1,64}$/u.test(branch)) {
    throw new Error('ECHO_STEAM_PRIVATE_BRANCH must contain only letters, numbers, underscore, or dash.');
  }
  if (['default', 'public'].includes(branch.toLocaleLowerCase())) {
    throw new Error('Steam uploads from this tool may only target a private beta branch.');
  }
  return branch;
};

const vdfPath = (path) => resolve(path).replaceAll('\\', '/').replaceAll('"', '\\"');
const vdfValue = (value) => String(value).replaceAll('"', '\\"');

const isInside = (parent, candidate) => {
  const candidateRelative = relative(resolve(parent), resolve(candidate));
  return candidateRelative === '' || (!candidateRelative.startsWith('..') && !isAbsolute(candidateRelative));
};

const findForbiddenRuntimeFile = (directory) => {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      const nested = findForbiddenRuntimeFile(entryPath);
      if (nested) return nested;
    } else if (entry.isFile() && entry.name.toLocaleLowerCase() === 'steam_appid.txt') {
      return entryPath;
    }
  }
  return null;
};

export const prepareSteamDepot = ({ env = process.env, upload = false } = {}) => {
  const appId = readPositiveId(env.ECHO_STEAM_RELEASE_APP_ID, 'ECHO_STEAM_RELEASE_APP_ID');
  const depotId = readPositiveId(env.ECHO_STEAM_DEPOT_ID, 'ECHO_STEAM_DEPOT_ID');
  const branch = upload ? normalizePrivateBranch(env.ECHO_STEAM_PRIVATE_BRANCH) : null;
  if (upload && env.ECHO_STEAM_UPLOAD_APPROVED !== '1') {
    throw new Error('Set ECHO_STEAM_UPLOAD_APPROVED=1 to authorize a private-branch upload.');
  }

  const contentRoot = resolve(env.ECHO_STEAM_CONTENT_ROOT?.trim() || join(repoRoot, 'dist', 'win-unpacked'));
  const generatedRoot = resolve(env.ECHO_STEAM_GENERATED_ROOT?.trim() || defaultGeneratedRoot);
  const configRoot = join(generatedRoot, 'scripts');
  const buildOutput = resolve(env.ECHO_STEAM_BUILD_OUTPUT?.trim() || join(generatedRoot, 'output'));

  if (!existsSync(contentRoot) || !statSync(contentRoot).isDirectory()) {
    throw new Error(`Steam depot content root does not exist: ${contentRoot}`);
  }
  for (const required of ['ECHO.exe', 'resources/app.asar']) {
    if (!existsSync(join(contentRoot, ...required.split('/')))) {
      throw new Error(`Steam depot content is missing required file: ${required}`);
    }
  }
  const forbiddenRuntimeFile = findForbiddenRuntimeFile(contentRoot);
  if (forbiddenRuntimeFile) {
    throw new Error(`Steam depot must not contain steam_appid.txt: ${forbiddenRuntimeFile}`);
  }
  if (isInside(contentRoot, generatedRoot) || isInside(contentRoot, buildOutput)) {
    throw new Error('SteamPipe generated files and build output must stay outside the depot content root.');
  }

  mkdirSync(configRoot, { recursive: true });
  mkdirSync(buildOutput, { recursive: true });

  const depotConfigPath = join(configRoot, `depot_build_${depotId}.vdf`);
  const appConfigPath = join(configRoot, `app_build_${appId}.vdf`);
  const manifestPath = join(generatedRoot, 'steam-depot-plan.json');
  const depotConfig = `"DepotBuild"
{
  "DepotID" "${vdfValue(depotId)}"
  "ContentRoot" "${vdfPath(contentRoot)}"
  "FileMapping"
  {
    "LocalPath" "*"
    "DepotPath" "."
    "Recursive" "1"
  }
  "FileExclusion" "steam_appid.txt"
  "FileExclusion" "*.pdb"
  "FileExclusion" "*.log"
}
`;
  const appConfig = `"AppBuild"
{
  "AppID" "${vdfValue(appId)}"
  "Desc" "ECHO ${upload ? `private ${branch}` : 'preview'} depot build"
  "Preview" "${upload ? '0' : '1'}"
${upload ? `  "SetLive" "${vdfValue(branch)}"\n` : ''}  "ContentRoot" "${vdfPath(contentRoot)}"
  "BuildOutput" "${vdfPath(buildOutput)}"
  "Depots"
  {
    "${vdfValue(depotId)}" "${vdfPath(depotConfigPath)}"
  }
}
`;

  writeFileSync(depotConfigPath, depotConfig, 'utf8');
  writeFileSync(appConfigPath, appConfig, 'utf8');
  writeFileSync(manifestPath, `${JSON.stringify({
    schemaVersion: 1,
    mode: upload ? 'private-upload' : 'preview',
    appId,
    depotId,
    branch,
    contentRoot,
    buildOutput,
    appConfigPath,
    depotConfigPath,
    generatedAt: new Date().toISOString(),
  }, null, 2)}\n`, 'utf8');

  return { appConfigPath, depotConfigPath, manifestPath, contentRoot, buildOutput, branch };
};

const isDirectRun = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  const plan = prepareSteamDepot({ upload: process.argv.includes('--upload') });
  console.log(`[steam-depot] ${process.argv.includes('--upload') ? 'Private upload' : 'Preview'} plan prepared.`);
  console.log(`[steam-depot] App config: ${plan.appConfigPath}`);
  console.log(`[steam-depot] Depot content: ${plan.contentRoot}`);
}
